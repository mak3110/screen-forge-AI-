"use client";

import React from "react";

interface AudioMeterProps {
  level: number; // 0 to 100
  isActive: boolean;
}

export function AudioMeter({ level, isActive }: AudioMeterProps) {
  // Determine color based on signal level
  const getColor = () => {
    if (!isActive) return "bg-zinc-700";
    if (level > 80) return "bg-rose-500 shadow-rose-500/50";
    if (level > 40) return "bg-emerald-400 shadow-emerald-400/50";
    return "bg-emerald-500";
  };

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800 text-xs font-mono">
      <div className="flex items-center gap-1.5">
        <svg
          className={`w-3.5 h-3.5 transition-colors ${
            isActive && level > 5 ? "text-emerald-400 animate-pulse" : "text-zinc-500"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
        <span className="text-zinc-400 text-[11px] font-sans">MIC</span>
      </div>

      <div className="w-16 h-2 bg-zinc-800 rounded-full overflow-hidden p-[1px]">
        <div
          className={`h-full rounded-full transition-all duration-75 ${getColor()}`}
          style={{ width: `${isActive ? Math.max(4, level) : 0}%` }}
        />
      </div>
    </div>
  );
}
