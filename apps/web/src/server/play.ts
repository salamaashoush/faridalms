import { createServerFn } from "@tanstack/react-start";

import { env } from "~/env";

/** The files host, where students' web pages play and the coding studio opens, or null when this cell has none. */
export const getPlay = createServerFn({ method: "GET" }).handler(() =>
  env.PLAY_URL ? { origin: new URL(env.PLAY_URL).origin } : null,
);
