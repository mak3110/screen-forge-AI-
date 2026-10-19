import { WordToken } from "@/types/transcript";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const COMMON_FILLERS = new Set(["um", "uh", "er", "ah", "hmm"]);

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
 * Request real transcription from backend using Groq Whisper,
 * or surface clear setup instructions if key is missing.
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

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/transcribe`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error(
      "Could not connect to ScreenForge backend at http://localhost:8000. Is the backend server running?"
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

  // If no words detected (e.g. silent recording)
  return [];
}
