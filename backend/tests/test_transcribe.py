from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.transcription import TranscriptionResponse, WordTimestamp

client = TestClient(app)


def test_transcribe_missing_key_error():
    with patch("app.config.settings.GROQ_API_KEY", ""):
        files = {"file": ("test.wav", b"dummy audio content", "audio/wav")}
        response = client.post("/api/transcribe", files=files, data={"duration": "5.0"})
        assert response.status_code == 400
        assert "GROQ_API_KEY" in response.json()["detail"]


def test_transcribe_successful_mock():
    mock_response = TranscriptionResponse(
        status="ok",
        words=[
            WordTimestamp(word="Hello", start=0.0, end=0.4),
            WordTimestamp(word="world", start=0.41, end=0.9),
        ],
        warnings=[]
    )
    with patch("app.main.transcribe_audio_groq", new_callable=AsyncMock) as mock_transcribe:
        mock_transcribe.return_value = mock_response
        files = {"file": ("test.wav", b"RIFF dummy wav content", "audio/wav")}
        response = client.post("/api/transcribe", files=files, data={"duration": "1.0"})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert len(data["words"]) == 2
        assert data["words"][0]["word"] == "Hello"
