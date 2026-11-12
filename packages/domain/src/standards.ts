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
  /** False for ideas that frame units, such as key concepts, rather than being assessed. */
  assessed: v.optional(v.boolean(), true),
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
  /** The school's Arabic wording of the statement; empty for none. */
  statementAr: v.optional(text(MAX_STANDARD_STATEMENT), ""),
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

/** One framework across the year's unit plans; empty for the one they name most. */
export const curriculumMapSchema = v.object({
  frameworkId: v.optional(v.union([v.literal(""), id]), ""),
});

export const studentProgressSchema = v.object({
  /** Empty for the student asking about themselves. */
  studentId: v.optional(v.union([v.literal(""), id]), ""),
});

export const sittingsSchema = v.object({
  /** Empty for the student asking about themselves. */
  studentId: v.optional(v.union([v.literal(""), id]), ""),
  standardId: id,
});

/**
 * Where a child stands against an early learning goal in their teacher's
 * judgement, as the EYFS profile records it: at the level expected by the
 * year's end, or emerging, not yet there. It is the best fit of all the
 * teacher knows of the child, never worked out from tasks on a screen.
 * Exempt is no judgement but the profile's "exemption applies": the child
 * holds an individual exemption from the goal on religious or philosophical
 * grounds, never for absence, illness or special needs, which are judged
 * emerging.
 */
export const GOAL_LEVELS = ["emerging", "expected", "exempt"] as const;
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
  /** The answer it was judged from, in a lesson or a quiz, when it was judged from one. */
  from: v.optional(
    v.union([
      v.object({ lessonId: id, blockId: id }),
      v.object({ submissionId: id, blockId: id }),
    ]),
  ),
});
export type JudgeGoal = v.InferOutput<typeof judgeGoalSchema>;

/**
 * Whether a child's right answer on a goal still waits for their teacher.
 * A right answer is evidence, never a judgement: it is shown until the
 * teacher judges the goal expected, or judges it emerging after it. A goal
 * the child is exempt from asks for none.
 */
export function awaitsConfirming(
  answeredAt: string,
  judgement: { level: GoalLevel; judgedAt: string } | undefined,
): boolean {
  if (!judgement) return true;
  if (judgement.level !== "emerging") return false;
  return new Date(answeredAt) > new Date(judgement.judgedAt);
}

export const shareGoalsReportSchema = v.object({
  classId: id,
  frameworkId: id,
  /** False takes the report back from the class's families. */
  shared: v.boolean(),
});

/** One child's goals reports, as their family reads them. */
export const goalsReportSchema = v.object({ studentId: id });

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

/**
 * The statements one sits under, from the top of its framework down to the
 * one holding it: an area of learning and its age band, say.
 */
export function ancestorsOf<T extends { id: string; parentId: string | null }>(
  standards: readonly T[],
  standardId: string,
): T[] {
  const byId = new Map(standards.map((standard) => [standard.id, standard]));
  const chain: T[] = [];
  let above = byId.get(standardId)?.parentId ?? null;
  while (above) {
    const found = byId.get(above);
    if (!found || chain.includes(found)) break;
    chain.unshift(found);
    above = found.parentId;
  }
  return chain;
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

export const MASTERY_LEVELS = ["beginning", "developing", "secure"] as const;

/**
 * What a teacher's observation counts for at each level, inside the band
 * the level names, so a judgement of "developing" reads as developing
 * however the student's other work went.
 */
export const OBSERVED_FRACTION: Record<MasteryLevel, number> = {
  beginning: 0.25,
  developing: 0.65,
  secure: 1,
};

/** A teacher records what they saw a student do against a standard. */
export const observeSchema = v.object({
  studentId: id,
  standardId: id,
  /** The class it was seen in; empty when it was seen outside one. */
  classId: v.optional(v.union([v.literal(""), id]), ""),
  level: v.picklist(MASTERY_LEVELS),
  note: v.pipe(v.string(), v.trim(), v.maxLength(500)),
});

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

/**
 * How many of the documents name each standard in a Standards block, as a
 * lesson sets out what it teaches: each document counted once a standard.
 */
export function intendedStandards(
  documents: readonly ContentDocument[],
): Map<string, number> {
  const set = new Map<string, number>();
  for (const document of documents)
    for (const target of planTargets(document))
      set.set(target.id, (set.get(target.id) ?? 0) + 1);
  return set;
}

// --- CASE ------------------------------------------------------------------
