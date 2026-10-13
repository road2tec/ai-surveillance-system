"""Fire and smoke detection with temporal confirmation (N of last M frames) to suppress orange-light flicker."""
import logging
from collections import deque

from .. import config
from ..model_hub import load_yolo, load_yolo_world, resolve_yolo_candidates

log = logging.getLogger("detector.fire")


class FireSmokeDetector:
    def __init__(self, device):
        self.device = device
        repo_id, path = resolve_yolo_candidates(config.FIRE_MODEL_CANDIDATES)
        if path:
            self.model = load_yolo(path)
            self.source = f"huggingface.co/{repo_id}"
        else:
            self.model = load_yolo_world(config.FIRE_WORLD_FALLBACK, config.FIRE_WORLD_CLASSES)
            self.source = f"YOLO-World {config.FIRE_WORLD_FALLBACK} (zero-shot)"
        self.class_map = {
            cid: config.FIRE_CLASS_MAP[name.lower()]
            for cid, name in self.model.names.items()
            if name.lower() in config.FIRE_CLASS_MAP
        }
        self.history = {"fire": deque(maxlen=config.FIRE_HISTORY), "smoke": deque(maxlen=config.FIRE_HISTORY)}

    def reset(self):
        for h in self.history.values():
            h.clear()

    def detect(self, frame):
        """Returns (boxes, confirmed) where confirmed is {'fire': bool, 'smoke': bool}."""
        res = self.model.predict(
            frame, imgsz=config.INFER_SIZE, conf=config.FIRE_CONF,
            classes=list(self.class_map), device=self.device, verbose=False,
        )[0]
        boxes = []
        for box in res.boxes:
            cls = int(box.cls)
            boxes.append({
                "type": self.class_map[cls],
                "label": self.class_map[cls],
                "conf": float(box.conf),
                "box": [int(v) for v in box.xyxy[0].tolist()],
            })
        seen = {b["type"] for b in boxes}
        confirmed = {}
        for kind, hist in self.history.items():
            hist.append(kind in seen)
            confirmed[kind] = sum(hist) >= config.FIRE_MIN_HITS
        return boxes, confirmed
