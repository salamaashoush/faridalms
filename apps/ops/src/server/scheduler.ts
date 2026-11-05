import { definePlugin } from "nitro";

import { businessDb } from "./business";
import { runRoundIfDue } from "./round";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Checks each hour whether today's round has run, and runs it if not, so a
 * console that was down at midnight catches up within the hour. Without a
 * business database there is nothing to run.
 */
export default definePlugin((nitroApp) => {
  if (!businessDb()) return;
  let running: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (running) return;
    running = runRoundIfDue()
      .catch((error: unknown) =>
        console.error(
          JSON.stringify({ worker: "daily_round", error: String(error) }),
        ),
      )
      .finally(() => {
        running = null;
      });
  }, HOUR_MS);
  nitroApp.hooks.hook("close", async () => {
    clearInterval(timer);
    await running;
  });
});
