import type {
  LtiGradingProgress,
  LtiHost,
  LtiPicked,
} from "@faridalms/domain/lti";
import type { EditorTools, LtiPicking } from "@faridalms/editor";
import type { ReactNode } from "react";

import { LTI_PICK_CHANNEL } from "@faridalms/domain/lti";
import { buttonVariants } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { createContext, useCallback, useContext, useMemo } from "react";

import { useCapability } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { availableToolsQuery } from "~/queries/lti";

/** The lesson or brief a document belongs to, which its tool links launch from. */
const LtiHostContext = createContext<{
  type: LtiHost;
  id: string | null;
} | null>(null);

export interface LtiHostProviderProps {
  type: LtiHost;
  /** None while the lesson or brief is not yet saved. */
  id: string | null;
  children: ReactNode;
}

export function LtiHostProvider({ type, id, children }: LtiHostProviderProps) {
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

/** Where a unit of a course package launches, in the lesson shown here. */
export function useCmi5Href():
  | ((packageId: string, index: number) => string | null)
  | undefined {
  const host = useContext(LtiHostContext);
  return useCallback(
    (packageId: string, index: number) =>
      host?.type === "lesson" && host.id
        ? `/cmi5/launch?${new URLSearchParams({ lesson: host.id, package: packageId, au: String(index) })}`
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
  const { promise, resolve } = Promise.withResolvers<LtiPicked[] | null>();
  channel.addEventListener(
    "message",
    (event: MessageEvent<{ pickId?: string; items?: LtiPicked[] }>) => {
      if (event.data.pickId !== pickId) return;
      channel.close();
      resolve(event.data.items ?? null);
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

const GRADING: Record<LtiGradingProgress, () => string> = {
  FullyGraded: m.ltiGradingFullyGraded,
  Pending: m.ltiGradingPending,
  PendingManual: m.ltiGradingPendingManual,
  Failed: m.ltiGradingFailed,
  NotReady: m.ltiGradingNotReady,
};

/** How far an outside tool has got marking a student's work, in words. */
export const toolGrading = (progress: LtiGradingProgress) =>
  GRADING[progress]();

/** Where a teacher launches from a student's score in a tool's column to the work behind it. */
export const toolWorkHref = (lineItemId: string, studentId: string) =>
  `/lti/review?${new URLSearchParams({ item: lineItemId, student: studentId })}`;

export interface ToolWorkLinkProps {
  lineItemId: string;
  studentId: string;
  /** The column's name, which tells apart several links on one page. */
  label: string;
  className?: string;
}

/**
 * Opens a student's work behind a tool's score in the tool, LTI's
 * Submission Review, in a window of its own as other launches are.
 */
export function ToolWorkLink({
  lineItemId,
  studentId,
  label,
  className,
}: ToolWorkLinkProps) {
  return (
    <a
      href={toolWorkHref(lineItemId, studentId)}
      target="_blank"
      rel="noopener"
      aria-label={m.ltiOpenWorkFor({ label })}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        className,
      )}
    >
      <ExternalLink aria-hidden />
      {m.ltiOpenWork()}
    </a>
  );
}
