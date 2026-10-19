from pydantic import BaseModel, Field
from typing import List, Literal


class WordTimestamp(BaseModel):
    word: str = Field(..., min_length=1)
    start: float = Field(..., ge=0.0)
    end: float = Field(..., ge=0.0)


class TranscriptionResponse(BaseModel):
    status: Literal["ok", "alignment_unavailable", "error"] = "ok"
    words: List[WordTimestamp] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
