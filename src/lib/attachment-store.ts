/**
 * Task proof images live in IndexedDB, not in the synced state document.
 * The task carries only metadata, so snapshots stay small and no base64 ends
 * up in localStorage. Clearing site data removes these files.
 */

const DB_NAME = "doro.attachments";
const STORE = "files";
const VERSION = 1;

function available(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!available()) {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
  });
}

export async function putAttachmentBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(blob, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the image."));
  });
  db.close();
}

export async function getAttachmentBlob(key: string): Promise<Blob | null> {
  if (!available()) return null;
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error("Could not read the image."));
  });
  db.close();
  return blob;
}

export async function deleteAttachmentBlob(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not delete the image."));
  });
  db.close();
}

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function validateAttachmentFile(file: File): string | null {
  if (!ACCEPTED_ATTACHMENT_TYPES.includes(file.type as (typeof ACCEPTED_ATTACHMENT_TYPES)[number])) {
    return "Use a JPEG, PNG, or WebP image.";
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return "Keep images under 5 MB.";
  }
  return null;
}

/** Downscales large photos so a receipt or drop-off photo stays quick to open. */
export async function prepareAttachmentBlob(file: File): Promise<Blob> {
  if (file.size <= 450 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.78),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
