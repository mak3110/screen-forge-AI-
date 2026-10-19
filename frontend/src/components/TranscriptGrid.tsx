"use client";

import React from "react";
import { WordToken } from "@/types/transcript";

interface TranscriptGridProps {
  words: WordToken[];
  currentTime: number;
  onSeek: (timestamp: number) => void;
  onToggleCut: (wordId: string) => void;
  onBatchCutFillers?: () => void;
  onRestoreAllCuts?: () => void;
}

export function TranscriptGrid({
  words,
  currentTime,
  onSeek,
  onToggleCut,
  onBatchCutFillers,
  onRestoreAllCuts,
}: TranscriptGridProps) {
  const cutCount = words.filter((w) => w.isCut).length;
  const fillerCount = words.filter((w) => w.cutReason === "filler" && !w.isCut).length;

  return (
    <div className="flex flex-col h-full bg-zinc-900/60 rounded-2xl border border-zinc-800/80 overflow-hidden backdrop-blur-sm">
      {/* Header / Actions Bar */}
      <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-zinc-900/80">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-400"></div>
          <h3 className="font-semibold text-sm text-zinc-100">Synchronized Transcript</h3>
          <span className="text-xs text-zinc-500 font-mono">({words.length} words)</span>
        </div>

        <div className="flex items-center gap-2">
          {fillerCount > 0 && onBatchCutFillers && (
            <button
              onClick={onBatchCutFillers}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium transition-all active:scale-95 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Auto-Cut Fillers ({fillerCount})
            </button>
          )}

          {cutCount > 0 && onRestoreAllCuts && (
            <button
              onClick={onRestoreAllCuts}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-xs font-medium transition-all active:scale-95 cursor-pointer"
            >
              Restore All ({cutCount})
            </button>
          )}
        </div>
      </div>

      {/* Transcript Text Flow Container */}
      <div className="flex-1 p-5 overflow-y-auto max-h-[460px] leading-relaxed select-none">
        {words.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
            No transcript generated yet.
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {words.map((item) => {
              const isActive = currentTime >= item.start && currentTime < item.end;
              const isCut = item.isCut;
              const isFiller = item.cutReason === "filler";

              return (
                <span
                  key={item.id}
                  className="group relative inline-flex items-center"
                >
                  <button
                    onClick={() => onSeek(item.start)}
                    title={`Click to jump to ${item.start.toFixed(2)}s`}
                    className={`px-2 py-1 rounded-md text-sm transition-all duration-100 cursor-pointer ${
                      isCut
                        ? "line-through opacity-45 text-rose-400 bg-rose-950/30 border border-rose-900/40"
                        : isActive
                        ? "bg-indigo-600 text-white font-medium shadow-md shadow-indigo-600/30 scale-105"
                        : isFiller
                        ? "bg-amber-500/10 text-amber-300 border border-amber-500/25 hover:bg-amber-500/20"
                        : "text-zinc-200 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    {item.word}
                  </button>

                  {/* Cut / Restore Hover Toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCut(item.id);
                    }}
                    title={isCut ? "Restore this word" : "Cut this word"}
                    className="opacity-0 group-hover:opacity-100 absolute -top-3.5 right-0 p-0.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] text-zinc-300 transition-opacity z-10"
                  >
                    {isCut ? "↩" : "✕"}
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Instructions */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/50 text-[11px] text-zinc-400 flex items-center justify-between">
        <span>💡 Click any word to scrub video. Hover to strike-through/cut.</span>
        <span className="font-mono text-zinc-500">{currentTime.toFixed(2)}s</span>
      </div>
    </div>
  );
}
