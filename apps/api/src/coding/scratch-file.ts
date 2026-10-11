import { strFromU8, unzipSync } from "fflate";

import type { FileStore } from "../files/store";

/**
 * The most of a saved project that is read, and of its own account of
 * itself inside. Scratch stops a project's code at 5 MB; one past these
 * was not written by its editor.
 */
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_CODE_BYTES = 8 * 1024 * 1024;
const CODE = "project.json";

/**
 * A coding project's account of itself, out of the file a student saved:
 * the sprites, their blocks and what the blocks are joined to. Null where
 * the file is too large to be read, is gone, or is no project. The file is
 * a student's upload, so its code is unpacked only up to the size its own
 * listing gives, which is refused past the limit.
 */
export async function projectCode(
  files: FileStore,
  file: { storageKey: string; sizeBytes: number },
): Promise<unknown> {
  if (file.sizeBytes > MAX_FILE_BYTES) return null;
  const body = await files.open(file.storageKey);
  if (!body) return null;
  try {
    const packed = new Uint8Array(await new Response(body).arrayBuffer());
    const code = unzipSync(packed, {
      filter: (entry) =>
        entry.name === CODE && entry.originalSize <= MAX_CODE_BYTES,
    })[CODE];
    return code ? (JSON.parse(strFromU8(code)) as unknown) : null;
  } catch {
    return null;
  }
}
