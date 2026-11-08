import {
  pacingRoom,
  signSignal,
  SIGNAL_TTL_SECONDS,
} from "@faridalms/domain/collab";

import type { UnitContext } from "./context";

/**
 * Tells everyone listening in a lesson's pacing room to ask again where the
 * class is, once what changed is committed. Without the collaboration
 * server's address, or when it does not answer, listeners keep asking on
 * their own, so a lost signal only slows them down.
 */
export function signalPacing(context: UnitContext, lessonId: string) {
  const url = context.signalUrl;
  if (!url) return;
  context.afterCommit(async () => {
    const token = await signSignal(
      {
        room: pacingRoom(context.tenantId, lessonId),
        expiresAt: Math.floor(Date.now() / 1000) + SIGNAL_TTL_SECONDS,
      },
      context.cellSecret,
    );
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: token,
        signal: AbortSignal.timeout(2000),
      });
    } catch {
      // The listeners' own asking covers a signal that did not arrive.
    }
  });
}
