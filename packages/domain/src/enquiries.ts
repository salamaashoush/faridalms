import * as v from "valibot";

import type { FormAnswer } from "./questions";

import { pageField } from "./paging";

/**
 * Where an enquiry came from. It is set once, when the enquiry is made:
 * the website's forms write `website`; staff log the rest by hand.
 */
export const ENQUIRY_SOURCES = [
  "website",
  "phone",
  "email",
  "walk_in",
  "event",
  "referral",
  "other",
] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];
export const LOGGED_SOURCES = ENQUIRY_SOURCES.filter(
  (source): source is Exclude<EnquirySource, "website"> => source !== "website",
);

export const ENQUIRY_PURPOSES = ["enquiry", "visit", "general"] as const;
export type EnquiryPurpose = (typeof ENQUIRY_PURPOSES)[number];

export const ENQUIRY_STATES = [
  "open",
  "in_progress",
  "converted",
  "closed",
] as const;
export type EnquiryState = (typeof ENQUIRY_STATES)[number];

/** Why an enquiry ended without the family going on to apply. */
export const CLOSE_REASONS = [
  "answered",
  "not_interested",
  "another_school",
  "not_eligible",
  "no_places",
  "no_response",
  "duplicate",
  "spam",
  "other",
] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

const MOVES: Record<EnquiryState, readonly EnquiryState[]> = {
  open: ["in_progress", "converted", "closed"],
  in_progress: ["converted", "closed"],
  converted: ["in_progress"],
  closed: ["open", "in_progress"],
};

/**
 * Where an enquiry may go from where it is. A converted one returns to work
 * only while no applicant is linked to it, since conversion made that record;
 * a closed one reopens where it left off.
 */
export function nextStates(enquiry: {
  state: EnquiryState;
  responded: boolean;
  linked: boolean;
}): EnquiryState[] {
  if (enquiry.state === "converted" && enquiry.linked) return [];
  if (enquiry.state === "closed")
    return [enquiry.responded ? "in_progress" : "open"];
  return [...MOVES[enquiry.state]];
}

/** The state an enquiry takes when someone first talks to the family. */
export const afterContact = (state: EnquiryState): EnquiryState =>
  state === "open" ? "in_progress" : state;

/** The most questions of its own a school's enquiry form asks. */
export const MAX_QUESTIONS = 10;

const id = v.pipe(v.string(), v.uuid());
const version = v.pipe(v.number(), v.integer(), v.minValue(1));
const words = (max: number) =>
  v.optional(v.pipe(v.string(), v.trim(), v.maxLength(max)), "");
const email = v.optional(
  v.union([
    v.literal(""),
    v.pipe(v.string(), v.trim(), v.maxLength(254), v.email()),
  ]),
  "",
);

export const ENQUIRY_VIEWS = ["all", ...ENQUIRY_STATES] as const;
export type EnquiryView = (typeof ENQUIRY_VIEWS)[number];

export const enquiryListSchema = v.object({
  state: v.optional(v.picklist(ENQUIRY_VIEWS), "open"),
  source: v.optional(v.picklist(["all", ...ENQUIRY_SOURCES]), "all"),
  purpose: v.optional(v.picklist(["all", ...ENQUIRY_PURPOSES]), "all"),
  /** Someone's id, `me`, `none` for nobody yet, or `all`. */
  assignee: v.optional(v.union([v.picklist(["all", "me", "none"]), id]), "all"),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  page: pageField,
});
export type EnquiryListQuery = v.InferOutput<typeof enquiryListSchema>;

/**
 * Who an enquiry is from and what they ask, alike whether a family wrote it
 * on the website or staff took it down.
 */
export const enquirerFields = {
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  email,
  phone: words(40),
  childName: words(120),
  childYear: words(60),
  message: words(2000),
};

/**
 * An enquiry staff take by phone, at the desk, at an event or from a
 * referral. Like a form, it needs a name and a way to reach the family.
 */
export const logEnquirySchema = v.pipe(
  v.object({
    source: v.picklist(LOGGED_SOURCES),
    purpose: v.picklist(ENQUIRY_PURPOSES),
    locale: v.picklist(["en", "ar"]),
    ...enquirerFields,
    assigneeId: v.optional(v.union([v.literal(""), id]), ""),
  }),
  v.check((input) => input.email !== "" || input.phone !== "", "enquiry.reach"),
);
export type LogEnquiry = v.InferOutput<typeof logEnquirySchema>;

export const enquiryRefSchema = v.object({ id });

export const assignEnquirySchema = v.object({
  id,
  expectedVersion: version,
  assigneeId: v.union([v.literal(""), id]),
});

export const moveEnquirySchema = v.pipe(
  v.object({
    id,
    expectedVersion: version,
    state: v.picklist(ENQUIRY_STATES),
    reason: v.optional(v.picklist(CLOSE_REASONS)),
    note: words(500),
  }),
  v.check(
    (input) => (input.state === "closed") === (input.reason !== undefined),
    "enquiry.reason",
  ),
);

/** Whole minutes from the enquiry to the first time someone talked to the family. */
export function responseMinutes(
  createdAt: string,
  firstRespondedAt: string | null,
): number | null {
  if (!firstRespondedAt) return null;
  const minutes = Math.round(
    (Date.parse(firstRespondedAt) - Date.parse(createdAt)) / 60_000,
  );
  return Number.isFinite(minutes) ? Math.max(0, minutes) : null;
}

const SUBJECTS: Record<EnquiryPurpose, Record<"en" | "ar", string>> = {
  enquiry: {
    en: "Your enquiry to {school}",
    ar: "استفساركم لدى {school}",
  },
  visit: {
    en: "Your visit to {school}",
    ar: "زيارتكم إلى {school}",
  },
  general: {
    en: "Your message to {school}",
    ar: "رسالتكم إلى {school}",
  },
};

/**
 * What the enquiry's conversation is called, in the family's language: the
 * subject of every email of it, so their mail program keeps it together.
 */
export function conversationSubject(
  purpose: EnquiryPurpose,
  locale: "en" | "ar",
  school: string,
): string {
  return SUBJECTS[purpose][locale].replace("{school}", school).slice(0, 200);
}

/** What the admissions conversation with an applying family is called, when the office starts it. */
export function applicationSubject(
  locale: "en" | "ar",
  school: string,
): string {
  return (
    locale === "ar"
      ? `طلب التحاقكم بـ${school}`
      : `Your application to ${school}`
  ).slice(0, 200);
}

/**
 * A website enquiry as the family's first message: what they wrote, then
 * their answers to the school's questions, so the conversation starts with
 * their words. An enquiry that says nothing in words names its child.
 */
export function submissionText(enquiry: {
  message: string;
  answers: readonly FormAnswer[];
  childName: string;
  childYear: string;
}): string {
  const message = enquiry.message.trim();
  const answered = enquiry.answers
    .map((answer) => `${answer.prompt}: ${answer.text}`)
    .join("\n");
  const about = [enquiry.childName, enquiry.childYear]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
  const said = [message, answered].filter(Boolean).join("\n\n") || about;
  return (said || "-").slice(0, 5000);
}

/**
 * How an enquiry staff took by hand opens its conversation: what they
 * noted down, as the call, meeting or email it was.
 */
export function loggedKind(
  source: EnquirySource,
): "call" | "meeting" | "email" | "note" {
  if (source === "phone") return "call";
  if (source === "walk_in" || source === "event") return "meeting";
  if (source === "email") return "email";
  return "note";
}

/**
 * What the enquiry's system records in its conversation as it is worked:
 * a move from one state to another, with the reason it closed, and a
 * change of who holds it. The conversation shows them among its entries,
 * so staff read one timeline.
 */
export type EnquiryEvent =
  | {
      event: "state";
      from: EnquiryState;
      to: EnquiryState;
      reason?: CloseReason;
      automatic?: boolean;
    }
  | {
      event: "assigned";
      assigneeId: string | null;
      nameEn: string | null;
      nameAr: string | null;
    };
