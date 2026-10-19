import json
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import TypeAdapter

from app.config import settings
from app.services.transcription import transcribe_audio_groq
from app.services.cut_planner import plan_cuts_with_rules
from app.services.ffmpeg_export import process_export_job
from app.schemas.transcription import TranscriptionResponse
from app.schemas.cut_schedule import CutCandidate, CutPlannerRequest, CutPlannerResponse
from app.schemas.export import ExportResponse

app = FastAPI(
    title="ScreenForge AI Backend",
    description="Backend processing service for transcription, AI cut planning, and FFmpeg export rendering.",
    version="0.2.0"
)

# Enable CORS for Next.js frontend and Render deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "ScreenForge AI Backend",
        "version": "0.2.0",
        "docs_url": "/docs",
        "health_url": "/api/health"
    }

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ScreenForge AI Backend",
        "has_groq_key": bool(settings.GROQ_API_KEY),
        "version": "0.2.0"
    }

@app.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    duration: float = Form(0.0)
):
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")
        
        result = await transcribe_audio_groq(content, file.filename or "recording.wav")
        return result
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(exc)}")

@app.post("/api/plan-cuts", response_model=CutPlannerResponse)
async def plan_cuts(request: CutPlannerRequest):
    """
    Step 11 & 12: Suggest cuts using rules engine with strict timestamp & media duration validation.
    """
    try:
        return plan_cuts_with_rules(request)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cut planning error: {str(exc)}")

@app.post("/api/export", response_model=ExportResponse)
async def export_edited_video(
    file: UploadFile = File(...),
    duration: float = Form(...),
    cuts_json: str = Form("[]")
):
    """
    Step 15 & 16: Upload original recording and render final video through FFmpeg.
    """
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded video file is empty.")

        # Parse and validate cut schedule
        raw_cuts = json.loads(cuts_json)
        cut_adapter = TypeAdapter(list[CutCandidate])
        validated_cuts = cut_adapter.validate_python(raw_cuts)

        ext = Path(file.filename or "video.webm").suffix or ".webm"

        result = await process_export_job(
            file_bytes=content,
            file_extension=ext,
            duration_seconds=duration,
            cuts=validated_cuts
        )
        return result
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid cuts_json format.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"FFmpeg Export failed: {str(exc)}")

@app.get("/api/download/{export_id}")
async def download_exported_video(export_id: str):
    """
    Step 17: User downloads finished rendered MP4 file.
    """
    storage_dir = Path(settings.TEMP_STORAGE_DIR)
    target_path = storage_dir / f"screenforge_export_{export_id}.mp4"

    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="Exported video file not found or expired.")

    return FileResponse(
        path=target_path,
        media_type="video/mp4",
        filename=f"screenforge_{export_id[:8]}.mp4"
    )
