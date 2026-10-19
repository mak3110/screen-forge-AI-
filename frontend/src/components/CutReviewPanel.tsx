"use client";

import React from "react";
import { CutCandidate } from "@/types/transcript";

interface CutReviewPanelProps {
  cuts: CutCandidate[];
  onToggleCut: (cutId: string) => void;
  onApplyAll: (reason?: string) => void;
  onDismissAll: () => void;
  onPlanCuts: () => void;
  isLoading: boolean;
}

export function CutReviewPanel({
  cuts,
  onToggleCut,
  onApplyAll,
  onDismissAll,
  onPlanCuts,
  isLoading,
}: CutReviewPanelProps) {
  const appliedCuts = cuts.filter((c) => c.isApplied);
  const totalSecondsSaved = appliedCuts.reduce((acc, c) => acc + (c.end - c.start), 0);

  const fillerCount = cuts.filter((c) => c.reason === "filler").length;
  const silenceCount = cuts.filter((c) => c.reason === "silence").length;
  const repetitionCount = cuts.filter((c) => c.reason === "repetition").length;

  return (
    <div className="flex flex-col rounded-2xl bg-zinc-900/70 border border-zinc-800/80 overflow-hidden backdrop-blur-md">
      {/* Panel Header */}
      <div className="p-3.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/90">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
          <h4 className="font-semibold text-xs text-zinc-100 uppercase tracking-wider">
            Smart Cut Suggestions
          </h4>
          {cuts.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-mono">
              {appliedCuts.length} / {cuts.length} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onPlanCuts}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            {cuts.length === 0 ? "Scan for Cuts" : "Re-Scan"}
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      {cuts.length > 0 && (
        <div className="px-4 py-2.5 bg-zinc-950/60 border-b border-zinc-800/60 flex flex-wrap items-center justify-between text-xs text-zinc-400 gap-2">
          <div className="flex items-center gap-3">
            <span>
              Time Saved: <strong className="text-emerald-400 font-mono">-{totalSecondsSaved.toFixed(1)}s</strong>
            </span>
            <span>•</span>
            <span className="text-zinc-500">
              {fillerCount} fillers, {silenceCount} silences, {repetitionCount} repetitions
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onApplyAll()}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer"
            >
              Select All
            </button>
            <span className="text-zinc-600">|</span>
            <button
              onClick={onDismissAll}
              className="text-[11px] text-zinc-400 hover:text-zinc-300 font-medium transition-colors cursor-pointer"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Cuts List */}
      <div className="p-3 max-h-[220px] overflow-y-auto space-y-2">
        {cuts.length === 0 ? (
          <div className="py-6 text-center text-xs text-zinc-500">
            Click <strong>Scan for Cuts</strong> to let the rules engine analyze filler words, pauses & repetitions.
          </div>
        ) : (
          cuts.map((cut) => {
            const duration = (cut.end - cut.start).toFixed(2);
            return (
              <div
                key={cut.id}
                onClick={() => onToggleCut(cut.id)}
                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                  cut.isApplied
                    ? "bg-rose-950/20 border-rose-800/40 text-rose-200"
                    : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold border transition-colors ${
                      cut.isApplied
                        ? "bg-rose-600 border-rose-500 text-white"
                        : "border-zinc-700 bg-zinc-800 text-transparent"
                    }`}
                  >
                    ✓
                  </div>
                  <div>
                    <span className="font-medium text-zinc-200">{cut.words}</span>
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase font-mono">
                      {cut.reason}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-zinc-500 font-mono text-[11px]">
                  <span>{cut.start.toFixed(2)}s - {cut.end.toFixed(2)}s</span>
                  <span className="text-rose-400">(-{duration}s)</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
