import pytest
from pydantic import ValidationError
from app.schemas.cut_schedule import CutCandidate, CutPlannerResponse
from app.schemas.transcription import TranscriptionResponse, WordTimestamp


def test_valid_word_timestamp():
    word = WordTimestamp(word="Hello", start=0.1, end=0.45)
    assert word.word == "Hello"
    assert word.start == 0.1
    assert word.end == 0.45


def test_valid_cut_candidate():
    cut = CutCandidate(start=1.2, end=1.8, words="um", reason="filler", confidence=0.95)
    assert cut.start == 1.2
    assert cut.end == 1.8
    assert cut.reason == "filler"


def test_invalid_cut_reversed_timestamps():
    with pytest.raises(ValidationError):
        # start >= end must fail
        CutCandidate(start=2.0, end=1.5, words="um", reason="filler", confidence=0.9)


def test_invalid_cut_negative_timestamp():
    with pytest.raises(ValidationError):
        CutCandidate(start=-0.5, end=1.5, words="um", reason="filler", confidence=0.9)


def test_invalid_cut_reason():
    with pytest.raises(ValidationError):
        CutCandidate(start=1.0, end=1.5, words="test", reason="unsupported_reason", confidence=0.9)
