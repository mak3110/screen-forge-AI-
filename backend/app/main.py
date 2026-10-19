from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.services.transcription import transcribe_audio_groq
from app.schemas.transcription import TranscriptionResponse

app = FastAPI(
    title="ScreenForge AI Backend",
    description="Backend processing service for transcription, AI cut planning, and FFmpeg export rendering.",
    version="0.1.0"
)

# Enable CORS for local Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ScreenForge AI Backend",
        "has_groq_key": bool(settings.GROQ_API_KEY),
        "version": "0.1.0"
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
