"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useScreenRecorder } from "@/hooks/useScreenRecorder";
import { RecorderControls } from "@/components/RecorderControls";
import { TranscriptGrid } from "@/components/TranscriptGrid";
import { CutReviewPanel } from "@/components/CutReviewPanel";
import { ExportModal } from "@/components/ExportModal";
import { extract16kHzMonoWav } from "@/lib/audioProcessing";
import { fetchTranscription, fetchPlannedCuts } from "@/lib/transcriptionService";
import {
  saveDraftToIndexedDB,
  loadDraftFromIndexedDB,
  clearDraftFromIndexedDB,
} from "@/lib/storage";
import { TranscriptState, CutCandidate } from "@/types/transcript";

export default function ScreenForgeStudio() {
  const {
    status,
    elapsedSeconds,
    audioLevel,
    error,
    recordedSession,
    screenStream,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    restoreSession,
  } = useScreenRecorder();

  // Video references
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const playbackVideoRef = useRef<HTMLVideoElement | null>(null);

  // Playback & Transcript state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [transcript, setTranscript] = useState<TranscriptState>({
    words: [],
    isTranscribing: false,
    error: null,
  });

  // Cut schedule state (Steps 11-14)
  const [cuts, setCuts] = useState<CutCandidate[]>([]);
  const [isPlanningCuts, setIsPlanningCuts] = useState<boolean>(false);
  const [skipNotification, setSkipNotification] = useState<string | null>(null);
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null);

  // Export modal state (Steps 15-18)
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Audio extraction metrics
  const [extractedAudioSize, setExtractedAudioSize] = useState<number | null>(null);

  // Bind live stream to monitor
  useEffect(() => {
    if (liveVideoRef.current && screenStream) {
      liveVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream, status]);

  // Restore draft from IndexedDB on initial mount
  useEffect(() => {
    async function restoreDraft() {
      const draft = await loadDraftFromIndexedDB();
      if (draft && draft.videoBlob) {
        const url = URL.createObjectURL(draft.videoBlob);
        restoreSession({
          blob: draft.videoBlob,
          url,
          durationSeconds: draft.durationSeconds,
          mimeType: draft.videoBlob.type || "video/webm",
          sizeBytes: draft.sizeBytes,
          timestamp: draft.savedAt,
        });

        if (draft.transcriptWords && draft.transcriptWords.length > 0) {
          setTranscript({
            words: draft.transcriptWords,
            isTranscribing: false,
            error: null,
          });
        }
        if (draft.cuts && draft.cuts.length > 0) {
          setCuts(draft.cuts);
        }
        if (draft.extractedAudioSize) {
          setExtractedAudioSize(draft.extractedAudioSize);
        }
        setRestoredNotice(
          `Restored unsaved session from draft (${draft.durationSeconds.toFixed(1)}s, ${(draft.sizeBytes / (1024 * 1024)).toFixed(1)} MB)`
        );
      }
    }
    restoreDraft();
  }, [restoreSession]);

  // Automatically persist session and editor state to IndexedDB whenever it changes
  useEffect(() => {
    if (status === "stopped" && recordedSession?.blob) {
      saveDraftToIndexedDB({
        videoBlob: recordedSession.blob,
        durationSeconds: recordedSession.durationSeconds,
        sizeBytes: recordedSession.sizeBytes,
        transcriptWords: transcript.words,
        cuts,
        extractedAudioSize,
      });
    }
  }, [status, recordedSession, transcript.words, cuts, extractedAudioSize]);

  // Clean transcript & IndexedDB when resetting
  const handleReset = () => {
    clearDraftFromIndexedDB();
    setTranscript({ words: [], isTranscribing: false, error: null });
    setCuts([]);
    setExtractedAudioSize(null);
    setCurrentTime(0);
    setSkipNotification(null);
    setRestoredNotice(null);
    resetRecording();
  };

  // Step 11 & 12: Request rules engine / AI cut planning
  const handleScanForCuts = useCallback(async () => {
    if (!recordedSession || transcript.words.length === 0) return;

    setIsPlanningCuts(true);
    try {
      const planned = await fetchPlannedCuts(transcript.words, recordedSession.durationSeconds);
      setCuts(planned);

      // Synchronize cut flags on words
      setTranscript((prev) => ({
        ...prev,
        words: prev.words.map((w) => {
          const matchingCut = planned.find(
            (c) => c.isApplied && w.start >= c.start - 0.05 && w.end <= c.end + 0.05
          );
          return matchingCut ? { ...w, isCut: true, cutReason: matchingCut.reason } : w;
        }),
      }));
    } catch (err) {
      console.error("Cut scanning error:", err);
    } finally {
      setIsPlanningCuts(false);
    }
  }, [recordedSession, transcript.words]);

  // Extract 16kHz audio and request transcription
  const handleGenerateTranscript = async (forceMock: boolean = false) => {
    if (!recordedSession) return;

    setTranscript((prev) => ({
      ...prev,
      isTranscribing: true,
      progressMessage: forceMock ? "Generating offline test tokens..." : "Extracting 16kHz mono audio in browser...",
      error: null,
    }));

    try {
      // 1. Client-side audio downsampling (Option C separation of audio pipeline)
      const audioWavBlob = await extract16kHzMonoWav(recordedSession.blob);
      setExtractedAudioSize(audioWavBlob.size);

      setTranscript((prev) => ({
        ...prev,
        progressMessage: forceMock ? "Aligning mock timestamps..." : "Transcribing with Groq Whisper Large v3...",
      }));

      // 2. Transcribe
      const words = await fetchTranscription(audioWavBlob, recordedSession.durationSeconds, forceMock);
      setTranscript({
        words,
        isTranscribing: false,
        error: null,
      });

      // Automatically scan for initial cuts once transcription finishes
      if (words.length > 0) {
        const planned = await fetchPlannedCuts(words, recordedSession.durationSeconds);
        setCuts(planned);
      }
    } catch (err: unknown) {
      console.error("Transcription error:", err);
      const message = err instanceof Error ? err.message : "Failed to process audio transcript.";
      setTranscript((prev) => ({
        ...prev,
        isTranscribing: false,
        error: message,
      }));
    }
  };

  // Step 14: Non-destructive preview skip (Skip approved cut ranges without immediately rewriting original file)
  const handleTimeUpdate = () => {
    if (!playbackVideoRef.current) return;
    const t = playbackVideoRef.current.currentTime;
    setCurrentTime(t);

    if (!playbackVideoRef.current.paused) {
      const activeCut = cuts.find(
        (c) => c.isApplied && t >= c.start && t < c.end
      );

      if (activeCut) {
        // Jump cleanly past the cut to prevent infinite seek loops
        const targetTime = Math.min(playbackVideoRef.current.duration, activeCut.end + 0.02);
        playbackVideoRef.current.currentTime = targetTime;
        setSkipNotification(`Skipping cut [${activeCut.words}]`);

        // Clear notification after 1.5s
        setTimeout(() => setSkipNotification(null), 1500);
      }
    }
  };

  // Seek video when clicking transcript word
  const handleSeek = (timestamp: number) => {
    if (playbackVideoRef.current) {
      playbackVideoRef.current.currentTime = timestamp;
      playbackVideoRef.current.play().catch(() => {});
    }
  };

  // Toggle word cut (strike-through) manually in transcript
  const handleToggleCut = (wordId: string) => {
    setTranscript((prev) => {
      const targetWord = prev.words.find((w) => w.id === wordId);
      if (!targetWord) return prev;

      const newIsCut = !targetWord.isCut;

      // Synchronize with cuts schedule
      setCuts((prevCuts) => {
        if (newIsCut) {
          // Add or enable a cut candidate
          const existing = prevCuts.find((c) => c.start <= targetWord.start && c.end >= targetWord.end);
          if (existing) {
            return prevCuts.map((c) => (c.id === existing.id ? { ...c, isApplied: true } : c));
          }
          return [
            ...prevCuts,
            {
              id: `cut-${Date.now()}-${wordId}`,
              start: targetWord.start,
              end: targetWord.end,
              words: targetWord.word,
              reason: "filler",
              confidence: 1.0,
              isApplied: true,
            },
          ];
        } else {
          // Disable any cut covering this word
          return prevCuts.map((c) =>
            targetWord.start >= c.start && targetWord.end <= c.end ? { ...c, isApplied: false } : c
          );
        }
      });

      return {
        ...prev,
        words: prev.words.map((w) => (w.id === wordId ? { ...w, isCut: newIsCut } : w)),
      };
    });
  };

  // Toggle cut from CutReviewPanel
  const handleToggleCutCandidate = (cutId: string) => {
    setCuts((prevCuts) => {
      const target = prevCuts.find((c) => c.id === cutId);
      if (!target) return prevCuts;

      const nextApplied = !target.isApplied;
      const updated = prevCuts.map((c) => (c.id === cutId ? { ...c, isApplied: nextApplied } : c));

      // Reflect into word tokens
      setTranscript((prev) => ({
        ...prev,
        words: prev.words.map((w) => {
          if (w.start >= target.start - 0.05 && w.end <= target.end + 0.05) {
            return { ...w, isCut: nextApplied };
          }
          return w;
        }),
      }));

      return updated;
    });
  };

  // Apply all or specific cut types
  const handleApplyAllCuts = (reasonFilter?: string) => {
    setCuts((prevCuts) => {
      const updated = prevCuts.map((c) =>
        reasonFilter ? (c.reason === reasonFilter ? { ...c, isApplied: true } : c) : { ...c, isApplied: true }
      );

      // Reflect into words
      setTranscript((prev) => ({
        ...prev,
        words: prev.words.map((w) => {
          const hasActiveCut = updated.some(
            (c) => c.isApplied && w.start >= c.start - 0.05 && w.end <= c.end + 0.05
          );
          return hasActiveCut ? { ...w, isCut: true } : w;
        }),
      }));

      return updated;
    });
  };

  // Dismiss / deselect all cuts
  const handleDismissAllCuts = () => {
    setCuts((prevCuts) => prevCuts.map((c) => ({ ...c, isApplied: false })));
    setTranscript((prev) => ({
      ...prev,
      words: prev.words.map((w) => ({ ...w, isCut: false })),
    }));
  };

  // Helper format file sizes
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const appliedCutsCount = cuts.filter((c) => c.isApplied).length;
  const totalSecondsCut = cuts
    .filter((c) => c.isApplied)
    .reduce((acc, c) => acc + (c.end - c.start), 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* Top Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 via-rose-500 to-amber-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="font-black text-white text-sm">SF</span>
            </div>
            <div>
              <span className="font-bold text-base tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                ScreenForge AI
              </span>
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                Option C • Hybrid (Steps 1–18)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-400">
            {status === "stopped" && recordedSession && (
              <button
                onClick={() => setIsExportModalOpen(true)}
                className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/25 transition-all active:scale-95 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export Video ({appliedCutsCount} cuts)
              </button>
            )}

            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Browser Desk Active</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Studio Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 flex flex-col gap-6">
        {/* Error Notification */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 flex items-start gap-3">
            <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm">
              <span className="font-semibold">{error.type === "permission_denied" ? "Permission Denied: " : "Error: "}</span>
              {error.message}
            </div>
          </div>
        )}

        {/* Restored Session Notification */}
        {restoredNotice && status === "stopped" && (
          <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 flex items-center justify-between text-xs backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
              <span className="font-medium text-white">Draft Restored:</span>
              <span>{restoredNotice}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRestoredNotice(null)}
                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] transition-colors cursor-pointer"
              >
                Dismiss
              </button>
              <button
                onClick={handleReset}
                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] border border-rose-500/30 transition-colors cursor-pointer"
              >
                Discard Draft
              </button>
            </div>
          </div>
        )}

        {/* Studio Viewport */}
        <div className="relative flex-1 min-h-[480px] rounded-3xl bg-zinc-900/40 border border-zinc-800/80 overflow-hidden flex flex-col shadow-inner">
          {/* STATE 1: IDLE */}
          {status === "idle" && (
            <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto text-center px-6 py-12 gap-5">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 shadow-xl">
                <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>

              <div>
                <h2 className="text-xl font-semibold tracking-tight text-white mb-1.5">
                  ScreenForge Recording Desk
                </h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Record your screen and microphone. Once stopped, edit your video by striking words in the transcript, preview with non-destructive skipping, and export through FFmpeg.
                </p>
              </div>

              <div className="w-full grid grid-cols-2 gap-3 text-left p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/60 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span className="text-zinc-300">Screen (30fps)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span className="text-zinc-300">Microphone Audio</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                  <span className="text-zinc-300">16kHz Audio Downsampling</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                  <span className="text-zinc-300">FFmpeg Export Engine</span>
                </div>
              </div>
            </div>
          )}

          {/* STATE 2: RECORDING OR PAUSED */}
          {(status === "recording" || status === "paused" || status === "requesting_permission") && (
            <div className="w-full h-full flex-1 relative flex items-center justify-center bg-black min-h-[460px]">
              <video
                ref={liveVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-contain max-h-[520px]"
              />

              {status === "paused" && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75.75v12a.75.75 0 01-1.5 0v-12a.75.75 0 01.75-.75zm10.5 0a.75.75 0 01.75.75v12a.75.75 0 01-1.5 0v-12a.75.75 0 01.75-.75z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-amber-200">Recording Paused</span>
                  <span className="text-xs text-zinc-400">Click Resume to continue capturing</span>
                </div>
              )}
            </div>
          )}

          {/* STATE 3: STOPPED (Local Material Ready & Side-by-Side Transcript & Cut Review) */}
          {status === "stopped" && recordedSession && (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 min-h-[440px]">
                {/* Left Side: Video Player with Non-destructive Skipping */}
                <div className="flex flex-col rounded-2xl bg-black border border-zinc-800 overflow-hidden shadow-md relative">
                  {/* Skip Notification Overlay */}
                  {skipNotification && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-rose-600/90 backdrop-blur-md text-white text-xs font-semibold shadow-lg flex items-center gap-1.5 animate-pulse">
                      <span>⏩</span>
                      <span>{skipNotification}</span>
                    </div>
                  )}

                  <div className="flex-1 flex items-center justify-center bg-black min-h-[300px]">
                    <video
                      ref={playbackVideoRef}
                      src={recordedSession.url}
                      controls
                      onTimeUpdate={handleTimeUpdate}
                      className="w-full h-full object-contain max-h-[420px]"
                    />
                  </div>

                  {/* Material Details Bar */}
                  <div className="p-3 bg-zinc-900 border-t border-zinc-800 flex flex-wrap items-center justify-between text-xs text-zinc-400 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span className="font-medium text-zinc-200">Original WebM:</span>
                      <span>{formatBytes(recordedSession.sizeBytes)}</span>
                      {extractedAudioSize && (
                        <>
                          <span>•</span>
                          <span className="text-indigo-400">16kHz Audio: {formatBytes(extractedAudioSize)}</span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono">
                            -{Math.round((1 - extractedAudioSize / recordedSession.sizeBytes) * 100)}%
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={recordedSession.url}
                        download={`screenforge_${new Date().toISOString().replace(/[:.]/g, "-")}.webm`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Raw
                      </a>

                      <button
                        onClick={() => setIsExportModalOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 text-white text-xs font-medium transition-all shadow-md active:scale-95 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        </svg>
                        Export Edited (-{totalSecondsCut.toFixed(1)}s)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Side: Interactive Transcript & Smart Cut Review */}
                <div className="flex flex-col gap-4 min-h-[380px]">
                  {transcript.words.length === 0 ? (
                    <div className="flex-1 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col items-center justify-center p-8 text-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                      </div>

                      <div>
                        <h3 className="font-semibold text-white mb-1">Transcribe Recording</h3>
                        <p className="text-xs text-zinc-400 max-w-xs">
                          Extracts a 16kHz mono audio payload and uses Groq Whisper Large v3 to align your real speech with word-level timestamps.
                        </p>
                      </div>

                      {transcript.error && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs max-w-md text-left">
                          <div className="font-semibold mb-1 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            Backend Notice:
                          </div>
                          <div>{transcript.error}</div>
                          {transcript.error.includes("GROQ_API_KEY") && (
                            <div className="mt-2 text-[11px] text-zinc-300">
                              Tip: Add <code className="bg-zinc-800 px-1 py-0.5 rounded text-amber-300 font-mono">GROQ_API_KEY=gsk_...</code> to <code className="font-mono text-zinc-300">backend/.env</code>, or click below to use the test mock.
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          onClick={() => handleGenerateTranscript(false)}
                          disabled={transcript.isTranscribing}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/25 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          {transcript.isTranscribing ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              {transcript.progressMessage || "Processing..."}
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                              </svg>
                              Transcribe Real Voice (Groq Whisper)
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleGenerateTranscript(true)}
                          disabled={transcript.isTranscribing}
                          title="Generate synthetic word timestamps for testing without API keys"
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 text-xs font-medium transition-all cursor-pointer"
                        >
                          Use Test Mock
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 flex-1">
                      {/* Transcript text grid */}
                      <div className="flex-1">
                        <TranscriptGrid
                          words={transcript.words}
                          currentTime={currentTime}
                          onSeek={handleSeek}
                          onToggleCut={handleToggleCut}
                          onBatchCutFillers={() => handleApplyAllCuts("filler")}
                          onRestoreAllCuts={handleDismissAllCuts}
                        />
                      </div>

                      {/* Smart Cut Suggestions Panel */}
                      <CutReviewPanel
                        cuts={cuts}
                        onToggleCut={handleToggleCutCandidate}
                        onApplyAll={handleApplyAllCuts}
                        onDismissAll={handleDismissAllCuts}
                        onPlanCuts={handleScanForCuts}
                        isLoading={isPlanningCuts}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls Bar */}
        <RecorderControls
          status={status}
          elapsedSeconds={elapsedSeconds}
          audioLevel={audioLevel}
          onStart={startRecording}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onStop={stopRecording}
          onReset={handleReset}
        />
      </main>

      {/* FFmpeg Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        videoBlob={recordedSession?.blob || null}
        durationSeconds={recordedSession?.durationSeconds || 0}
        cuts={cuts}
      />
    </div>
  );
}
