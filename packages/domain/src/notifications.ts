import * as v from "valibot";

import { addDays, zonedInstant, zonedLocal } from "./school";
import { isoWeekday } from "./timetable";

export const NOTIFICATION_KINDS = [
  "announcement",
  "urgent",
  "news",
  "message",
  "absence",
  "event",
  "reminder",
  "consent",
  "mention",
  "library",
  "reply",
  "enquiry",
  "application",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * What a producer records with a notice, for the app and the templates to
 * word it in the reader's language. Names come as `x` and `xAr`.
 */
export interface NoticeParams {
  title?: string;
  titleAr?: string;
  preview?: string;
  updated?: boolean;
  cancelled?: boolean;
  actorName?: string;
  actorNameAr?: string;
  studentName?: string;
  studentNameAr?: string;
  className?: string;
  classNameAr?: string;
  studentId?: string;
  classId?: string;
  date?: string;
  /** A lesson someone covers, or with `cancelled`, no longer covers. */
  cover?: boolean;
  /** The office's answer to an absence a family reported. */
  report?: "accepted" | "declined";
  periodName?: string;
  periodNameAr?: string;
  /** A piece offered to the school library: shared, or sent back to its owner. */
  shared?: boolean;
  /** What a family's enquiry is about, and whether it was handed to the reader. */
  purpose?: "enquiry" | "visit" | "general";
  assigned?: boolean;
  /** The grade an application is for, its number, and whether the reader is the family that sent it. */
  gradeName?: string;
  gradeNameAr?: string;
  reference?: string;
  received?: boolean;
  /**
   * Where an application went: to the family, the offer, the waiting list,
   * the refusal, the welcome, an offer lapsed or moved to a later year; to
   * the office, the family's answer to an offer.
   */
  outcome?: ApplicationOutcome;
  /** That the reader is the family, who read it in their own applications. */
  toFamily?: boolean;
  /** The last day of an offer. */
  until?: string;
}

export const APPLICATION_OUTCOMES = [
  "offered",
  "waitlisted",
  "declined_by_school",
  "enrolled",
  "offer_expired",
  "deferred",
  "accepted",
  "offer_declined",
] as const;
export type ApplicationOutcome = (typeof APPLICATION_OUTCOMES)[number];

/** Urgent notices reach everyone on every channel, so nobody can turn them off. */
export const CHOOSABLE_KINDS = [
  "announcement",
  "news",
  "message",
  "absence",
  "event",
  "reminder",
  "consent",
  "mention",
  "library",
  "reply",
  "enquiry",
  "application",
] as const;
export type ChoosableKind = (typeof CHOOSABLE_KINDS)[number];

export const EMAIL_MODES = ["instant", "digest", "off"] as const;
export type EmailMode = (typeof EMAIL_MODES)[number];
export const SMS_MODES = ["instant", "off"] as const;
export type SmsMode = (typeof SMS_MODES)[number];

const clock = v.pipe(v.string(), v.isoTime());
const optionalClock = v.union([v.literal(""), clock]);

export const preferencesSchema = v.object({
  email: v.object(
    Object.fromEntries(
      CHOOSABLE_KINDS.map((kind) => [kind, v.picklist(EMAIL_MODES)]),
    ) as Record<ChoosableKind, v.PicklistSchema<typeof EMAIL_MODES, undefined>>,
  ),
  sms: v.object(
    Object.fromEntries(
      CHOOSABLE_KINDS.map((kind) => [kind, v.picklist(SMS_MODES)]),
    ) as Record<ChoosableKind, v.PicklistSchema<typeof SMS_MODES, undefined>>,
  ),
  quietFrom: optionalClock,
  quietTo: optionalClock,
  weekendMute: v.boolean(),
  digestAt: clock,
});
export type Preferences = v.InferOutput<typeof preferencesSchema>;

/**
 * What a person gets before choosing: what needs them now by email at once,
 * news gathered into the evening digest, and texts only for absences.
 */
export const DEFAULT_PREFERENCES: Preferences = {
  email: {
    announcement: "digest",
    news: "digest",
    message: "instant",
    absence: "instant",
    event: "digest",
    reminder: "instant",
    consent: "digest",
    mention: "instant",
    library: "digest",
    reply: "digest",
    enquiry: "instant",
    application: "instant",
  },
  sms: {
    announcement: "off",
    news: "off",
    message: "off",
    absence: "instant",
    event: "off",
    reminder: "off",
    consent: "off",
    mention: "off",
    library: "off",
    reply: "off",
    enquiry: "off",
    application: "off",
  },
  quietFrom: "21:00",
  quietTo: "07:00",
  weekendMute: false,
  digestAt: "18:00",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A stored value read back, whatever an older release wrote. A kind added
 * since takes its default rather than costing the person every other choice.
 */
export function preferencesOf(value: unknown): Preferences {
  const stored = isRecord(value) ? value : {};
  const parsed = v.safeParse(preferencesSchema, {
    ...DEFAULT_PREFERENCES,
    ...stored,
    email: {
      ...DEFAULT_PREFERENCES.email,
      ...(isRecord(stored.email) ? stored.email : {}),
    },
    sms: {
      ...DEFAULT_PREFERENCES.sms,
      ...(isRecord(stored.sms) ? stored.sms : {}),
    },
  });
  return parsed.success ? parsed.output : DEFAULT_PREFERENCES;
}

export const savePreferencesSchema = v.object({
  preferences: preferencesSchema,
  locale: v.picklist(["en", "ar"]),
});

export const NOTIFICATION_TABS = ["action", "all"] as const;
export const listNotificationsSchema = v.object({
  tab: v.optional(v.picklist(NOTIFICATION_TABS), "all"),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});

export const markReadSchema = v.object({
  /** Empty marks everything read. */
  ids: v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.maxLength(100)),
    [],
  ),
});

export const DELIVERY_STATES = [
  "pending",
  "sent",
  "failed",
  "skipped",
] as const;
export const DELIVERY_CHANNELS = ["email", "sms"] as const;
export const deliveryLogSchema = v.object({
  state: v.optional(v.picklist(["all", ...DELIVERY_STATES]), "all"),
  channel: v.optional(v.picklist(["all", ...DELIVERY_CHANNELS]), "all"),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});
export type DeliveryLogQuery = v.InferOutput<typeof deliveryLogSchema>;

export const MAX_DELIVERY_ATTEMPTS = 5;

/**
 * Grows from a minute to half a day, so a flapping provider is not hammered.
 * Null once the attempts are spent.
 */
export function retryDelayMs(attempt: number, baseMs = 60_000): number | null {
  const factors = [1, 5, 30, 120, 720];
  if (attempt >= MAX_DELIVERY_ATTEMPTS) return null;
  return (factors[attempt] ?? 720) * baseMs;
}

interface School {
  timeZone: string;
  weekendDays: readonly number[];
}

/** The first moment at or after `at` outside quiet hours and, if muted, the weekend. */
function wake(at: Date, preferences: Preferences, school: School): Date {
  let result = at;
  for (let guard = 0; guard < 8; guard += 1) {
    const local = zonedLocal(result, school.timeZone);
    const day = local.slice(0, 10);
    const time = local.slice(11, 16);
    const { quietFrom, quietTo } = preferences;
    if (
      preferences.weekendMute &&
      school.weekendDays.includes(isoWeekday(day))
    ) {
      result = zonedInstant(
        addDays(day, 1),
        quietTo || "07:00",
        school.timeZone,
      );
      continue;
    }
    if (quietFrom && quietTo) {
      const overnight = quietFrom > quietTo;
      const quiet = overnight
        ? time >= quietFrom || time < quietTo
        : time >= quietFrom && time < quietTo;
      if (quiet) {
        const endDay = overnight && time >= quietFrom ? addDays(day, 1) : day;
        result = zonedInstant(endDay, quietTo, school.timeZone);
        continue;
      }
    }
    return result;
  }
  return result;
}

/**
 * When a notification should leave on a channel, or null when it should not.
 * Urgent notices go at once whatever the person chose; the rest wait out
 * quiet hours, and digest items wait for the next digest.
 */
export function deliveryTime(input: {
  kind: NotificationKind;
  channel: "email" | "sms";
  preferences: Preferences;
  school: School;
  now: Date;
  delayMinutes?: number;
}): { mode: "instant" | "digest"; at: Date } | null {
  if (input.kind === "urgent") return { mode: "instant", at: input.now };
  const mode =
    input.channel === "email"
      ? input.preferences.email[input.kind]
      : input.preferences.sms[input.kind];
  if (mode === "off") return null;
  const earliest = new Date(
    input.now.getTime() + (input.delayMinutes ?? 0) * 60_000,
  );
  if (mode === "instant")
    return {
      mode,
      at: wake(earliest, input.preferences, input.school),
    };
  const local = zonedLocal(earliest, input.school.timeZone);
  const today = local.slice(0, 10);
  const digestDay =
    local.slice(11, 16) < input.preferences.digestAt
      ? today
      : addDays(today, 1);
  return {
    mode,
    at: wake(
      zonedInstant(
        digestDay,
        input.preferences.digestAt,
        input.school.timeZone,
      ),
      input.preferences,
      input.school,
    ),
  };
}
