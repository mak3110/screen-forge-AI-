"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { RecordingStatus, RecordingError, RecordedSession } from "@/types/recorder";

export function useScreenRecorder() {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [error, setError] = useState<RecordingError | null>(null);
  const [recordedSession, setRecordedSession] = useState<RecordedSession | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // Stream & Recording references
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Web Audio Context references
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Timer reference
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedSecondsRef = useRef<number>(0);

  // Determine best supported WebM codec
  const getOptimalMimeType = (): string => {
    if (typeof MediaRecorder === "undefined") return "video/webm";
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=h264,opus",
      "video/webm",
    ];
    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }
    return "video/webm";
  };

  // Stop and release all hardware streams
  const releaseStreams = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (combinedStreamRef.current) {
      combinedStreamRef.current.getTracks().forEach((track) => track.stop());
      combinedStreamRef.current = null;
    }
    setScreenStream(null);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Update real-time microphone level for visual feedback
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    const update = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      // Normalize to 0 - 100 percentage
      const normalized = Math.min(100, Math.round((average / 128) * 100));
      setAudioLevel(normalized);

      animationFrameRef.current = requestAnimationFrame(update);
    };

    animationFrameRef.current = requestAnimationFrame(update);
  }, []);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      (mediaRecorderRef.current.state === "recording" || mediaRecorderRef.current.state === "paused")
    ) {
      mediaRecorderRef.current.stop();
    } else {
      releaseStreams();
      setStatus("stopped");
    }
  }, [releaseStreams]);

  // Keep a ref to stopRecording so stream callbacks can invoke it reliably
  const stopRecordingRef = useRef(stopRecording);
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.pause();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setStatus("paused");
    }
  }, []);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
      timerIntervalRef.current = setInterval(() => {
        elapsedSecondsRef.current += 1;
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      setStatus("recording");
    }
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    setError(null);
    setStatus("requesting_permission");
    recordedChunksRef.current = [];
    elapsedSecondsRef.current = 0;
    setElapsedSeconds(0);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getDisplayMedia ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setError({
        type: "not_supported",
        message: "Screen capture or microphone APIs are not supported in this browser.",
      });
      setStatus("idle");
      return;
    }

    try {
      // 1. Capture screen video (and optional system audio)
      const screenMedia = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
          displaySurface: "monitor",
        },
        audio: true, // Captures tab or system audio if shared by user
      });
      screenStreamRef.current = screenMedia;

      // 2. Capture microphone audio
      let micMedia: MediaStream | null = null;
      try {
        micMedia = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        micStreamRef.current = micMedia;
      } catch (micErr: unknown) {
        console.warn("Microphone access was denied or device not found:", micErr);
        setError({
          type: "permission_denied",
          message: "Microphone permission was denied. Recording will continue without voice audio.",
        });
      }

      // 3. Audio Mixing Pipeline via Web Audio API
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const destination = audioCtx.createMediaStreamDestination();

      // Hook up microphone audio + analyser
      if (micMedia && micMedia.getAudioTracks().length > 0) {
        const micSource = audioCtx.createMediaStreamSource(micMedia);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        micSource.connect(analyser);
        micSource.connect(destination);
        monitorAudioLevel();
      }

      // Hook up screen audio if present
      if (screenMedia.getAudioTracks().length > 0) {
        const screenAudioSource = audioCtx.createMediaStreamSource(screenMedia);
        screenAudioSource.connect(destination);
      }

      // 4. Combine screen video and mixed audio into a single PTS-synchronized stream
      const tracks: MediaStreamTrack[] = [
        ...screenMedia.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ];
      const combined = new MediaStream(tracks);
      combinedStreamRef.current = combined;
      setScreenStream(combined);

      // 5. Handle user clicking Chrome's native "Stop sharing" bar
      const videoTrack = screenMedia.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopRecordingRef.current();
        };
      }

      // 6. Initialize MediaRecorder
      const optimalMimeType = getOptimalMimeType();
      const recorder = new MediaRecorder(combined, {
        mimeType: optimalMimeType,
        videoBitsPerSecond: 3_000_000,
      });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalBlob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || optimalMimeType,
        });
        const url = URL.createObjectURL(finalBlob);
        setRecordedSession({
          blob: finalBlob,
          url,
          durationSeconds: elapsedSecondsRef.current,
          mimeType: finalBlob.type,
          sizeBytes: finalBlob.size,
          timestamp: new Date().toISOString(),
        });
        setStatus("stopped");
        releaseStreams();
      };

      // Start recording with 1-second chunks for stream resilience
      recorder.start(1000);
      setStatus("recording");

      // Start elapsed timer
      timerIntervalRef.current = setInterval(() => {
        elapsedSecondsRef.current += 1;
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      console.error("Error starting recording:", err);
      releaseStreams();
      setStatus("idle");
      const errName = (err as { name?: string })?.name;
      if (errName === "NotAllowedError") {
        setError({
          type: "permission_denied",
          message: "Screen share permission was denied or cancelled.",
        });
      } else if (errName === "NotFoundError") {
        setError({
          type: "device_not_found",
          message: "No screen or microphone hardware was found.",
        });
      } else {
        setError({
          type: "recording_failed",
          message: "Failed to initialize screen recording. Please try again.",
        });
      }
    }
  }, [monitorAudioLevel, releaseStreams]);

  // Reset to record again
  const resetRecording = useCallback(() => {
    if (recordedSession?.url) {
      URL.revokeObjectURL(recordedSession.url);
    }
    setRecordedSession(null);
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
    setError(null);
    setStatus("idle");
  }, [recordedSession]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      releaseStreams();
      if (recordedSession?.url) {
        URL.revokeObjectURL(recordedSession.url);
      }
    };
  }, [releaseStreams, recordedSession]);

  return {
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
  };
}
