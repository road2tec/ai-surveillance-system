"""
Camera capture + detection pipeline.

Three loops run independently so a slow model never stutters the video:
  * capture thread  â€“ grabs webcam frames as fast as the camera delivers them
  * detect thread   â€“ runs person / weapon / fire / fight on the newest frame
  * blood thread    â€“ runs the heavy zero-shot blood check at a slower interval
The MJPEG stream draws the latest detection results on the latest frame.
"""
import logging
import platform
import threading
import time
from collections import deque

import cv2

from . import config
from .detectors import BloodDetector, FightDetector, FireSmokeDetector, PersonDetector, WeaponDetector
from .model_hub import pick_device
from .reporter import Reporter
from .scoring import AlertGate, compute_score, level_for

log = logging.getLogger("camera")

# BGR colours matching the admin panel palette
GREEN = (80, 185, 63)
AMBER = (61, 163, 232)
RED = (77, 72, 229)
GREY = (200, 200, 200)
LEVEL_COLOURS = {"Safe": GREEN, "Medium Danger": AMBER, "High Danger": RED}
BOX_COLOURS = {"gun": RED, "knife": RED, "fire": RED, "smoke": AMBER, "blood": AMBER, "person": GREY}


class CameraError(RuntimeError):
    pass


class ModelRegistry:
    """Loads every detector exactly once (in a background thread at startup)."""

    def __init__(self):
        self.device = pick_device()
        self.ready = threading.Event()
        self.error = None
        self.sources = {}
        self.person = self.weapon = self.fire = self.fight = self.blood = None

    def load(self):
        steps = [
            ("person", PersonDetector),
            ("weapon", WeaponDetector),
            ("fire_smoke", FireSmokeDetector),
            ("fight", FightDetector),
            ("blood", BloodDetector),
        ]
        log.info("Loading models on device=%s", self.device)
        for name, cls in steps:
            t0 = time.time()
            try:
                det = cls(self.device)
            except Exception as exc:
                # A single detector failing must not take down the rest of the system.
                log.exception("Failed to load %s detector", name)
                self.sources[name] = f"FAILED: {exc}"
                continue
            setattr(self, "fire" if name == "fire_smoke" else name, det)
            self.sources[name] = det.source
            log.info("[model] %-10s -> %s (%.1fs)", name, det.source, time.time() - t0)
        if not self.person:
            self.error = "Person detector failed to load; detection cannot run."
        self.ready.set()


def _overlaps(weapon_box, person_box, pad=0.15):
    """True if the weapon's centre lies inside the person's box (expanded a little for outstretched arms)."""
    x1, y1, x2, y2 = person_box
    w, h = x2 - x1, y2 - y1
    x1, y1, x2, y2 = x1 - w * pad, y1 - h * pad, x2 + w * pad, y2 + h * pad
    cx = (weapon_box[0] + weapon_box[2]) / 2
    cy = (weapon_box[1] + weapon_box[3]) / 2
    return x1 <= cx <= x2 and y1 <= cy <= y2


class SurveillancePipeline:
    def __init__(self, models: ModelRegistry, reporter: Reporter):
        self.models = models
        self.reporter = reporter
        self.gate = AlertGate()
        self.cap = None
        self.running = False
        self.state_lock = threading.Lock()
        self.frame = None
        self.frame_id = 0
        self.last_error = None
        self.fps = 0.0
        self.det_fps = 0.0
        self._reset_result()
        self.blood_result = {"flag": False, "boxes": [], "prob": 0.0, "scene": None, "at": 0.0}
        self.weapon_history = {k: deque(maxlen=config.WEAPON_HISTORY) for k in ("gun", "knife")}
        self.threads = []

    def _reset_result(self):
        self.result = {
            "boxes": [], "score": 0, "level": "Safe", "threats": [],
            "confidences": {}, "persons": 0, "fight_prob": 0.0,
        }

    # ------------------------------------------------------------------ control
    def _open_camera(self):
        is_device = isinstance(config.CAMERA_INDEX, int)
        windows = platform.system() == "Windows"
        backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY] if (is_device and windows) else [cv2.CAP_ANY]
        for backend in backends:
            cap = cv2.VideoCapture(config.CAMERA_INDEX, backend)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                ok, frame = cap.read()
                if ok and frame is not None:
                    return cap, frame
            cap.release()
        if not is_device:
            raise CameraError(f"Could not open video source '{config.CAMERA_INDEX}'. Check the path or stream URL.")
        raise CameraError(
            f"Could not open camera index {config.CAMERA_INDEX}. It is probably in use by another app "
            "(Teams, Zoom, Camera, a browser tab) or blocked in Windows Settings > Privacy > Camera."
        )

    def start(self):
        if self.running:
            return
        if not self.models.ready.is_set():
            raise CameraError("Models are still loading, try again in a moment.")
        if self.models.error:
            raise CameraError(self.models.error)
        self.cap, first = self._open_camera()
        with self.state_lock:
            self.frame, self.frame_id = first, 1
            self._reset_result()
        for det in (self.models.fight, self.models.fire):
            if det:
                det.reset()
        self.blood_result = {"flag": False, "boxes": [], "prob": 0.0, "scene": None, "at": 0.0}
        self.weapon_history = {k: deque(maxlen=config.WEAPON_HISTORY) for k in ("gun", "knife")}
        self.last_error = None
        self.running = True
        self.threads = [
            threading.Thread(target=self._capture_loop, daemon=True, name="capture"),
            threading.Thread(target=self._detect_loop, daemon=True, name="detect"),
        ]
        if self.models.blood:
            self.threads.append(threading.Thread(target=self._blood_loop, daemon=True, name="blood"))
        for t in self.threads:
            t.start()
        log.info("Camera %s started", config.CAMERA_INDEX)

    def stop(self):
        self.running = False
        for t in self.threads:
            t.join(timeout=3)
        self.threads = []
        if self.cap:
            self.cap.release()
            self.cap = None
        with self.state_lock:
            self.frame = None
            self._reset_result()
        self.fps = self.det_fps = 0.0
        log.info("Camera stopped")

    # ------------------------------------------------------------------ loops
    def _capture_loop(self):
        count, t0, failures = 0, time.time(), 0
        is_file = isinstance(config.CAMERA_INDEX, str) and "://" not in config.CAMERA_INDEX
        # Files decode much faster than real time, so pace them to their own FPS.
        file_delay = 1.0 / (self.cap.get(cv2.CAP_PROP_FPS) or 25) if is_file else 0
        while self.running:
            ok, frame = self.cap.read()
            if not ok and is_file:
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # loop test videos
                ok, frame = self.cap.read()
            if file_delay:
                time.sleep(file_delay)
            if not ok or frame is None:
                failures += 1
                if failures > 50:
                    self.last_error = "Camera stopped delivering frames (disconnected or taken by another app)."
                    log.error(self.last_error)
                    self.running = False
                    break
                time.sleep(0.02)
                continue
            failures = 0
            with self.state_lock:
                self.frame = frame
                self.frame_id += 1
            count += 1
            if time.time() - t0 >= 1.0:
                self.fps, count, t0 = count / (time.time() - t0), 0, time.time()

    def _latest(self):
        with self.state_lock:
            return (None, 0) if self.frame is None else (self.frame.copy(), self.frame_id)

    def _blood_loop(self):
        while self.running:
            frame, _ = self._latest()
            if frame is not None:
                try:
                    boxes, flag, scene = self.models.blood.detect(frame)
                    self.blood_result = {"flag": flag, "boxes": boxes, "prob": scene["blood"], "scene": scene, "at": time.time()}
                except Exception:
                    log.exception("Blood detector error")
            end = time.time() + config.BLOOD_INTERVAL_SECONDS
            while self.running and time.time() < end:
                time.sleep(0.1)

    def _detect_loop(self):
        last_id, last_fight_id = 0, -config.FIGHT_EVERY_N_FRAMES
        count, t0 = 0, time.time()
        while self.running:
            frame, fid = self._latest()
            if frame is None or fid == last_id:
                time.sleep(0.005)
                continue
            last_id = fid
            try:
                result = self._analyse(frame, fid, last_fight_id)
            except Exception:
                log.exception("Detection error")
                time.sleep(0.2)
                continue
            if result.pop("_fight_ran"):
                last_fight_id = fid
            with self.state_lock:
                self.result = result
            if result["threats"] and self.gate.should_alert(result["score"], result["scored_types"]):
                self.reporter.submit(
                    self.annotate(frame, result), result["threats"], result["score"],
                    result["level"], result["confidences"], result["primary"],
                )
            count += 1
            if time.time() - t0 >= 1.0:
                self.det_fps, count, t0 = count / (time.time() - t0), 0, time.time()

    def _analyse(self, frame, fid, last_fight_id):
        m = self.models
        persons, coco_knives = m.person.detect(frame)
        weapons = (m.weapon.detect(frame) if m.weapon else []) + coco_knives
        seen = {w["type"] for w in weapons}
        for kind, hist in self.weapon_history.items():
            hist.append(kind in seen)
        weapons = [w for w in weapons if sum(self.weapon_history[w["type"]]) >= config.WEAPON_MIN_HITS]

        fire_boxes, fire_ok = m.fire.detect(frame) if m.fire else ([], {"fire": False, "smoke": False})

        fight_ran = False
        if m.fight and len(persons) < config.FIGHT_MIN_PERSONS:
            # A fight can't be flagged with fewer than 2 people, so skip the ViT (the most
            # expensive per-cycle model) and drop stale history so it can't trigger later.
            m.fight.reset()
        elif m.fight and fid - last_fight_id >= config.FIGHT_EVERY_N_FRAMES:
            m.fight.predict(frame)
            fight_ran = True
        fight_prob = m.fight.smoothed if m.fight else 0.0
        fight = bool(m.fight and m.fight.is_fight(len(persons)))

        blood = self.blood_result
        fresh = time.time() - blood["at"] <= config.BLOOD_RESULT_TTL
        blood_live = blood["flag"] and fresh

        # Cross-check YOLO fire/smoke with the CLIP scene probabilities (see config.FIRE_CLIP_VERIFY).
        if config.FIRE_CLIP_VERIFY and m.blood and any(fire_ok.values()):
            scene = blood["scene"] if fresh else None
            plausible = bool(scene) and scene["fire"] + scene["smoke"] >= config.FIRE_CLIP_MIN
            if not plausible:
                fire_ok = {"fire": False, "smoke": False}
        if fight and config.FIGHT_CLIP_VETO and m.blood and fresh and blood["scene"]:
            fight = blood["scene"]["fight"] >= config.FIGHT_CLIP_MIN

        threats, conf = set(), {}

        def bump(kind, value):
            threats.add(kind)
            conf[kind] = round(max(conf.get(kind, 0.0), value), 3)

        for w in weapons:
            bump(w["type"], w["conf"])
        for kind in ("fire", "smoke"):
            if fire_ok[kind]:
                vals = [b["conf"] for b in fire_boxes if b["type"] == kind]
                bump(kind, max(vals) if vals else config.FIRE_CONF)
        if fight:
            bump("fight", fight_prob)
        if blood_live:
            bump("blood", blood["prob"])

        person_with_weapon = any(_overlaps(w["box"], p["box"]) for w in weapons for p in persons)
        score, per = compute_score(threats, fight_prob, person_with_weapon)
        scored_types = sorted(per, key=per.get, reverse=True)
        tags = list(scored_types)
        if person_with_weapon or (fight and weapons):
            tags.append("suspicious_activity")
            conf["suspicious_activity"] = 1.0

        # Only draw fire/smoke boxes once they are temporally confirmed.
        shown_fire = [b for b in fire_boxes if fire_ok[b["type"]]]
        boxes = persons + weapons + shown_fire + (blood["boxes"] if blood_live else [])
        return {
            "boxes": boxes, "score": score, "level": level_for(score), "threats": tags,
            "scored_types": scored_types, "primary": scored_types[0] if scored_types else None,
            "confidences": conf, "persons": len(persons), "fight_prob": round(fight_prob, 3),
            "_fight_ran": fight_ran,
        }

    # ------------------------------------------------------------------ output
    @staticmethod
    def annotate(frame, result):
        out = frame.copy()
        for b in result["boxes"]:
            colour = BOX_COLOURS.get(b["type"], AMBER)
            x1, y1, x2, y2 = b["box"]
            cv2.rectangle(out, (x1, y1), (x2, y2), colour, 2)
            text = f"{b['label']} {b['conf']:.2f}"
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            ty = max(y1, th + 6)
            cv2.rectangle(out, (x1, ty - th - 6), (x1 + tw + 6, ty), colour, -1)
            cv2.putText(out, text, (x1 + 3, ty - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (20, 20, 20), 1, cv2.LINE_AA)

        level = result["level"]
        colour = LEVEL_COLOURS[level]
        h, w = out.shape[:2]
        out[0:36, 0:w] = (out[0:36, 0:w] * 0.35).astype(out.dtype)  # darken header strip
        cv2.rectangle(out, (0, 0), (6, 36), colour, -1)
        header = f"SCORE {result['score']:>3}  {level.upper()}"
        if result["threats"]:
            header += "  |  " + ", ".join(t.replace("_", " ") for t in result["threats"])
        cv2.putText(out, header, (16, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, colour, 2, cv2.LINE_AA)
        cv2.putText(out, time.strftime("%Y-%m-%d %H:%M:%S"), (w - 190, h - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (230, 230, 230), 1, cv2.LINE_AA)
        return out

    def jpeg(self):
        with self.state_lock:
            if self.frame is None:
                return None
            frame, result = self.frame.copy(), self.result
        ok, buf = cv2.imencode(".jpg", self.annotate(frame, result), [cv2.IMWRITE_JPEG_QUALITY, config.JPEG_QUALITY])
        return buf.tobytes() if ok else None

    def status(self):
        r = self.result
        return {
            "running": self.running,
            "modelsReady": self.models.ready.is_set(),
            "modelsError": self.models.error,
            "device": self.models.device,
            "models": self.models.sources,
            "cameraIndex": config.CAMERA_INDEX,
            "cameraName": config.CAMERA_NAME,
            "fps": round(self.fps, 1),
            "detectionFps": round(self.det_fps, 1),
            "score": r["score"],
            "level": r["level"],
            "threats": r["threats"],
            "confidences": r["confidences"],
            "persons": r["persons"],
            "fightProb": r["fight_prob"],
            "alertThreshold": self.gate.threshold,
            "cooldownSeconds": self.gate.cooldown,
            "pendingIncidents": self.reporter.pending,
            "incidentsSent": self.reporter.sent,
            "backendError": self.reporter.last_error,
            "error": self.last_error,
        }
