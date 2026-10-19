from pydantic import BaseModel, Field, model_validator
from typing import List, Literal


class CutCandidate(BaseModel):
    start: float = Field(..., ge=0.0)
    end: float = Field(..., gt=0.0)
    words: str
    reason: Literal["filler", "silence", "false_start", "repetition"]
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_range(self):
        if self.start >= self.end:
            raise ValueError(f"start timestamp ({self.start}) must be strictly less than end ({self.end})")
        return self


class CutPlannerRequest(BaseModel):
    media_duration_seconds: float = Field(..., gt=0.0)
    words: List[dict]
    settings: dict = Field(default_factory=dict)


class CutPlannerResponse(BaseModel):
    cuts: List[CutCandidate] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
