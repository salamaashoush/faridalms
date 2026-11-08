import { HocuspocusProvider } from "@hocuspocus/provider";
import { useCallback, useEffect, useRef, useState } from "react";
import { Doc } from "yjs";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import { replyPresence } from "~/server/messages";

/** How long after the last keystroke a writer stops counting as replying. */
const IDLE_MS = 6_000;

interface Replying {
  userId: string;
  name: string;
  typing: boolean;
}

const isReplying = (state: unknown): state is Replying =>
  typeof state === "object" &&
  state !== null &&
  typeof (state as Replying).userId === "string" &&
  typeof (state as Replying).name === "string" &&
  (state as { typing?: unknown }).typing === true;

/**
 * Who else is writing a reply in a conversation, through its presence room
 * on the collaboration server: each writer says only whether they are
 * typing, as awareness, which the server passes on and never stores. A
 * writer tells it when they start and when they stop or go idle, never per
 * keystroke, and nobody polls. Without a collaboration server, or for a
 * viewer who does not reply there, nobody is shown.
 */
export function useReplying(threadId: string, enabled: boolean) {
  const user = useCurrentUser();
  const [others, setOthers] = useState<string[]>([]);
  const provider = useRef<HocuspocusProvider | null>(null);
  const typing = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!enabled) return undefined;
    let left = false;
    let joined: HocuspocusProvider | null = null;
    void replyPresence({ data: { threadId } }).then((ticket) => {
      if (left || !ticket) return;
      let first: string | undefined = ticket.token;
      joined = new HocuspocusProvider({
        url: ticket.url,
        name: ticket.room,
        document: new Doc(),
        // A dropped socket reconnects much later than a ticket lasts.
        token: async () => {
          const fresh = first;
          first = undefined;
          return (
            fresh ?? (await replyPresence({ data: { threadId } }))?.token ?? ""
          );
        },
      });
      const awareness = joined.awareness;
      awareness?.setLocalState({
        userId: user.id,
        name: user.name,
        typing: typing.current,
      });
      awareness?.on("change", () => {
        const names = new Set<string>();
        for (const [clientId, state] of awareness.getStates())
          if (
            clientId !== awareness.clientID &&
            isReplying(state) &&
            state.userId !== user.id
          )
            names.add(state.name);
        setOthers([...names].toSorted());
      });
      provider.current = joined;
    });
    return () => {
      left = true;
      clearTimeout(idle.current);
      provider.current = null;
      joined?.destroy();
      setOthers([]);
    };
  }, [threadId, enabled, user.id, user.name]);

  const say = useCallback((now: boolean) => {
    if (typing.current === now) return;
    typing.current = now;
    provider.current?.awareness?.setLocalStateField("typing", now);
  }, []);

  /** The writer's words changed: replying while there are any. */
  const wrote = useCallback(
    (hasWords: boolean) => {
      clearTimeout(idle.current);
      say(hasWords);
      if (hasWords) idle.current = setTimeout(() => say(false), IDLE_MS);
    },
    [say],
  );

  return { others, wrote };
}
