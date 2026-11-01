import { presentVariables } from "@faridalms/domain/environment";
import * as v from "valibot";
import { createEnv } from "valibot-env";

export const env = createEnv({
  publicPrefix: "VITE_",
  schema: {
    private: {
      BACKEND_URL: v.pipe(v.string(), v.url()),
      // `<school>.<PORTAL_DOMAIN>` is a school's portal and the bare domain
      // asks for the school; `<school>.<SITES_DOMAIN>` is its public website.
      // Any other host is one a school bound, or answers 404.
      PORTAL_DOMAIN: v.optional(v.pipe(v.string(), v.trim(), v.toLowerCase())),
      SITES_DOMAIN: v.optional(v.pipe(v.string(), v.trim(), v.toLowerCase())),
      // The collaboration server's WebSocket URL as browsers reach it; unset
      // turns live editing off and every editor works alone.
      COLLAB_URL: v.optional(v.pipe(v.string(), v.url())),
      // Where students' web pages play and the coding studio opens, as
      // browsers reach it: the files host's own domain, never the
      // application's. Unset, web pages in a lesson show as code and editors
      // offer no coding questions.
      PLAY_URL: v.optional(v.pipe(v.string(), v.url())),
      // Proxies in front of the web server that append to X-Forwarded-For;
      // the client is the entry the outermost of them added.
      TRUSTED_PROXY_HOPS: v.optional(
        v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
        "1",
      ),
    },
    shared: {
      // "test" belongs here: vitest sets NODE_ENV=test, and without it every
      // module that touches `env` throws during a test run.
      NODE_ENV: v.optional(
        v.union([
          v.literal("development"),
          v.literal("production"),
          v.literal("test"),
        ]),
        "development",
      ),
      // vite env
      MODE: v.optional(v.string(), "development"),
      BASE_URL: v.optional(v.string(), "/"),
      PROD: v.optional(v.boolean(), false),
      DEV: v.optional(v.boolean(), true),
      SSR: v.optional(v.boolean(), false),
    },
  },
  values: {
    ...presentVariables(process.env),
    ...import.meta.env,
  },
});
