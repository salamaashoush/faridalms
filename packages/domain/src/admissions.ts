import * as v from "valibot";

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

/** Who may make a move: the family that applied, or the admissions office. */
export type Mover = "family" | "office";

/**
 * Every move an application may make, and who makes it. Decisions, offers,
 * the waiting list and enrolment are added here, beside the rest; a move not
 * listed cannot be made by anyone.
 */
const MOVES: Record<
  ApplicationState,
  readonly { to: ApplicationState; by: readonly Mover[] }[]
> = {
  draft: [
    { to: "submitted", by: ["family"] },
    { to: "withdrawn", by: ["family"] },
  ],
  submitted: [
    { to: "in_review", by: ["office"] },
    { to: "withdrawn", by: ["family", "office"] },
  ],
  in_review: [{ to: "withdrawn", by: ["family", "office"] }],
  decided: [],
  offered: [],
  accepted: [],
  enrolled: [],
  waitlisted: [],
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
export const APPLICATION_ENTRY_KINDS = ["note", "state", "item"] as const;
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
