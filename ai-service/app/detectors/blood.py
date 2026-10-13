"""
Zero-shot blood detection (plus a CLIP scene check reused to verify fire / smoke).

There is no reliable public blood detector, so two zero-shot models vote:
YOLO-World with the open-vocabulary class "blood" (localises), and CLIP ViT-L/14
scoring the whole frame against blood / fire / smoke / normal-scene prompts.
Blood is reported when both agree, or when CLIP alone is very confident.
"""
import logging

import cv2
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

from .. import config
from ..model_hub import load_yolo_world

log = logging.getLogger("detector.blood")


def _features(out):
    """transformers <5 returns a tensor; >=5 returns a ModelOutput whose pooler_output is the projected embedding."""
    return out if isinstance(out, torch.Tensor) else out.pooler_output


class BloodDetector:
    def __init__(self, device):
        self.device = device
        self.world = load_yolo_world(config.BLOOD_WORLD_MODEL, config.BLOOD_WORLD_CLASSES)
        self.clip = CLIPModel.from_pretrained(config.BLOOD_CLIP_MODEL).to(device).eval()
        self.processor = CLIPProcessor.from_pretrained(config.BLOOD_CLIP_MODEL)
        self.prompts, self.groups = [], {}
        for group, prompts in config.CLIP_PROMPT_GROUPS.items():
            start = len(self.prompts)
            self.prompts += prompts
            self.groups[group] = slice(start, len(self.prompts))
        # Text embeddings never change, so encode them once.
        with torch.inference_mode():
            t = self.processor(text=self.prompts, return_tensors="pt", padding=True).to(device)
            emb = _features(self.clip.get_text_features(**t))
            self.text_emb = emb / emb.norm(dim=-1, keepdim=True)
        self.source = f"YOLO-World {config.BLOOD_WORLD_MODEL} + huggingface.co/{config.BLOOD_CLIP_MODEL}"

    @torch.inference_mode()
    def scene_probs(self, frame):
        """Probability mass per prompt group (blood / fire / smoke / normal), summing to 1."""
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        inputs = self.processor(images=Image.fromarray(rgb), return_tensors="pt").to(self.device)
        img = _features(self.clip.get_image_features(**inputs))
        img = img / img.norm(dim=-1, keepdim=True)
        probs = (self.clip.logit_scale.exp() * img @ self.text_emb.T).softmax(-1)[0]
        return {g: float(probs[s].sum()) for g, s in self.groups.items()}

    def detect(self, frame):
        """Returns (boxes, blood_flag, scene_probs)."""
        res = self.world.predict(
            frame, imgsz=config.INFER_SIZE, conf=config.BLOOD_WORLD_CONF, device=self.device, verbose=False,
        )[0]
        boxes = [
            {"type": "blood", "label": "blood", "conf": float(b.conf), "box": [int(v) for v in b.xyxy[0].tolist()]}
            for b in res.boxes
        ]
        scene = self.scene_probs(frame)
        p = scene["blood"]
        flag = (bool(boxes) and p >= config.BLOOD_CLIP_AGREE) or p >= config.BLOOD_CLIP_STRONG
        return (boxes if flag else []), flag, scene
