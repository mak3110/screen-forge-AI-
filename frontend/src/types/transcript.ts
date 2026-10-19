export interface WordToken {
  id: string;
  word: string;
  start: number;
  end: number;
  isCut?: boolean;
  cutReason?: "filler" | "silence" | "false_start" | "repetition";
}

export interface CutCandidate {
  id: string;
  start: number;
  end: number;
  words: string;
  reason: "filler" | "silence" | "false_start" | "repetition";
  confidence: number;
  isApplied: boolean;
}

export interface TranscriptState {
  words: WordToken[];
  isTranscribing: boolean;
  progressMessage?: string;
  error: string | null;
}

export interface ExportJobState {
  isExporting: boolean;
  progressStage: string;
  exportResult: {
    exportId: string;
    downloadUrl: string;
    originalDuration: number;
    finalDuration: number;
    cutsAppliedCount: number;
    fileSizeBytes: number;
  } | null;
  error: string | null;
}
