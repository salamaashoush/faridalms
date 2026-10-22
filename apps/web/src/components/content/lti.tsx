import type { LtiHost } from "@faridalms/domain/lti";
import type { EditorTools } from "@faridalms/editor";
import type { ReactNode } from "react";

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
  return useMemo(
    () => (host && tools?.length && href ? { list: tools, href } : undefined),
    [host, tools, href],
  );
}
