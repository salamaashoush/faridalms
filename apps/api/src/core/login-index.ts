import type { Cell } from "@faridalms/database/context";
import type {
  Directory,
  DirectorySync,
} from "@faridalms/database/directory/client";

import { passwordLoginNames } from "@faridalms/database/stores/handoffs";
import { createHmac } from "node:crypto";

import type { UnitContext } from "./context";

import { everyTenant } from "../files/upkeep";

/** A sign-in name as every school stores it: trimmed, NFC, lower case. */
export const normalLoginName = (name: string) =>
  name.trim().normalize("NFC").toLowerCase();

/**
 * Finds which tenants hold a sign-in name without the directory holding
 * the name: the directory keeps an HMAC of it under a platform secret that
 * every cell's API holds and the directory never does.
 */
export interface LoginIndex {
  tenantsOf: (loginName: string) => Promise<string[]>;
  /** Makes the directory's keys for one tenant match its accounts now. */
  refresh: (tenantId: string) => Promise<void>;
}

export function createLoginIndex(input: {
  cell: Cell;
  directory: Directory;
  /** Null where the cell has no directory_sync login: lookups still work. */
  sync: DirectorySync | null;
  secret: Uint8Array;
}): LoginIndex {
  const keyOf = (name: string) =>
    createHmac("sha256", input.secret).update(normalLoginName(name)).digest();
  return {
    tenantsOf: (loginName) => input.directory.loginTenants(keyOf(loginName)),
    refresh: async (tenantId) => {
      const { sync } = input;
      if (!sync) return;
      const names = await input.cell.withTenant(
        { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
        "read",
        (tx) => passwordLoginNames(tx, tenantId),
      );
      await sync.replaceLogins(tenantId, names.map(keyOf));
    },
  };
}

/** Brings the index up to date once a unit that gave sign-in names commits. */
export function refreshLoginsAfter(context: UnitContext) {
  context.afterCommit(async () => {
    await context.logins?.refresh(context.tenantId);
  });
}

/**
 * Builds every tenant's keys once the API starts, then rebuilds them on a
 * timer: a change made where nobody refreshed the index, such as an
 * erasure, reaches it within the interval.
 */
export function startLoginIndex(input: {
  index: LoginIndex;
  directory: Directory;
  cellId: string;
  intervalMs: number;
}): () => Promise<void> {
  const run = (tenantId: string) => input.index.refresh(tenantId);
  void (async () => {
    for (const tenantId of await input.directory.tenantsOfCell(input.cellId))
      await run(tenantId).catch((error: unknown) =>
        console.error(
          JSON.stringify({
            worker: "login-index",
            tenantId,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      );
  })();
  return everyTenant({
    name: "login-index",
    directory: input.directory,
    cellId: input.cellId,
    intervalMs: input.intervalMs,
    run,
  });
}
