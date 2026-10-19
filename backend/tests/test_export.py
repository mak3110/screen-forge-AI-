import pytest
from app.schemas.cut_schedule import CutCandidate
from app.services.ffmpeg_export import calculate_keep_segments
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_calculate_keep_segments():
    cuts = [
        CutCandidate(start=2.0, end=4.0, words="cut1", reason="filler"),
        CutCandidate(start=7.0, end=9.0, words="cut2", reason="silence"),
    ]
    keep = calculate_keep_segments(media_duration=10.0, cuts=cuts)
    assert len(keep) == 3
    assert keep[0] == (0.0, 2.0)
    assert keep[1] == (4.0, 7.0)
    assert keep[2] == (9.0, 10.0)


def test_calculate_keep_segments_empty():
    keep = calculate_keep_segments(media_duration=15.0, cuts=[])
    assert len(keep) == 1
    assert keep[0] == (0.0, 15.0)


def test_plan_cuts_endpoint():
    payload = {
        "media_duration_seconds": 5.0,
        "words": [
            {"text": "um", "start": 0.5, "end": 0.8},
            {"text": "hello", "start": 1.0, "end": 1.5}
        ],
        "settings": {"detect_fillers": True}
    }
    response = client.post("/api/plan-cuts", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["cuts"]) >= 1
    assert data["cuts"][0]["reason"] == "filler"


def test_download_nonexistent_returns_404():
    response = client.get("/api/download/nonexistent-id")
    assert response.status_code == 404
