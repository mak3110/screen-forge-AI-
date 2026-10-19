import httpx
from app.config import settings
from app.schemas.transcription import TranscriptionResponse, WordTimestamp


GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions"


async def transcribe_audio_groq(file_bytes: bytes, filename: str = "audio.wav") -> TranscriptionResponse:
    if not settings.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not configured. Please add your key to backend/.env")

    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY.strip()}"
    }

    files = {
        "file": (filename, file_bytes, "audio/wav")
    }

    data = {
        "model": "whisper-large-v3",
        "response_format": "verbose_json",
        "timestamp_granularities[]": "word",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            GROQ_TRANSCRIPTION_URL,
            headers=headers,
            files=files,
            data=data
        )

        if response.status_code == 401:
            raise ValueError("Invalid Groq API key. Please check GROQ_API_KEY in backend/.env")
        elif response.status_code == 429:
            raise ValueError("Groq rate limit exceeded (429). Please retry in a few moments.")
        elif response.status_code != 200:
            raise ValueError(f"Groq API error ({response.status_code}): {response.text}")

        result = response.json()

    words_data = result.get("words", [])
    word_timestamps = []

    for item in words_data:
        word = item.get("word", "").strip()
        start = float(item.get("start", 0.0))
        end = float(item.get("end", 0.0))

        if word and start <= end:
            word_timestamps.append(
                WordTimestamp(
                    word=word,
                    start=start,
                    end=end
                )
            )

    # Fallback to segments if word-level array was omitted by provider
    if not word_timestamps and "segments" in result:
        for seg in result["segments"]:
            text = seg.get("text", "").strip()
            if text:
                word_timestamps.append(
                    WordTimestamp(
                        word=text,
                        start=float(seg.get("start", 0.0)),
                        end=float(seg.get("end", 0.0))
                    )
                )

    return TranscriptionResponse(
        status="ok",
        words=word_timestamps,
        warnings=[]
    )
