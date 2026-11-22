from __future__ import annotations

import importlib.util
import os
import platform
import secrets
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, File, Form, Header, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

VERSION = "0.1.1"
HOST = "127.0.0.1"
PORT = int(os.environ.get("FREMIQ_AGENT_PORT", "8765"))
PAIR_CODE = f"{secrets.randbelow(1_000_000):06d}"
PAIR_CODE_CREATED = time.time()
PAIR_CODE_TTL = 600
PAIRING_TOKEN = secrets.token_urlsafe(32)
INSTALL_JOBS: dict[str, dict[str, Any]] = {}
INSTALL_JOBS_LOCK = threading.Lock()
CONFIG_FILE = Path.home() / ".fremiq" / "agent-token"
CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
if CONFIG_FILE.exists():
    try:
        PAIRING_TOKEN = CONFIG_FILE.read_text(encoding="utf-8").strip() or PAIRING_TOKEN
    except OSError:
        pass

app = FastAPI(title="FREMIQ Local Agent", version=VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4000", "http://127.0.0.1:4000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


class PairRequest(BaseModel):
    code: str
    client: str | None = None


def require_token(authorization: str | None) -> None:
    if not authorization or not secrets.compare_digest(
        authorization.removeprefix("Bearer ").strip(), PAIRING_TOKEN
    ):
        raise HTTPException(status_code=401, detail="Pair this FREMIQ Local Agent first")


def detected_tools() -> list[str]:
    names = ["python"]
    for name in ("ffmpeg", "ffprobe", "git", "node"):
        if shutil.which(name):
            names.append(name)
    for module, key in (
        ("faster_whisper", "faster-whisper"),
        ("whisper", "whisper"),
        ("torch", "torch"),
        ("cv2", "opencv"),
        ("moviepy", "moviepy"),
        ("numpy", "numpy"),
        ("PIL", "pillow"),
    ):
        if importlib.util.find_spec(module):
            names.append(key)
    return names


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "version": VERSION,
        "hostname": socket.gethostname(),
        "os": f"{platform.system()} {platform.release()}",
        "gpu": None,
        "tools": detected_tools(),
    }


@app.post("/api/pair")
def pair(request: PairRequest) -> dict[str, str]:
    global PAIR_CODE
    if time.time() - PAIR_CODE_CREATED > PAIR_CODE_TTL:
        raise HTTPException(status_code=410, detail="Pairing code expired. Restart the Local Agent for a new code.")
    if not secrets.compare_digest(request.code.strip(), PAIR_CODE):
        raise HTTPException(status_code=401, detail="Pairing code is incorrect")
    CONFIG_FILE.write_text(PAIRING_TOKEN, encoding="utf-8")
    try:
        CONFIG_FILE.chmod(0o600)
    except OSError:
        pass
    PAIR_CODE = ""
    print("FREMIQ pairing completed. You can close this window to stop the Local Agent.")
    return {"token": PAIRING_TOKEN}


@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form(default="faster-whisper/base"),
    language: str = Form(default="auto"),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_token(authorization)
    if importlib.util.find_spec("faster_whisper") is None:
        raise HTTPException(
            status_code=503,
            detail="Faster-Whisper is not installed on this Local Agent. Install it from FREMIQ Tool Manager, then retry.",
        )

    model_name = model.split("/", 1)[-1] if model.startswith("faster-whisper/") else model
    if model_name not in {"tiny", "base", "small", "medium", "large-v3", "distil-large-v3"}:
        raise HTTPException(status_code=400, detail="Unsupported Faster-Whisper model")

    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename or "audio.bin").suffix or ".bin") as temp:
            temp_path = Path(temp.name)
            total = 0
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > 2 * 1024 * 1024 * 1024:
                    raise HTTPException(status_code=413, detail="Video is over the 2 GB local transcription limit")
                temp.write(chunk)

        from faster_whisper import WhisperModel

        device = os.environ.get("FREMIQ_WHISPER_DEVICE", "cpu")
        compute_type = os.environ.get("FREMIQ_WHISPER_COMPUTE_TYPE", "int8" if device == "cpu" else "float16")
        whisper = WhisperModel(model_name, device=device, compute_type=compute_type)
        language_arg = None if language == "auto" else language
        segments, info = whisper.transcribe(str(temp_path), language=language_arg, word_timestamps=True)
        cues = []
        for segment in segments:
            words = [
                {"text": (word.word or "").strip(), "start": word.start, "end": word.end}
                for word in (segment.words or [])
            ]
            cues.append(
                {
                    "id": secrets.token_hex(12),
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text.strip(),
                    "words": words,
                }
            )
        return {"cues": cues, "language": info.language, "model": f"faster-whisper/{model_name} (local)"}
    except HTTPException:
        raise
    except Exception as error:
        if "metadata_errors" in str(error):
            raise HTTPException(
                status_code=500,
                detail=(
                    "Faster-Whisper and PyAV versions are incompatible. Open Tool Manager, "
                    "choose Faster-Whisper → Repair / update locally, wait for it to finish, "
                    "then restart the Local Agent and retry transcription."
                ),
            ) from error
        raise HTTPException(status_code=500, detail=f"Local transcription failed: {error}") from error
    finally:
        if temp_path:
            temp_path.unlink(missing_ok=True)
        await file.close()


class InstallRequest(BaseModel):
    key: str
    approved: bool = False


@app.post("/api/tools/install")
def install_tool(
    request: InstallRequest,
    background_tasks: BackgroundTasks,
    response: Response,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_token(authorization)
    if not request.approved:
        raise HTTPException(status_code=400, detail="Explicit install approval is required")
    packages = {
        "faster-whisper": ["faster-whisper", "av<19"],
        "whisper": ["openai-whisper"],
    }
    package_args = packages.get(request.key)
    if not package_args:
        raise HTTPException(status_code=400, detail="This agent only installs allow-listed transcription packages")
    if any(job["key"] == request.key and job["status"] == "running" for job in INSTALL_JOBS.values()):
        raise HTTPException(status_code=409, detail="An install for this tool is already running")
    job_id = secrets.token_urlsafe(18)
    with INSTALL_JOBS_LOCK:
        INSTALL_JOBS[job_id] = {
            "jobId": job_id,
            "key": request.key,
            "status": "running",
            "progress": "Downloading and installing package; this may take several minutes",
            "output": "",
            "error": None,
            "createdAt": time.time(),
        }
    background_tasks.add_task(run_install, job_id, package_args)
    response.status_code = 202
    return {"jobId": job_id, "key": request.key, "status": "running"}


def run_install(job_id: str, packages: list[str]) -> None:
    python = os.environ.get("FREMIQ_PYTHON", os.sys.executable)
    command = [python, "-m", "pip", "install", "--progress-bar", "off", *packages]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=1800,
            check=False,
        )
        output = (completed.stdout + "\n" + completed.stderr)[-8000:]
        with INSTALL_JOBS_LOCK:
            job = INSTALL_JOBS.get(job_id)
            if not job:
                return
            job["output"] = output
            if completed.returncode == 0:
                job["status"] = "complete"
                job["progress"] = "Install complete"
                job["restartRequired"] = True
            else:
                job["status"] = "failed"
                job["progress"] = "Install failed"
                job["error"] = (output.strip() or "pip exited with a non-zero status")[-3000:]
    except subprocess.TimeoutExpired:
        with INSTALL_JOBS_LOCK:
            job = INSTALL_JOBS.get(job_id)
            if job:
                job.update(
                    status="failed",
                    progress="Install timed out after 30 minutes",
                    error="Package installation exceeded the 30-minute limit. Check internet access, disk space, and Python compatibility.",
                )
    except Exception as error:
        with INSTALL_JOBS_LOCK:
            job = INSTALL_JOBS.get(job_id)
            if job:
                job.update(status="failed", progress="Install failed", error=str(error))


@app.get("/api/tools/install/{job_id}")
def install_status(job_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_token(authorization)
    with INSTALL_JOBS_LOCK:
        job = INSTALL_JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Install job not found; restart the install from Tool Manager")
        return {**job, "tools": detected_tools()}


@app.post("/api/agent/diagnose")
def diagnose(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_token(authorization)
    return {
        "python": os.sys.version,
        "platform": platform.platform(),
        "tools": detected_tools(),
        "fasterWhisperReady": importlib.util.find_spec("faster_whisper") is not None,
        "modelCache": str(Path.home() / ".cache" / "huggingface" / "hub"),
    }


@app.post("/api/agent/restart")
def restart(authorization: str | None = Header(default=None)) -> dict[str, str]:
    require_token(authorization)
    threading.Timer(0.5, lambda: os._exit(0)).start()
    return {"message": "Agent is stopping. Start it again from its launcher."}


if __name__ == "__main__":
    print("FREMIQ Local Agent")
    print(f"URL: http://{HOST}:{PORT}")
    print(f"Pairing code: {PAIR_CODE}")
    print("Pairing code expires after 10 minutes.")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
