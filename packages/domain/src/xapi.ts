import * as v from "valibot";

import type { QuestionKind } from "./content";

/**
 * Results as Experience API statements (xAPI 1.0.3), the shape a learning
 * record store keeps: who did what to which activity, with the score,
 * success, completion and time it took. A school takes them away to an
 * LRS or its own analysis, or has them sent to its own store as they
 * happen; this app keeps its records in its own form and writes them this
 * way only for that.
 */

export const XAPI_VERSION = "1.0.3";

const VERB = "http://adlnet.gov/expapi/verbs";
const ACTIVITY = "http://adlnet.gov/expapi/activities";

export const XAPI_VERBS = {
  completed: `${VERB}/completed`,
  attempted: `${VERB}/attempted`,
  answered: `${VERB}/answered`,
  experienced: `${VERB}/experienced`,
  scored: `${VERB}/scored`,
} as const;
type Verb = keyof typeof XAPI_VERBS;

/** The xAPI Video Profile's names for a video and how much of it was watched. */
const VIDEO = "https://w3id.org/xapi/video";

export interface XapiAgent {
  objectType: "Agent";
  name?: string;
  account: { homePage: string; name: string };
}

export interface XapiActivity {
  objectType: "Activity";
  id: string;
  definition: {
    type: string;
    name: Record<string, string>;
    interactionType?: string;
  };
}

export interface XapiResult {
  score?: { scaled: number; raw?: number; min?: number; max?: number };
  success?: boolean;
  completion?: boolean;
  duration?: string;
  extensions?: Record<string, number>;
}

export interface XapiStatement {
  id: string;
  actor: XapiAgent;
  verb: { id: string; display: { "en-US": string } };
  object: XapiActivity;
  result?: XapiResult;
  context?: {
    platform: string;
    language?: string;
    contextActivities?: { parent?: XapiActivity[]; grouping?: XapiActivity[] };
  };
  timestamp: string;
  version: typeof XAPI_VERSION;
}

/** A period as an ISO 8601 duration, to the hundredth of a second, as xAPI asks. */
export function xapiDuration(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 10)) / 100;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Number((total % 60).toFixed(2));
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${seconds || (!hours && !minutes) ? `${seconds}S` : ""}`;
}

/** How xAPI names a kind of question, as SCORM's interactions do. */
export function interactionType(kind: QuestionKind): string {
  switch (kind) {
    case "choice":
    case "poll":
    case "highlight":
    case "hotspot":
      return "choice";
    case "text":
    case "math":
    case "gaps":
    case "spelling":
      return "fill-in";
    case "written":
      return "long-fill-in";
    case "number":
      return "numeric";
    case "matching":
    case "sorting":
    case "labelling":
      return "matching";
    case "ordering":
    case "parsons":
      return "sequencing";
    default:
      return "other";
  }
}

/** Names in the lesson's language, or as undetermined when it is not known. */
const named = (name: string, language: string | null) => ({
  [language ?? "und"]: name,
});

/**
 * What a statement is about: a lesson, its module, a class, a question, a
 * video, or something marked, an assignment or an outside tool's column.
 */
export function xapiActivity(
  kind: "lesson" | "module" | "course" | "question" | "video" | "assessment",
  id: string,
  name: string,
  language: string | null,
  question?: QuestionKind,
): XapiActivity {
  return {
    objectType: "Activity",
    id,
    definition: {
      type:
        kind === "question"
          ? `${ACTIVITY}/cmi.interaction`
          : kind === "video"
            ? `${VIDEO}/activity-type/video`
            : `${ACTIVITY}/${kind}`,
      name: named(name, language),
      ...(question ? { interactionType: interactionType(question) } : {}),
    },
  };
}

export function xapiStatement(statement: {
  id: string;
  actor: XapiAgent;
  verb: Verb;
  object: XapiActivity;
  result?: XapiResult;
  language: string | null;
  parent?: XapiActivity[];
  grouping?: XapiActivity[];
  timestamp: string;
}): XapiStatement {
  const activities = {
    ...(statement.parent?.length ? { parent: statement.parent } : {}),
    ...(statement.grouping?.length ? { grouping: statement.grouping } : {}),
  };
  return {
    id: statement.id,
    actor: statement.actor,
    verb: {
      id: XAPI_VERBS[statement.verb],
      display: { "en-US": statement.verb },
    },
    object: statement.object,
    ...(statement.result ? { result: statement.result } : {}),
    context: {
      platform: "Farida",
      ...(statement.language ? { language: statement.language } : {}),
      ...(Object.keys(activities).length
        ? { contextActivities: activities }
        : {}),
    },
    timestamp: new Date(statement.timestamp).toISOString(),
    version: XAPI_VERSION,
  };
}

/**
 * What a lesson's progress says as a result: its score out of a hundred,
 * whether it reached the lesson's pass mark, whether it was finished, and
 * how long from opening it to finishing.
 */
export function lessonResult(progress: {
  startedAt: string;
  completedAt: string | null;
  score: number | null;
  passScore: number | null;
}): XapiResult {
  const score = progress.score;
  return {
    ...(score === null
      ? {}
      : { score: { scaled: score / 100, raw: score, min: 0, max: 100 } }),
    ...(score !== null && progress.passScore !== null
      ? { success: score >= progress.passScore }
      : {}),
    completion: progress.completedAt !== null,
    ...(progress.completedAt
      ? {
          duration: xapiDuration(
            Date.parse(progress.completedAt) - Date.parse(progress.startedAt),
          ),
        }
      : {}),
  };
}

/** What a marked answer says as a result: its share of the marks and its points out of the question's. */
export function answerResult(
  fraction: number,
  points: number | null,
): XapiResult {
  const scaled = Math.min(1, Math.max(0, fraction));
  return {
    score:
      points === null
        ? { scaled }
        : {
            scaled,
            raw: Number((scaled * points).toFixed(2)),
            min: 0,
            max: points,
          },
    success: scaled >= 1,
    completion: true,
  };
}

/**
 * What a mark says as a result: the points given out of the most there
 * were, and their share; the work was finished to be marked.
 */
export function markResult(given: number, maximum: number): XapiResult {
  const scaled = maximum > 0 ? Math.min(1, Math.max(0, given / maximum)) : 0;
  return {
    score: {
      scaled: Number(scaled.toFixed(4)),
      raw: Math.min(Math.max(0, given), maximum),
      min: 0,
      max: maximum,
    },
    completion: true,
  };
}

const https = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(499),
  v.url("xapi.url"),
  v.startsWith("https://", "xapi.https"),
);

/**
 * A school's own record store, as its administrator sets it: the address
 * of its xAPI endpoint, kept ending in a slash so the resources follow
 * it, the key the store gave and its secret, which is kept when left
 * empty, and whether statements are sent.
 */
export const recordStoreSchema = v.object({
  expectedVersion: v.optional(v.pipe(v.number(), v.integer()), 0),
  endpoint: v.pipe(
    https,
    v.transform((value) => (value.endsWith("/") ? value : `${value}/`)),
  ),
  username: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  secret: v.optional(v.pipe(v.string(), v.maxLength(500)), ""),
  enabled: v.boolean(),
});
export type RecordStoreInput = v.InferOutput<typeof recordStoreSchema>;

/** What watching a video says as a result: how much was seen, for how long, and whether nearly all of it. */
export function watchResult(
  watchedSeconds: number,
  durationSeconds: number,
): XapiResult {
  const progress =
    durationSeconds > 0 ? Math.min(1, watchedSeconds / durationSeconds) : 0;
  return {
    completion: progress >= 0.9,
    duration: xapiDuration(watchedSeconds * 1000),
    extensions: {
      [`${VIDEO}/extensions/progress`]: Number(progress.toFixed(3)),
    },
  };
}
