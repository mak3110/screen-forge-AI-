import { WordToken, CutCandidate } from "@/types/transcript";

const DB_NAME = "ScreenForgeDB";
const STORE_NAME = "recording_drafts";
const DB_VERSION = 1;

export interface PersistedDraft {
  id: string;
  videoBlob: Blob;
  durationSeconds: number;
  sizeBytes: number;
  savedAt: string;
  transcriptWords: WordToken[];
  cuts: CutCandidate[];
  extractedAudioSize: number | null;
}

/**
 * Open or upgrade native IndexedDB for storing binary media and transcript state.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not available in this environment."));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save current recording session and editor state into IndexedDB.
 */
export async function saveDraftToIndexedDB(draft: {
  videoBlob: Blob;
  durationSeconds: number;
  sizeBytes: number;
  transcriptWords: WordToken[];
  cuts: CutCandidate[];
  extractedAudioSize: number | null;
}): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const record: PersistedDraft = {
        id: "active_session",
        videoBlob: draft.videoBlob,
        durationSeconds: draft.durationSeconds,
        sizeBytes: draft.sizeBytes,
        savedAt: new Date().toISOString(),
        transcriptWords: draft.transcriptWords,
        cuts: draft.cuts,
        extractedAudioSize: draft.extractedAudioSize,
      };

      const putRequest = store.put(record);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    });
  } catch (error) {
    console.warn("Failed to persist draft to IndexedDB:", error);
  }
}

/**
 * Load persisted active session draft on page load/refresh.
 */
export async function loadDraftFromIndexedDB(): Promise<PersistedDraft | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);

      const getRequest = store.get("active_session");
      getRequest.onsuccess = () => {
        const result = getRequest.result as PersistedDraft | undefined;
        resolve(result || null);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (error) {
    console.warn("Failed to retrieve draft from IndexedDB:", error);
    return null;
  }
}

/**
 * Purge persisted draft when user explicitly clicks Reset or Discard.
 */
export async function clearDraftFromIndexedDB(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const deleteRequest = store.delete("active_session");
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    });
  } catch (error) {
    console.warn("Failed to clear draft from IndexedDB:", error);
  }
}
