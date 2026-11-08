import { PACING_SIGNAL } from "@faridalms/domain/collab";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useEffectEvent, useState } from "react";
import { Doc } from "yjs";

import { pacingChannel } from "~/server/learning";

/**
 * Listens for a lesson's teacher moving the class, through the
 * collaboration server, and calls `onSignal` each time, and once more on
 * every (re)connection so nothing missed while away is lost. Answers
 * whether it is listening now: while it is not, the caller keeps asking on
 * its own. A ticket refused stops listening for good, as one the API will
 * not give again.
 */
export function usePacingChannel(
  lessonId: string,
  onSignal: () => void,
): boolean {
  const [listening, setListening] = useState(false);
  const signal = useEffectEvent(onSignal);
  useEffect(() => {
    let provider: HocuspocusProvider | undefined;
    let stopped = false;
    const ticket = () =>
      pacingChannel({ data: { lessonId } }).catch(() => null);
    void ticket().then((first) => {
      if (stopped || !first) return;
      // The first connection uses the ticket at hand; a reconnection, maybe
      // long after, asks for a fresh one.
      let fresh: string | undefined = first.token;
      provider = new HocuspocusProvider({
        url: first.url,
        name: first.room,
        document: new Doc(),
        awareness: null,
        token: async () => {
          const token = fresh;
          fresh = undefined;
          return token ?? (await ticket())?.token ?? "";
        },
        onAuthenticated: () => {
          setListening(true);
          signal();
        },
        onStateless: ({ payload }) => {
          if (payload === PACING_SIGNAL) signal();
        },
        onDisconnect: () => setListening(false),
        onAuthenticationFailed: () => {
          setListening(false);
          provider?.destroy();
        },
      });
    });
    return () => {
      stopped = true;
      provider?.destroy();
      setListening(false);
    };
  }, [lessonId]);
  return listening;
}
