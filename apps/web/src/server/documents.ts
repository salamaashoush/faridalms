import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { env } from "~/env";

import { backend } from "./backend";
import { checked } from "./input";

const hostSchema = v.object({
  hostType: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]{1,62}$/)),
  hostId: v.pipe(v.string(), v.uuid()),
});

/**
 * A ticket to join a record's document live, with the server to join. Null
 * when live editing is not set up or this viewer cannot have it, and the
 * editor then works alone as before.
 */
export const collaborate = createServerFn({ method: "POST" })
  .validator(checked(hostSchema))
  .handler(async ({ data }) => {
    const url = env.COLLAB_URL;
    if (!url) return null;
    try {
      const ticket = await backend().documents.collaborate(data);
      return { ...ticket, url };
    } catch {
      return null;
    }
  });

export const holdDocument = createServerFn({ method: "POST" })
  .validator(
    checked(v.object({ ...hostSchema.entries, take: v.optional(v.boolean()) })),
  )
  .handler(({ data }) => backend().documents.hold(data));

export const releaseDocument = createServerFn({ method: "POST" })
  .validator(checked(hostSchema))
  .handler(({ data }) => backend().documents.release(data));

export const getDocumentHistory = createServerFn({ method: "GET" })
  .validator(checked(hostSchema))
  .handler(({ data }) => backend().documents.history(data));

export const restoreDocumentVersion = createServerFn({ method: "POST" })
  .validator(
    checked(
      v.object({
        ...hostSchema.entries,
        documentVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
        locale: v.optional(v.picklist(["en", "ar"])),
      }),
    ),
  )
  .handler(({ data }) => backend().documents.restore(data));
