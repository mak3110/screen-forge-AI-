"use client";

import React, { useState } from "react";
import { CutCandidate, ExportJobState } from "@/types/transcript";
import { exportVideoFFmpeg } from "@/lib/transcriptionService";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoBlob: Blob | null;
  durationSeconds: number;
  cuts: CutCandidate[];
}

export function ExportModal({
  isOpen,
  onClose,
  videoBlob,
  durationSeconds,
  cuts,
}: ExportModalProps) {
  const [exportState, setExportState] = useState<ExportJobState>({
    isExporting: false,
    progressStage: "",
    exportResult: null,
    error: null,
  });

  if (!isOpen) return null;

  const appliedCuts = cuts.filter((c) => c.isApplied);
  const totalSecondsCut = appliedCuts.reduce((acc, c) => acc + (c.end - c.start), 0);
  const estimatedFinalDuration = Math.max(0.1, durationSeconds - totalSecondsCut);

  const handleStartExport = async () => {
    if (!videoBlob) return;

    setExportState({
      isExporting: true,
      progressStage: "Uploading recording & verified cut schedule to FFmpeg worker...",
      exportResult: null,
      error: null,
    });

    try {
      const result = await exportVideoFFmpeg(videoBlob, durationSeconds, appliedCuts);
      setExportState({
        isExporting: false,
        progressStage: "Export ready!",
        exportResult: result,
        error: null,
      });
    } catch (err: unknown) {
      console.error("Export error:", err);
      const message = err instanceof Error ? err.message : "Export failed unexpectedly.";
      setExportState({
        isExporting: false,
        progressStage: "",
        exportResult: null,
        error: message,
      });
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Export Rendered Video</h3>
              <p className="text-xs text-zinc-400">Step 15-18: FFmpeg Concat & Splice Engine</p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={exportState.isExporting}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Metrics Card */}
          <div className="grid grid-cols-3 gap-3 p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 text-center">
            <div>
              <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Original</div>
              <div className="text-sm font-semibold font-mono text-zinc-200 mt-0.5">
                {durationSeconds.toFixed(1)}s
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Cuts Applied</div>
              <div className="text-sm font-semibold font-mono text-rose-400 mt-0.5">
                {appliedCuts.length} (-{totalSecondsCut.toFixed(1)}s)
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Final Output</div>
              <div className="text-sm font-semibold font-mono text-emerald-400 mt-0.5">
                {estimatedFinalDuration.toFixed(1)}s
              </div>
            </div>
          </div>

          {/* Architecture Caution & Privacy Note */}
          <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 leading-relaxed flex items-start gap-2.5">
            <svg className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <strong>Architecture Disclosure:</strong> Video is rendered via local FFmpeg using parameterized arguments (no arbitrary shell execution). Temporary files are stored in <code className="bg-indigo-950/60 px-1 py-0.5 rounded text-indigo-200 font-mono">./temp_storage</code> and automatically purged after 60 minutes.
            </div>
          </div>

          {/* Error Message */}
          {exportState.error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <span className="font-semibold">Export Failed: </span>
              {exportState.error}
            </div>
          )}

          {/* Success Result */}
          {exportState.exportResult && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Render Complete!</span>
              </div>

              <div className="text-xs text-zinc-300 space-y-1 font-mono">
                <div>Duration: {exportState.exportResult.finalDuration}s (saved {totalSecondsCut.toFixed(1)}s)</div>
                <div>File size: {formatBytes(exportState.exportResult.fileSizeBytes)}</div>
              </div>

              <a
                href={exportState.exportResult.downloadUrl}
                download="screenforge_edited.mp4"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Rendered MP4
              </a>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-950/40 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={exportState.isExporting}
            className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white text-xs font-medium transition-colors cursor-pointer"
          >
            {exportState.exportResult ? "Close" : "Cancel"}
          </button>

          {!exportState.exportResult && (
            <button
              onClick={handleStartExport}
              disabled={exportState.isExporting || !videoBlob}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/25 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {exportState.isExporting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{exportState.progressStage || "Rendering..."}</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Start FFmpeg Render</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
