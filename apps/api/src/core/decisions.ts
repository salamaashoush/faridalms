import type { AuditEntry } from "@faridalms/database/audit";
import type {
  ApplicationRow,
  IntakeRow,
} from "@faridalms/database/stores/admissions";
import type {
  ApplicationState,
  LetterField,
  LetterKind,
} from "@faridalms/domain/admissions";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ApplicationOutcome } from "@faridalms/domain/notifications";

import { writeAudit } from "@faridalms/database/audit";
import {
  advanceApplication,
  insertLetter,
  seatsOf,
} from "@faridalms/database/stores/admission-decisions";
import {
  applicationById,
  insertApplicationEntry,
  intakesOf,
} from "@faridalms/database/stores/admissions";
import { documentOf, insertFrozen } from "@faridalms/database/stores/documents";
import { schoolProfile } from "@faridalms/database/stores/identity";
import {
  templateById,
  templateByKey,
} from "@faridalms/database/stores/templates";
import {
  fillLetter,
  fillLetterText,
  LETTER_FOR,
  letterKey,
  offerExpiresOn,
  placesLeft,
  RELEASED_AS,
} from "@faridalms/domain/admissions";
import { contentPlainText } from "@faridalms/domain/content";
import { APPLICATION_OUTCOMES } from "@faridalms/domain/notifications";
import { formatDayIn, formattingLocale } from "@faridalms/domain/school";

import type { UnitContext } from "./context";
import type { NoticeScope } from "./notify";

import { templateHost } from "./library";
import { notifyIn } from "./notify";

/**
 * Where a move of an application is made from: a person's procedure, or
 * the school's clock releasing decisions and letting offers lapse, where
 * nobody is the actor.
 */
export interface AdmissionScope extends NoticeScope {
  today: string;
}

export const admissionScope = (context: UnitContext): AdmissionScope => ({
  tx: context.tx,
  tenantId: context.tenantId,
  schoolId: context.schoolId,
  actorUserId: context.actor.userId,
  now: context.now,
  channels: context.channels,
  today: context.today,
});

const auditIn = (scope: AdmissionScope, entry: AuditEntry) =>
  writeAudit(scope.tx, scope.tenantId, { orgId: scope.schoolId, ...entry });

export async function intakeIn(scope: AdmissionScope, id: string) {
  const [intake] = await intakesOf(scope.tx, {
    tenantId: scope.tenantId,
    orgId: scope.schoolId,
    id,
  });
  return intake ?? null;
}

export async function applicationIn(scope: AdmissionScope, id: string) {
  return applicationById(scope.tx, {
    tenantId: scope.tenantId,
    orgId: scope.schoolId,
    id,
  });
}

/** A letter as it was sent, for a system that carries it on to the family. */
export interface SentLetter {
  id: string;
  applicationId: string;
  familyUserId: string;
  applicantUserId: string;
  enquiryId: string | null;
  /** Who sent it: whoever moved the application, or for the clock, whoever decided. */
  sentByUserId: string | null;
  /** The language the family applied in, which their conversation is in. */
  applicationLocale: "en" | "ar";
  kind: LetterKind;
  locale: "en" | "ar";
  title: string;
  content: ContentDocument;
}

type LetterDelivery = (
  scope: AdmissionScope,
  letter: SentLetter,
) => Promise<void>;

const deliveries: LetterDelivery[] = [];

/**
 * Where a letter also goes beside the family's applications, which always
 * keep it: `family-conversation.ts` registers here to post each letter
 * into the family's conversation with admissions through Messages, so
 * admissions never writes a message or an email of its own.
 */
export function registerLetterDelivery(delivery: LetterDelivery) {
  deliveries.push(delivery);
}

const pick = (locale: "en" | "ar", en: string | null, ar: string | null) =>
  (locale === "ar" ? (ar ?? en) : (en ?? ar)) ?? "";

async function letterFields(
  scope: AdmissionScope,
  row: ApplicationRow,
  intake: IntakeRow,
  locale: "en" | "ar",
  expires: string | null,
): Promise<Record<LetterField, string>> {
  const school = await schoolProfile(scope.tx, scope.schoolId);
  return {
    family: pick(locale, row.family.nameEn, row.family.nameAr),
    child: pick(locale, row.applicant.nameEn, row.applicant.nameAr),
    grade: pick(locale, intake.gradeEn, intake.gradeAr),
    year: pick(locale, intake.yearTitleEn, intake.yearTitleAr),
    school: pick(locale, school?.nameEn ?? null, school?.nameAr ?? null),
    reference: row.reference ?? "",
    expires: expires
      ? formatDayIn(
          expires,
          "full",
          formattingLocale(locale, school?.digits ?? "latn"),
        )
      : "",
  };
}

/**
 * Writes the family the letter a move sends, from the template for it in
 * the language they applied in, its fields filled and its words frozen as
 * sent; then hands it to whatever else carries letters. The intake's own
 * letter comes first, then the school's, then either in the other
 * language.
 */
export async function sendLetter(
  scope: AdmissionScope,
  row: ApplicationRow,
  intake: IntakeRow,
  kind: LetterKind,
  expires: string | null,
): Promise<string | null> {
  const org = { tenantId: scope.tenantId, orgId: scope.schoolId };
  const other = row.locale === "ar" ? "en" : "ar";
  const chosen = intake.letters[kind] ?? {};
  const inLanguage = async (locale: "en" | "ar") => {
    const id = chosen[locale];
    const own = id ? await templateById(scope.tx, scope.tenantId, id) : null;
    return own &&
      own.kind === "admission_letter" &&
      own.orgId === scope.schoolId
      ? own
      : templateByKey(scope.tx, { ...org, key: letterKey(kind, locale) });
  };
  const own = await inLanguage(row.locale);
  const template = own ?? (await inLanguage(other));
  if (!template) return null;
  const locale = own ? row.locale : other;
  const source = templateHost(template.id);
  const document = await documentOf(scope.tx, scope.tenantId, source);
  if (!document) return null;
  const fields = await letterFields(scope, row, intake, locale, expires);
  const content = fillLetter(
    document.content as unknown as ContentDocument,
    fields,
  );
  const title = fillLetterText(template.title, fields).slice(0, 200);
  const letter = await insertLetter(scope.tx, {
    ...org,
    applicationId: row.id,
    kind,
    locale,
    title,
    templateId: template.id,
    sentByUserId: scope.actorUserId ?? row.decidedByUserId,
  });
  await insertFrozen(scope.tx, {
    ...org,
    host: { type: "admission_letter", id: letter.id },
    from: source,
    content: content as unknown as Record<string, unknown>,
    plainText: contentPlainText(content),
    locale,
    userId: scope.actorUserId,
  });
  for (const deliver of deliveries)
    await deliver(scope, {
      id: letter.id,
      applicationId: row.id,
      familyUserId: row.familyUserId,
      applicantUserId: row.applicantUserId,
      enquiryId: row.enquiryId,
      sentByUserId: scope.actorUserId ?? row.decidedByUserId,
      applicationLocale: row.locale,
      kind,
      locale,
      title,
      content,
    });
  return letter.id;
}

const isOutcome = (state: ApplicationState): state is ApplicationOutcome =>
  (APPLICATION_OUTCOMES as readonly string[]).includes(state);

/** What a family is told as their application moves; the moves they made themselves tell them nothing. */
const TOLD_FAMILY: ReadonlySet<ApplicationState> = new Set([
  "offered",
  "waitlisted",
  "declined_by_school",
  "enrolled",
  "offer_expired",
  "deferred",
]);

export interface Move {
  row: ApplicationRow;
  intake: IntakeRow;
  to: ApplicationState;
  /** Null for the clock, which reads no version. */
  expectedVersion: number | null;
  note?: string;
  reason?: string | null;
  details?: Record<string, string | boolean | null>;
  released?: boolean;
  offerExpiresOn?: string | null;
  answered?: boolean;
  studentUserId?: string | null;
  /** Where the application went on to, for a deferral's notice. */
  gradeName?: { en: string | null; ar: string | null };
}

/**
 * Moves an application and records the move everywhere a move is
 * recorded: its history, the audit log, the letter the move sends, and the
 * family's notice. Null when the application changed meanwhile.
 */
export async function moveApplication(
  scope: AdmissionScope,
  move: Move,
): Promise<number | null> {
  const { row, intake } = move;
  const version = await advanceApplication(scope.tx, {
    tenantId: scope.tenantId,
    orgId: scope.schoolId,
    id: row.id,
    expectedVersion: move.expectedVersion,
    from: row.state,
    state: move.to,
    exitReason: move.reason ?? null,
    released: move.released,
    offerExpiresOn: move.offerExpiresOn,
    answered: move.answered,
    studentUserId: move.studentUserId,
  });
  if (version === null) return null;
  const kind = LETTER_FOR[move.to];
  const letterId = kind
    ? await sendLetter(scope, row, intake, kind, move.offerExpiresOn ?? null)
    : null;
  const details = {
    from: row.state,
    to: move.to,
    ...(move.reason ? { reason: move.reason } : {}),
    ...(letterId ? { letterId } : {}),
    ...move.details,
  };
  await insertApplicationEntry(scope.tx, {
    tenantId: scope.tenantId,
    orgId: scope.schoolId,
    applicationId: row.id,
    kind: "state",
    body: move.note ?? "",
    details,
    authorUserId: scope.actorUserId,
  });
  await auditIn(scope, {
    action: "admission_application.state",
    objectType: "admission_application",
    objectId: row.id,
    subjectUserId: row.applicantUserId,
    details,
  });
  if (TOLD_FAMILY.has(move.to) && isOutcome(move.to))
    await notifyIn(scope, [row.familyUserId], {
      kind: "application",
      subject: { type: "admission_application", id: row.id },
      params: {
        title: row.applicant.nameEn ?? row.applicant.nameAr ?? "",
        titleAr: row.applicant.nameAr ?? undefined,
        gradeName:
          (move.gradeName ? move.gradeName.en : intake.gradeEn) ?? undefined,
        gradeNameAr:
          (move.gradeName ? move.gradeName.ar : intake.gradeAr) ?? undefined,
        reference: row.reference ?? undefined,
        outcome: move.to,
        toFamily: true,
        until: move.offerExpiresOn ?? undefined,
      },
      needsAction: move.to === "offered",
    });
  return version;
}

export interface Released {
  released: string[];
  /** Offers left decided because the intake had no place left for them. */
  full: string[];
}

/**
 * Releases decisions to the families: an offer while the intake has a
 * place left for it, open for the intake's days; a place on the waiting
 * list; a refusal. The office's own release goes all or not at all, so an
 * offer with no place refuses the whole release; the clock releases what
 * fits and leaves the rest for the office.
 */
export async function releaseDecisions(
  scope: AdmissionScope,
  wanted: readonly { row: ApplicationRow; expectedVersion: number | null }[],
  by: "office" | "clock",
): Promise<Released> {
  const intakeIds = [...new Set(wanted.map((each) => each.row.intakeId))];
  const seats = await seatsOf(scope.tx, {
    tenantId: scope.tenantId,
    intakeIds,
    lock: true,
  });
  const intakes = new Map<string, IntakeRow>();
  for (const id of intakeIds) {
    const intake = await intakeIn(scope, id);
    if (intake) intakes.set(id, intake);
  }
  const left = new Map(
    intakeIds.map((id) => {
      const counted = seats.get(id);
      const intake = intakes.get(id);
      return [
        id,
        intake && counted
          ? placesLeft({
              capacity: intake.capacity,
              accepted: counted.accepted,
              offered: counted.offered,
            })
          : 0,
      ];
    }),
  );
  const plan: {
    row: ApplicationRow;
    intake: IntakeRow;
    expectedVersion: number | null;
  }[] = [];
  const full: string[] = [];
  for (const { row, expectedVersion } of wanted) {
    const intake = intakes.get(row.intakeId);
    if (row.state !== "decided" || !row.decision || !intake) continue;
    if (row.decision === "offer") {
      const places = left.get(row.intakeId) ?? 0;
      if (places <= 0) {
        full.push(row.id);
        continue;
      }
      left.set(row.intakeId, places - 1);
    }
    plan.push({ row, intake, expectedVersion });
  }
  if (by === "office" && full.length > 0) return { released: [], full };
  const released: string[] = [];
  for (const { row, intake, expectedVersion } of plan) {
    if (!row.decision) continue;
    const to = RELEASED_AS[row.decision];
    const version = await moveApplication(scope, {
      row,
      intake,
      to,
      expectedVersion,
      released: true,
      offerExpiresOn:
        to === "offered" ? offerExpiresOn(scope.today, intake.offerDays) : null,
      details: { decision: row.decision, by },
    });
    if (version !== null) released.push(row.id);
    else if (by === "office") throw new DecisionConflict(row.id);
  }
  return { released, full };
}

/** An application changed while a decision about it was being made. */
export class DecisionConflict extends Error {
  constructor(public readonly applicationId: string) {
    super("conflict.version");
  }
}

/** Places offered from the waiting list, each within the places left; null names the first with none. */
export async function offerPlaces(
  scope: AdmissionScope,
  wanted: readonly { row: ApplicationRow; expectedVersion: number }[],
): Promise<{ offered: string[]; full: string | null }> {
  const intakeIds = [...new Set(wanted.map((each) => each.row.intakeId))];
  const seats = await seatsOf(scope.tx, {
    tenantId: scope.tenantId,
    intakeIds,
    lock: true,
  });
  const left = new Map<string, number>();
  const offered: string[] = [];
  for (const { row, expectedVersion } of wanted) {
    const intake = await intakeIn(scope, row.intakeId);
    if (!intake) continue;
    const counted = seats.get(intake.id);
    const places =
      left.get(intake.id) ??
      placesLeft({
        capacity: intake.capacity,
        accepted: counted?.accepted ?? 0,
        offered: counted?.offered ?? 0,
      });
    if (places <= 0) return { offered, full: row.id };
    left.set(intake.id, places - 1);
    const version = await moveApplication(scope, {
      row,
      intake,
      to: "offered",
      expectedVersion,
      offerExpiresOn: offerExpiresOn(scope.today, intake.offerDays),
      details: { from_waitlist: true },
    });
    if (version === null) throw new DecisionConflict(row.id);
    offered.push(row.id);
  }
  return { offered, full: null };
}
