import type { StoredFile } from "@faridalms/database/stores/files";

import {
  partsFolder,
  quarantineKey,
  readyKey,
} from "@faridalms/database/stores/files";
import { contentBytesNeeded, contentMatchesName } from "@faridalms/domain/file";

import type { FileScanner } from "./scan";
import type { FileStore } from "./store";

import { ScanUnavailableError } from "./scan";
import { readPrefix, StoreError } from "./store";

export type Rejection =
  | "too_large"
  | "size_mismatch"
  | "content_mismatch"
  | "infected"
  | "scan_unavailable";

export type Checked =
  | { ok: true; sha256: string }
  | { ok: false; reason: Rejection };

/**
 * Takes a file's bytes into quarantine and checks them against what was
 * declared: the size, that the content is what its name says, and the
 * scanner's verdict. A file that passes moves to its final key; one that
 * fails leaves nothing behind. Uploads and the attachments of mail that
 * arrived both come in here, so they are held to the same checks; the
 * caller records the verdict as the worker.
 */
export async function takeChecked(
  stores: { files: FileStore; scanner: FileScanner | null; log: string },
  tenantId: string,
  file: StoredFile,
  body: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Checked> {
  const waiting = quarantineKey(tenantId, file.id);
  const refuse = async (reason: Rejection): Promise<Checked> => {
    await stores.files.remove(waiting);
    await stores.files.removeFolder(partsFolder(tenantId, file.id));
    return { ok: false, reason };
  };
  let stored;
  try {
    stored = await stores.files.write(
      waiting,
      body,
      Math.min(file.sizeBytes, limit),
    );
  } catch (error) {
    if (error instanceof StoreError) return refuse("too_large");
    throw error;
  }
  if (stored.sizeBytes !== file.sizeBytes) return refuse("size_mismatch");
  const head = await readPrefix(
    stores.files,
    waiting,
    contentBytesNeeded(file.name, stored.sizeBytes),
  );
  if (!contentMatchesName(file.name, head)) return refuse("content_mismatch");
  if (stores.scanner) {
    const scanned = await stores.files.open(waiting);
    if (!scanned) return refuse("size_mismatch");
    try {
      const verdict = await stores.scanner.scan(scanned);
      if (!verdict.clean) {
        console.warn(
          JSON.stringify({
            requestId: stores.log,
            file: file.id,
            signature: verdict.signature,
          }),
        );
        return refuse("infected");
      }
    } catch (error) {
      if (!(error instanceof ScanUnavailableError)) throw error;
      console.error(
        JSON.stringify({
          requestId: stores.log,
          file: file.id,
          scanner: error.message,
        }),
      );
      return refuse("scan_unavailable");
    }
  }
  await stores.files.move(waiting, readyKey(tenantId, file.id));
  await stores.files.removeFolder(partsFolder(tenantId, file.id));
  return { ok: true, sha256: stored.sha256 };
}
