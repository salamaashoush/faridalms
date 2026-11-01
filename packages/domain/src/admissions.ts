import * as v from "valibot";

import type { ContentDocument, ContentNode } from "./content";
import type { FormQuestion, QuestionKind } from "./enquiries";

import {
  MAX_OPTIONS,
  optionsOf,
  QUESTION_KINDS,
  readAnswers,
} from "./enquiries";
import { personNamesSchema } from "./people";

const id = v.pipe(v.string(), v.uuid());
const version = v.pipe(v.number(), v.integer(), v.minValue(1));
const isoDate = v.pipe(v.string(), v.isoDate());
const optionalDate = v.optional(v.union([v.literal(""), isoDate]), "");
const words = (max: number) =>
  v.optional(v.pipe(v.string(), v.trim(), v.maxLength(max)), "");
const whole = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

/**
 * An application's phases, fixed by the product: a family's draft, sent,
 * read by the office, decided, offered a place, the offer accepted and the
 * child enrolled, or held on a ranked waiting list until a place opens.
 */
export const APPLICATION_PHASES = [
  "draft",
  "submitted",
  "in_review",
  "decided",
  "offered",
  "accepted",
  "enrolled",
  "waitlisted",
] as const;

/** The ways an application ends without the child enrolling for this intake. */
export const APPLICATION_EXITS = [
  "declined_by_school",
  "withdrawn",
  "offer_declined",
  "offer_expired",
  "deferred",
] as const;

export const APPLICATION_STATES = [
  ...APPLICATION_PHASES,
  ...APPLICATION_EXITS,
] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

/**
 * Who may make a move: the family that applied, the admissions office, or
 * the school's own clock, which releases decisions on the intake's day and
 * lets an offer lapse when its time is up.
 */
export type Mover = "family" | "office" | "clock";

interface Move {
  to: ApplicationState;
  by: readonly Mover[];
  /** A move the office makes only with `admissions:decide`: deciding, releasing, offering, enrolling. */
  decides?: true;
}

/**
 * Every move an application may make, and who makes it; a move not listed
 * cannot be made by anyone. A decision stays the office's until it is
 * released, when it becomes an offer, a ranked place on the waiting list or
 * a refusal. An accepted offer is enrolled by converting the applicant into
 * a student; deferring moves the application to an intake of a later year.
 */
const MOVES: Record<ApplicationState, readonly Move[]> = {
  draft: [
    { to: "submitted", by: ["family"] },
    { to: "withdrawn", by: ["family"] },
  ],
  submitted: [
    { to: "in_review", by: ["office"] },
    { to: "withdrawn", by: ["family", "office"] },
  ],
  in_review: [
    { to: "decided", by: ["office"], decides: true },
    { to: "withdrawn", by: ["family", "office"] },
    { to: "deferred", by: ["office"] },
  ],
  decided: [
    { to: "in_review", by: ["office"], decides: true },
    { to: "offered", by: ["office", "clock"], decides: true },
    { to: "waitlisted", by: ["office", "clock"], decides: true },
    { to: "declined_by_school", by: ["office", "clock"], decides: true },
    { to: "withdrawn", by: ["family", "office"] },
    { to: "deferred", by: ["office"] },
  ],
  waitlisted: [
    { to: "offered", by: ["office"], decides: true },
    { to: "declined_by_school", by: ["office"], decides: true },
    { to: "withdrawn", by: ["family", "office"] },
    { to: "deferred", by: ["office"] },
  ],
  offered: [
    { to: "accepted", by: ["family", "office"] },
    { to: "offer_declined", by: ["family", "office"] },
    { to: "offer_expired", by: ["clock"] },
    { to: "deferred", by: ["office"] },
  ],
  accepted: [
    { to: "enrolled", by: ["office"], decides: true },
    { to: "withdrawn", by: ["family", "office"] },
    { to: "deferred", by: ["office"] },
  ],
  enrolled: [],
  declined_by_school: [],
  withdrawn: [],
  offer_declined: [],
  offer_expired: [],
  deferred: [],
};

export function nextApplicationStates(
  state: ApplicationState,
  mover: Mover,
): ApplicationState[] {
  return MOVES[state]
    .filter((move) => move.by.includes(mover))
    .map((move) => move.to);
}

export const canMove = (
  from: ApplicationState,
  to: ApplicationState,
  mover: Mover,
) => nextApplicationStates(from, mover).includes(to);

/** Whether the office needs `admissions:decide` for a move, rather than `admissions:manage`. */
export const moveDecides = (from: ApplicationState, to: ApplicationState) =>
  MOVES[from].some((move) => move.to === to && move.decides === true);

/**
 * What the office may decide for an application under review, and the
 * state each becomes once released.
 */
export const DECISIONS = ["offer", "waitlist", "decline"] as const;
export type Decision = (typeof DECISIONS)[number];

export const RELEASED_AS: Record<Decision, ApplicationState> = {
  offer: "offered",
  waitlist: "waitlisted",
  decline: "declined_by_school",
};

/**
 * The state a family reads: a decision not yet released is still being
 * reviewed as far as they can tell.
 */
export const familyState = (state: ApplicationState): ApplicationState =>
  state === "decided" ? "in_review" : state;

/** Whether the intake's day for releasing decisions has come. */
export const releaseDue = (
  intake: { decisionsOn: string | null },
  today: string,
) => intake.decisionsOn !== null && intake.decisionsOn <= today;

/**
 * Places still to give: the seats, less the offers accepted (and enrolled,
 * which were accepted first) and the offers still open.
 */
export function placesLeft(input: {
  capacity: number;
  accepted: number;
  offered: number;
}): number {
  return input.capacity - input.accepted - input.offered;
}

/** The last day an offer released today may be accepted. */
export function offerExpiresOn(today: string, offerDays: number): string {
  const at = new Date(`${today}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + offerDays);
  return at.toISOString().slice(0, 10);
}

export interface WaitlistEntry {
  id: string;
  priorities: readonly PriorityRule[];
  birthDate: string | null;
  submittedAt: string | null;
}

/**
 * The waiting list in the order places are offered: by the intake's
 * priority rules in its order, each rule met ahead of one not met, then by
 * the intake's tiebreak, age, the older child first, and last by who sent
 * their application first.
 */
export function rankWaitlist<T extends WaitlistEntry>(
  entries: readonly T[],
  order: readonly PriorityRule[],
): T[] {
  const key = (entry: T) =>
    order.map((rule) => entry.priorities.includes(rule));
  return entries.toSorted((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let index = 0; index < order.length; index += 1)
      if (ka[index] !== kb[index]) return ka[index] ? -1 : 1;
    if (a.birthDate !== b.birthDate) {
      if (a.birthDate === null) return 1;
      if (b.birthDate === null) return -1;
      return a.birthDate < b.birthDate ? -1 : 1;
    }
    return (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "");
  });
}

/** States that hold a place in the intake's count of live applications. */
export const LIVE_STATES: readonly ApplicationState[] = [
  "submitted",
  "in_review",
  "decided",
  "offered",
  "accepted",
  "waitlisted",
];

/** Applications that ended without the child coming, kept only for the school's retention period. */
export const UNSUCCESSFUL_STATES: readonly ApplicationState[] = [
  "declined_by_school",
  "withdrawn",
  "offer_declined",
  "offer_expired",
];

export const WITHDRAW_REASONS = [
  "family_request",
  "another_school",
  "moving",
  "duplicate",
  "no_response",
  "other",
] as const;
export type WithdrawReason = (typeof WITHDRAW_REASONS)[number];

/** The kinds of step an intake's checklist asks of every applicant. */
export const CHECKLIST_KINDS = [
  "document",
  "assessment",
  "interview",
  "fee",
  "reference",
] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

/** A checklist step's progress: asked for, in, checked, not needed, or not accepted. */
export const ITEM_STATES = [
  "pending",
  "received",
  "verified",
  "waived",
  "rejected",
] as const;
export type ItemState = (typeof ITEM_STATES)[number];

const ITEM_MOVES: Record<ItemState, readonly ItemState[]> = {
  pending: ["received", "waived"],
  received: ["verified", "rejected", "waived", "pending"],
  verified: ["received"],
  waived: ["pending"],
  rejected: ["received", "pending"],
};

/** Where the office may take a checklist step from where it is. */
export const nextItemStates = (state: ItemState): ItemState[] => [
  ...ITEM_MOVES[state],
];

export interface ChecklistItem {
  key: string;
  kind: ChecklistKind;
  labelEn: string;
  labelAr: string;
  required: boolean;
}

export const MAX_CHECKLIST = 20;
export const MAX_FILES_PER_ITEM = 5;

export const checklistItemSchema = v.object({
  key: id,
  kind: v.picklist(CHECKLIST_KINDS),
  labelEn: v.pipe(v.string(), v.trim(), v.maxLength(120)),
  labelAr: v.pipe(v.string(), v.trim(), v.maxLength(120)),
  required: v.boolean(),
});

/**
 * The orders of preference an intake can rank applicants by, in the order
 * the school puts them: a brother or sister at the school, a parent on its
 * staff, a child coming back, and declared additional needs.
 */
export const PRIORITY_RULES = [
  "sibling",
  "staff_child",
  "returning_student",
  "additional_needs",
] as const;
export type PriorityRule = (typeof PRIORITY_RULES)[number];

/** The rules an applicant meets, in the order the intake ranks them. */
export function prioritiesMet(
  order: readonly PriorityRule[],
  met: ReadonlySet<PriorityRule>,
): PriorityRule[] {
  return order.filter((rule) => met.has(rule));
}

export const FEE_KINDS = [
  "application",
  "assessment",
  "registration",
  "tuition",
  "other",
] as const;
export type FeeKind = (typeof FEE_KINDS)[number];

export const CURRENCIES = ["EGP", "USD", "EUR", "GBP", "AED", "SAR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Fee {
  kind: FeeKind;
  amount: number;
}

const amount = v.pipe(
  v.number(),
  v.minValue(0),
  v.maxValue(100_000_000),
  v.check((value) => Math.round(value * 100) === value * 100, "fee.amount"),
);

export const feeSchema = v.object({
  kind: v.picklist(FEE_KINDS),
  amount,
});

/** Months of age a child must have reached, and must not have passed, on the intake's cut-off day. */
export interface AgeRange {
  minMonths: number | null;
  maxMonths: number | null;
}

/** Whole months from a birth date to a day: 4 years and 11 months is 59. */
export function ageInMonths(birthDate: string, on: string): number {
  const [by = 0, bm = 1, bd = 1] = birthDate.split("-").map(Number);
  const [oy = 0, om = 1, od = 1] = on.split("-").map(Number);
  return (oy - by) * 12 + (om - bm) - (od < bd ? 1 : 0);
}

export type AgeFit = "fits" | "young" | "old" | "unknown";

/** Whether a child is of age for an intake on its cut-off day. */
export function ageFit(
  range: AgeRange & { cutoffOn: string },
  birthDate: string | null,
): AgeFit {
  if (!birthDate) return "unknown";
  const months = ageInMonths(birthDate, range.cutoffOn);
  if (range.minMonths !== null && months < range.minMonths) return "young";
  if (range.maxMonths !== null && months > range.maxMonths) return "old";
  return "fits";
}

/**
 * The age range a grade starts with, as Egypt counts it on 1 October:
 * KG1 from 4 years to 5 years and 11 months, grade 1 from 6, a year more for
 * each grade after. A school changes it on the intake.
 */
export function suggestedAges(gradeMeaning: string | null): AgeRange {
  const start: Record<string, number> = {
    pre_kg: 3,
    kg1: 4,
    kg2: 5,
  };
  const grade = /^grade_(\d{1,2})$/.exec(gradeMeaning ?? "");
  const years =
    (gradeMeaning ? start[gradeMeaning] : undefined) ??
    (grade ? 5 + Number(grade[1]) : null);
  if (years === null) return { minMonths: null, maxMonths: null };
  return {
    minMonths: years * 12,
    maxMonths: gradeMeaning === "kg1" ? 71 : years * 12 + 23,
  };
}

/**
 * The day ages are counted on: 1 October of the year of entry in Egypt,
 * otherwise the first day of the school year.
 */
export function suggestedCutoff(
  yearStartsOn: string,
  country: string | null,
): string {
  return country === "EG" ? `${yearStartsOn.slice(0, 4)}-10-01` : yearStartsOn;
}

export type IntakeWindow = "upcoming" | "open" | "closed";

/** Whether families may apply today: from the opening day to the closing day, both included. */
export function intakeWindow(
  intake: { opensOn: string; closesOn: string },
  today: string,
): IntakeWindow {
  if (today < intake.opensOn) return "upcoming";
  if (today > intake.closesOn) return "closed";
  return "open";
}

const intakeFields = {
  schoolYearId: id,
  gradeId: id,
  opensOn: isoDate,
  closesOn: isoDate,
  capacity: whole(1, 5000),
  formId: id,
  checklist: v.pipe(v.array(checklistItemSchema), v.maxLength(MAX_CHECKLIST)),
  currency: v.picklist(CURRENCIES),
  fees: v.pipe(v.array(feeSchema), v.maxLength(FEE_KINDS.length)),
  decisionsOn: optionalDate,
  offerDays: whole(1, 120),
  ageCutoffOn: isoDate,
  minAgeMonths: v.nullable(whole(0, 300)),
  maxAgeMonths: v.nullable(whole(0, 300)),
  priorities: v.pipe(
    v.array(v.picklist(PRIORITY_RULES)),
    v.maxLength(PRIORITY_RULES.length),
  ),
};

export const saveIntakeSchema = v.pipe(
  v.object({
    id: v.optional(v.union([v.literal(""), id]), ""),
    expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
    ...intakeFields,
  }),
  v.forward(
    v.check((input) => input.opensOn <= input.closesOn, "intake.dates"),
    ["closesOn"],
  ),
  v.forward(
    v.check(
      (input) =>
        input.minAgeMonths === null ||
        input.maxAgeMonths === null ||
        input.minAgeMonths <= input.maxAgeMonths,
      "intake.ages",
    ),
    ["maxAgeMonths"],
  ),
  v.forward(
    v.check(
      (input) => new Set(input.priorities).size === input.priorities.length,
      "intake.priorities",
    ),
    ["priorities"],
  ),
  v.forward(
    v.check(
      (input) =>
        new Set(input.fees.map((fee) => fee.kind)).size === input.fees.length,
      "intake.fees",
    ),
    ["fees"],
  ),
  v.forward(
    v.check(
      (input) =>
        input.checklist.every(
          (item) => item.labelEn !== "" || item.labelAr !== "",
        ),
      "intake.checklist",
    ),
    ["checklist"],
  ),
);
export type SaveIntake = v.InferOutput<typeof saveIntakeSchema>;

export const intakeRefSchema = v.object({ id });

export const intakeListSchema = v.object({
  year: v.optional(v.union([v.literal(""), id]), ""),
});

/** One of the school's own questions, worded in both languages. */
export interface AdmissionQuestion {
  id: string;
  answer: QuestionKind;
  required: "optional" | "required";
  labelEn: string;
  labelAr: string;
  hintEn: string;
  hintAr: string;
  /** A choice's options, one per line, the same count in each language. */
  optionsEn: string;
  optionsAr: string;
}

export const MAX_APPLICATION_QUESTIONS = 30;

export const admissionQuestionSchema = v.object({
  id,
  answer: v.picklist(QUESTION_KINDS),
  required: v.picklist(["optional", "required"]),
  labelEn: v.pipe(v.string(), v.trim(), v.maxLength(120)),
  labelAr: v.pipe(v.string(), v.trim(), v.maxLength(120)),
  hintEn: words(200),
  hintAr: words(200),
  optionsEn: v.pipe(v.string(), v.maxLength(MAX_OPTIONS * 101)),
  optionsAr: v.pipe(v.string(), v.maxLength(MAX_OPTIONS * 101)),
});

/**
 * A question as the enquiry form asks it, in one language, so applications
 * and enquiries read and check answers the same way. A question left blank
 * in one language borrows the other's words.
 */
export function questionIn(
  question: AdmissionQuestion,
  locale: "en" | "ar",
): FormQuestion {
  const pick = (en: string, ar: string) =>
    locale === "ar" ? ar.trim() || en : en.trim() || ar;
  return {
    id: question.id,
    label: pick(question.labelEn, question.labelAr),
    hint: pick(question.hintEn, question.hintAr),
    answer: question.answer,
    required: question.required,
    options: pick(question.optionsEn, question.optionsAr),
  };
}

/** A family's answers to the school's questions, checked as an enquiry's are, in the language they read. */
export function readApplicationAnswers(
  questions: readonly AdmissionQuestion[],
  locale: "en" | "ar",
  submitted: Readonly<Record<string, string>>,
) {
  return readAnswers(
    questions.map((question) => questionIn(question, locale)),
    submitted,
  );
}

export const saveFormSchema = v.pipe(
  v.object({
    id: v.optional(v.union([v.literal(""), id]), ""),
    expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
    nameEn: words(120),
    nameAr: words(120),
    questions: v.pipe(
      v.array(admissionQuestionSchema),
      v.maxLength(MAX_APPLICATION_QUESTIONS),
    ),
  }),
  v.forward(
    v.check((input) => input.nameEn !== "" || input.nameAr !== "", "form.name"),
    ["nameEn"],
  ),
  v.forward(
    v.check(
      (input) =>
        new Set(input.questions.map((q) => q.id)).size ===
        input.questions.length,
      "form.questions",
    ),
    ["questions"],
  ),
);
export type SaveForm = v.InferOutput<typeof saveFormSchema>;

export const formRefSchema = v.object({ id, expectedVersion: version });

/** Whether a question can be published: words in at least one language, and a choice's options in each it has words for. */
export function questionReady(question: AdmissionQuestion): boolean {
  const en = questionIn(question, "en");
  const ar = questionIn(question, "ar");
  if (en.label === "") return false;
  if (question.answer !== "choice") return true;
  const count = optionsOf(en.options).length;
  return count >= 2 && optionsOf(ar.options).length === count;
}

/** A second adult the family names on the form, made a person when it is sent. */
export const otherGuardianSchema = v.object({
  relationId: id,
  names: personNamesSchema,
  email: v.optional(
    v.union([
      v.literal(""),
      v.pipe(
        v.string(),
        v.trim(),
        v.toLowerCase(),
        v.maxLength(254),
        v.email(),
      ),
    ]),
    "",
  ),
  phone: words(40),
  livesWithChild: v.boolean(),
});

export const previousSchoolSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(160)),
  country: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.regex(/^[A-Z]{2}$/))]),
    "",
  ),
  city: words(100),
  fromYear: v.nullable(whole(1990, 2100)),
  toYear: v.nullable(whole(1990, 2100)),
  grade: words(60),
  leaving: words(500),
});
export type PreviousSchool = v.InferOutput<typeof previousSchoolSchema>;

export const MAX_PREVIOUS_SCHOOLS = 5;

/**
 * What the family writes on the form besides the child: who they are to the
 * child, the other parent or guardian, the schools the child has been to,
 * and their answers to the school's questions as typed. Kept as a draft
 * until the application is sent; the child is a person from the start.
 */
export const applicationFormSchema = v.object({
  relationId: v.optional(v.union([v.literal(""), id]), ""),
  /** That the person applying has parental responsibility, which a consent on the child's behalf needs. */
  responsible: v.boolean(),
  phone: words(40),
  other: v.nullable(otherGuardianSchema),
  schools: v.pipe(
    v.array(previousSchoolSchema),
    v.maxLength(MAX_PREVIOUS_SCHOOLS),
  ),
  questions: v.pipe(
    v.record(
      v.pipe(v.string(), v.uuid()),
      v.pipe(v.string(), v.maxLength(2000)),
    ),
    v.check(
      (answers) => Object.keys(answers).length <= MAX_APPLICATION_QUESTIONS,
      "application.questions",
    ),
  ),
});
export type ApplicationForm = v.InferOutput<typeof applicationFormSchema>;

export const emptyApplicationForm = (): ApplicationForm => ({
  relationId: "",
  responsible: false,
  phone: "",
  other: null,
  schools: [],
  questions: {},
});

/** The child's identity document, sealed by the identifiers system as it is saved. */
export const childDocumentSchema = v.object({
  systemId: id,
  /** Empty keeps the number already saved. */
  number: v.pipe(v.string(), v.trim(), v.maxLength(64)),
  issuingCountry: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.regex(/^[A-Z]{2}$/))]),
    "",
  ),
});

export const childSchema = v.object({
  names: personNamesSchema,
  birthDate: isoDate,
  sexId: id,
  document: v.nullable(childDocumentSchema),
});
export type ChildInput = v.InferOutput<typeof childSchema>;

/**
 * Health and needs, each in the family's words. Each answer is kept as a
 * health record of its kind behind the health purpose; only whether
 * additional needs were declared is plain, for the intake's ranking.
 */
export const NEEDS_KINDS = [
  "chronic_condition",
  "allergy",
  "medication",
  "dietary_requirement",
  "additional_needs",
] as const;
export type NeedsKind = (typeof NEEDS_KINDS)[number];

export const needsSchema = v.object(
  Object.fromEntries(NEEDS_KINDS.map((kind) => [kind, words(2000)])) as Record<
    NeedsKind,
    ReturnType<typeof words>
  >,
);
export type Needs = Record<NeedsKind, string>;

export const emptyNeeds = (): Needs =>
  Object.fromEntries(NEEDS_KINDS.map((kind) => [kind, ""])) as Needs;

/** Starts an application for a child: one already applying through this family, or a new one. */
export const startApplicationSchema = v.pipe(
  v.object({
    intakeId: id,
    applicantId: v.optional(v.union([v.literal(""), id]), ""),
    child: v.nullable(childSchema),
    locale: v.picklist(["en", "ar"]),
  }),
  v.check(
    (input) => (input.applicantId === "") !== (input.child === null),
    "application.child",
  ),
);

export const saveDraftSchema = v.object({
  id,
  expectedVersion: version,
  child: childSchema,
  form: applicationFormSchema,
  /** Only when they changed, so saving other answers reads no health record. */
  needs: v.nullable(needsSchema),
});
export type SaveDraft = v.InferOutput<typeof saveDraftSchema>;

/** The consents asked when an application is sent, each agreed or not to the published words. */
export const APPLICATION_CONSENTS = [
  "admission_processing",
  "special_category",
  "marketing",
] as const;
export type ApplicationConsent = (typeof APPLICATION_CONSENTS)[number];

/** Purposes agreed to when a family applies, never asked of the families already at the school. */
export const askedAtAdmission = (meaning: string | null) =>
  (APPLICATION_CONSENTS as readonly string[]).includes(meaning ?? "");

export const submitApplicationSchema = v.object({
  id,
  expectedVersion: version,
  locale: v.picklist(["en", "ar"]),
  consents: v.array(v.object({ noticeId: id, agreed: v.boolean() })),
});

export const withdrawApplicationSchema = v.object({
  id,
  expectedVersion: version,
  reason: v.picklist(WITHDRAW_REASONS),
  note: words(500),
});

export const applicationRefSchema = v.object({ id });

export const moveApplicationSchema = v.object({
  id,
  expectedVersion: version,
  state: v.picklist(APPLICATION_STATES),
  note: words(500),
});

export const APPLICATION_VIEWS = [
  "live",
  "all",
  ...APPLICATION_STATES,
] as const;
export type ApplicationView = (typeof APPLICATION_VIEWS)[number];
export const APPLICATIONS_PAGE_SIZE = 25;

export const applicationListSchema = v.object({
  intake: v.optional(v.union([v.literal(""), id]), ""),
  year: v.optional(v.union([v.literal(""), id]), ""),
  state: v.optional(v.picklist(APPLICATION_VIEWS), "live"),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});
export type ApplicationListQuery = v.InferOutput<typeof applicationListSchema>;

export const applicationNoteSchema = v.object({
  id,
  body: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4000)),
});

export const moveItemSchema = v.object({
  applicationId: id,
  itemId: id,
  expectedVersion: version,
  state: v.picklist(ITEM_STATES),
  note: words(500),
});

export const attachDocumentSchema = v.object({
  applicationId: id,
  itemId: id,
  fileId: id,
});

export const detachDocumentSchema = v.object({
  applicationId: id,
  fileId: id,
});

/** What the thread of an application holds: notes, each change of state, and each checklist change. */
export const APPLICATION_ENTRY_KINDS = [
  "note",
  "state",
  "item",
  "event",
] as const;
export type ApplicationEntryKind = (typeof APPLICATION_ENTRY_KINDS)[number];

/** People the office may already know, found when the application is sent; never shown to the family. */
export interface ApplicationMatches {
  /** Students or former students sharing the child's name and birth date. */
  students: { id: string; nameEn: string | null; nameAr: string | null }[];
  /** People already holding a guardian's email or phone. */
  guardians: {
    id: string;
    nameEn: string | null;
    nameAr: string | null;
    /** Who on the application they may be: the person applying or the other guardian. */
    as: "applicant" | "other";
  }[];
  /** Current students who share a parent with the child. */
  siblings: { id: string; nameEn: string | null; nameAr: string | null }[];
  /** Whether a parent holds a current staff role at the school. */
  staffParent: boolean;
}

export const NO_MATCHES: ApplicationMatches = {
  students: [],
  guardians: [],
  siblings: [],
  staffParent: false,
};

/** The priority rules matching found, before the office confirms them. */
export function prioritiesFound(
  matches: ApplicationMatches,
  additionalNeeds: boolean,
): Set<PriorityRule> {
  const met = new Set<PriorityRule>();
  if (matches.siblings.length > 0) met.add("sibling");
  if (matches.staffParent) met.add("staff_child");
  if (matches.students.length > 0) met.add("returning_student");
  if (additionalNeeds) met.add("additional_needs");
  return met;
}

/** A school's application number: the year of entry and a running count, `2027-0042`. */
export function applicationReference(entryYear: number, count: number): string {
  return `${entryYear}-${String(count).padStart(4, "0")}`;
}

/**
 * Registering as a family on the portal: a name, an address to confirm and
 * a phone, sent through Turnstile where it is set up, with the same hidden
 * field and fill time as the website's forms.
 */
export const registerFamilySchema = v.object({
  names: personNamesSchema,
  email: v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.maxLength(254),
    v.email(),
  ),
  phone: words(40),
  locale: v.picklist(["en", "ar"]),
  turnstile: v.optional(v.pipe(v.string(), v.maxLength(2048)), ""),
  website: v.optional(v.pipe(v.string(), v.maxLength(200)), ""),
  elapsed: v.pipe(v.number(), v.minValue(0)),
});
export type RegisterFamily = v.InferOutput<typeof registerFamilySchema>;

const applicationVersion = v.object({ id, expectedVersion: version });
const someApplications = v.pipe(
  v.array(applicationVersion),
  v.minLength(1),
  v.maxLength(100),
);

/** The office decides one application or many at once; nothing reaches the family until it is released. */
export const decideSchema = v.object({
  applications: someApplications,
  decision: v.picklist(DECISIONS),
  note: words(500),
});

/** Decisions released by hand, before the intake's day; and places offered from the waiting list. */
export const releaseSchema = v.object({ applications: someApplications });

/** The family answers an offer, or the office records the answer they gave by phone or at the desk. */
export const OFFER_ANSWERS = ["accept", "decline"] as const;
export type OfferAnswer = (typeof OFFER_ANSWERS)[number];
export const answerOfferSchema = v.object({
  id,
  expectedVersion: version,
  answer: v.picklist(OFFER_ANSWERS),
  note: words(500),
});

/** Moves an application to an intake of a later year, where it carries on as sent. */
export const deferApplicationSchema = v.object({
  id,
  expectedVersion: version,
  intakeId: id,
  note: words(500),
});

const schoolReference = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(24),
  v.regex(/^[A-Za-z0-9/_-]*$/, "validation.reference"),
);

/**
 * Enrols accepted applicants. Each names the student they become: empty
 * for the applicant themself, or a current or former student matching
 * found when the application was sent, which the office confirms is the
 * same child. A new student takes the school reference given, or the
 * application's number.
 */
export const convertSchema = v.object({
  applications: v.pipe(
    v.array(
      v.object({
        id,
        expectedVersion: version,
        studentId: v.optional(v.union([v.literal(""), id]), ""),
        reference: v.optional(schoolReference, ""),
      }),
    ),
    v.minLength(1),
    v.maxLength(100),
  ),
});

export const boardSchema = v.object({ intake: id });

export const admissionReportSchema = v.object({
  year: v.optional(v.union([v.literal(""), id]), ""),
});

/** Visits and meetings an application can hold, each at a time with the staff who attend. */
export const EVENT_KINDS = ["tour", "assessment", "interview"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** An event is booked, then attended, missed by the family, or called off. */
export const EVENT_OUTCOMES = [
  "scheduled",
  "attended",
  "missed",
  "cancelled",
] as const;
export type EventOutcome = (typeof EVENT_OUTCOMES)[number];

export const MAX_EVENT_ATTENDEES = 10;
const clockTime = v.pipe(v.string(), v.isoTime());

export const saveEventSchema = v.pipe(
  v.object({
    applicationId: id,
    id: v.optional(v.union([v.literal(""), id]), ""),
    expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
    kind: v.picklist(EVENT_KINDS),
    /** The checklist step it is for, an assessment or interview; empty for none. */
    itemId: v.optional(v.union([v.literal(""), id]), ""),
    date: isoDate,
    startTime: clockTime,
    endTime: clockTime,
    location: words(200),
    attendeeIds: v.pipe(v.array(id), v.maxLength(MAX_EVENT_ATTENDEES)),
  }),
  v.forward(
    v.check((input) => input.startTime < input.endTime, "event.times"),
    ["endTime"],
  ),
);
export type SaveEvent = v.InferOutput<typeof saveEventSchema>;

export const recordEventSchema = v.object({
  applicationId: id,
  id,
  expectedVersion: version,
  outcome: v.picklist(["attended", "missed", "cancelled"]),
  result: words(2000),
});

/** The letters a family receives as its application moves, each written from the school's template for it. */
export const LETTER_KINDS = [
  "offer",
  "waitlist",
  "decline",
  "welcome",
] as const;
export type LetterKind = (typeof LETTER_KINDS)[number];

/** The letter a move into a state sends. */
export const LETTER_FOR: Partial<Record<ApplicationState, LetterKind>> = {
  offered: "offer",
  waitlisted: "waitlist",
  declined_by_school: "decline",
  enrolled: "welcome",
};

/** What a letter's template may say in braces, filled in from the application when it is sent. */
export const LETTER_FIELDS = [
  "family",
  "child",
  "grade",
  "year",
  "school",
  "reference",
  "expires",
] as const;
export type LetterField = (typeof LETTER_FIELDS)[number];

const FIELD = /\{([a-z]+)\}/g;

/** Words with a letter's fields filled in; braces naming no field stay as written. */
export function fillLetterText(
  text: string,
  fields: Readonly<Record<LetterField, string>>,
): string {
  return text.replaceAll(FIELD, (written, name: string) =>
    (LETTER_FIELDS as readonly string[]).includes(name)
      ? fields[name as LetterField]
      : written,
  );
}

/** A letter's document with its fields filled in, wherever in it they are written. */
export function fillLetter(
  document: ContentDocument,
  fields: Readonly<Record<LetterField, string>>,
): ContentDocument {
  const fill = (node: ContentNode): ContentNode => ({
    ...node,
    ...(typeof node.text === "string"
      ? { text: fillLetterText(node.text, fields) }
      : {}),
    ...(node.children ? { children: node.children.map(fill) } : {}),
  });
  return { ...document, root: fill(document.root) };
}

/** The builtin key a school's starting letter of a kind and language is given under. */
export const letterKey = (kind: LetterKind, locale: "en" | "ar") =>
  `admission_${kind}_${locale}`;

/**
 * The letters every school starts with, in both languages, given to it as
 * templates it edits. A custom migration gave them to the schools that
 * existed before; it copies these words.
 */
export const BUILTIN_LETTERS: readonly {
  kind: LetterKind;
  locale: "en" | "ar";
  title: string;
  body: string;
}[] = [
  {
    kind: "offer",
    locale: "en",
    title: "Offer of a place",
    body: "Dear {family},\n\nWe are delighted to offer {child} a place in {grade} for the {year} school year.\n\nPlease accept or decline the offer from your family account by {expires}. If we do not hear from you by then, the place will be offered to another child.\n\nYour application number is {reference}. Once you accept, we will write to you about the next steps before the year begins.\n\nWith warm regards,\n{school}",
  },
  {
    kind: "offer",
    locale: "ar",
    title: "عرض مقعد",
    body: "إلى {family}،\n\nتحية طيبة وبعد،\n\nيسعدنا أن نعرض على {child} مقعدًا في {grade} للعام الدراسي {year}.\n\nنرجو قبول العرض أو الاعتذار عنه من حساب الأسرة في موعد أقصاه {expires}، وإن لم يصلنا ردكم حتى ذلك الحين عُرض المقعد على طفل آخر.\n\nرقم طلبكم {reference}، وبعد قبولكم العرض سنراسلكم بالخطوات التالية قبل بداية العام.\n\nمع أطيب التحيات،\n{school}",
  },
  {
    kind: "waitlist",
    locale: "en",
    title: "A place on our waiting list",
    body: "Dear {family},\n\nThank you for applying to {school} for {child}. We have more applications for {grade} in {year} than places, and we are not able to offer {child} a place at this time.\n\nWe have placed {child} on our waiting list. If a place becomes available, we offer it in the order of our admission criteria and will write to you straight away.\n\nYour application number is {reference}. You can leave the waiting list at any time from your family account.\n\nWith kind regards,\n{school}",
  },
  {
    kind: "waitlist",
    locale: "ar",
    title: "قائمة الانتظار",
    body: "إلى {family}،\n\nتحية طيبة وبعد،\n\nنشكركم على تقديم طلب التحاق {child} بـ{school}. لقد تجاوز عدد الطلبات المقدَّمة إلى {grade} للعام الدراسي {year} عدد المقاعد المتاحة، ولذلك لا يمكننا أن نعرض على {child} مقعدًا في الوقت الحالي.\n\nوقد أدرجنا {child} في قائمة الانتظار، وإذا توفر مقعد عرضناه وفق ترتيب معايير القبول لدينا وراسلناكم فورًا.\n\nرقم طلبكم {reference}، ويمكنكم الخروج من قائمة الانتظار في أي وقت من حساب الأسرة.\n\nمع أطيب التحيات،\n{school}",
  },
  {
    kind: "decline",
    locale: "en",
    title: "Your application",
    body: "Dear {family},\n\nThank you for your interest in {school} and for the time you gave to the application for {child} to join {grade} in {year}.\n\nAfter careful consideration, we are sorry that we are not able to offer {child} a place.\n\nWe wish {child} every success, and we thank you again for thinking of us.\n\nWith kind regards,\n{school}",
  },
  {
    kind: "decline",
    locale: "ar",
    title: "بشأن طلب الالتحاق",
    body: "إلى {family}،\n\nتحية طيبة وبعد،\n\nنشكركم على اهتمامكم بـ{school} وعلى الوقت الذي خصصتموه لطلب التحاق {child} بـ{grade} للعام الدراسي {year}.\n\nوبعد دراسة الطلب بعناية، نأسف لعدم تمكننا من عرض مقعد على {child}.\n\nنتمنى لـ{child} كل التوفيق، ونشكركم مجددًا على ثقتكم.\n\nمع أطيب التحيات،\n{school}",
  },
  {
    kind: "welcome",
    locale: "en",
    title: "Welcome to {school}",
    body: "Dear {family},\n\nWelcome to {school}. {child} is now enrolled in {grade} for the {year} school year, and we look forward to meeting you.\n\nYour family account now opens {child}'s record at the school. Before the year begins we will share the calendar, the uniform and supplies list, and the arrangements for the first day.\n\nWith warm regards,\n{school}",
  },
  {
    kind: "welcome",
    locale: "ar",
    title: "مرحبًا بكم في {school}",
    body: "إلى {family}،\n\nتحية طيبة وبعد،\n\nيسعدنا أن نرحب بكم في {school}، فقد أصبح {child} مقيدًا في {grade} للعام الدراسي {year}، ونتطلع إلى لقائكم.\n\nيتيح لكم حساب الأسرة الآن الاطلاع على سجل {child} في المدرسة، وقبل بداية العام سنرسل إليكم التقويم الدراسي وقائمة الزي المدرسي والأدوات وترتيبات اليوم الأول.\n\nمع أطيب التحيات،\n{school}",
  },
];

/** The phases the funnel counts, in order: how far each application got. */
export const FUNNEL_STAGES = [
  "submitted",
  "in_review",
  "decided",
  "offered",
  "accepted",
  "enrolled",
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

const STAGE_OF: Partial<Record<ApplicationState, FunnelStage>> = {
  submitted: "submitted",
  in_review: "in_review",
  decided: "decided",
  waitlisted: "decided",
  declined_by_school: "decided",
  offered: "offered",
  offer_declined: "offered",
  offer_expired: "offered",
  accepted: "accepted",
  enrolled: "enrolled",
};

/**
 * The furthest stage of the funnel an application reached, from the states
 * it has been in. A draft reaches none; an ending counts at the stage it
 * ended from, so an offer turned down still reached an offer.
 */
export function stageReached(
  history: readonly ApplicationState[],
): FunnelStage | null {
  let reached = -1;
  for (const state of history) {
    const stage = STAGE_OF[state];
    const at = stage ? FUNNEL_STAGES.indexOf(stage) : -1;
    if (at > reached) reached = at;
  }
  return FUNNEL_STAGES[reached] ?? null;
}

export const letterRefSchema = v.object({ id });
