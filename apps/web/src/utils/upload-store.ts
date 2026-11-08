import { ABANDONED_UPLOAD_MS } from "@faridalms/domain/file";

/**
 * An upload the browser keeps until the server has it all, so a reload or
 * a closed tab picks it up where it stopped, as Uppy's Golden Retriever
 * does: the file itself, the server's id for it, and what the page that
 * began it does with it once it is in.
 */
export interface KeptUpload {
  /** The server's id for the file. */
  id: string;
  /** The page and place it was begun in, which picks it up again. */
  scope: string;
  file: Blob;
  name: string;
  mediaType: string;
  sizeBytes: number;
  partBytes: number;
  /** What the place does with the file once it is in, such as the folder it goes to. */
  meta: Record<string, string | null>;
  startedAt: number;
}

const DATABASE = "farida-uploads";
const STORE = "uploads";

function open(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.addEventListener("upgradeneeded", () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("scope", "scope");
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const opening = open();
  if (!opening) return null;
  const database = await opening;
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(
        database.transaction(STORE, mode).objectStore(STORE),
      );
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
  } finally {
    database.close();
  }
}

/**
 * Keeps an upload until it is finished or given up. A browser that will
 * not store it, out of room or in a private window, simply cannot pick it
 * up after a reload.
 */
export async function keepUpload(upload: KeptUpload): Promise<void> {
  try {
    await run("readwrite", (store) => store.put(upload));
  } catch {
    // Kept nowhere: the upload goes on, it just cannot outlive the page.
  }
}

export async function forgetUpload(id: string): Promise<void> {
  try {
    await run("readwrite", (store) => store.delete(id));
  } catch {
    // Nothing kept to forget.
  }
}

/**
 * The uploads begun in a place and not finished, oldest first. Those the
 * server will have given up on by now are forgotten instead.
 */
export async function uploadsIn(
  scope: string,
  now = Date.now(),
): Promise<KeptUpload[]> {
  let found: KeptUpload[];
  try {
    found =
      ((await run("readonly", (store) =>
        store.index("scope").getAll(IDBKeyRange.only(scope)),
      )) as KeptUpload[] | null) ?? [];
  } catch {
    return [];
  }
  const stale = found.filter(
    (upload) => now - upload.startedAt >= ABANDONED_UPLOAD_MS,
  );
  await Promise.all(stale.map((upload) => forgetUpload(upload.id)));
  return found
    .filter((upload) => now - upload.startedAt < ABANDONED_UPLOAD_MS)
    .toSorted((a, b) => a.startedAt - b.startedAt);
}

/**
 * Runs an upload's sending while this tab holds it, so two tabs of the
 * same page never send one file at once. Answers null without running
 * when another tab already holds it.
 */
export async function whileHolding<T>(
  id: string,
  send: () => Promise<T>,
): Promise<T | null> {
  if (typeof navigator === "undefined" || !("locks" in navigator))
    return send();
  const holding = { held: false };
  const result = await navigator.locks.request(
    `upload:${id}`,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) return null;
      holding.held = true;
      return send();
    },
  );
  return holding.held ? result : null;
}
