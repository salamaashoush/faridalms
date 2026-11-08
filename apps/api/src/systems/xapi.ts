import {
  recordStoreOf,
  retryFailed,
  saveRecordStore,
  sendingOf,
} from "@faridalms/database/stores/xapi";
import { recordStoreSchema } from "@faridalms/domain/xapi";
import { ORPCError } from "@orpc/server";

import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { namesPrivateHost } from "../files/fetch-link";
import { recordStoreSecrets } from "../xapi/statements";

/**
 * The school's own learning record store, as its settings show it: where
 * it is, the key, whether a secret is kept, never the secret itself, and
 * how sending stands.
 */
export const recordStore = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "school:manage");
  const scope = { tenantId: context.tenantId, orgId: context.schoolId };
  const store = await recordStoreOf(context.tx, scope);
  return {
    store: store
      ? {
          version: store.version,
          endpoint: store.endpoint,
          username: store.username,
          secretKept: store.sealedSecret !== null,
          enabled: store.enabled,
        }
      : null,
    sending: await sendingOf(context.tx, scope),
  };
});

/**
 * Sets the school's record store. The secret is sealed before it is kept;
 * left empty, the one kept stays. Sending cannot be on without one.
 */
export const saveRecordStoreSettings = writeProcedure
  .input(recordStoreSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    const scope = { tenantId: context.tenantId, orgId: context.schoolId };
    const before = await recordStoreOf(context.tx, scope);
    if (input.enabled && !input.secret && !before?.sealedSecret)
      throw new ORPCError("BAD_REQUEST", { message: "xapi.secret_needed" });
    // Statements go from the server, so the store must be on the public
    // web; a name is checked again, resolved, before every send.
    if (namesPrivateHost(new URL(input.endpoint)))
      throw new ORPCError("BAD_REQUEST", { message: "xapi.store_address" });
    const saved = await saveRecordStore(context.tx, {
      ...scope,
      expectedVersion: input.expectedVersion,
      endpoint: input.endpoint,
      username: input.username,
      ...(input.secret
        ? {
            sealedSecret: await recordStoreSecrets(context.cellSecret).seal(
              input.secret,
            ),
          }
        : {}),
      enabled: input.enabled,
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "xapi_store.save",
      objectType: "xapi_store",
      objectId: saved.id,
      details: {
        host: new URL(input.endpoint).host,
        enabled: input.enabled,
        secretChanged: Boolean(input.secret),
      },
    });
    return { version: saved.version };
  });

/** Puts the statements that could not go back in the queue, once the store is put right. */
export const retryRecordStore = writeProcedure.handler(async ({ context }) => {
  requireCapability(context, "school:manage");
  const queued = await retryFailed(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
  });
  await audit(context, {
    action: "xapi_store.retry",
    objectType: "xapi_store",
    details: { statements: queued },
  });
  return { queued };
});
