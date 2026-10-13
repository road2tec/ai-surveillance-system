# How to run the project (terminal commands)

You need **3 terminals** (Command Prompt). MongoDB does not need a terminal; it runs as a Windows service.

In every command below, replace `D:\ai-surveillance-system` with the folder where the project is on your laptop.

---

## One time only: first setup

```bat
cd D:\ai-surveillance-system
setup.bat
notepad server\.env
```

In `server\.env`, fill in these values and save:

| Key | What to put |
|---|---|
| `SMTP_USER` | Gmail address that sends the alerts |
| `SMTP_PASS` | 16-character Gmail App Password (not your normal password); see SETUP.md step 5 |
| `ALERT_TO` | Email address(es) that receive alerts, comma separated |
| `ADMIN_EMAIL` | Login email for the admin panel |
| `ADMIN_PASSWORD` | Login password for the admin panel |

---

## Every time: start the 3 services

### Terminal 1: AI service (port 8000)

```bat
cd D:\ai-surveillance-system\ai-service
venv\Scripts\activate
python -m app.main
```

Wait about 25 seconds until you see `[model] blood -> ...` and `Uvicorn running on http://0.0.0.0:8000`.

### Terminal 2: API server (port 5000)

```bat
cd D:\ai-surveillance-system\server
npm start
```

Ready when it shows `[db] connected` and `[api] listening on http://localhost:5000`.

### Terminal 3: Admin panel (port 5173)

```bat
cd D:\ai-surveillance-system\client
npm run dev
```

Ready when it shows `Local: http://localhost:5173/`.

### Open the app

Go to **http://localhost:5173**, sign in with your `ADMIN_EMAIL` / `ADMIN_PASSWORD`, and click **Start camera**.

### Stop

Press `Ctrl + C` in each terminal.

---

## Shortcuts

| Instead of 3 terminals | Command |
|---|---|
| One terminal for everything | `cd D:\ai-surveillance-system` then `npm run dev` |
| No terminal at all | Double-click `start.bat` |

---

## If something fails

| Problem | Fix |
|---|---|
| Terminal 2 shows `could not start server` | MongoDB is not running: press `Win + R`, type `services.msc`, find **MongoDB Server**, right-click it, **Start** |
| Terminal 1 shows `Could not open camera index 0` | Close Zoom/Teams/the Camera app/browser tabs using the camera, then click Start camera again |
| `venv\Scripts\activate` not found | Setup did not finish: run `setup.bat` again |
| `npm` or `python` not recognized | Install Node.js / Python 3.12 (tick "Add python.exe to PATH"), restart the laptop |
| Port already in use | An old terminal is still running the service: close it, or restart the laptop |

Full installation guide: [SETUP.md](SETUP.md) · Technical reference: [README.md](README.md) · Project report: [docs/Project-Documentation.pdf](docs/Project-Documentation.pdf)
