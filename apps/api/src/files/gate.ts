import type { CellTransaction } from "@faridalms/database/context";
import type { StoredFile } from "@faridalms/database/stores/files";

import { withPurpose } from "@faridalms/database/context";
import { fileById } from "@faridalms/database/stores/files";
import { FILE_GATES, fileGate } from "@faridalms/domain/file";

/**
 * Runs work on a file of this purpose with the purpose its rows are hidden
 * behind set, or as it is for a file no purpose hides. Who may do what to
 * the file is still decided by its host's rules; the gate only lets the
 * pipeline see the row it was asked about.
 */
export function withFileGate<T>(
  tx: CellTransaction,
  purpose: string,
  work: (tx: CellTransaction) => Promise<T>,
): Promise<T> {
  const gate = fileGate(purpose);
  return gate ? withPurpose(tx, gate, work) : work(tx);
}

/**
 * A file by its id, looked for behind each gate in turn when no gate hides
 * it. A request names only the file, so this is how the pipeline learns
 * which purpose the rest of its work on it needs.
 */
export async function findFile(
  tx: CellTransaction,
  tenantId: string,
  id: string,
): Promise<StoredFile | null> {
  const open = await fileById(tx, tenantId, id);
  if (open) return open;
  for (const gate of FILE_GATES) {
    const found = await withPurpose(tx, gate, (inner) =>
      fileById(inner, tenantId, id),
    );
    if (found && fileGate(found.purpose) === gate) return found;
  }
  return null;
}
