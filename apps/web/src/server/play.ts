import { createServerFn } from "@tanstack/react-start";

import { env } from "~/env";

/** Where students' web pages play, or null when this cell has nowhere. */
export const getPlay = createServerFn({ method: "GET" }).handler(() =>
  env.PLAY_URL ? { origin: new URL(env.PLAY_URL).origin } : null,
);
