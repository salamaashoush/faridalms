import type { Role } from "@faridalms/domain/identity";
import type {
  SearchGroup,
  SearchHit,
  SearchKind,
} from "@faridalms/domain/search";

import { ROLES } from "@faridalms/domain/identity";
import { EVENT_CATEGORIES } from "@faridalms/domain/school-schema";
import { Link } from "@tanstack/react-router";

import { ROLE_LABEL } from "~/components/admin/labels";
import { EVENT_CATEGORY_LABEL } from "~/components/app/labels";
import { formatDate } from "~/components/family/format";
import { LEGACY_ROLE } from "~/data/legacy-role";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

export const SEARCH_KIND_LABEL: Record<SearchKind, () => string> = {
  students: m.searchKindStudents,
  classes: m.searchKindClasses,
  people: m.searchKindPeople,
  assignments: m.searchKindAssignments,
  messages: m.searchKindMessages,
  events: m.searchKindEvents,
  newsletters: m.searchKindNewsletters,
  announcements: m.searchKindAnnouncements,
};

const MESSAGES: Record<
  Role,
  "/admin/messages" | "/teach/messages" | "/family/messages" | "/me/messages"
> = {
  admin: "/admin/messages",
  teacher: "/teach/messages",
  parent: "/family/messages",
  student: "/me/messages",
};

const ROW_CLASS =
  "flex flex-col gap-1 rounded-lg px-3 py-2.5 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

function contextLabel(hit: SearchHit): string | null {
  if (!hit.context) return null;
  if (hit.kind === "people") {
    const role = ROLES.find((item) => item === hit.context);
    return role ? ROLE_LABEL[role]() : hit.context;
  }
  if (hit.kind === "events") {
    const category = EVENT_CATEGORIES.find((item) => item === hit.context);
    return category ? EVENT_CATEGORY_LABEL[category]() : hit.context;
  }
  if (hit.kind === "announcements") return m.searchDraft();
  return hit.context;
}

function HitBody({ hit }: { hit: SearchHit }) {
  const context = contextLabel(hit);
  return (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium">{hit.title}</span>
        {hit.when ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatDate(hit.when)}
          </span>
        ) : null}
      </span>
      {hit.snippet || context ? (
        <span className="flex min-w-0 gap-2 text-xs text-muted-foreground">
          {context ? <span className="shrink-0">{context}</span> : null}
          {hit.snippet ? (
            <span className="min-w-0 truncate">{hit.snippet}</span>
          ) : null}
        </span>
      ) : null}
    </>
  );
}

export function HitLink({
  hit,
  role,
  onNavigate,
}: {
  hit: SearchHit;
  role: Role;
  onNavigate?: () => void;
}) {
  const shared = {
    className: ROW_CLASS,
    onClick: onNavigate,
    "data-search-hit": true,
    children: <HitBody hit={hit} />,
  };
  switch (hit.kind) {
    case "students":
      return (
        <Link
          to="/students/$studentId"
          params={{ studentId: hit.id }}
          {...shared}
        />
      );
    case "classes":
      return (
        <Link to="/classes/$classId" params={{ classId: hit.id }} {...shared} />
      );
    case "people":
      return (
        <Link to="/people/$userId" params={{ userId: hit.id }} {...shared} />
      );
    case "assignments":
      return (
        <Link
          to="/assignments/$assignmentId"
          params={{ assignmentId: hit.id }}
          {...shared}
        />
      );
    case "newsletters":
      return (
        <Link
          to="/newsletters/$newsletterId"
          params={{ newsletterId: hit.id }}
          {...shared}
        />
      );
    case "announcements":
      return (
        <Link
          to="/announcements/$announcementId"
          params={{ announcementId: hit.id }}
          {...shared}
        />
      );
    case "messages":
      return (
        <Link to={MESSAGES[role]} search={{ thread: hit.id }} {...shared} />
      );
    case "events":
      return (
        <Link
          to="/calendar/$eventId"
          params={{ eventId: hit.id }}
          {...shared}
        />
      );
    default: {
      const unreachable: never = hit.kind;
      return unreachable;
    }
  }
}

export function SearchResults({
  groups,
  q,
  compact = false,
  onNavigate,
}: {
  groups: SearchGroup[];
  q: string;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const user = useCurrentUser();
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.kind} aria-labelledby={`search-${group.kind}`}>
          <h3
            id={`search-${group.kind}`}
            className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {SEARCH_KIND_LABEL[group.kind]()} · {group.total}
          </h3>
          <ul className="flex flex-col">
            {group.rows.map((hit) => (
              <li key={hit.id}>
                <HitLink
                  hit={hit}
                  role={LEGACY_ROLE[user.workspace]}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
          {compact && group.total > group.rows.length ? (
            <Link
              to="/search"
              search={{ q, kind: group.kind, page: 1 }}
              onClick={onNavigate}
              data-search-hit
              className="block rounded-lg px-3 py-2 text-xs font-medium text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              {m.searchShowAll({ count: group.total })}
            </Link>
          ) : null}
        </section>
      ))}
    </div>
  );
}
