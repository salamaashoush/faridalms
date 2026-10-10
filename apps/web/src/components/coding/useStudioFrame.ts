import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { playQuery } from "~/queries/play";

export interface SavedProject {
  project: ArrayBuffer;
  thumbnail: ArrayBuffer | null;
}

type FromStudio =
  | { type: "ready" | "loaded" | "changed" }
  | { type: "error"; code: string }
  | ({ type: "saved"; id: string } & SavedProject);

/**
 * Talks to the studio in a frame: names its source on the files host's
 * domain, hands it the project once it is ready, and asks for the project
 * back. Messages are taken only from that frame at the files host's origin.
 */
export function useStudioFrame({
  projectUrl,
  mode,
  onLoaded,
  onChanged,
}: {
  /** Where the project is read from; none opens the studio's starter. */
  projectUrl: string | null;
  mode: "editor" | "player";
  onLoaded?: () => void;
  onChanged?: () => void;
}) {
  const origin = useQuery(playQuery).data?.origin ?? null;
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const waiting = useRef(new Map<string, (saved: SavedProject) => void>());

  const post = (
    message: Record<string, unknown>,
    transfer: Transferable[] = [],
  ) => {
    if (!origin) return;
    frame.current?.contentWindow?.postMessage(
      { source: "farida", ...message },
      origin,
      transfer,
    );
  };

  const receive = useEffectEvent(async (data: FromStudio) => {
    switch (data.type) {
      case "ready": {
        let bytes: ArrayBuffer | null = null;
        if (projectUrl) {
          const response = await fetch(projectUrl);
          if (response.ok) bytes = await response.arrayBuffer();
          else toast.error(m.studioLoadFailed());
        }
        post({ type: "load", project: bytes }, bytes ? [bytes] : []);
        return;
      }
      case "loaded":
        setLoaded(true);
        onLoaded?.();
        return;
      case "error":
        setLoaded(true);
        toast.error(m.studioLoadFailed());
        return;
      case "changed":
        onChanged?.();
        return;
      case "saved":
        waiting.current.get(data.id)?.(data);
        waiting.current.delete(data.id);
    }
  });

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (
        !origin ||
        event.origin !== origin ||
        event.source !== frame.current?.contentWindow ||
        (event.data as { source?: unknown } | null)?.source !== "farida-scratch"
      )
        return;
      void receive(event.data as FromStudio);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [origin]);

  return {
    frame,
    loaded,
    source: origin
      ? `${origin}/studio/?${new URLSearchParams({
          parent: window.location.origin,
          mode,
          locale: getLocale(),
        })}`
      : null,
    /** The project as it stands, with a picture of its stage. */
    save: () => {
      const id = crypto.randomUUID();
      const saved = new Promise<SavedProject>((resolve) =>
        waiting.current.set(id, resolve),
      );
      post({ type: "save", id });
      return saved;
    },
    start: () => post({ type: "start" }),
  };
}
