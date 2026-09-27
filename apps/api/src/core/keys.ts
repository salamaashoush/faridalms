import type { CellTransaction } from "@faridalms/database/context";
import type { KeyEncryptionKey, KeyPurpose } from "@faridalms/database/crypto";

import { tenantKeys } from "@faridalms/database/tables/index";
import { and, eq, isNull } from "drizzle-orm";

const TTL_MS = 5 * 60_000;

export interface DataKey {
  key: Uint8Array<ArrayBuffer>;
  version: number;
}

/**
 * Unwraps tenants' data keys on demand and keeps each one in memory for at
 * most five minutes, so a key read once per request does not reach the KMS
 * every time and a rotated key is picked up soon after.
 */
export function createKeyRing(kek: KeyEncryptionKey, cell: string) {
  const cache = new Map<string, { at: number; value: DataKey }>();
  const unwrap = async (
    tenantId: string,
    purpose: KeyPurpose,
    row: { version: number; wrapped: Uint8Array | Buffer },
  ): Promise<DataKey> => {
    const key = await kek.unwrap(new Uint8Array(row.wrapped), {
      cell,
      tenantId,
      purpose,
      keyVersion: row.version,
    });
    return { key, version: row.version };
  };
  return {
    async active(
      tx: CellTransaction,
      tenantId: string,
      purpose: KeyPurpose,
    ): Promise<DataKey> {
      const cacheKey = `${tenantId}:${purpose}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
      const [row] = await tx
        .select({
          version: tenantKeys.keyVersion,
          wrapped: tenantKeys.wrappedDek,
        })
        .from(tenantKeys)
        .where(
          and(
            eq(tenantKeys.tenantId, tenantId),
            eq(tenantKeys.purpose, purpose),
            isNull(tenantKeys.retiredAt),
          ),
        );
      if (!row) throw new Error(`tenant has no active ${purpose} key`);
      const value = await unwrap(tenantId, purpose, row);
      cache.set(cacheKey, { at: Date.now(), value });
      cache.set(`${cacheKey}:${row.version}`, { at: Date.now(), value });
      return value;
    },
    /** The key a row was sealed with, which may be a retired one. */
    async version(
      tx: CellTransaction,
      tenantId: string,
      purpose: KeyPurpose,
      keyVersion: number,
    ): Promise<DataKey> {
      const cacheKey = `${tenantId}:${purpose}:${keyVersion}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
      const [row] = await tx
        .select({
          version: tenantKeys.keyVersion,
          wrapped: tenantKeys.wrappedDek,
        })
        .from(tenantKeys)
        .where(
          and(
            eq(tenantKeys.tenantId, tenantId),
            eq(tenantKeys.purpose, purpose),
            eq(tenantKeys.keyVersion, keyVersion),
          ),
        );
      if (!row) throw new Error(`tenant has no ${purpose} key ${keyVersion}`);
      const value = await unwrap(tenantId, purpose, row);
      cache.set(cacheKey, { at: Date.now(), value });
      return value;
    },
  };
}

export type KeyRing = ReturnType<typeof createKeyRing>;
