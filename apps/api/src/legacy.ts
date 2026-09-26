import { ORPCError } from "@orpc/server";

/**
 * The per-school control database and pools no longer exist. Systems not yet
 * rebuilt on the cell still reach for them; any use answers 503 with
 * `system.moving` until that system's replacement lands and this goes with it.
 */
export const legacyUnavailable = new Proxy(
  {},
  {
    get() {
      throw new ORPCError("SERVICE_UNAVAILABLE", { message: "system.moving" });
    },
  },
) as never;
