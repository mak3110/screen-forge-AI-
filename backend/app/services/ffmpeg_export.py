import os
import time
import uuid
import asyncio
import subprocess
from pathlib import Path
from typing import List, Tuple
import imageio_ffmpeg

from app.config import settings
from app.schemas.cut_schedule import CutCandidate
from app.schemas.export import ExportResponse


def get_ffmpeg_binary() -> str:
    """Returns guaranteed path to ffmpeg binary via imageio-ffmpeg or PATH."""
    try:
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def calculate_keep_segments(media_duration: float, cuts: List[CutCandidate]) -> List[Tuple[float, float]]:
    """
    Inverts approved cuts over the media duration to generate positive keep segments.
    """
    if not cuts:
        return [(0.0, round(media_duration, 3))]

    # Ensure sorted by start
    sorted_cuts = sorted(cuts, key=lambda c: c.start)
    keep_segments: List[Tuple[float, float]] = []
    current_pos = 0.0

    for cut in sorted_cuts:
        if cut.start > current_pos + 0.05:
            keep_segments.append((round(current_pos, 3), round(cut.start, 3)))
        current_pos = max(current_pos, cut.end)

    if current_pos < media_duration - 0.05:
        keep_segments.append((round(current_pos, 3), round(media_duration, 3)))

    return keep_segments


def cleanup_expired_media():
    """
    Rule 18: Retention policy cleanup for temporary uploads and exports.
    Deletes files older than CLEANUP_RETENTION_MINUTES.
    """
    storage_dir = Path(settings.TEMP_STORAGE_DIR)
    if not storage_dir.exists():
        return

    now = time.time()
    max_age_seconds = settings.CLEANUP_RETENTION_MINUTES * 60

    for file_path in storage_dir.glob("*"):
        if file_path.is_file():
            try:
                mtime = file_path.stat().st_mtime
                if (now - mtime) > max_age_seconds:
                    file_path.unlink(missing_ok=True)
            except Exception:
                pass


def render_cut_video_sync(
    input_video_path: str,
    output_mp4_path: str,
    keep_segments: List[Tuple[float, float]]
) -> None:
    """
    Synchronous worker executing FFmpeg with safe parameterized arguments (no shell injection).
    """
    ffmpeg_exe = get_ffmpeg_binary()

    # Case 1: No cuts needed, fast pass-through / transcode
    if len(keep_segments) == 1 and keep_segments[0][0] == 0.0:
        cmd = [
            ffmpeg_exe,
            "-y",
            "-i", str(input_video_path),
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "22",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            str(output_mp4_path)
        ]
    else:
        # Case 2: Multi-segment concat filter
        filter_parts = []
        for i, (s, e) in enumerate(keep_segments):
            filter_parts.append(f"[0:v]trim=start={s:.3f}:end={e:.3f},setpts=PTS-STARTPTS[v{i}];")
            filter_parts.append(f"[0:a]atrim=start={s:.3f}:end={e:.3f},asetpts=PTS-STARTPTS[a{i}];")

        concat_inputs = "".join(f"[v{i}][a{i}]" for i in range(len(keep_segments)))
        filter_parts.append(f"{concat_inputs}concat=n={len(keep_segments)}:v=1:a=1[outv][outa]")
        filter_str = "".join(filter_parts)

        cmd = [
            ffmpeg_exe,
            "-y",
            "-i", str(input_video_path),
            "-filter_complex", filter_str,
            "-map", "[outv]",
            "-map", "[outa]",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "22",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            str(output_mp4_path)
        ]

    process = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        shell=False  # Security caution: strictly avoid shell=True
    )

    if process.returncode != 0:
        raise RuntimeError(f"FFmpeg rendering failed: {process.stderr[-500:]}")


async def process_export_job(
    file_bytes: bytes,
    file_extension: str,
    duration_seconds: float,
    cuts: List[CutCandidate]
) -> ExportResponse:
    """
    Asynchronous orchestrator for processing an export job.
    Saves input, triggers FFmpeg, calculates durations, and cleans stale files.
    """
    cleanup_expired_media()

    storage_dir = Path(settings.TEMP_STORAGE_DIR)
    storage_dir.mkdir(parents=True, exist_ok=True)

    export_id = str(uuid.uuid4())
    input_filename = f"input_{export_id}.{file_extension.lstrip('.')}"
    output_filename = f"screenforge_export_{export_id}.mp4"

    input_path = storage_dir / input_filename
    output_path = storage_dir / output_filename

    # Save incoming upload
    with open(input_path, "wb") as f:
        f.write(file_bytes)

    # Calculate keep segments
    keep_segments = calculate_keep_segments(duration_seconds, cuts)
    final_duration = sum(e - s for s, e in keep_segments)

    try:
        # Run CPU-bound FFmpeg in threadpool
        await asyncio.to_thread(
            render_cut_video_sync,
            str(input_path),
            str(output_path),
            keep_segments
        )

        file_size = output_path.stat().st_size if output_path.exists() else 0

        # Remove input to save server storage immediately; keep only final export
        input_path.unlink(missing_ok=True)

        return ExportResponse(
            export_id=export_id,
            status="completed",
            download_url=f"/api/download/{export_id}",
            original_duration=round(duration_seconds, 2),
            final_duration=round(final_duration, 2),
            cuts_applied_count=len(cuts),
            file_size_bytes=file_size,
            message="Video rendered and ready for download."
        )
    except Exception as exc:
        input_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)
        raise RuntimeError(f"Export job error: {str(exc)}")
