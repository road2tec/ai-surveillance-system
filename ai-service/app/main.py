"""FastAPI entry point: MJPEG stream, start/stop control and live status."""
import logging
import threading
import time
from contextlib import asynccontextmanager

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import config
from .camera import CameraError, ModelRegistry, SurveillancePipeline
from .reporter import Reporter, fetch_runtime_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
log = logging.getLogger("ai-service")

models = ModelRegistry()
reporter = Reporter()
pipeline = SurveillancePipeline(models, reporter)


def _settings_sync():
    """Keep alert threshold / cooldown in sync with the admin Settings page."""
    while True:
        s = fetch_runtime_settings()
        if s:
            pipeline.gate.update_settings(s.get("alertThreshold"), s.get("cooldownSeconds"))
        time.sleep(config.SETTINGS_REFRESH_SECONDS)


@asynccontextmanager
async def lifespan(_app):
    # Models load in the background so the API (and /status) answer immediately.
    threading.Thread(target=models.load, daemon=True, name="model-loader").start()
    threading.Thread(target=_settings_sync, daemon=True, name="settings-sync").start()
    yield
    pipeline.stop()


app = FastAPI(title="Surveillance AI Service", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _placeholder(text):
    img = np.full((720, 1280, 3), (19, 16, 14), dtype=np.uint8)  # #0E1013 in BGR
    (tw, _), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 1.0, 2)
    cv2.putText(img, text, ((1280 - tw) // 2, 370), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (140, 140, 140), 2, cv2.LINE_AA)
    return cv2.imencode(".jpg", img)[1].tobytes()


PLACEHOLDER_OFF = _placeholder("CAMERA OFFLINE")
PLACEHOLDER_LOADING = _placeholder("LOADING MODELS...")


def _mjpeg():
    interval = 1.0 / config.STREAM_FPS
    while True:
        t0 = time.time()
        frame = pipeline.jpeg() if pipeline.running else None
        if frame is None:
            frame = PLACEHOLDER_OFF if models.ready.is_set() else PLACEHOLDER_LOADING
        yield b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(frame)).encode() + b"\r\n\r\n" + frame + b"\r\n"
        # Idle streams tick slowly; live streams target STREAM_FPS.
        time.sleep(max(0.0, (interval if pipeline.running else 0.5) - (time.time() - t0)))


@app.get("/video_feed")
def video_feed():
    return StreamingResponse(_mjpeg(), media_type="multipart/x-mixed-replace; boundary=frame")


@app.post("/start")
def start():
    try:
        pipeline.start()
    except CameraError as exc:
        return JSONResponse({"ok": False, "error": str(exc), **pipeline.status()}, status_code=409)
    return {"ok": True, **pipeline.status()}


@app.post("/stop")
def stop():
    pipeline.stop()
    return {"ok": True, **pipeline.status()}


@app.get("/status")
def status():
    return pipeline.status()


@app.post("/simulate_incident")
def simulate_incident():
    """Push a synthetic incident through the full alert path (backend, email, socket) for testing."""
    raw = pipeline.frame
    if raw is None:
        raw = cv2.imdecode(np.frombuffer(PLACEHOLDER_OFF, np.uint8), cv2.IMREAD_COLOR)
    threats, conf = ["knife", "suspicious_activity"], {"knife": 0.91, "suspicious_activity": 1.0}
    # Burn the synthetic score into the screenshot (not the live frame's real score).
    img = pipeline.annotate(raw, {"boxes": [], "score": 80, "level": "High Danger", "threats": threats + ["test"]})
    reporter.submit(img, threats, 80, "High Danger", conf, "knife")
    return {"ok": True, "queued": reporter.pending}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=config.PORT)
