import type { Candidate, FoundRow } from "@faridalms/database/stores/search";
import type { MentionKind } from "@faridalms/domain/content";
import type {
  SearchGroup,
  SearchHit,
  SearchKind,
  SearchResult,
  SearchTarget,
} from "@faridalms/domain/search";

import { orgPath } from "@faridalms/database/stores/identity";
import {
  broadcastsAmong,
  broadcastsReached,
  candidates,
  classesAmong,
  classesReached,
  eventsAmong,
  eventsReached,
  peopleAmong,
  peopleReached,
  studentsAmong,
  teamThreadsAmong,
  teamThreadsReached,
  studentsReached,
  threadsAmong,
  threadsReached,
} from "@faridalms/database/stores/search";
import { mailboxesOf } from "@faridalms/domain/messages";
import {
  mentionNamesSchema,
  SEARCH_PAGE_SIZE,
  SEARCH_PREVIEW_SIZE,
  searchableKinds,
  searchFlagOf,
  searchQuerySchema,
} from "@faridalms/domain/search";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";
import type { Resolver, SearchSource } from "../search/points";

import { openedAnnouncements } from "../announcements/points";
import { calendarReach } from "../core/audiences";
import { contributionsTo } from "../core/extension";
import { can, localeOf, readProcedure } from "../core/procedure";
import { classesReachedBesides, peopleOpenedTo, scopeFor } from "../core/reach";
import { placed } from "../people/points";
import { searchSources } from "../search/points";

/** Kinds core keeps, each with its index types and the page each opens. */
const CORE_TARGETS: Partial<
  Record<SearchKind, Readonly<Record<string, SearchTarget>>>
> = {
  students: { user: "student" },
  people: { user: "person" },
  classes: { class: "class" },
  announcements: { announcement: "announcement" },
  events: { calendar_event: "event" },
  messages: { message_thread: "thread" },
  notes: { team_thread: "thread" },
};

/** Where each kind of mention is found by core, so its name is read by that kind's rule. */
const CORE_MENTIONS: Partial<Record<MentionKind, readonly SearchKind[]>> = {
  person: ["students", "people"],
  class: ["classes"],
  announcement: ["announcements"],
  event: ["events"],
};

/** The kinds the viewer may search, core's and those of the modules on, each with its source if a module keeps it. */
async function kindsFor(
  context: UnitContext,
): Promise<Map<SearchKind, SearchSource | null>> {
  const sources = await contributionsTo(context, searchSources);
  const kinds = new Map<SearchKind, SearchSource | null>();
  for (const kind of searchableKinds(context.actor.capabilities)) {
    const source = sources.find((each) => each.kind === kind);
    if (source) kinds.set(kind, source);
    else if (CORE_TARGETS[kind]) kinds.set(kind, null);
  }
  return kinds;
}

/** How each kind reads its candidates back through the rule its own pages use. */
async function resolverOf(
  context: UnitContext,
  kind: SearchKind,
  source: SearchSource | null,
  q: string,
): Promise<Resolver> {
  if (source) return source.resolver(context, q);
  const ar = localeOf(context) === "ar";
  const school = { tenantId: context.tenantId, schoolId: context.schoolId };
  const base = { ...school, q, ar };
  const viewerId = context.actor.userId;
  switch (kind) {
    case "students": {
      const scope = scopeFor(context, "people");
      return {
        within: studentsReached(scope),
        resolve: async (ids) =>
          placed(
            context,
            await studentsAmong(context.tx, scope, { ...base, ids }),
            ar,
          ),
      };
    }
    case "people": {
      const scope = scopeFor(context, "people");
      const besides = await peopleOpenedTo(context, "people");
      return {
        within: peopleReached(scope, besides),
        resolve: (ids) =>
          peopleAmong(context.tx, scope, { ...base, ids, besides }),
      };
    }
    case "classes": {
      const scope = scopeFor(context, "teaching");
      const besides = await classesReachedBesides(context, "teaching");
      return {
        within: classesReached(scope, besides),
        resolve: (ids) =>
          classesAmong(context.tx, scope, { ...base, ids, besides }),
      };
    }
    case "announcements": {
      const access = {
        ...school,
        viewerId,
        manage: can(context, "announcements:manage"),
        opened: await openedAnnouncements(context),
      };
      return {
        within: broadcastsReached(access),
        resolve: (ids) =>
          broadcastsAmong(context.tx, { ...base, ...access, ids }),
      };
    }
    case "events": {
      const access = {
        ...school,
        viewerId,
        reach: await calendarReach(context),
      };
      return {
        within: eventsReached(access),
        resolve: (ids) => eventsAmong(context.tx, { ...base, ...access, ids }),
      };
    }
    case "messages": {
      const access = { ...school, viewerId };
      return {
        within: threadsReached(access),
        resolve: (ids) => threadsAmong(context.tx, { ...base, ...access, ids }),
      };
    }
    case "notes": {
      const access = {
        ...school,
        mailboxes: mailboxesOf(context.actor.capabilities).reads,
      };
      return {
        within: teamThreadsReached(access),
        resolve: (ids) =>
          teamThreadsAmong(context.tx, { ...base, ...access, ids }),
      };
    }
    default:
      throw new ORPCError("FORBIDDEN");
  }
}

function hitOf(
  kind: SearchKind,
  targets: Readonly<Record<string, SearchTarget>>,
  row: FoundRow,
): SearchHit {
  return {
    kind,
    target: targets[row.type] ?? "class",
    id: row.id,
    title: row.title,
    snippet: row.snippet,
    context: row.context,
    when: row.when,
    flag: searchFlagOf(row.flag),
    roles: row.roles,
  };
}

const cursorOf = (candidate: Candidate) => `${candidate.rank}:${candidate.id}`;

function parseCursor(value: string | undefined) {
  if (!value) return null;
  const at = value.indexOf(":");
  return { rank: Number(value.slice(0, at)), id: value.slice(at + 1) };
}

/**
 * One kind's page: the index ranks only what the viewer may open, so a page
 * is the best of their own and the one after it starts where it ended.
 * Never a total, so a narrow viewer learns nothing from what was left out.
 */
async function pageOf(
  context: UnitContext,
  input: {
    kind: SearchKind;
    source: SearchSource | null;
    q: string;
    orgScope: string[];
    size: number;
    after: { rank: number; id: string } | null;
  },
): Promise<{ group: SearchGroup; next: string | null }> {
  const { within, resolve } = await resolverOf(
    context,
    input.kind,
    input.source,
    input.q,
  );
  const targets = input.source?.targets ?? CORE_TARGETS[input.kind] ?? {};
  const preferOn = input.kind === "classes" ? context.today : null;
  const found = await candidates(context.tx, {
    q: input.q,
    types: Object.keys(targets),
    orgScope: input.orgScope,
    after: input.after,
    max: input.size + 1,
    preferOn,
    within,
  });
  const page = found.slice(0, input.size);
  const visible = new Map(
    (await resolve(page.map((candidate) => candidate.id))).map((row) => [
      row.id,
      row,
    ]),
  );
  const rows = page.flatMap((candidate) => {
    const row = visible.get(candidate.id);
    return row ? [hitOf(input.kind, targets, row)] : [];
  });
  const more = found.length > input.size;
  const last = page.at(-1);
  return {
    group: { kind: input.kind, rows, more },
    next: more && last ? cursorOf(last) : null,
  };
}

/** Everything the viewer may open that matches, grouped by kind, or one kind a page at a time. */
export const find = readProcedure
  .input(searchQuerySchema)
  .handler(async ({ input, context }): Promise<SearchResult> => {
    const kinds = await kindsFor(context);
    const orgScope = await orgPath(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    if (input.kind === "all") {
      const pages = await Promise.all(
        [...kinds].map(([kind, source]) =>
          pageOf(context, {
            kind,
            source,
            q: input.q,
            orgScope,
            size: SEARCH_PREVIEW_SIZE,
            after: null,
          }),
        ),
      );
      return {
        groups: pages
          .map((page) => page.group)
          .filter((group) => group.rows.length > 0),
        next: null,
      };
    }
    const source = kinds.get(input.kind);
    if (source === undefined) throw new ORPCError("FORBIDDEN");
    const page = await pageOf(context, {
      kind: input.kind,
      source,
      q: input.q,
      orgScope,
      size: SEARCH_PAGE_SIZE,
      after: parseCursor(input.after),
    });
    return { groups: [page.group], next: page.next };
  });

/**
 * The names the things a document mentions bear now, in the reader's
 * language, so a renamed person or lesson reads as it is called today.
 * Only what the reader could find for themselves is named; the rest keep
 * the name they were written with.
 */
export const mentionNames = readProcedure
  .input(mentionNamesSchema)
  .handler(async ({ input, context }) => {
    const kinds = await kindsFor(context);
    const mentionedIn = (mention: MentionKind) => [
      ...(CORE_MENTIONS[mention] ?? []),
      ...[...kinds]
        .filter(([, source]) => source?.mentions.includes(mention))
        .map(([kind]) => kind),
    ];
    const wanted = new Map<SearchKind, Set<string>>();
    for (const mention of input.mentions)
      for (const kind of mentionedIn(mention.kind))
        if (kinds.has(kind))
          wanted.set(kind, (wanted.get(kind) ?? new Set()).add(mention.id));
    const found = await Promise.all(
      [...wanted].map(async ([kind, ids]) =>
        (await resolverOf(context, kind, kinds.get(kind) ?? null, "")).resolve([
          ...ids,
        ]),
      ),
    );
    return [
      ...new Map(
        found.flat().map((row) => [row.id, { id: row.id, name: row.title }]),
      ).values(),
    ];
  });
