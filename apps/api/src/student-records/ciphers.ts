import { decryptField, encryptField } from "@faridalms/database/crypto";

import type { UnitContext } from "../core/context";

export const healthCipher = (
  context: Pick<UnitContext, "tenantId">,
  rowId: string,
  keyVersion: number,
) => ({
  tenantId: context.tenantId,
  table: "health.records",
  column: "ciphertext",
  rowId,
  keyVersion,
});

export const changeCipher = (
  context: Pick<UnitContext, "tenantId">,
  rowId: string,
  keyVersion: number,
) => ({
  tenantId: context.tenantId,
  table: "health.requested_changes",
  column: "ciphertext",
  rowId,
  keyVersion,
});

/** Opens a sealed health value with the key version it was sealed under. */
export async function openSealed(
  context: UnitContext,
  cipher: ReturnType<typeof healthCipher>,
  ciphertext: Uint8Array,
): Promise<unknown> {
  const key = await context.keys.version(
    context.tx,
    context.tenantId,
    "health",
    cipher.keyVersion,
  );
  return JSON.parse(
    await decryptField(key.key, new Uint8Array(ciphertext), cipher),
  );
}

/** Seals a health value under the tenant's active key, for the row the cipher names. */
export async function seal(
  context: UnitContext,
  cipherFor: (keyVersion: number) => ReturnType<typeof healthCipher>,
  value: unknown,
): Promise<{ keyVersion: number; ciphertext: Uint8Array }> {
  const key = await context.keys.active(context.tx, context.tenantId, "health");
  return {
    keyVersion: key.version,
    ciphertext: await encryptField(
      key.key,
      JSON.stringify(value),
      cipherFor(key.version),
    ),
  };
}
