"""
Ships incidents to the Express backend.

Incidents are put on an in-memory queue and delivered by a background thread.
If the backend is down they stay queued and are retried, so detection never blocks
or crashes because of network problems.
"""
import json
import logging
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import cv2
import requests

from . import config

log = logging.getLogger("reporter")


class Reporter:
    def __init__(self):
        self.queue = deque(maxlen=config.REPORT_QUEUE_MAX)
        self.lock = threading.Lock()
        self.wake = threading.Event()
        self.sent = 0
        self.last_error = None
        threading.Thread(target=self._run, daemon=True, name="reporter").start()

    def submit(self, frame, threats, score, level, confidences, primary):
        ts = datetime.now(timezone.utc)
        name = f"incident_{ts.strftime('%Y%m%d_%H%M%S_%f')}.jpg"
        path = config.CAPTURES_DIR / name
        cv2.imwrite(str(path), frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
        item = {
            "path": path,
            "data": {
                "threats": json.dumps(threats),
                "primaryThreat": primary,
                "score": str(score),
                "level": level,
                "confidences": json.dumps(confidences),
                "timestamp": ts.isoformat(),
                "cameraName": config.CAMERA_NAME,
            },
        }
        with self.lock:
            self.queue.append(item)
        self.wake.set()
        log.info("Queued incident %s score=%s threats=%s", name, score, threats)

    @property
    def pending(self):
        return len(self.queue)

    def _post(self, item):
        path: Path = item["path"]
        with open(path, "rb") as fh:
            r = requests.post(
                f"{config.BACKEND_URL}/api/incidents/ingest",
                data=item["data"],
                files={"screenshot": (path.name, fh, "image/jpeg")},
                headers={"x-api-key": config.INGEST_API_KEY},
                timeout=15,
            )
        if r.status_code >= 400:
            raise RuntimeError(f"HTTP {r.status_code}: {r.text[:200]}")

    def _run(self):
        while True:
            self.wake.wait(timeout=config.REPORT_RETRY_SECONDS)
            self.wake.clear()
            while self.queue:
                item = self.queue[0]
                try:
                    self._post(item)
                except Exception as exc:
                    self.last_error = str(exc)
                    log.warning("Backend unreachable, %d incident(s) queued: %s", len(self.queue), exc)
                    break  # retry the whole queue after the retry interval
                with self.lock:
                    if self.queue and self.queue[0] is item:
                        self.queue.popleft()
                self.sent += 1
                self.last_error = None


def fetch_runtime_settings():
    """Pull alert threshold / cooldown configured in the admin panel. Returns dict or None."""
    try:
        r = requests.get(
            f"{config.BACKEND_URL}/api/settings/runtime",
            headers={"x-api-key": config.INGEST_API_KEY}, timeout=5,
        )
        if r.ok:
            return r.json()
    except requests.RequestException:
        pass
    return None
