"""COCO YOLOv8n: person count plus the COCO 'knife' class as an extra weapon signal."""
import logging

from .. import config
from ..model_hub import load_yolo, ultralytics_asset

log = logging.getLogger("detector.person")


class PersonDetector:
    def __init__(self, device):
        self.device = device
        self.model = load_yolo(ultralytics_asset(config.PERSON_MODEL))
        names = self.model.names
        self.person_id = next(k for k, v in names.items() if v == config.COCO_PERSON_CLASS)
        self.knife_id = next(k for k, v in names.items() if v == config.COCO_KNIFE_CLASS)
        self.source = f"Ultralytics {config.PERSON_MODEL} (COCO)"

    def detect(self, frame):
        """Returns (persons, knives) as lists of detection dicts."""
        res = self.model.predict(
            frame, imgsz=config.INFER_SIZE, conf=min(config.PERSON_CONF, config.COCO_KNIFE_CONF),
            classes=[self.person_id, self.knife_id], device=self.device, verbose=False,
        )[0]
        persons, knives = [], []
        for box in res.boxes:
            cls = int(box.cls)
            conf = float(box.conf)
            xyxy = [int(v) for v in box.xyxy[0].tolist()]
            if cls == self.person_id and conf >= config.PERSON_CONF:
                persons.append({"type": "person", "label": "person", "conf": conf, "box": xyxy})
            elif cls == self.knife_id and conf >= config.COCO_KNIFE_CONF:
                knives.append({"type": "knife", "label": "knife (coco)", "conf": conf, "box": xyxy})
        return persons, knives
