import pytest
from app.schemas.cut_schedule import CutPlannerRequest, CutCandidate
from app.services.cut_planner import plan_cuts_with_rules, merge_overlapping_cuts


def test_merge_overlapping_cuts():
    cuts = [
        CutCandidate(start=1.0, end=3.0, words="um", reason="filler"),
        CutCandidate(start=2.5, end=4.5, words="uh", reason="filler"),
        CutCandidate(start=6.0, end=7.0, words="like", reason="filler"),
    ]
    merged, warnings = merge_overlapping_cuts(cuts, media_duration=10.0)
    assert len(merged) == 2
    assert merged[0].start == 1.0
    assert merged[0].end == 4.5
    assert merged[1].start == 6.0
    assert merged[1].end == 7.0


def test_cut_planner_rules_fillers_and_silences():
    words = [
        {"text": "Hello", "start": 0.0, "end": 0.5},
        {"text": "um", "start": 0.6, "end": 0.9},
        {"text": "world", "start": 3.0, "end": 3.5},  # Large gap (silence 2.1s)
        {"text": "the", "start": 4.0, "end": 4.2},
        {"text": "the", "start": 4.3, "end": 4.5},   # Repetition
        {"text": "end", "start": 5.0, "end": 5.4},
    ]
    request = CutPlannerRequest(
        media_duration_seconds=6.0,
        words=words,
        settings={"min_silence_seconds": 1.0}
    )
    response = plan_cuts_with_rules(request)
    assert len(response.cuts) >= 3

    reasons = [c.reason for c in response.cuts]
    assert "filler" in reasons
    assert "silence" in reasons
    assert "repetition" in reasons


def test_cut_planner_clamps_out_of_bounds():
    with pytest.raises(Exception):
        CutCandidate(start=-1.0, end=2.0, words="test", reason="filler")

    cuts = [
        CutCandidate(start=8.0, end=15.0, words="over", reason="filler"),
    ]
    merged, warnings = merge_overlapping_cuts(cuts, media_duration=10.0)
    assert merged[0].start == 8.0
    assert merged[0].end == 10.0
    assert len(warnings) == 1

