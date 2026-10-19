export interface WordToken {
  id: string;
  word: string;
  start: number;
  end: number;
  isCut?: boolean;
  cutReason?: "filler" | "silence" | "false_start" | "repetition";
}

export interface TranscriptState {
  words: WordToken[];
  isTranscribing: boolean;
  progressMessage?: string;
  error: string | null;
}
