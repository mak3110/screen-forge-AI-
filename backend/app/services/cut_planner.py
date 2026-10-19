import re
from typing import List, Dict, Any, Tuple
from app.schemas.cut_schedule import CutCandidate, CutPlannerRequest, CutPlannerResponse
from app.config import settings

# Common English verbal fillers
FILLER_WORDS = {
    "um", "uh", "er", "ah", "like", "hmm", "you know", "basically", 
    "actually", "literally", "i mean", "sort of", "kind of"
}

def normalize_text(text: str) -> str:
    return re.sub(r"[^\w\s]", "", text).strip().lower()

def merge_overlapping_cuts(cuts: List[CutCandidate], media_duration: float) -> Tuple[List[CutCandidate], List[str]]:
    """
    Validates cuts against media duration and merges overlapping or contiguous cut ranges.
    Prevents player seek loops and FFmpeg trim overlaps.
    """
    warnings: List[str] = []
    valid_cuts: List[CutCandidate] = []

    for cut in cuts:
        # Validate against duration bounds
        if cut.start < 0:
            warnings.append(f"Cut start {cut.start}s clamped to 0.0s")
            cut.start = 0.0
        if cut.end > media_duration:
            warnings.append(f"Cut end {cut.end}s clamped to media duration {media_duration}s")
            cut.end = media_duration
        if cut.start >= cut.end:
            warnings.append(f"Discarded invalid cut range: {cut.start}s - {cut.end}s")
            continue
        valid_cuts.append(cut)

    if not valid_cuts:
        return [], warnings

    # Sort cuts strictly by start time
    valid_cuts.sort(key=lambda c: (c.start, c.end))

    merged: List[CutCandidate] = [valid_cuts[0]]
    for next_cut in valid_cuts[1:]:
        prev_cut = merged[-1]
        # Merge if overlapping or within 50ms proximity
        if next_cut.start <= prev_cut.end + 0.05:
            merged[-1] = CutCandidate(
                start=round(prev_cut.start, 3),
                end=round(max(prev_cut.end, next_cut.end), 3),
                words=f"{prev_cut.words} ... {next_cut.words}".strip(),
                reason=prev_cut.reason if prev_cut.reason == next_cut.reason else "filler",
                confidence=min(prev_cut.confidence, next_cut.confidence)
            )
        else:
            merged.append(next_cut)

    return merged, warnings


def plan_cuts_with_rules(request: CutPlannerRequest) -> CutPlannerResponse:
    """
    Local rules engine for instantaneous, reliable cut suggestions without hallucinated timestamps:
    1. Filler words identification
    2. Silence gaps detection (> min_silence_seconds)
    3. Immediate word repetitions ("we we", "the the")
    """
    raw_cuts: List[CutCandidate] = []
    words = request.words
    min_silence = float(request.settings.get("min_silence_seconds", 1.0))
    detect_fillers = bool(request.settings.get("detect_fillers", True))
    detect_silence = bool(request.settings.get("detect_silence", True))
    detect_repetitions = bool(request.settings.get("detect_repetitions", True))

    for i, word_data in enumerate(words):
        w_text = str(word_data.get("text", "")).strip()
        w_start = float(word_data.get("start", 0.0))
        w_end = float(word_data.get("end", 0.0))
        norm_w = normalize_text(w_text)

        # 1. Filler detection
        if detect_fillers and norm_w in FILLER_WORDS:
            raw_cuts.append(
                CutCandidate(
                    start=round(w_start, 3),
                    end=round(w_end, 3),
                    words=w_text,
                    reason="filler",
                    confidence=0.95
                )
            )

        # 2. Silence detection (gap before next word)
        if detect_silence and i < len(words) - 1:
            next_start = float(words[i + 1].get("start", 0.0))
            gap = next_start - w_end
            if gap >= min_silence:
                # Add safe padding (100ms) so natural speech boundaries aren't clipped
                silence_start = round(w_end + 0.1, 3)
                silence_end = round(next_start - 0.1, 3)
                if silence_end > silence_start:
                    raw_cuts.append(
                        CutCandidate(
                            start=silence_start,
                            end=silence_end,
                            words=f"[Silence {round(gap, 1)}s]",
                            reason="silence",
                            confidence=1.0
                        )
                    )

        # 3. Repetition detection
        if detect_repetitions and i < len(words) - 1:
            next_text = str(words[i + 1].get("text", "")).strip()
            norm_next = normalize_text(next_text)
            if norm_w and norm_w == norm_next and len(norm_w) > 1:
                # Propose cutting the first stuttered instance
                raw_cuts.append(
                    CutCandidate(
                        start=round(w_start, 3),
                        end=round(w_end, 3),
                        words=f"Repeated: {w_text}",
                        reason="repetition",
                        confidence=0.90
                    )
                )

    merged_cuts, warnings = merge_overlapping_cuts(raw_cuts, request.media_duration_seconds)
    return CutPlannerResponse(cuts=merged_cuts, warnings=warnings)
