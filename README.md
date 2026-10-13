# AI-Driven Integrated Surveillance System for Threat Recognition and Emergency Response

> **Quick links:** [RUN.md](RUN.md) (terminal commands to run the project) · [SETUP.md](SETUP.md) (install on a new laptop) · [Project documentation PDF](docs/Project-Documentation.pdf)

A laptop webcam feed is analysed in real time by pretrained AI models. The system detects **weapons (gun, knife), fire, smoke, blood, fights and suspicious activity**. Each processed frame gets a **threat score (0-100)** and a level (Safe, Medium Danger or High Danger). When a threat is confirmed, the system:

1. saves an annotated screenshot,
2. stores an incident in MongoDB,
3. emails an alert with the screenshot attached,
4. pushes the incident live to a React admin panel.

No model is trained. Every model is a public pretrained checkpoint that downloads automatically.

```
 Webcam ──► ai-service (FastAPI :8000) ──multipart + x-api-key──► server (Express :5000) ──► MongoDB
             │  YOLO / ViT / CLIP models                            │  Nodemailer (Gmail SMTP)
             │  MJPEG stream, /start /stop /status                  │  Socket.io "new_incident"
             └──────────────── proxied through /api/camera/* ◄──────┘
                                                                    ▲
                                    client (React + Vite :5173) ────┘
```

---

## 1. Requirements

| Tool | Version | Notes |
|---|---|---|
| Windows 10/11 laptop with a webcam | | macOS/Linux also work (use `venv/bin/python`) |
| Python | 3.10 – 3.12 | `python --version` |
| Node.js | 18+ (tested on 24) | `node --version` |
| MongoDB | 6+ local, or MongoDB Atlas | local service on `mongodb://127.0.0.1:27017` |
| Git | any | needed by pip to install the CLIP package used by YOLO-World |
| Disk / RAM | ~5 GB free, 8 GB RAM | models are about 2.5 GB in total |

A GPU is optional. With `DEVICE=auto` the AI service uses CUDA if PyTorch can see it and the CPU otherwise. For a GPU, first install the CUDA build of PyTorch from <https://pytorch.org/get-started/locally/>, then install the rest of the requirements.

## 2. Setup (one time)

**Easiest:** double-click `setup.bat`. It does everything below in one go. **SETUP.md** has a step-by-step guide for a brand-new laptop, including the software downloads.

Manual equivalent, from the project folder:

```bat
:: 1. Install everything (root tools, server, client, Python venv + packages)
npm install
npm run setup

:: 2. Create the .env files from the examples, then edit them (see section 3)
copy server\.env.example server\.env
copy ai-service\.env.example ai-service\.env
copy client\.env.example client\.env

:: 3. Download and verify all pretrained models (about 2.5 GB, 5-10 minutes the first time)
npm run models

:: 4. Create the admin user (the server also does this automatically on first start)
npm run seed
```

`npm run models` prints which model was picked for each detector:

```
=== Model selection (device: cpu) ===
  person      Ultralytics yolov8n.pt (COCO)
  weapon      huggingface.co/cosgun99/gun-knife-yolo11n
  fire_smoke  huggingface.co/rabahdev/fire-smoke-yolov8n
  fight       huggingface.co/jaranohaal/vit-base-violence-detection (timm ViT-B/16)
  blood       YOLO-World yolov8s-worldv2.pt + huggingface.co/openai/clip-vit-large-patch14
```

## 3. Environment variables

### `server/.env`

| Variable | Example | Meaning |
|---|---|---|
| `PORT` | `5000` | Express port |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/surveillance` | Local MongoDB or an Atlas `mongodb+srv://...` string |
| `JWT_SECRET` | long random string | Signs admin login tokens (8 h expiry) |
| `INGEST_API_KEY` | long random string | Shared secret. **Must equal** `INGEST_API_KEY` in `ai-service/.env` |
| `AI_SERVICE_URL` | `http://localhost:8000` | Where the AI service runs |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.gmail.com` / `465` | Gmail SMTP over SSL |
| `SMTP_USER` | `you@gmail.com` | Gmail address that sends alerts |
| `SMTP_PASS` | `abcd efgh ijkl mnop` | **Gmail App Password** (16 characters; spaces are ignored), not your normal password |
| `ALERT_TO` | `you@gmail.com,guard@x.com` | Default recipients. Editable later on the Settings page |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@example.com` / `Admin@12345` | First admin account created by the seed |
| `CLIENT_URL` | `http://localhost:5173` | Used for CORS and for the "Open incident" link in emails |

### `ai-service/.env`

| Variable | Example | Meaning |
|---|---|---|
| `BACKEND_URL` | `http://localhost:5000` | Express server that receives incidents |
| `INGEST_API_KEY` | same as server | Sent as the `x-api-key` header |
| `CAMERA_INDEX` | `0` | `0` = built-in webcam, `1` = USB camera. A file path or `rtsp://` URL also works (files loop, which is useful for demos) |
| `CAMERA_NAME` | `Laptop Webcam` | Shown in the panel and in emails |
| `DEVICE` | `auto` | `auto`, `cpu` or `cuda` |

### `client/.env`

| Variable | Example |
|---|---|
| `VITE_API_URL` | `http://localhost:5000` |
| `VITE_SOCKET_URL` | `http://localhost:5000` |

### How to create a Gmail App Password

1. Open <https://myaccount.google.com/security> with the Gmail account that will send alerts.
2. Turn on **2-Step Verification**. App Passwords are only available once it is on.
3. Open <https://myaccount.google.com/apppasswords> (or search "App passwords" in the account settings).
4. Type a name such as `Surveillance`, then click **Create**.
5. Copy the 16-character password into `SMTP_PASS` in `server/.env` and set `SMTP_USER` to the same Gmail address.
6. Restart the server. On the **Settings** page, add recipients, click **Save settings**, then click **Send test email**.

If an email fails, the incident is still saved. The error appears in the History table ("Failed") and on the incident page. Gmail's `535 Username and Password not accepted` means the App Password or address is wrong.

## 4. Running

Make sure MongoDB is running, then use either option:

```bat
:: Option A: one terminal, all three services with coloured logs
npm run dev

:: Option B: three separate windows, then the browser opens automatically
start.bat
```

Open <http://localhost:5173> and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Then:

1. **Live monitor**: wait for "Loading AI models" to disappear (about 25 s), then click **Start camera**.
2. Show a threat to the camera: hold a knife, or show a phone/laptop screen with a photo of a gun or a fire. The score gauge changes colour, a toast appears, a sound plays, the incident shows in **Detection history**, and an email is sent.
3. **Test alert** sends a synthetic incident through the whole pipeline (screenshot, database, email, live toast). Use it to check email without a real threat.

Individual services, if you need them:

| Service | Command | URL |
|---|---|---|
| AI service | `cd ai-service && venv\Scripts\python -m app.main` | <http://localhost:8000/status>, <http://localhost:8000/video_feed> |
| API | `cd server && npm start` | <http://localhost:5000/api/health> |
| Admin panel | `cd client && npm run dev` | <http://localhost:5173> |

### Offline check of the detectors

```bat
cd ai-service
venv\Scripts\python test_detectors.py path\to\folder\with\jpgs
```

This prints persons, weapons, fire/smoke, violence probability, blood verdict and the final score for every image.

## 5. Models used (all pretrained, no training)

Each detector has a ranked list of candidates in `ai-service/app/config.py`. At startup the service checks each repository on the Hugging Face Hub with `huggingface_hub`, downloads the first one that has usable weights, and falls back to the next candidate (or to zero-shot YOLO-World) if one is missing. When there is no internet connection it switches to the local cache automatically.

| Detector | Model chosen | Source | Why it was chosen |
|---|---|---|---|
| Person + extra knife signal | YOLOv8n (COCO classes `person`, `knife`) | [Ultralytics](https://docs.ultralytics.com/models/yolov8/) | Fast person count; links weapons to people |
| Weapons (gun, knife) | YOLO11n gun/knife | [cosgun99/gun-knife-yolo11n](https://huggingface.co/cosgun99/gun-knife-yolo11n) | Best published score among the candidates: **mAP50 0.964** (gun 0.984, knife 0.944) on a 36k-image test set |
| Weapons fallback 1 | YOLOv8n threat detection | [Subh775/Threat-Detection-YOLOv8n](https://huggingface.co/Subh775/Threat-Detection-YOLOv8n) | mAP50 0.811 (gun/knife/grenade/explosive) |
| Weapons fallback 2 | YOLO-World v2 X, prompts `gun, pistol, rifle, knife` | [Ultralytics YOLO-World](https://docs.ultralytics.com/models/yolo-world/) | Zero-shot; always available |
| Fire / smoke | YOLOv8n fine-tuned on D-Fire | [rabahdev/fire-smoke-yolov8n](https://huggingface.co/rabahdev/fire-smoke-yolov8n) | **mAP50 0.754** on the 4,306-image D-Fire test split, the best published YOLOv8 fire/smoke metric found |
| Fire / smoke fallback | YOLOv8n | [mfranzon/fire-smoke-yolov8](https://huggingface.co/mfranzon/fire-smoke-yolov8), then YOLO-World `fire, flame, smoke` | |
| Fight / violence | ViT-B/16 violence classifier | [jaranohaal/vit-base-violence-detection](https://huggingface.co/jaranohaal/vit-base-violence-detection) | **98.8 % test accuracy** on Real Life Violence Situations |
| Blood (zero-shot) | YOLO-World v2 S, prompt `blood` + CLIP ViT-L/14 | [Ultralytics YOLO-World](https://docs.ultralytics.com/models/yolo-world/), [openai/clip-vit-large-patch14](https://huggingface.co/openai/clip-vit-large-patch14) | No reliable dedicated blood detector exists, so two zero-shot models vote |

Implementation notes found during verification:

- **The violence model ships timm-format weights** (`blocks.N.attn.qkv`, `head.*`), even though its model card shows `ViTForImageClassification`. Loading it with transformers silently uses *random* weights. The service detects this and loads the checkpoint into the matching `timm` ViT-B/16 with `strict=True`. For transformers-format models, any load that reports missing weights is rejected and the next candidate is used.
- **CLIP cross-checks.** In tests, the D-Fire model reported "smoke" on plain grey backgrounds, and the violence ViT reported about 0.95 "violent" for one calm person in a dark room. CLIP ViT-L/14 is already loaded for blood, so it scores the whole frame against fire, smoke, fight, blood and normal-scene prompts in one pass. Fire and smoke are reported only if CLIP's fire+smoke probability is at least 0.40. A fight is vetoed if CLIP's fight probability is below 0.15 (real fights scored about 1.0). Both checks can be switched off in `config.py` (`FIRE_CLIP_VERIFY`, `FIGHT_CLIP_VETO`).

## 6. Detection and scoring rules

| Rule | Value (all in `ai-service/app/config.py`) |
|---|---|
| Inference size | 640 px. YOLO models run on the newest frame; the stream is drawn independently at 15 fps |
| Fight | ViT on every 3rd frame when 2 or more people are visible; mean of the last 8 predictions ≥ 0.70 **and** ≥ 2 persons |
| Weapons | confidence ≥ 0.45 (COCO knife ≥ 0.40) in ≥ 2 of the last 3 processed frames (suppresses single-frame flicker seen in low light); "person holding weapon" = weapon centre inside a person box |
| Fire / smoke | confidence ≥ 0.40, present in ≥ 3 of the last 5 processed frames |
| Blood | (YOLO-World `blood` **and** CLIP ≥ 0.50) **or** CLIP ≥ 0.80; sampled every 3 s on a separate thread |

| Threat | Score |
|---|---|
| Fire | 100 |
| Gun | 90 |
| Knife | 70 |
| Fight | 60 + 30 × (p − 0.70) / 0.30 |
| Blood | 50 |
| Smoke only | 45 |
| Person holding a weapon | +10 on the weapon score |
| Combination | `min(100, max(scores) + 10 × (number of other distinct threats))` |

Levels: **0-39 Safe**, **40-69 Medium Danger**, **70-100 High Danger**. An incident is raised when score ≥ the alert threshold (default 40). The same threat type will not alert again during the cooldown (default 60 s); a different threat type alerts immediately. Threshold and cooldown are edited on the Settings page, and the AI service picks up changes within 20 s. Incidents that also involve a person holding a weapon, or a fight with a weapon, are tagged `suspicious_activity`.

## 7. API reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | | Returns a JWT (8 h) |
| GET | `/api/auth/me` | JWT | Current admin |
| POST | `/api/incidents/ingest` | `x-api-key` | Used by the AI service (multipart: threats, score, level, confidences, timestamp, cameraName, screenshot) |
| GET | `/api/incidents` | JWT | `page, limit, threat, level, status, from, to, search`; newest first |
| GET | `/api/incidents/export` | JWT | CSV with the same filters |
| GET / PATCH / DELETE | `/api/incidents/:id` | JWT | Detail; update `status` / `notes`; delete (also removes the screenshot) |
| GET | `/api/stats?days=7\|30` | JWT | Totals, by threat, by level, per day (IST) |
| GET / PUT | `/api/settings` | JWT | `alertEmails, cooldownSeconds, alertThreshold, emailEnabled` |
| POST | `/api/settings/test-email` | JWT | Sends a test email to the saved recipients |
| POST / POST / GET | `/api/camera/start`, `/stop`, `/status` (also `/api/start`, `/api/stop`, `/api/status`) | JWT | Pass-through to the AI service |
| GET | `/api/camera/video_feed?token=` | JWT | MJPEG stream proxied from the AI service |
| GET | `/uploads/screenshots/*` | | Static screenshots |

Socket.io events (the client authenticates with the JWT): `new_incident`, `incident_updated` (status/notes/email result), `incident_deleted`.

If the Express server is down, the AI service keeps incidents in an in-memory queue (up to 200) and retries every 5 s. Local copies of the screenshots are kept in `ai-service/captures/`.

## 8. Performance on a CPU-only laptop

Measured on a Ryzen 5 5625U (6 cores, no GPU):

| Stage | Time per call |
|---|---|
| Person YOLOv8n | 68 ms |
| Weapon YOLO11n | 81 ms |
| Fire/smoke YOLOv8n | 90 ms |
| Violence ViT-B/16 (only when 2+ people are visible) | 230 ms |
| YOLO-World S (blood) | 197 ms |
| CLIP ViT-L/14 (blood + cross-checks, every 3 s) | 1,165 ms |

Result: the **stream runs at about 15 fps** and **detection at 2.5-5 cycles per second**. On an NVIDIA GPU, detection speeds up roughly 10×.

## 9. Known limitations

- Every model is a generic public checkpoint used without fine-tuning on your camera, so expect some false positives and misses. Some seen in testing: the D-Fire model does not box large smoke plumes that CLIP recognises, and the weapon model occasionally calls an ornate object a "gun" (about 0.56 confidence). Tune the thresholds in `config.py` for your scene.
- The fight model classifies single frames. Low light makes its raw probability unreliable, which is why it requires two people plus the CLIP veto.
- Blood is zero-shot, so treat it as a hint, not evidence.

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| "Could not open camera index 0" | Close Teams/Zoom/Camera app and browser tabs using the camera; check *Settings > Privacy > Camera > Let desktop apps access your camera*; try `CAMERA_INDEX=1` |
| Live page says "AI service is offline" | Start the AI service; check `AI_SERVICE_URL` |
| Incidents never arrive | `INGEST_API_KEY` must be identical in both `.env` files; the AI service log shows "Backend unreachable" while incidents are queued |
| Email "Failed" | See the Gmail App Password steps above; the exact SMTP error is shown on the incident page |
| `[fatal] could not start server ... ECONNREFUSED` | MongoDB is not running: `net start MongoDB` (admin terminal) or use Atlas |
| First AI start is slow | Models load in about 25 s (download only once). `/status` shows `modelsReady` |

## Project structure

```
surveillance-system/
  ai-service/      FastAPI detection service
    app/main.py           endpoints, MJPEG stream
    app/camera.py         capture / detect / blood threads, annotation
    app/detectors/        person, weapon, fire_smoke, fight, blood
    app/scoring.py        threat score, levels, cooldown gate
    app/reporter.py       queued delivery to the backend
    app/model_hub.py      Hugging Face verification + download
    app/config.py         every model id, class map and threshold
    download_models.py    pre-download + print model selection
    test_detectors.py     offline check on still images
  server/          Express + MongoDB + Socket.io + Nodemailer
  client/          React (Vite) admin panel
  start.bat        starts all three services
```
