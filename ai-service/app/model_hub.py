"""
Helpers to verify and download pretrained weights.

Nothing here trains anything: we only check that a Hugging Face repo exists and
contains the expected weights file, download it into ai-service/models, and fall
through to the next candidate if anything is missing.
"""
import logging
import shutil
from pathlib import Path

import torch
from huggingface_hub import HfApi, hf_hub_download

from . import config

log = logging.getLogger("model_hub")
_api = HfApi()


def pick_device():
    if config.DEVICE_PREF == "cpu":
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    if config.DEVICE_PREF == "cuda":
        log.warning("DEVICE=cuda requested but CUDA is not available, using CPU")
    return "cpu"


def repo_has_file(repo_id, filename):
    """True if the repo exists and lists `filename`. Network errors fall back to the local cache."""
    try:
        files = {s.rfilename for s in _api.model_info(repo_id).siblings}
        return filename in files
    except Exception as exc:  # offline or repo gone
        log.debug("model_info(%s) failed: %s", repo_id, exc)
        return _cached_path(repo_id, filename) is not None


def _cached_path(repo_id, filename):
    try:
        return hf_hub_download(repo_id, filename, local_files_only=True)
    except Exception:
        return None


def download_yolo_weights(repo_id, filename):
    """Download a YOLO .pt from the Hub and copy it to models/<owner>__<repo>.pt (stable local path)."""
    target = config.MODELS_DIR / f"{repo_id.replace('/', '__')}.pt"
    if target.exists() and target.stat().st_size > 0:
        return target
    if not repo_has_file(repo_id, filename):
        raise FileNotFoundError(f"{repo_id} has no {filename}")
    src = hf_hub_download(repo_id, filename)
    shutil.copyfile(src, target)
    return target


def resolve_yolo_candidates(candidates):
    """Return (repo_id, local_path) for the first candidate that downloads, else (None, None)."""
    for repo_id, filename in candidates:
        try:
            path = download_yolo_weights(repo_id, filename)
            return repo_id, path
        except Exception as exc:
            log.warning("Weights candidate %s unusable: %s", repo_id, exc)
    return None, None


def ultralytics_asset(name):
    """Local path for an official Ultralytics asset (auto-downloaded on first load)."""
    return str(Path(config.MODELS_DIR) / name)


def load_yolo(path_or_name):
    from ultralytics import YOLO
    return YOLO(str(path_or_name))


def load_yolo_world(name, classes):
    from ultralytics import YOLOWorld
    model = YOLOWorld(ultralytics_asset(name))
    model.set_classes(classes)
    return model
