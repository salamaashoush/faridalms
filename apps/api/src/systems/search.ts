import type { Candidate, FoundRow } from "@faridalms/database/stores/search";
import type { Scope } from "@faridalms/database/stores/students";
import type { MentionKind } from "@faridalms/domain/content";
import type {
  SearchGroup,
  SearchHit,
  SearchKind,
  SearchResult,
  SearchTarget,
} from "@faridalms/domain/search";

import { reachOf } from "@faridalms/database/stores/audiences";
import { orgPath } from "@faridalms/database/stores/identity";
import { childrenOf } from "@faridalms/database/stores/persons";
import {
  assignmentsAmong,
  broadcastsAmong,
  candidates,
  classesAmong,
  eventsAmong,
  learningAmong,
  peopleAmong,
  studentsAmong,
  threadsAmong,
} from "@faridalms/database/stores/search";
import { schoolYears, workingYear } from "@faridalms/database/stores/years";
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

import { calendarReach } from "../core/audiences";
import { featuresOf } from "../core/features";
import { can, localeOf, readProcedure } from "../core/procedure";

const TYPES: Record<SearchKind, readonly string[]> = {
  students: ["user"],
  people: ["user"],
  classes: ["class"],
  assignments: ["assignment"],
  learning: ["learning_module", "lesson"],
  announcements: ["announcement"],
  news: ["news"],
  events: ["calendar_event"],
  messages: ["message_thread"],
};

const TARGET: Record<string, SearchTarget> = {
  class: "class",
  assignment: "assignment",
  learning_module: "module",
  lesson: "lesson",
  announcement: "announcement",
  news: "news",
  calendar_event: "event",
  message_thread: "thread",
};

/** Index rows read per round, and rounds per page, before a sparse result stops. */
const ROUND = 50;
const ROUNDS = 5;

function peopleScope(context: UnitContext): Scope {
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    viewerId: context.actor.userId,
    schoolWide: can(context, "people:manage"),
  };
}

function teachingScope(context: UnitContext): Scope {
  return {
    ...peopleScope(context),
    schoolWide: can(context, "classes:manage"),
  };
}

/** The students whose work the viewer follows: themselves, or the children in their care. */
async function learnersOf(context: UnitContext) {
  const own = can(context, "own-work:read") ? [context.actor.userId] : [];
  if (!can(context, "children:read")) return own;
  const children = await childrenOf(
    context.tx,
    peopleScope(context),
    context.actor.userId,
  );
  return [...own, ...children.map((child) => child.studentId)];
}

async function learnerClasses(context: UnitContext, learners: string[]) {
  const reaches = await Promise.all(
    learners.map((userId) =>
      reachOf(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        userId,
        on: context.today,
      }),
    ),
  );
  return [...new Set(reaches.flatMap((reach) => reach.classIds))];
}

type Resolve = (ids: string[]) => Promise<FoundRow[]>;

/** How each kind reads its candidates back through the rule its own pages use. */
async function resolverOf(
  context: UnitContext,
  kind: SearchKind,
  q: string,
): Promise<Resolve> {
  const ar = localeOf(context) === "ar";
  const base = {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    q,
    ar,
  };
  const viewerId = context.actor.userId;
  switch (kind) {
    case "students":
      return (ids) =>
        studentsAmong(context.tx, peopleScope(context), { ...base, ids });
    case "people":
      return (ids) =>
        peopleAmong(context.tx, peopleScope(context), { ...base, ids });
    case "classes":
      return (ids) =>
        classesAmong(context.tx, teachingScope(context), { ...base, ids });
    case "assignments": {
      const teaching = can(context, "assignments:author")
        ? teachingScope(context)
        : null;
      const learners = await learnersOf(context);
      return (ids) =>
        assignmentsAmong(context.tx, { ...base, ids, teaching, learners });
    }
    case "learning": {
      const teaching = can(context, "learning:author")
        ? teachingScope(context)
        : null;
      const learnerIds = can(context, "learning:read")
        ? await learnersOf(context)
        : [];
      const learnerClassIds = await learnerClasses(context, learnerIds);
      return (ids) =>
        learningAmong(context.tx, {
          ...base,
          ids,
          viewerId,
          teaching,
          learnerClassIds,
          learnerIds,
        });
    }
    case "announcements": {
      const manage = can(context, "announcements:manage");
      return (ids) =>
        broadcastsAmong(context.tx, {
          ...base,
          kind: "announcement",
          ids,
          viewerId,
          manage,
        });
    }
    case "news": {
      const manage = can(context, "news:manage");
      return (ids) =>
        broadcastsAmong(context.tx, {
          ...base,
          kind: "news",
          ids,
          viewerId,
          manage,
        });
    }
    case "events": {
      const reach = await calendarReach(context);
      return (ids) =>
        eventsAmong(context.tx, { ...base, ids, reach, viewerId });
    }
    case "messages":
      return (ids) => threadsAmong(context.tx, { ...base, ids, viewerId });
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function hitOf(kind: SearchKind, row: FoundRow): SearchHit {
  return {
    kind,
    target:
      kind === "students"
        ? "student"
        : kind === "people"
          ? "person"
          : (TARGET[row.type] ?? "class"),
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
 * One kind's page: index candidates in rank order, read back through the
 * kind's rule, until the page is full or the index runs out. Never a total,
 * so a narrow viewer learns nothing from what was left out.
 */
async function pageOf(
  context: UnitContext,
  input: {
    kind: SearchKind;
    q: string;
    orgScope: string[];
    size: number;
    after: { rank: number; id: string } | null;
  },
): Promise<{ group: SearchGroup; next: string | null }> {
  const resolve = await resolverOf(context, input.kind, input.q);
  const preferYear =
    input.kind === "classes"
      ? (workingYear(
          await schoolYears(context.tx, context.tenantId, context.schoolId),
          context.today,
        )?.id ?? null)
      : null;
  const rows: SearchHit[] = [];
  let after = input.after;
  for (let round = 0; round < ROUNDS; round++) {
    const found = await candidates(context.tx, {
      q: input.q,
      types: TYPES[input.kind],
      orgScope: input.orgScope,
      after,
      max: ROUND,
      preferYear,
    });
    const visible = new Map(
      (await resolve(found.map((candidate) => candidate.id))).map((row) => [
        row.id,
        row,
      ]),
    );
    for (const [index, candidate] of found.entries()) {
      const row = visible.get(candidate.id);
      if (row) rows.push(hitOf(input.kind, row));
      if (rows.length === input.size) {
        const more = index < found.length - 1 || found.length === ROUND;
        return {
          group: { kind: input.kind, rows, more },
          next: more ? cursorOf(candidate) : null,
        };
      }
    }
    const last = found.at(-1);
    if (!last || found.length < ROUND)
      return { group: { kind: input.kind, rows, more: false }, next: null };
    after = { rank: last.rank, id: last.id };
  }
  return {
    group: { kind: input.kind, rows, more: true },
    next: after ? `${after.rank}:${after.id}` : null,
  };
}

async function kindsFor(context: UnitContext): Promise<SearchKind[]> {
  const kinds = searchableKinds(context.actor.capabilities);
  if (!kinds.includes("learning")) return kinds;
  return (await featuresOf(context)).elearning
    ? kinds
    : kinds.filter((kind) => kind !== "learning");
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
        kinds.map((kind) =>
          pageOf(context, {
            kind,
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
    if (!kinds.includes(input.kind)) throw new ORPCError("FORBIDDEN");
    const page = await pageOf(context, {
      kind: input.kind,
      q: input.q,
      orgScope,
      size: SEARCH_PAGE_SIZE,
      after: parseCursor(input.after),
    });
    return { groups: [page.group], next: page.next };
  });

/** Where each kind of mention is found, so its name is read by that kind's rule. */
const MENTIONED_IN: Record<MentionKind, readonly SearchKind[]> = {
  person: ["students", "people"],
  class: ["classes"],
  module: ["learning"],
  lesson: ["learning"],
  assignment: ["assignments"],
  news: ["news"],
  announcement: ["announcements"],
  event: ["events"],
};

/**
 * The names the things a document mentions bear now, in the reader's
 * language, so a renamed person or lesson reads as it is called today.
 * Only what the reader could find for themselves is named; the rest keep
 * the name they were written with.
 */
export const mentionNames = readProcedure
  .input(mentionNamesSchema)
  .handler(async ({ input, context }) => {
    const kinds = new Set(await kindsFor(context));
    const wanted = new Map<SearchKind, Set<string>>();
    for (const mention of input.mentions)
      for (const kind of MENTIONED_IN[mention.kind])
        if (kinds.has(kind))
          wanted.set(kind, (wanted.get(kind) ?? new Set()).add(mention.id));
    const found = await Promise.all(
      [...wanted].map(async ([kind, ids]) =>
        (await resolverOf(context, kind, ""))([...ids]),
      ),
    );
    return [
      ...new Map(
        found.flat().map((row) => [row.id, { id: row.id, name: row.title }]),
      ).values(),
    ];
  });
