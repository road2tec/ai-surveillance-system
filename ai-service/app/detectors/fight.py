"""Frame-level violence classifier (ViT) with sliding-window smoothing."""
import json
import logging
from collections import deque

import cv2
import numpy as np
import torch
from huggingface_hub import hf_hub_download
from PIL import Image
from safetensors.torch import load_file
from transformers import AutoImageProcessor, AutoModelForImageClassification

from .. import config
from ..model_hub import repo_has_file

log = logging.getLogger("detector.fight")


class _TimmViT:
    """
    Some Hub "ViT" fine-tunes (including jaranohaal/vit-base-violence-detection) actually
    contain timm-format weights (blocks.N.attn.qkv, head.*). transformers would silently
    initialise those randomly, so we load them into the matching timm architecture instead.
    """

    def __init__(self, repo_id, state_dict, device):
        import timm

        cfg = json.load(open(hf_hub_download(repo_id, "config.json")))
        pre_path = hf_hub_download(repo_id, "preprocessor_config.json") if repo_has_file(repo_id, "preprocessor_config.json") else None
        pre = json.load(open(pre_path)) if pre_path else {}
        num_classes = state_dict["head.weight"].shape[0]
        patch = cfg.get("patch_size", 16)
        size = cfg.get("image_size", 224)
        self.model = timm.create_model(f"vit_base_patch{patch}_{size}", pretrained=False, num_classes=num_classes)
        self.model.load_state_dict(state_dict, strict=True)  # strict: fail loudly on any mismatch
        self.model.to(device).eval()
        self.size = size
        self.mean = np.array(pre.get("image_mean", [0.5, 0.5, 0.5]), dtype=np.float32)
        self.std = np.array(pre.get("image_std", [0.5, 0.5, 0.5]), dtype=np.float32)
        self.device = device
        self.id2label = cfg.get("id2label") or {i: f"LABEL_{i}" for i in range(num_classes)}

    def probs(self, rgb):
        img = cv2.resize(rgb, (self.size, self.size), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255.0
        x = torch.from_numpy(((img - self.mean) / self.std).transpose(2, 0, 1)).unsqueeze(0).to(self.device)
        return self.model(x).softmax(-1)[0]


class _HFClassifier:
    def __init__(self, repo_id, device):
        self.processor = AutoImageProcessor.from_pretrained(repo_id)
        model, info = AutoModelForImageClassification.from_pretrained(repo_id, output_loading_info=True)
        if info.get("missing_keys"):
            raise RuntimeError(f"{repo_id}: {len(info['missing_keys'])} weights missing from checkpoint")
        self.model = model.to(device).eval()
        self.device = device
        self.id2label = model.config.id2label

    def probs(self, rgb):
        inputs = self.processor(images=Image.fromarray(rgb), return_tensors="pt").to(self.device)
        return self.model(**inputs).logits.softmax(-1)[0]


def _load_state_dict(repo_id):
    if repo_has_file(repo_id, "model.safetensors"):
        return load_file(hf_hub_download(repo_id, "model.safetensors"))
    return torch.load(hf_hub_download(repo_id, "pytorch_model.bin"), map_location="cpu", weights_only=True)


class FightDetector:
    def __init__(self, device):
        self.device = device
        self.backend = None
        for repo_id in config.FIGHT_MODEL_CANDIDATES:
            try:
                sd = _load_state_dict(repo_id)
                if any(k.startswith("blocks.") for k in sd):
                    self.backend = _TimmViT(repo_id, sd, device)
                    fmt = "timm ViT-B/16"
                else:
                    self.backend = _HFClassifier(repo_id, device)
                    fmt = "transformers"
                self.source = f"huggingface.co/{repo_id} ({fmt})"
                break
            except Exception as exc:
                log.warning("Fight candidate %s unusable: %s", repo_id, exc)
        if not self.backend:
            raise RuntimeError("No violence classifier candidate could be loaded")
        self.violent_idx = self._find_violent_index(self.backend.id2label)
        self.window = deque(maxlen=config.FIGHT_SMOOTH_WINDOW)

    @staticmethod
    def _find_violent_index(id2label):
        # Prefer an explicit label name; fall back to the configured index for LABEL_0/LABEL_1 models.
        for idx, name in id2label.items():
            n = name.lower()
            if ("violen" in n or "fight" in n) and not n.startswith("non"):
                return int(idx)
        return config.FIGHT_VIOLENT_LABEL_INDEX

    def reset(self):
        self.window.clear()

    @torch.inference_mode()
    def predict(self, frame):
        """Raw violent probability for one BGR frame; also pushes it into the smoothing window."""
        p = float(self.backend.probs(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))[self.violent_idx])
        self.window.append(p)
        return p

    @property
    def smoothed(self):
        return sum(self.window) / len(self.window) if self.window else 0.0

    def is_fight(self, person_count):
        return self.smoothed >= config.FIGHT_PROB_THRESHOLD and person_count >= config.FIGHT_MIN_PERSONS
