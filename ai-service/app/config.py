"""
Central configuration for the AI service.

Every model ID, class mapping and threshold lives here so models can be swapped
without touching detector code. Values marked "env" can be overridden in .env.
"""
import logging
import os
import socket
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

MODELS_DIR = BASE_DIR / "models"
CAPTURES_DIR = BASE_DIR / "captures"
MODELS_DIR.mkdir(exist_ok=True)
CAPTURES_DIR.mkdir(exist_ok=True)

# Keep every Hugging Face download inside ai-service/models so the project is self-contained.
os.environ.setdefault("HF_HOME", str(MODELS_DIR / "hf"))
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")


def _hub_reachable():
    try:
        socket.create_connection(("huggingface.co", 443), timeout=3).close()
        return True
    except OSError:
        return False


# Without internet, transformers/huggingface_hub retry every request before using the cache,
# which makes startup crawl. Once models are downloaded, run fully from the local cache instead.
if "HF_HUB_OFFLINE" not in os.environ and not _hub_reachable():
    os.environ["HF_HUB_OFFLINE"] = "1"


# huggingface_hub logs every HTTP request at INFO; keep the console readable.
for _noisy in ("httpx", "httpx2", "httpcore", "urllib3"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)


def _env_int(name, default):
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


# --------------------------------------------------------------------------- env
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000").rstrip("/")
INGEST_API_KEY = os.getenv("INGEST_API_KEY", "change-me-ingest-key")
# A number selects a local webcam; anything else is treated as a video file path or stream URL (RTSP/HTTP).
_cam = os.getenv("CAMERA_INDEX", "0").strip()
CAMERA_INDEX = int(_cam) if _cam.lstrip("-").isdigit() else _cam
CAMERA_NAME = os.getenv("CAMERA_NAME", "Laptop Webcam")
DEVICE_PREF = os.getenv("DEVICE", "auto").lower()  # auto | cpu | cuda
PORT = _env_int("AI_PORT", 8000)

# ------------------------------------------------------------------ performance
INFER_SIZE = 640            # longest side fed to detectors
STREAM_FPS = 15             # MJPEG output rate
JPEG_QUALITY = 80

# ------------------------------------------------------------- person (COCO)
PERSON_MODEL = "yolov8n.pt"
PERSON_CONF = 0.40
COCO_PERSON_CLASS = "person"
COCO_KNIFE_CLASS = "knife"       # used as an extra weapon signal
COCO_KNIFE_CONF = 0.40

# ------------------------------------------------------------------ fight
# Candidates are tried in order; first one that exists with usable weights wins.
FIGHT_MODEL_CANDIDATES = [
    "jaranohaal/vit-base-violence-detection",   # ViT-B/16, 98.8% test acc on Real Life Violence Situations
    "hosamEl1/vit-base-violence-detection",
    "locih/violence_classification",
]
# Model config ships generic LABEL_0/LABEL_1 names. The training set (RLVS) folders are
# NonViolence / Violence, so alphabetical index 1 is the violent class.
FIGHT_VIOLENT_LABEL_INDEX = 1
FIGHT_EVERY_N_FRAMES = 3
FIGHT_SMOOTH_WINDOW = 8
FIGHT_PROB_THRESHOLD = 0.70
FIGHT_MIN_PERSONS = 2
# The ViT gives ~0.95 "violent" on a single calm person in a dark room (RLVS violent clips are
# mostly dark CCTV). When the CLIP scene model is loaded it acts as a veto: a fight is dropped
# if CLIP's "fight" prompts get less than this probability. Real fights scored ~1.0 in tests.
FIGHT_CLIP_VETO = True
FIGHT_CLIP_MIN = 0.15

# ------------------------------------------------------------------ weapons
# (repo_id, weights filename). Ranked by reported mAP50 on their model cards.
WEAPON_MODEL_CANDIDATES = [
    ("cosgun99/gun-knife-yolo11n", "best.pt"),              # mAP50 0.964 (gun 0.984, knife 0.944), 36k images
    ("Subh775/Threat-Detection-YOLOv8n", "weights/best.pt"),  # mAP50 0.811 (gun/explosive/grenade/knife)
    ("Hadi959/weapon-detection-yolov8", "best.pt"),          # pistol/knife, no metrics published
]
WEAPON_WORLD_FALLBACK = "yolov8x-worldv2.pt"
WEAPON_WORLD_CLASSES = ["gun", "pistol", "rifle", "knife"]
WEAPON_CONF = 0.45
# Live webcam tests showed single-frame "gun" flickers at ~0.45 on a hand near the face in low
# light, so a weapon type must appear in WEAPON_MIN_HITS of the last WEAPON_HISTORY processed frames.
WEAPON_HISTORY = 3
WEAPON_MIN_HITS = 2
# Map raw model class names (lower-case) to our canonical threat types.
WEAPON_CLASS_MAP = {
    "gun": "gun", "pistol": "gun", "rifle": "gun", "handgun": "gun",
    "firearm": "gun", "weapon": "gun", "knife": "knife",
}

# ------------------------------------------------------------- fire / smoke
FIRE_MODEL_CANDIDATES = [
    ("rabahdev/fire-smoke-yolov8n", "best.pt"),               # mAP50 0.754 on D-Fire test (4,306 images)
    ("mfranzon/fire-smoke-yolov8", "fire_smoke_yolov8.pt"),   # D-Fire + domestic fire, no metrics published
]
FIRE_WORLD_FALLBACK = "yolov8s-worldv2.pt"
FIRE_WORLD_CLASSES = ["fire", "flame", "smoke"]
FIRE_CONF = 0.40
FIRE_CLASS_MAP = {"fire": "fire", "flame": "fire", "smoke": "smoke"}
FIRE_HISTORY = 5          # look at the last N processed frames...
FIRE_MIN_HITS = 3         # ...and require at least this many positives
# The D-Fire model reports "smoke" on plain grey walls/backgrounds in tests, which temporal
# smoothing cannot remove on a static webcam. When the CLIP scene model is loaded, a fire/smoke
# box is only reported if CLIP also gives the fire+smoke prompts at least this much probability.
FIRE_CLIP_VERIFY = True
FIRE_CLIP_MIN = 0.40

# ------------------------------------------------------------------ blood
BLOOD_WORLD_MODEL = "yolov8s-worldv2.pt"   # small variant keeps CPU latency sane
BLOOD_WORLD_CLASSES = ["blood"]
BLOOD_WORLD_CONF = 0.25
BLOOD_CLIP_MODEL = "openai/clip-vit-large-patch14"
# CLIP scores the whole frame against these prompt groups in one pass. The "normal" group
# must be broad: with only a couple of negatives, any unusual image (a knife product shot,
# a dark room) gets pushed towards the blood prompts by the softmax.
CLIP_PROMPT_GROUPS = {
    "blood": [
        "a photo of a bleeding injured person",
        "a photo of blood on the floor",
        "a photo of a bloody wound",
    ],
    "fire": ["a photo of fire", "a photo of flames burning"],
    "smoke": ["a photo of thick smoke", "a photo of a room filled with smoke"],
    "fight": [
        "a photo of people fighting",
        "a photo of a person punching another person",
        "a photo of a violent brawl",
    ],
    "normal": [
        "a normal photo of a person",
        "a normal room",
        "a photo of a person sitting at a desk",
        "a photo of a face",
        "a dark photo",
        "a product photo of an object",
        "a photo of a kitchen knife",
        "a photo of a gun",
        "a photo of a tool",
        "a photo of a red object",
        "a photo of a street",
        "a drawing or illustration",
    ],
}
BLOOD_CLIP_AGREE = 0.50     # CLIP must at least lean towards blood when YOLO-World fires
BLOOD_CLIP_STRONG = 0.80    # CLIP alone is enough above this
# CLIP-L is heavy on CPU, so blood runs in its own worker at this interval instead of every frame.
BLOOD_INTERVAL_SECONDS = 3.0
BLOOD_RESULT_TTL = 6.0      # seconds a blood verdict stays valid between samples

# ------------------------------------------------------------------ scoring
SCORE_FIRE = 100
SCORE_GUN = 90
SCORE_KNIFE = 70
SCORE_FIGHT_BASE = 60
SCORE_FIGHT_RANGE = 30
SCORE_BLOOD = 50
SCORE_SMOKE = 45
BONUS_PERSON_WITH_WEAPON = 10
BONUS_PER_EXTRA_THREAT = 10

LEVEL_MEDIUM_MIN = 40
LEVEL_HIGH_MIN = 70

# Defaults; the live values are pulled from the admin Settings page via the backend.
ALERT_THRESHOLD = 40
COOLDOWN_SECONDS = 60
SETTINGS_REFRESH_SECONDS = 20

# ------------------------------------------------------------------ reporter
REPORT_QUEUE_MAX = 200
REPORT_RETRY_SECONDS = 5
