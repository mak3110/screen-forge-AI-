from pydantic import BaseModel, Field
from typing import List, Literal, Optional
from app.schemas.cut_schedule import CutCandidate


class ExportRequestMetadata(BaseModel):
    duration_seconds: float = Field(..., gt=0.0)
    cuts: List[CutCandidate] = Field(default_factory=list)


class ExportResponse(BaseModel):
    export_id: str
    status: Literal["completed", "failed"]
    download_url: str
    original_duration: float
    final_duration: float
    cuts_applied_count: int
    file_size_bytes: int
    message: Optional[str] = None
