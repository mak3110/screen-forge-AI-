import { WordToken, CutCandidate } from "@/types/transcript";

export function getBackendUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && !envUrl.includes("localhost")) {
    if (envUrl.startsWith("http://") || envUrl.startsWith("https://")) {
      return envUrl.replace(/\/$/, "");
    }
    return `https://${envUrl}`.replace(/\/$/, "");
  }

  // Auto-detect production cloud deployment (Vercel) and route to Render backend
  if (
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    return "https://screen-forge-ai.onrender.com";
  }

  return "http://localhost:8000";
}

const COMMON_FILLERS = new Set(["um", "uh", "er", "ah", "hmm", "like", "actually", "basically"]);

function isFillerWord(word: string): boolean {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  return COMMON_FILLERS.has(clean);
}

/**
 * Generate synthetic realistic transcript tokens fitting the actual recorded duration.
 * Used for zero-cost offline development.
 */
export function generateMockTranscript(durationSeconds: number): WordToken[] {
  const sampleSentences = [
    ["Hello", "everyone.", "Um,", "today", "I", "will", "show", "you", "my", "project."],
    ["ScreenForge", "is", "an", "agile,", "low-latency", "tool", "for", "technical", "recordings."],
    ["Instead", "of", "cutting", "video", "on", "a", "timeline,", "you", "edit", "the", "spoken", "script."],
    ["Uh,", "let's", "verify", "that", "audio", "and", "video", "remain", "perfectly", "synchronized."],
    ["The", "playhead", "can", "skip", "fillers", "with", "zero", "rendering", "latency."]
  ];

  const wordsList: string[] = [];
  for (const sentence of sampleSentences) {
    wordsList.push(...sentence);
  }

  const effectiveDuration = Math.max(1, durationSeconds);
  const wordsCount = Math.max(3, Math.min(wordsList.length, Math.floor(effectiveDuration * 1.8)));

  const tokens: WordToken[] = [];
  let currentTime = 0.2;
  const timePerWord = Math.max(0.2, (effectiveDuration - 0.4) / wordsCount);

  for (let i = 0; i < wordsCount; i++) {
    const word = wordsList[i % wordsList.length];
    const wordDuration = Math.min(timePerWord * 0.75, 0.45);
    const start = parseFloat(currentTime.toFixed(2));
    const end = parseFloat(Math.min(effectiveDuration, currentTime + wordDuration).toFixed(2));

    const isFiller = isFillerWord(word);

    tokens.push({
      id: `token-${i}-${Date.now()}`,
      word,
      start,
      end,
      isCut: false,
      cutReason: isFiller ? "filler" : undefined,
    });

    currentTime += timePerWord;
    if (currentTime >= effectiveDuration) break;
  }

  return tokens;
}

/**
 * Request real transcription from backend using Groq Whisper.
 */
export async function fetchTranscription(
  audioBlob: Blob,
  durationSeconds: number,
  forceMock: boolean = false
): Promise<WordToken[]> {
  if (forceMock) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return generateMockTranscript(durationSeconds);
  }

  const formData = new FormData();
  formData.append("file", audioBlob, "recording.wav");
  formData.append("duration", durationSeconds.toString());

  const backendUrl = getBackendUrl();
  let response: Response;
  try {
    response = await fetch(`${backendUrl}/api/transcribe`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error(
      `Could not connect to ScreenForge backend at ${backendUrl}. If deployed on Render free tier, the backend may take 30-60s to wake up on first request. Please wait a moment and click retry.`
    );
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody.detail || `Server returned status ${response.status}`;
    throw new Error(message);
  }

  const data = await response.json();
  if (data.words && Array.isArray(data.words) && data.words.length > 0) {
    return data.words.map((w: { word: string; start: number; end: number }, idx: number) => ({
      id: `word-${idx}-${Date.now()}`,
      word: w.word,
      start: w.start,
      end: w.end,
      isCut: false,
      cutReason: isFillerWord(w.word) ? "filler" : undefined,
    }));
  }

  return [];
}

/**
 * Plan cuts using backend rules engine (fillers, silence pauses, repetitions)
 * with strict timestamp validation against media duration.
 */
export async function fetchPlannedCuts(
  words: WordToken[],
  durationSeconds: number
): Promise<CutCandidate[]> {
  const payload = {
    media_duration_seconds: durationSeconds,
    words: words.map((w) => ({ text: w.word, start: w.start, end: w.end })),
    settings: {
      detect_fillers: true,
      detect_silence: true,
      min_silence_seconds: 0.8,
      detect_repetitions: true,
    },
  };

  const backendUrl = getBackendUrl();
  try {
    const res = await fetch(`${backendUrl}/api/plan-cuts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to plan cuts.");
    }

    const data = await res.json();
    return (data.cuts || []).map((c: { start: number; end: number; words: string; reason: string; confidence: number }, idx: number) => ({
      id: `cut-${idx}-${Date.now()}`,
      start: c.start,
      end: c.end,
      words: c.words,
      reason: c.reason as CutCandidate["reason"],
      confidence: c.confidence,
      isApplied: true,
    }));
  } catch (error) {
    console.error("Cut planning error:", error);
    // Fallback: local rules
    const fallbackCuts: CutCandidate[] = [];
    words.forEach((w, idx) => {
      if (isFillerWord(w.word)) {
        fallbackCuts.push({
          id: `cut-fallback-${idx}`,
          start: w.start,
          end: w.end,
          words: w.word,
          reason: "filler",
          confidence: 0.9,
          isApplied: true,
        });
      }
    });
    return fallbackCuts;
  }
}

/**
 * Request server-side FFmpeg rendering for the final export.
 */
export async function exportVideoFFmpeg(
  videoBlob: Blob,
  durationSeconds: number,
  cuts: CutCandidate[]
): Promise<{
  exportId: string;
  downloadUrl: string;
  originalDuration: number;
  finalDuration: number;
  cutsAppliedCount: number;
  fileSizeBytes: number;
}> {
  const formData = new FormData();
  formData.append("file", videoBlob, "recording.webm");
  formData.append("duration", durationSeconds.toString());
  formData.append(
    "cuts_json",
    JSON.stringify(
      cuts.map((c) => ({
        start: c.start,
        end: c.end,
        words: c.words,
        reason: c.reason,
        confidence: c.confidence,
      }))
    )
  );

  const backendUrl = getBackendUrl();
  const res = await fetch(`${backendUrl}/api/export`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Server export failed with status ${res.status}`);
  }

  const data = await res.json();
  return {
    exportId: data.export_id,
    downloadUrl: `${backendUrl}${data.download_url}`,
    originalDuration: data.original_duration,
    finalDuration: data.final_duration,
    cutsAppliedCount: data.cuts_applied_count,
    fileSizeBytes: data.file_size_bytes,
  };
}
