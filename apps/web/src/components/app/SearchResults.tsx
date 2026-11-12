import type {
  SearchFlag,
  SearchGroup,
  SearchHit,
  SearchKind,
} from "@faridalms/domain/search";
import type { Workspace } from "@faridalms/domain/workspace";
import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { matchedRuns } from "@faridalms/domain/search";
import { cn } from "@faridalms/ui/cn";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  GraduationCap,
  Inbox,
  Megaphone,
  NotebookPen,
  School,
  Search,
  Users,
} from "lucide-react";

import { roleLabel } from "~/components/people/format";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { formatDate, formatInstant, formatList } from "~/utils/datetime";
import { slot } from "~/utils/extension";

/** How a module's kind of search hit is named, marked and opened. */
export interface SearchKindWords {
  kind: SearchKind;
  label: () => string;
  icon: LucideIcon;
  /** The page a hit of the kind opens, by what it is. */
  linkOf(hit: SearchHit): LinkProps | null;
}

export const searchKindWords = slot<SearchKindWords>("search kind words");

const OWN_WORDS: Partial<
  Record<SearchKind, { label: () => string; icon: LucideIcon }>
> = {
  students: { label: m.searchKindStudents, icon: GraduationCap },
  people: { label: m.searchKindPeople, icon: Users },
  classes: { label: m.searchKindClasses, icon: School },
  announcements: { label: m.searchKindAnnouncements, icon: Megaphone },
  events: { label: m.searchKindEvents, icon: CalendarDays },
  messages: { label: m.searchKindMessages, icon: Inbox },
  notes: { label: m.searchKindNotes, icon: NotebookPen },
};

/** How each kind of hit is named and marked, core's and those of the modules on. */
export function useSearchKinds() {
  const added = useSlot(searchKindWords);
  const wordsOf = (kind: SearchKind) =>
    added.find((each) => each.kind === kind) ?? OWN_WORDS[kind];
  return {
    label: (kind: SearchKind) => wordsOf(kind)?.label() ?? kind,
    icon: (kind: SearchKind) => wordsOf(kind)?.icon ?? Search,
    linkOf: (hit: SearchHit) =>
      added.find((each) => each.kind === hit.kind)?.linkOf(hit) ?? null,
  };
}

const FLAG_LABEL: Record<SearchFlag, () => string> = {
  draft: m.searchFlagDraft,
  scheduled: m.searchFlagScheduled,
  archived: m.searchFlagArchived,
  cancelled: m.searchFlagCancelled,
};

const MESSAGES = {
  staff: "/messages",
  family: "/family/messages",
  me: "/me/messages",
} as const;

export const HIT_ROW =
  "flex items-start gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

const whenLabel = (when: string) =>
  when.length === 10 ? formatDate(when) : formatInstant(when, "date");

interface MarkedProps {
  text: string;
  q: string;
}

/** The query's words marked in a title, matched without regard to case. */
function Marked({ text, q }: MarkedProps) {
  const words = q
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 1);
  if (words.length === 0) return text;
  const lower = text.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let at = 0;
  while (at < text.length) {
    let next: { word: string; index: number } | null = null;
    for (const word of words) {
      const index = lower.indexOf(word, at);
      if (index >= 0 && (!next || index < next.index)) next = { word, index };
    }
    if (!next) break;
    if (next.index > at) parts.push(text.slice(at, next.index));
    const end = next.index + next.word.length;
    parts.push(
      <mark
        key={next.index}
        className="rounded-sm bg-transparent font-semibold text-foreground"
      >
        {text.slice(next.index, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

interface SnippetProps {
  snippet: string;
}

function Snippet({ snippet }: SnippetProps) {
  let offset = 0;
  return matchedRuns(snippet).map((run) => {
    const at = offset;
    offset += run.text.length;
    return run.matched ? (
      <mark
        key={at}
        className="rounded-sm bg-primary/15 px-0.5 text-foreground"
      >
        {run.text}
      </mark>
    ) : (
      run.text
    );
  });
}

interface HitBodyProps {
  hit: SearchHit;
  q: string;
  icon: LucideIcon;
}

function HitBody({ hit, q, icon: Icon }: HitBodyProps) {
  const context =
    hit.roles.length > 0 ? formatList(hit.roles.map(roleLabel)) : hit.context;
  return (
    <>
      <Icon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span dir="auto" className="min-w-0 truncate font-medium">
            <Marked text={hit.title} q={q} />
          </span>
          {hit.flag ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] leading-4 font-medium text-muted-foreground">
              {FLAG_LABEL[hit.flag]()}
            </span>
          ) : null}
          {hit.when ? (
            <span className="ms-auto shrink-0 text-xs text-muted-foreground tabular-nums">
              {whenLabel(hit.when)}
            </span>
          ) : null}
        </span>
        {context || hit.snippet ? (
          <span className="flex min-w-0 gap-2 text-[13px] leading-[18px] text-muted-foreground">
            {context ? (
              <span dir="auto" className="shrink-0">
                {context}
              </span>
            ) : null}
            {hit.snippet ? (
              <span dir="auto" className="line-clamp-2 min-w-0">
                <Snippet snippet={hit.snippet} />
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </>
  );
}

export interface HitLinkProps {
  hit: SearchHit;
  q: string;
  workspace: Workspace;
  onNavigate?: (hit: SearchHit) => void;
  className?: string;
}

/** A result, linked to the page it opens for this workspace. */
export function HitLink({
  hit,
  q,
  workspace,
  onNavigate,
  className,
}: HitLinkProps) {
  const kinds = useSearchKinds();
  const shared = {
    className: cn(HIT_ROW, className),
    onClick: () => onNavigate?.(hit),
    "data-search-hit": true,
    children: <HitBody hit={hit} q={q} icon={kinds.icon(hit.kind)} />,
  };
  switch (hit.target) {
    case "student":
      return (
        <Link
          to="/students/$studentId"
          params={{ studentId: hit.id }}
          {...shared}
        />
      );
    case "person":
      return (
        <Link to="/people/$userId" params={{ userId: hit.id }} {...shared} />
      );
    case "class":
      return (
        <Link to="/classes/$classId" params={{ classId: hit.id }} {...shared} />
      );
    case "announcement":
      return (
        <Link
          to="/announcements/$announcementId"
          params={{ announcementId: hit.id }}
          {...shared}
        />
      );
    case "event":
      return (
        <Link
          to="/calendar/$eventId"
          params={{ eventId: hit.id }}
          {...shared}
        />
      );
    case "thread":
      return (
        <Link
          to={MESSAGES[workspace]}
          search={{ thread: hit.id }}
          {...shared}
        />
      );
    default: {
      const link = kinds.linkOf(hit);
      return link ? <Link {...link} {...shared} /> : null;
    }
  }
}

export interface SearchResultsProps {
  groups: SearchGroup[];
  q: string;
  onNavigate?: (hit: SearchHit) => void;
  /** Opens every result of one kind; without it the group links to the search page. */
  onMore?: (kind: SearchKind) => void;
}

/** Results grouped by kind, each group ending in a way to all of its kind when there is more. */
export function SearchResults({
  groups,
  q,
  onNavigate,
  onMore,
}: SearchResultsProps) {
  const user = useCurrentUser();
  const kinds = useSearchKinds();
  return (
    <div className="grid gap-4">
      {groups.map((group) => (
        <section key={group.kind} aria-labelledby={`search-${group.kind}`}>
          <h3
            id={`search-${group.kind}`}
            className="px-3 pb-1 text-xs leading-5 font-medium text-muted-foreground"
          >
            {kinds.label(group.kind)}
          </h3>
          <ul className="grid">
            {group.rows.map((hit) => (
              <li key={`${hit.target}-${hit.id}`}>
                <HitLink
                  hit={hit}
                  q={q}
                  workspace={user.workspace}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
          {group.more ? (
            <Link
              to="/search"
              search={{ q, kind: group.kind }}
              onClick={() => onMore?.(group.kind)}
              data-search-hit
              className="ms-10 inline-flex rounded-md px-3 py-1.5 text-[13px] font-medium text-primary outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              {m.searchMoreOfKind({
                kind: kinds.label(group.kind).toLocaleLowerCase(getLocale()),
              })}
            </Link>
          ) : null}
        </section>
      ))}
    </div>
  );
}
