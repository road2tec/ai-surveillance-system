# Setup guide: installing on a new Windows laptop

Follow these steps in order. Total time is about 30-45 minutes; most of it is downloads.

## Step 1: Install the required software

Install each of these with the default options unless a note says otherwise.

| # | Software | Download | Notes |
|---|---|---|---|
| 1 | **Python 3.12** | <https://www.python.org/downloads/release/python-3120/> → "Windows installer (64-bit)" | On the first installer screen, **tick "Add python.exe to PATH"**. Do not use Python 3.13 or newer |
| 2 | **Node.js LTS** | <https://nodejs.org> → LTS | Default options |
| 3 | **Git** | <https://git-scm.com/download/win> | Default options |
| 4 | **MongoDB Community Server** | <https://www.mongodb.com/try/download/community> → Windows, msi | Choose **"Complete"** and keep **"Install MongoD as a Service"** ticked. MongoDB Compass (optional) lets you browse the data |

After installing, **restart the laptop** (or at least open a new terminal) so the new PATH entries take effect.

To check, open **Command Prompt** and run:

```bat
python --version
node --version
git --version
```

Each command should print a version number.

## Step 2: Get the project code

**Option A, with Git** (needs access to the private GitHub repository):

```bat
cd %USERPROFILE%\Desktop
git clone https://github.com/road2tec/ai-surveillance-system.git
cd ai-surveillance-system
```

**Option B, without Git access:** the repository owner downloads it from GitHub with **Code → Download ZIP**, copies the ZIP to the laptop and extracts it to the Desktop.

> Use a folder path **without special characters** (spaces are fine).

## Step 3: Run the one-click installer

Double-click **`setup.bat`** in the project folder, or run it from Command Prompt:

```bat
setup.bat
```

It will:

1. check that Node, Git and Python are installed,
2. install the Node.js packages for the server, admin panel and launcher,
3. create a Python virtual environment and install the AI packages (PyTorch, Ultralytics, transformers and others; 5-15 minutes),
4. create the three `.env` configuration files with fresh random secrets,
5. download all pretrained AI models (about 2.5 GB) and print which model was chosen for each detector.

Wait for **"Setup complete."** If a step fails, read the error, fix it (usually a missing tool or a dropped internet connection), and run `setup.bat` again. Finished steps are skipped or finish quickly the second time.

## Step 4: Check that MongoDB is running

Press `Win + R`, type `services.msc` and press Enter. Find **MongoDB Server (MongoDB)** and check that its status is **Running**. If it isn't, right-click it and choose **Start**.

To use MongoDB Atlas (cloud) instead, put the Atlas connection string in `MONGO_URI` in `server\.env`.

## Step 5: Configure email alerts (Gmail)

1. Sign in to the Gmail account that will **send** alerts.
2. Turn on 2-Step Verification: <https://myaccount.google.com/security>.
3. Create an App Password: <https://myaccount.google.com/apppasswords>. Name it `Surveillance` and click **Create**, then copy the 16-character password.
4. Open `server\.env` in Notepad and set:

```
SMTP_USER=the.sender@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
ALERT_TO=first.recipient@gmail.com,second.recipient@gmail.com
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=ChooseAStrongPassword
```

`ADMIN_EMAIL` and `ADMIN_PASSWORD` are the login for the admin panel. Change them **before** the first start; the account is created the first time the server runs.

## Step 6: Start the system

Double-click **`start.bat`**. Three windows open:

| Window | What it is |
|---|---|
| AI service :8000 | Camera and AI models. Shows `[model] ...` lines when the models are loaded |
| API server :5000 | Backend. Shows `[db] connected` and `[api] listening` |
| Admin panel :5173 | Web interface |

The browser opens <http://localhost:5173> automatically. **Keep all three windows open** while using the system. To stop the system, close the three windows.

### Alternative: start each service in its own terminal

`start.bat` simply opens these three terminals for you. To start them by hand (useful for seeing errors), open **3 Command Prompt windows**. The examples assume the project is at `C:\Users\<you>\Desktop\ai-surveillance-system`; replace that path with yours.

**Terminal 1: AI service (port 8000)**

```bat
cd C:\Users\<you>\Desktop\ai-surveillance-system\ai-service
venv\Scripts\activate
python -m app.main
```

Ready when it prints `[model] blood -> ...` (about 25 s) and `Uvicorn running on http://0.0.0.0:8000`.

**Terminal 2: API server (port 5000)**

```bat
cd C:\Users\<you>\Desktop\ai-surveillance-system\server
npm start
```

Ready when it prints `[db] connected` and `[api] listening on http://localhost:5000`.

**Terminal 3: Admin panel (port 5173)**

```bat
cd C:\Users\<you>\Desktop\ai-surveillance-system\client
npm run dev
```

Ready when it prints `Local: http://localhost:5173/`. Open that link in the browser.

MongoDB does not need a terminal; it runs as a Windows service (Step 4). To stop the system, press `Ctrl + C` in each terminal.

**Optional:** one terminal for everything, from the project root folder: `npm run dev` (all three services with coloured logs).

## Step 7: Use it

1. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. The defaults are **admin@example.com** / **Admin@12345**.
2. **Settings:** check the recipient list, click **Save settings**, then **Send test email**. The email should arrive within a minute.
3. **Live monitor:** wait until "Loading AI models" disappears (about 25 seconds), then click **Start camera**. Allow camera access if Windows asks.
4. Test it: hold a kitchen knife in front of the camera, or show a phone screen with a photo of a gun or a fire. The score turns red, an alert sound plays, a toast appears, and an email with the screenshot is sent.
5. **Detection history:** every incident with its screenshot. Click a row to mark it Acknowledged, Resolved or False alarm and add notes. **Export CSV** downloads the list.
6. **Dashboard:** totals and charts.

**Test alert** (Live monitor) sends a simulated incident through the full pipeline without needing a real threat.

## Troubleshooting

| Problem | Solution |
|---|---|
| `setup.bat` says Python not found | Reinstall Python 3.12 and tick "Add python.exe to PATH" |
| pip install fails with a network error | Check the internet connection and run `setup.bat` again |
| "Could not open camera index 0" | Close Zoom/Teams/the Camera app/browser tabs using the camera. Windows Settings → Privacy & security → Camera → allow desktop apps. For a USB camera set `CAMERA_INDEX=1` in `ai-service\.env` |
| API window shows `could not start server` | MongoDB is not running (Step 4) |
| Live monitor says "AI service is offline" | The AI service window closed or crashed; read its error and restart `start.bat` |
| Email shows "Failed" in history | Open the incident to see the exact error. `535 Username and Password not accepted` means a wrong App Password or `SMTP_USER` |
| Port already in use | An old window is still running. Close all three windows (or restart the laptop) and run `start.bat` again |
| Detection is slow | This is normal on a CPU-only laptop (about 3-5 analyses per second while the video stays smooth). A laptop with an NVIDIA GPU is much faster: install the CUDA build of PyTorch (see README) |

For the full technical documentation see **README.md** and **docs/Project-Documentation.pdf**.
