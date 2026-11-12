import type {
  NoticeParams,
  NotificationKind,
} from "@faridalms/domain/notifications";
import type { Workspace } from "@faridalms/domain/workspace";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ComponentType, ReactNode } from "react";

import { slot } from "~/utils/extension";

export interface Notice {
  id: string;
  kind: NotificationKind;
  /** What kind of record the notice is about, where a link must know. */
  subjectType?: string;
  subjectId: string;
  params: NoticeParams;
  actorNameEn: string | null;
  actorNameAr: string | null;
}

export interface NoticeLinkProps extends Omit<
  ComponentProps<"a">,
  "href" | "children"
> {
  notice: Notice;
  workspace: Workspace;
  children: ReactNode;
}

/**
 * How the module that owns a kind of notice words it, where one leads, and
 * who may choose how it reaches them.
 */
export interface NoticeWords {
  kind: NotificationKind;
  icon: LucideIcon;
  /** The kind as the preferences page names it, where a person chooses it. */
  label?: () => string;
  /** Whether someone in this workspace, holding these capabilities, is sent the kind at all. */
  offered?(workspace: Workspace, capabilities: readonly string[]): boolean;
  text(notice: Notice): { title: string; body: string };
  Link: ComponentType<NoticeLinkProps>;
}

export const noticeWords = slot<NoticeWords>("notice words");
