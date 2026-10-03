import { createServerFn } from "@tanstack/react-start";

import { env } from "~/env";

/** Where the coding studio is served, or null when this cell has none. */
export const getStudio = createServerFn({ method: "GET" }).handler(() =>
  env.STUDIO_URL ? { origin: new URL(env.STUDIO_URL).origin } : null,
);
