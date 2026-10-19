"use client";

import React from "react";
import { RecordingStatus } from "@/types/recorder";
import { AudioMeter } from "./AudioMeter";

interface RecorderControlsProps {
  status: RecordingStatus;
  elapsedSeconds: number;
  audioLevel: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
}

export function RecorderControls({
  status,
  elapsedSeconds,
  audioLevel,
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
}: RecorderControlsProps) {
  // Format MM:SS
  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const isRecording = status === "recording";
  const isPaused = status === "paused";
  const isRequesting = status === "requesting_permission";
  const isStopped = status === "stopped";

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 backdrop-blur-md shadow-2xl">
      {/* Left: Status and Timer */}
      <div className="flex items-center gap-3">
        {/* Status Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/70 border border-zinc-700/60 text-xs font-medium">
          {isRecording && (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              </span>
              <span className="text-rose-300 font-semibold uppercase tracking-wider text-[11px]">REC</span>
            </>
          )}

          {isPaused && (
            <>
              <span className="inline-flex rounded-full h-2.5 w-2.5 bg-amber-400"></span>
              <span className="text-amber-300 font-semibold uppercase tracking-wider text-[11px]">PAUSED</span>
            </>
          )}

          {isRequesting && (
            <>
              <div className="w-2.5 h-2.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-indigo-300 font-semibold text-[11px]">REQUESTING ACCESS</span>
            </>
          )}

          {isStopped && (
            <>
              <span className="inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
              <span className="text-emerald-300 font-semibold text-[11px]">READY ON DESK</span>
            </>
          )}

          {status === "idle" && (
            <>
              <span className="inline-flex rounded-full h-2.5 w-2.5 bg-zinc-500"></span>
              <span className="text-zinc-400 font-semibold text-[11px]">IDLE</span>
            </>
          )}
        </div>

        {/* Timer */}
        <div className="font-mono text-lg font-semibold tracking-wider text-zinc-100 bg-zinc-950/80 px-3 py-1 rounded-lg border border-zinc-800">
          {formatTime(elapsedSeconds)}
        </div>

        {/* Audio Meter */}
        <AudioMeter level={audioLevel} isActive={isRecording} />
      </div>

      {/* Right: Action Buttons */}
      <div className="flex items-center gap-2.5">
        {status === "idle" && (
          <button
            onClick={onStart}
            disabled={isRequesting}
            className="group flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-medium text-sm shadow-lg shadow-red-500/20 hover:shadow-red-500/40 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white shadow-sm group-hover:scale-110 transition-transform"></span>
            Start Recording
          </button>
        )}

        {isRequesting && (
          <button
            disabled
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 font-medium text-sm cursor-not-allowed"
          >
            <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></div>
            Select Screen...
          </button>
        )}

        {(isRecording || isPaused) && (
          <>
            {isRecording ? (
              <button
                onClick={onPause}
                title="Pause recording without dropping session"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700/80 text-zinc-200 border border-zinc-700/60 font-medium text-sm transition-all active:scale-95 cursor-pointer"
              >
                <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75.75v12a.75.75 0 01-1.5 0v-12a.75.75 0 01.75-.75zm10.5 0a.75.75 0 01.75.75v12a.75.75 0 01-1.5 0v-12a.75.75 0 01.75-.75z" clipRule="evenodd" />
                </svg>
                Pause
              </button>
            ) : (
              <button
                onClick={onResume}
                title="Resume recording"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white font-medium text-sm shadow-lg shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                </svg>
                Resume
              </button>
            )}

            <button
              onClick={onStop}
              title="Stop recording and prepare media"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-medium text-sm shadow-lg shadow-rose-600/25 transition-all active:scale-95 cursor-pointer"
            >
              <span className="w-3 h-3 rounded-sm bg-white"></span>
              Stop & Finish
            </button>
          </>
        )}

        {isStopped && (
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 font-medium text-sm transition-all active:scale-95 cursor-pointer"
          >
            <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Record Again
          </button>
        )}
      </div>
    </div>
  );
}
