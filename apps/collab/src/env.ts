import { presentVariables } from "@faridalms/domain/environment";
import * as v from "valibot";

export const env = v.parse(
  v.object({
    // The collaboration role's own login: collaborative documents and nothing else.
    CELL_COLLAB_URL: v.pipe(v.string(), v.url()),
    // Tickets the API signs are checked with a key derived from this.
    CELL_SECRET: v.pipe(
      v.string(),
      v.base64(),
      v.check(
        (value) => Buffer.from(value, "base64").length >= 32,
        "must decode to at least 32 bytes",
      ),
    ),
    COLLAB_PORT: v.optional(
      v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
      "3002",
    ),
  }),
  presentVariables(process.env),
);
