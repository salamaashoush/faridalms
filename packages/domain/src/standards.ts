import * as v from "valibot";

import type { ContentDocument, ContentNode, StandardTarget } from "./content";

/**
 * A school's standards: the frameworks it teaches to, such as an IB
 * subject's objectives, a Cambridge curriculum framework, Common Core or
 * AERO, or its own, each a tree of statements with the codes publishers
 * give them. A question carries the standards it gives evidence of. A
 * framework published in CASE, 1EdTech's exchange format, can be imported
 * whole, its items' identifiers kept so a later import updates them.
 */

export const MAX_FRAMEWORK_TITLE = 200;
export const MAX_FRAMEWORK_DESCRIPTION = 2000;
export const MAX_STANDARD_CODE = 60;
export const MAX_STANDARD_STATEMENT = 2000;
export const MAX_ITEM_TYPE = 60;
/** The most items one framework holds, as an import brings them. */
export const MAX_FRAMEWORK_ITEMS = 5000;
/** The most standards one question gives evidence of. */
export const MAX_QUESTION_STANDARDS = 6;
/** The most standards a standards block in a document names. */
export const MAX_BLOCK_STANDARDS = 40;

const id = v.pipe(v.string(), v.uuid());
const version = v.pipe(v.number(), v.integer(), v.minValue(0));
const text = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));
const required = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));

export const saveFrameworkSchema = v.object({
  /** Empty for a new framework. */
  id: v.optional(v.union([v.literal(""), id]), ""),
  expectedVersion: version,
  title: required(MAX_FRAMEWORK_TITLE),
  description: text(MAX_FRAMEWORK_DESCRIPTION),
});
export type SaveFramework = v.InferOutput<typeof saveFrameworkSchema>;

export const saveStandardSchema = v.object({
  frameworkId: id,
  /** Empty for a new standard. */
  id: v.optional(v.union([v.literal(""), id]), ""),
  expectedVersion: version,
  /** Empty for one at the top of the framework. */
  parentId: v.optional(v.union([v.literal(""), id]), ""),
  code: text(MAX_STANDARD_CODE),
  statement: required(MAX_STANDARD_STATEMENT),
  /** What the framework calls this level: strand, objective, standard. */
  itemType: text(MAX_ITEM_TYPE),
});
export type SaveStandard = v.InferOutput<typeof saveStandardSchema>;

export const moveStandardSchema = v.object({
  id,
  parentId: v.optional(v.union([v.literal(""), id]), ""),
  /** Its place among its new siblings, from 0. */
  position: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const refSchema = v.object({ id });

export const searchStandardsSchema = v.object({
  query: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  frameworkId: v.optional(v.union([v.literal(""), id]), ""),
});

export const describeStandardsSchema = v.object({
  ids: v.pipe(v.array(id), v.maxLength(200)),
});

export const classProgressSchema = v.object({ classId: id });

export const studentProgressSchema = v.object({
  /** Empty for the student asking about themselves. */
  studentId: v.optional(v.union([v.literal(""), id]), ""),
});

/**
 * Where a child stands against an early learning goal in their teacher's
 * judgement, as the EYFS profile records it: at the level expected by the
 * year's end, or emerging, not yet there. It is the best fit of all the
 * teacher knows of the child, never worked out from tasks on a screen.
 */
export const GOAL_LEVELS = ["emerging", "expected"] as const;
export type GoalLevel = (typeof GOAL_LEVELS)[number];

export const MAX_JUDGEMENT_NOTE = 1000;

export const classGoalsSchema = v.object({
  classId: id,
  /** Empty for the framework the class was last judged against. */
  frameworkId: v.optional(v.union([v.literal(""), id]), ""),
});

export const judgeGoalSchema = v.object({
  classId: id,
  studentId: id,
  standardId: id,
  /** Nothing takes the judgement back. */
  level: v.nullable(v.picklist(GOAL_LEVELS)),
  /** Without one, the note the judgement had stays. */
  note: v.optional(text(MAX_JUDGEMENT_NOTE)),
  /** The answer it was judged from, when it was judged from one. */
  from: v.optional(v.object({ lessonId: id, blockId: id })),
});
export type JudgeGoal = v.InferOutput<typeof judgeGoalSchema>;

/**
 * A framework's statements with nothing beneath them, each under the one
 * holding it, in the framework's own order: the goals children are judged
 * against and the areas they sit in, however deep the framework goes.
 * Siblings come in the order given.
 */
export function goalGroups<T extends { id: string; parentId: string | null }>(
  standards: readonly T[],
): { area: T | null; goals: T[] }[] {
  const under = new Map<string | null, T[]>();
  for (const standard of standards) {
    const siblings = under.get(standard.parentId);
    if (siblings) siblings.push(standard);
    else under.set(standard.parentId, [standard]);
  }
  const groups: { area: T | null; goals: T[] }[] = [];
  const visit = (area: T | null) => {
    const children = under.get(area?.id ?? null) ?? [];
    const goals = children.filter((child) => !under.has(child.id));
    if (goals.length > 0) groups.push({ area, goals });
    for (const child of children) if (under.has(child.id)) visit(child);
  };
  visit(null);
  return groups;
}

/** A standard as a picker or a tag shows it. */
export interface StandardSummary {
  id: string;
  code: string;
  statement: string;
  frameworkId: string;
  frameworkTitle: string;
}

// --- Mastery ---------------------------------------------------------------

/** How firmly a student holds a standard, as their marked answers show it. */
export type MasteryLevel = "secure" | "developing" | "beginning";

/**
 * The latest occasion's weight against everything before it, as in a
 * decaying average (Canvas's default is 65%): recent work counts most, so
 * a student who has since learned a standard is not held to their first
 * tries at it.
 */
export const RECENT_WEIGHT = 0.65;
export const SECURE_AT = 0.8;
export const DEVELOPING_AT = 0.5;
/**
 * Occasions a standard must be shown on before it counts as secure, so one
 * good lesson is not taken for a skill that lasts.
 */
export const SECURE_OCCASIONS = 2;

/** One marked answer to a question tagged with a standard. */
export interface Evidence {
  /** The sitting it came from: one lesson attempt, or one quiz attempt. */
  occasion: string;
  /** From 0 to 1. */
  fraction: number;
  at: string;
}

export interface Mastery {
  level: MasteryLevel;
  /** The decaying average, from 0 to 1. */
  score: number;
  occasions: number;
}

/**
 * A student's mastery of one standard. Answers in one sitting are averaged
 * first, so three questions in one quiz are one occasion, not three; the
 * occasions then make a decaying average in the order they happened.
 */
export function masteryOf(evidence: readonly Evidence[]): Mastery | null {
  const occasions = new Map<
    string,
    { total: number; count: number; at: string }
  >();
  for (const item of evidence) {
    const seen = occasions.get(item.occasion);
    if (seen) {
      seen.total += item.fraction;
      seen.count += 1;
      if (item.at > seen.at) seen.at = item.at;
    } else
      occasions.set(item.occasion, {
        total: item.fraction,
        count: 1,
        at: item.at,
      });
  }
  const ordered = [...occasions.values()].toSorted((a, b) =>
    a.at.localeCompare(b.at),
  );
  let score: number | null = null;
  for (const occasion of ordered) {
    const fraction = occasion.total / occasion.count;
    score =
      score === null
        ? fraction
        : RECENT_WEIGHT * fraction + (1 - RECENT_WEIGHT) * score;
  }
  if (score === null) return null;
  const level: MasteryLevel =
    score >= SECURE_AT && ordered.length >= SECURE_OCCASIONS
      ? "secure"
      : score >= DEVELOPING_AT
        ? "developing"
        : "beginning";
  return { level, score, occasions: ordered.length };
}

// --- Planning --------------------------------------------------------------

function eachNode(node: ContentNode, each: (node: ContentNode) => void) {
  each(node);
  for (const child of node.children ?? []) eachNode(child, each);
}

/** The standards a plan's standards blocks name, each once, in order. */
export function planTargets(plan: ContentDocument): StandardTarget[] {
  const named = new Map<string, StandardTarget>();
  eachNode(plan.root, (node) => {
    if (node.type === "standards")
      for (const target of node.targets ?? [])
        if (!named.has(target.id)) named.set(target.id, target);
  });
  return [...named.values()];
}

/** How many questions in the documents are tagged with each standard. */
export function questionStandards(
  documents: readonly ContentDocument[],
): Map<string, number> {
  const tagged = new Map<string, number>();
  for (const document of documents)
    eachNode(document.root, (node) => {
      if (node.type === "question")
        for (const standard of new Set(node.standards ?? []))
          tagged.set(standard, (tagged.get(standard) ?? 0) + 1);
    });
  return tagged;
}

// --- CASE ------------------------------------------------------------------

const node = v.looseObject({ identifier: v.string() });

/**
 * A CASE package as CASE services and editors export it (CFPackage JSON),
 * read only as far as a framework's tree needs.
 */
export const casePackageSchema = v.looseObject({
  CFDocument: v.looseObject({
    identifier: v.pipe(v.string(), v.uuid()),
    title: v.string(),
    description: v.optional(v.string()),
    creator: v.optional(v.string()),
    language: v.optional(v.string()),
  }),
  CFItems: v.optional(
    v.array(
      v.looseObject({
        identifier: v.pipe(v.string(), v.uuid()),
        fullStatement: v.string(),
        abbreviatedStatement: v.optional(v.nullable(v.string())),
        humanCodingScheme: v.optional(v.nullable(v.string())),
        listEnumeration: v.optional(v.nullable(v.string())),
        CFItemType: v.optional(v.nullable(v.string())),
      }),
    ),
    [],
  ),
  CFAssociations: v.optional(
    v.array(
      v.looseObject({
        associationType: v.string(),
        originNodeURI: node,
        destinationNodeURI: node,
        sequenceNumber: v.optional(v.nullable(v.number())),
      }),
    ),
    [],
  ),
});
export type CasePackage = v.InferOutput<typeof casePackageSchema>;

export const importCaseSchema = v.object({
  /** Empty to make a new framework of the package. */
  frameworkId: v.optional(v.union([v.literal(""), id]), ""),
  casePackage: casePackageSchema,
});

/**
 * A framework's items as a CASE package orders them, each with its parent,
 * parents before their children.
 */
export interface CaseOutline {
  identifier: string;
  title: string;
  description: string;
  items: {
    identifier: string;
    parentIdentifier: string | null;
    position: number;
    code: string;
    statement: string;
    itemType: string;
  }[];
}

const clip = (value: string | null | undefined, max: number) =>
  (value ?? "").trim().slice(0, max);

/**
 * The tree a CASE package describes: each item under the item it is a child
 * of, or at the top when its parent is the document or missing, ordered by
 * the association's sequence number, then its list marker, then its code.
 * An item claimed as the child of two parents stays under the first, and a
 * loop is broken at the top, so whatever a package says the result is a
 * tree. The title is empty when the package gives none.
 */
export function caseOutline(casePackage: CasePackage): CaseOutline {
  const items = casePackage.CFItems.slice(0, MAX_FRAMEWORK_ITEMS);
  const known = new Set(items.map((item) => item.identifier));
  const parentOf = new Map<string, string | null>();
  const order = new Map<string, number>();
  for (const association of casePackage.CFAssociations) {
    if (association.associationType !== "isChildOf") continue;
    const child = association.originNodeURI.identifier;
    const parent = association.destinationNodeURI.identifier;
    if (!known.has(child) || parentOf.has(child)) continue;
    parentOf.set(child, known.has(parent) ? parent : null);
    if (typeof association.sequenceNumber === "number")
      order.set(child, association.sequenceNumber);
  }
  // A parent chain that comes back on itself is cut where it closes.
  for (const item of items) {
    const seen = new Set<string>([item.identifier]);
    let at = parentOf.get(item.identifier) ?? null;
    while (at) {
      if (seen.has(at)) {
        parentOf.set(item.identifier, null);
        break;
      }
      seen.add(at);
      at = parentOf.get(at) ?? null;
    }
  }
  const sorted = items.toSorted((a, b) => {
    const left = order.get(a.identifier) ?? Number.MAX_SAFE_INTEGER;
    const right = order.get(b.identifier) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    const marker = (a.listEnumeration ?? "").localeCompare(
      b.listEnumeration ?? "",
      undefined,
      { numeric: true },
    );
    if (marker !== 0) return marker;
    return (a.humanCodingScheme ?? "").localeCompare(
      b.humanCodingScheme ?? "",
      undefined,
      { numeric: true },
    );
  });
  // Parents come before their children, so each can be stored in turn.
  const childrenOf = new Map<string | null, typeof sorted>();
  for (const item of sorted) {
    const parent = parentOf.get(item.identifier) ?? null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), item]);
  }
  const outlined: CaseOutline["items"] = [];
  const visit = (parent: string | null) =>
    (childrenOf.get(parent) ?? []).forEach((item, position) => {
      const statement =
        clip(item.fullStatement, MAX_STANDARD_STATEMENT) ||
        clip(item.abbreviatedStatement, MAX_STANDARD_STATEMENT);
      // An item with nothing to say, and everything under it, is left out.
      if (!statement) return;
      outlined.push({
        identifier: item.identifier,
        parentIdentifier: parent,
        position,
        code: clip(item.humanCodingScheme, MAX_STANDARD_CODE),
        statement,
        itemType: clip(item.CFItemType, MAX_ITEM_TYPE),
      });
      visit(item.identifier);
    });
  visit(null);
  return {
    identifier: casePackage.CFDocument.identifier,
    title: clip(casePackage.CFDocument.title, MAX_FRAMEWORK_TITLE),
    description: clip(
      casePackage.CFDocument.description,
      MAX_FRAMEWORK_DESCRIPTION,
    ),
    items: outlined,
  };
}
