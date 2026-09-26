import * as v from "valibot";
import { createEnv } from "valibot-env";

export const env = createEnv({
  publicPrefix: "VITE_",
  schema: {
    private: {
      BACKEND_URL: v.pipe(v.string(), v.url()),
      // The cell's application host; `<school>.<APP_HOST>` names a school.
      APP_HOST: v.optional(v.pipe(v.string(), v.toLowerCase())),
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
    ...process.env,
    ...import.meta.env,
  },
});
