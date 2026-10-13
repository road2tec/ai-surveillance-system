"""Gun / knife detection with a dedicated Hugging Face YOLO model, falling back to YOLO-World."""
import logging

from .. import config
from ..model_hub import load_yolo, load_yolo_world, resolve_yolo_candidates

log = logging.getLogger("detector.weapon")


class WeaponDetector:
    def __init__(self, device):
        self.device = device
        repo_id, path = resolve_yolo_candidates(config.WEAPON_MODEL_CANDIDATES)
        if path:
            self.model = load_yolo(path)
            self.source = f"huggingface.co/{repo_id}"
        else:
            self.model = load_yolo_world(config.WEAPON_WORLD_FALLBACK, config.WEAPON_WORLD_CLASSES)
            self.source = f"YOLO-World {config.WEAPON_WORLD_FALLBACK} (zero-shot)"
        # Only keep classes we know how to map (drops e.g. 'grenade', 'explosive').
        self.class_map = {
            cid: config.WEAPON_CLASS_MAP[name.lower()]
            for cid, name in self.model.names.items()
            if name.lower() in config.WEAPON_CLASS_MAP
        }
        if not self.class_map:
            raise RuntimeError(f"Weapon model {self.source} exposes no gun/knife classes: {self.model.names}")

    def detect(self, frame):
        res = self.model.predict(
            frame, imgsz=config.INFER_SIZE, conf=config.WEAPON_CONF,
            classes=list(self.class_map), device=self.device, verbose=False,
        )[0]
        out = []
        for box in res.boxes:
            cls = int(box.cls)
            out.append({
                "type": self.class_map[cls],
                "label": self.model.names[cls].lower(),
                "conf": float(box.conf),
                "box": [int(v) for v in box.xyxy[0].tolist()],
            })
        return out
