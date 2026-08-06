"use client";

/**
 * The house-plan underlay's picture, kept in the browser and nowhere else.
 *
 * A client's house plan is their own private drawing, and the studio treats it
 * the way it treats the aerial: a tracing guide, never part of what prints, and
 * — this is the point — never uploaded. It lives in IndexedDB on the machine
 * that drew it. Only the placement (a handful of numbers) travels with the
 * saved design, so the plan follows nobody to a server. Open the same design
 * on another device and the traced result is all there; the picture behind it
 * is re-added, not fetched.
 *
 * One picture per design, keyed by the design's own id. Everything degrades
 * quietly: no IndexedDB, a private-mode block, a full disk — the feature just
 * can't persist, and the caller carries on with whatever is on screen.
 */

const DB = "cfba-studio";
const STORE = "underlay";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") { resolve(null); return; }
    let req: IDBOpenDBRequest;
    try { req = indexedDB.open(DB, 1); } catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return open().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => resolve(null);
        t.oncomplete = () => db.close();
      } catch {
        resolve(null);
      }
    });
  });
}

/** The stored picture for a design, as a data URL, or null if there's none
 *  here (or the store is unavailable). */
export function getUnderlay(key: string): Promise<string | null> {
  return tx<string>("readonly", (s) => s.get(key));
}

/** Keep a picture for a design. Resolves whether or not it was actually
 *  saved — persistence is a nicety, never a promise the caller waits on. */
export async function putUnderlay(key: string, dataUrl: string): Promise<void> {
  await tx("readwrite", (s) => s.put(dataUrl, key));
}

/** Forget a design's picture — on removal, and so a deleted design leaves
 *  nothing of the client's plan behind. */
export async function delUnderlay(key: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(key));
}
