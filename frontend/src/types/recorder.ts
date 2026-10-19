export type RecordingStatus = 
  | "idle"
  | "requesting_permission"
  | "recording"
  | "paused"
  | "stopped";

export interface RecordingError {
  type: "permission_denied" | "device_not_found" | "not_supported" | "recording_failed";
  message: string;
}

export interface RecordedSession {
  blob: Blob;
  url: string;
  durationSeconds: number;
  mimeType: string;
  sizeBytes: number;
  timestamp: string;
}
