import type {
  EditorCollaboration,
  Provider,
  ProviderAwareness,
} from "@faridalms/editor";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Doc } from "yjs";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import { collaborate } from "~/server/documents";

const COLORS = [
  "#0d9488",
  "#2563eb",
  "#9333ea",
  "#db2777",
  "#ea580c",
  "#65a30d",
];

function colorOf(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length] ?? "#0d9488";
}

/**
 * The Hocuspocus provider in the shape the Lexical plugin expects: it names
 * its sync event `synced`. Letting go of a provider must free its socket,
 * which only `destroy` does; but React mounts effects twice in development,
 * so a disconnect waits a moment for the reconnect that follows it.
 */
function forLexical(provider: HocuspocusProvider): Provider {
  const synced = new Map<unknown, (event: { state: boolean }) => void>();
  let release: ReturnType<typeof setTimeout> | undefined;
  return {
    awareness: provider.awareness as unknown as ProviderAwareness,
    connect: () => {
      clearTimeout(release);
      return provider.connect();
    },
    disconnect: () => {
      provider.disconnect();
      release = setTimeout(() => provider.destroy(), 1000);
    },
    on: (type: string, callback: (value: never) => void) => {
      if (type === "sync") {
        const handler = ({ state }: { state: boolean }) =>
          callback(state as never);
        synced.set(callback, handler);
        provider.on("synced", handler);
      } else if (type === "status") provider.on("status", callback);
    },
    off: (type: string, callback: (value: never) => void) => {
      if (type === "sync") {
        const handler = synced.get(callback);
        if (handler) provider.off("synced", handler);
        synced.delete(callback);
      } else if (type === "status") provider.off("status", callback);
    },
  } as Provider;
}

export type Collaboration =
  | { state: "loading" }
  | { state: "alone" }
  | {
      state: "live";
      collaboration: EditorCollaboration;
      access: "read" | "write";
    };

/**
 * Joins a record's document live when the host allows it. Each connection
 * asks for a fresh ticket, since tickets are good only for a couple of
 * minutes and a dropped socket reconnects later.
 */
export function useCollaboration(
  host: { hostType: string; hostId: string } | null,
): Collaboration {
  const user = useCurrentUser();
  const ticket = useQuery({
    queryKey: ["collaborate", host?.hostType, host?.hostId],
    queryFn: () => (host ? collaborate({ data: host }) : null),
    enabled: host !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const room = ticket.data?.room;
  const url = ticket.data?.url;
  const hostType = host?.hostType;
  const hostId = host?.hostId;
  const collaboration = useMemo<EditorCollaboration | null>(() => {
    if (!hostType || !hostId || !room || !url) return null;
    const target = { hostType, hostId };
    return {
      id: room,
      username: user.name,
      color: colorOf(user.id),
      providerFactory: (id, docs) => {
        const doc = new Doc();
        docs.set(id, doc);
        return forLexical(
          new HocuspocusProvider({
            url,
            name: id,
            document: doc,
            token: async () =>
              (await collaborate({ data: target }))?.token ?? "",
          }),
        );
      },
    };
  }, [hostType, hostId, room, url, user.name, user.id]);
  if (!host) return { state: "alone" };
  if (ticket.isPending) return { state: "loading" };
  if (!collaboration || !ticket.data) return { state: "alone" };
  return { state: "live", collaboration, access: ticket.data.access };
}
