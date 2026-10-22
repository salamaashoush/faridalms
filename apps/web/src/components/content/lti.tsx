import type { LtiHost, LtiPick } from "@faridalms/domain/lti";
import type { EditorTools, LtiPicking } from "@faridalms/editor";
import type { ReactNode } from "react";

import { LTI_PICK_CHANNEL } from "@faridalms/domain/lti";
import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo } from "react";

import { useCapability } from "~/hooks/useCurrentUser";
import { availableToolsQuery } from "~/queries/lti";

/** The lesson or brief a document belongs to, which its tool links launch from. */
const LtiHostContext = createContext<{
  type: LtiHost;
  id: string | null;
} | null>(null);

export function LtiHostProvider({
  type,
  id,
  children,
}: {
  type: LtiHost;
  /** None while the lesson or brief is not yet saved. */
  id: string | null;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ type, id }), [type, id]);
  return (
    <LtiHostContext.Provider value={value}>{children}</LtiHostContext.Provider>
  );
}

/** Where a link to an outside tool launches, in the document shown here. */
export function useLtiHref(): ((linkId: string) => string | null) | undefined {
  const host = useContext(LtiHostContext);
  return useCallback(
    (linkId: string) =>
      host?.id
        ? `/lti/launch?${new URLSearchParams({ host: host.type, id: host.id, link: linkId })}`
        : null,
    [host],
  );
}

/**
 * Opens a tool's window to pick its content, LTI's Deep Linking, and waits
 * for the page the tool sends back to hand over what was picked. The window
 * is cut from this page before it goes to the tool, so the tool cannot
 * reach back into the editor.
 */
function pickIn(
  host: { type: LtiHost; id: string },
  toolId: string,
): LtiPicking | null {
  const pickId = crypto.randomUUID();
  const popup = window.open("", `lti-${pickId}`, "popup,width=1024,height=720");
  if (!popup) return null;
  popup.opener = null;
  popup.location.href = `/lti/pick?${new URLSearchParams({ host: host.type, id: host.id, tool: toolId, pick: pickId })}`;
  const channel = new BroadcastChannel(LTI_PICK_CHANNEL);
  const { promise, resolve } = Promise.withResolvers<LtiPick | null>();
  channel.addEventListener(
    "message",
    (event: MessageEvent<{ pickId?: string; item?: LtiPick | null }>) => {
      if (event.data.pickId !== pickId) return;
      channel.close();
      resolve(event.data.item ?? null);
    },
  );
  return {
    picked: promise,
    cancel: () => {
      channel.close();
      popup.close();
      resolve(null);
    },
  };
}

/** The school's outside tools for an editor writing a lesson or brief. */
export function useEditorTools(): EditorTools | undefined {
  const host = useContext(LtiHostContext);
  const lessons = useCapability("learning:author");
  const assignments = useCapability("assignments:author");
  const authors = lessons || assignments;
  const tools = useQuery({
    ...availableToolsQuery,
    enabled: Boolean(host) && authors,
  }).data;
  const href = useLtiHref();
  return useMemo(() => {
    if (!host || !tools?.length || !href) return undefined;
    const saved = host.id;
    return saved
      ? {
          list: tools,
          href,
          pick: (toolId: string) =>
            pickIn({ type: host.type, id: saved }, toolId),
        }
      : { list: tools, href };
  }, [host, tools, href]);
}
