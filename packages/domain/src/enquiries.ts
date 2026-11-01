import * as v from "valibot";

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

/** What staff write into an enquiry's thread themselves. */
export const LOGGED_ENTRIES = ["note", "call", "email", "meeting"] as const;
export type LoggedEntry = (typeof LOGGED_ENTRIES)[number];
/**
 * Everything the thread holds: what staff wrote, the replies sent from the
 * app, and each change of state or assignee, so the record reads as a history.
 */
export const ENTRY_KINDS = [
  ...LOGGED_ENTRIES,
  "reply",
  "state",
  "assigned",
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** Entries that are a conversation with the family, which ends the wait for a first response. */
export const CONTACT_ENTRIES: readonly EntryKind[] = [
  "call",
  "email",
  "meeting",
  "reply",
];

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

export const QUESTION_KINDS = [
  "short",
  "long",
  "choice",
  "date",
  "number",
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** A question a school adds to its form, as the form section stores it. */
export interface FormQuestion {
  id: string;
  label: string;
  hint: string;
  answer: QuestionKind;
  required: "optional" | "required";
  /** A choice's options, one per line. */
  options: string;
}

/** One answer kept with the enquiry, worded as the family saw the question. */
export interface EnquiryAnswer {
  id: string;
  label: string;
  kind: QuestionKind;
  value: string;
}

export const MAX_QUESTIONS = 10;
export const MAX_OPTIONS = 20;
const ANSWER_LIMIT: Record<QuestionKind, number> = {
  short: 200,
  long: 2000,
  choice: 200,
  date: 10,
  number: 20,
};

/** A choice's options: one per line, blank lines and repeats dropped. */
export function optionsOf(text: string): string[] {
  return [
    ...new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ].slice(0, MAX_OPTIONS);
}

/** Whether a question can be answered as written: it has words, and a choice has two options. */
export function questionComplete(question: FormQuestion): boolean {
  return (
    question.label.trim() !== "" &&
    (question.answer !== "choice" || optionsOf(question.options).length >= 2)
  );
}

const NUMBER = /^-?\d{1,12}(\.\d{1,4})?$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function validDay(value: string) {
  if (!ISO_DAY.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value);
}

/** Arabic-Indic and Persian digits as ASCII, so a number typed either way reads the same. */
const asciiDigits = (value: string) =>
  value
    .replaceAll(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replaceAll(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace("٫", ".");

export type AnswersRead =
  | { ok: true; answers: EnquiryAnswer[] }
  | { ok: false; questionId: string; code: "required" | "invalid" };

/**
 * A family's answers checked against the questions their form showed, in the
 * words it showed them. A choice must be one of its options, a date a real
 * day, a number a number. Answers to questions the form no longer asks are
 * dropped, and each answer keeps its question's wording, so editing the form
 * later never changes what an enquiry says.
 */
export function readAnswers(
  questions: readonly FormQuestion[],
  submitted: Readonly<Record<string, string>>,
): AnswersRead {
  const answers: EnquiryAnswer[] = [];
  for (const question of questions.filter(questionComplete)) {
    const raw = (submitted[question.id] ?? "").trim();
    if (!raw) {
      if (question.required === "required")
        return { ok: false, questionId: question.id, code: "required" };
      continue;
    }
    let value = raw;
    if (question.answer === "number") {
      value = asciiDigits(raw);
      if (!NUMBER.test(value))
        return { ok: false, questionId: question.id, code: "invalid" };
    }
    if (question.answer === "date" && !validDay(raw))
      return { ok: false, questionId: question.id, code: "invalid" };
    if (
      question.answer === "choice" &&
      !optionsOf(question.options).includes(raw)
    )
      return { ok: false, questionId: question.id, code: "invalid" };
    if (value.length > ANSWER_LIMIT[question.answer])
      return { ok: false, questionId: question.id, code: "invalid" };
    answers.push({
      id: question.id,
      label: question.label.trim(),
      kind: question.answer,
      value,
    });
  }
  return { ok: true, answers };
}

/** The most an answer can hold, for the form's own inputs. */
export const answerLimit = (kind: QuestionKind) => ANSWER_LIMIT[kind];

export const enquiryAnswerSchema = v.object({
  id: v.pipe(v.string(), v.maxLength(64)),
  label: v.pipe(v.string(), v.maxLength(120)),
  kind: v.picklist(QUESTION_KINDS),
  value: v.pipe(v.string(), v.maxLength(2000)),
});

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
export const ENQUIRIES_PAGE_SIZE = 25;

export const enquiryListSchema = v.object({
  state: v.optional(v.picklist(ENQUIRY_VIEWS), "open"),
  source: v.optional(v.picklist(["all", ...ENQUIRY_SOURCES]), "all"),
  purpose: v.optional(v.picklist(["all", ...ENQUIRY_PURPOSES]), "all"),
  /** Someone's id, `me`, `none` for nobody yet, or `all`. */
  assignee: v.optional(v.union([v.picklist(["all", "me", "none"]), id]), "all"),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});
export type EnquiryListQuery = v.InferOutput<typeof enquiryListSchema>;

/**
 * An enquiry staff take by phone, at the desk, at an event or from a
 * referral. Like a form, it needs a name and a way to reach the family.
 */
export const logEnquirySchema = v.pipe(
  v.object({
    source: v.picklist(LOGGED_SOURCES),
    purpose: v.picklist(ENQUIRY_PURPOSES),
    locale: v.picklist(["en", "ar"]),
    name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
    email,
    phone: words(40),
    childName: words(120),
    childYear: words(60),
    message: words(2000),
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

export const addEntrySchema = v.object({
  id,
  kind: v.picklist(LOGGED_ENTRIES),
  body: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4000)),
});

export const REPLY_TEMPLATES = [
  "thanks",
  "visit",
  "information",
  "places",
  "general",
] as const;
export type ReplyTemplate = (typeof REPLY_TEMPLATES)[number];

export const replySchema = v.object({
  id,
  template: v.optional(v.picklist(REPLY_TEMPLATES)),
  locale: v.picklist(["en", "ar"]),
  subject: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  body: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(5000)),
});

interface Written {
  subject: string;
  body: string;
}

/**
 * The replies an office sends most, in both languages. `{name}`, `{child}`,
 * `{school}` and `{sender}` are filled in before the reply opens, and the
 * person sending edits the words before they go.
 */
export const REPLY_WORDING: Record<
  ReplyTemplate,
  Record<"en" | "ar", Written>
> = {
  thanks: {
    en: {
      subject: "Thank you for your enquiry",
      body: "Dear {name},\n\nThank you for your interest in {school}. We have received your enquiry and would be glad to tell you more about the school and how admission works.\n\nPlease reply to this email with any questions, or let us know a good time to call you.\n\nKind regards,\n{sender}\n{school}",
    },
    ar: {
      subject: "شكرًا لاستفساركم",
      body: "مرحبًا {name}،\n\nنشكركم على اهتمامكم بـ{school}. وصلنا استفساركم، ويسعدنا أن نعرّفكم بالمدرسة وبخطوات القبول.\n\nيمكنكم الرد على هذه الرسالة بأي سؤال، أو إخبارنا بالوقت المناسب للاتصال بكم.\n\nمع خالص التحية،\n{sender}\n{school}",
    },
  },
  visit: {
    en: {
      subject: "Visiting {school}",
      body: "Dear {name},\n\nThank you for asking to visit. We would be delighted to show you around and answer your questions in person.\n\nPlease reply with two or three days and times that suit you, and we will confirm one.\n\nKind regards,\n{sender}\n{school}",
    },
    ar: {
      subject: "زيارة {school}",
      body: "مرحبًا {name}،\n\nنشكركم على طلب الزيارة، ويسعدنا أن نرافقكم في جولة بالمدرسة ونجيب عن أسئلتكم.\n\nنرجو الرد بيومين أو ثلاثة وبالأوقات المناسبة لكم، وسنؤكد لكم أحدها.\n\nمع خالص التحية،\n{sender}\n{school}",
    },
  },
  information: {
    en: {
      subject: "A little more about {child}",
      body: "Dear {name},\n\nThank you for your enquiry. To advise you properly, could you tell us {child}'s date of birth, the year you are hoping for, and the school {child} attends now?\n\nKind regards,\n{sender}\n{school}",
    },
    ar: {
      subject: "معلومات إضافية عن {child}",
      body: "مرحبًا {name}،\n\nنشكركم على استفساركم. حتى نتمكن من إفادتكم على النحو الصحيح، نرجو إخبارنا بتاريخ ميلاد {child}، والصف الذي ترغبون في التقديم له، ومدرسته الحالية إن وُجدت.\n\nمع خالص التحية،\n{sender}\n{school}",
    },
  },
  places: {
    en: {
      subject: "Places at {school}",
      body: "Dear {name},\n\nThank you for your enquiry. We do not have a place in the year you asked about at the moment. We would be glad to keep your details and contact you as soon as one becomes available.\n\nKind regards,\n{sender}\n{school}",
    },
    ar: {
      subject: "المقاعد المتاحة في {school}",
      body: "مرحبًا {name}،\n\nنشكركم على استفساركم. لا يتوفر لدينا حاليًا مقعد في الصف الذي سألتم عنه، ويسعدنا الاحتفاظ ببياناتكم والتواصل معكم فور توفر مقعد.\n\nمع خالص التحية،\n{sender}\n{school}",
    },
  },
  general: {
    en: {
      subject: "Your message to {school}",
      body: "Dear {name},\n\nThank you for your message.\n\n\n\nKind regards,\n{sender}\n{school}",
    },
    ar: {
      subject: "رسالتكم إلى {school}",
      body: "مرحبًا {name}،\n\nنشكركم على رسالتكم.\n\n\n\nمع خالص التحية،\n{sender}\n{school}",
    },
  },
};

/** The template a reply starts from, for what the family asked. */
export const TEMPLATE_FOR: Record<EnquiryPurpose, ReplyTemplate> = {
  enquiry: "thanks",
  visit: "visit",
  general: "general",
};

/** A template's words with its fields filled; a field with nothing to fill keeps a neutral word. */
export function fillReply(
  template: ReplyTemplate,
  locale: "en" | "ar",
  fields: { name: string; child: string; school: string; sender: string },
): Written {
  const fallback =
    locale === "ar"
      ? { child: "طفلكم", name: "ولي الأمر" }
      : { child: "your child", name: "parent" };
  const values: Record<string, string> = {
    name: fields.name.trim() || fallback.name,
    child: fields.child.trim() || fallback.child,
    school: fields.school.trim(),
    sender: fields.sender.trim(),
  };
  const fill = (text: string) =>
    text.replaceAll(
      /\{(name|child|school|sender)\}/g,
      (_, key: string) => values[key] ?? "",
    );
  const written = REPLY_WORDING[template][locale];
  return { subject: fill(written.subject), body: fill(written.body) };
}

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
