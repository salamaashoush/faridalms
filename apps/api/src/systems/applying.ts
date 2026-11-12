import type { ApplicationRow } from "@faridalms/database/stores/admissions";
import type { ChildInput, Needs } from "@faridalms/domain/admissions";

import { changeOf, writeAudit } from "@faridalms/database/audit";
import { lookupHmac } from "@faridalms/database/crypto";
import { capabilityHolders } from "@faridalms/database/stores/access";
import {
  eventsOf,
  lettersOf,
} from "@faridalms/database/stores/admission-decisions";
import {
  applicationById,
  applicationsFiledBy,
  appliedFor,
  convertEnquiry,
  enquiryToConvert,
  formVersionById,
  holderOfName,
  holdsStaffRole,
  insertApplication,
  insertApplicationEntry,
  intakesOf,
  itemsOf,
  markSubmitted,
  nextReferenceCount,
  noteDocumentHolders,
  saveDraftForm,
  setApplicationState,
  setItemState,
} from "@faridalms/database/stores/admissions";
import { insertAnswer } from "@faridalms/database/stores/consents";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import { openEnquiryConversation } from "@faridalms/database/stores/enquiries";
import {
  filesByIds,
  filesOfHosts,
  unlinkFiles,
} from "@faridalms/database/stores/files";
import {
  identifiersOf,
  insertIdentifier,
  removeIdentifier,
  studentsByIdentifier,
  updateIdentifier,
} from "@faridalms/database/stores/identifiers";
import {
  attemptsSoFar,
  countAttempt,
  findPasswordIdentity,
  schoolProfile,
} from "@faridalms/database/stores/identity";
import {
  issueInvite,
  reserveLoginName,
} from "@faridalms/database/stores/invites";
import {
  logLinkDelivery,
  reachability,
} from "@faridalms/database/stores/notifications";
import {
  addContact,
  insertPerson,
  nameColumns,
  peopleByContact,
  person as readPerson,
  studentMatches,
  updatePerson,
} from "@faridalms/database/stores/students";
import {
  ageFit,
  answerOfferSchema,
  applicationReference,
  applicationRefSchema,
  attachDocumentSchema,
  canMove,
  detachDocumentSchema,
  emptyApplicationForm,
  familyState,
  intakeWindow,
  letterRefSchema,
  NEEDS_KINDS,
  prioritiesFound,
  prioritiesMet,
  readApplicationAnswers,
  registerApplicantSchema,
  saveDraftSchema,
  startApplicationSchema,
  submitApplicationSchema,
  withdrawApplicationSchema,
} from "@faridalms/domain/admissions";
import { refreshDueOn } from "@faridalms/domain/consents";
import { INVITE_DAYS } from "@faridalms/domain/first-sign-in";
import { clientAddress } from "@faridalms/domain/forwarded";
import { isSealed, normaliseIdentifier } from "@faridalms/domain/identifiers";
import { toE164 } from "@faridalms/domain/phone";
import { ageOn } from "@faridalms/domain/school";
import { STAFF_ROLES } from "@faridalms/domain/workspace";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  admissionConsents,
  documentStep,
  fileDocument,
  intakeOf,
  letterView,
} from "../admissions/access";
import { admissionScope, moveApplication } from "../admissions/decisions";
import {
  filingModule,
  needsKeeper,
  readNeeds,
  writeNeeds,
} from "../admissions/points";
import { consentWords } from "../consents/words";
import { identifierValue } from "../core/identifiers";
import { modulesOf } from "../core/modules";
import { notify, notifyIn } from "../core/notify";
import { portalUrl, welcomeLink } from "../core/portal";
import {
  audit,
  readProcedure,
  requireCapability,
  schoolProcedure,
  writeProcedure,
} from "../core/procedure";
import { withPurposeFor } from "../core/purpose";
import { scopeFor } from "../core/reach";
import { attemptKey, ipPrefix, issueBadgeSecret } from "../core/session";
import { servesSchool } from "../core/turnstile";
import { scopeOf, writeEntry } from "../messages/conversations";
import {
  alreadyRegisteredMessage,
  registerMessage,
} from "../notifications/templates";
import { decidingLearners, keepConsentLink } from "../people/acting";

const conflict = () =>
  new ORPCError("CONFLICT", { message: "conflict.version" });

/**
 * A session that may apply: someone applying for themself in their own
 * context, or for another person in the family context a module opens.
 */
function applying(context: UnitContext) {
  requireCapability(context, "applications:submit");
  if (context.actor.context !== "family" && context.actor.context !== "student")
    throw new ORPCError("FORBIDDEN");
}

/** Whether the session applies for other people rather than for itself. */
const forOthers = (context: UnitContext) => context.actor.context === "family";

const org = (context: UnitContext) => ({
  tenantId: context.tenantId,
  orgId: context.schoolId,
});

const NEEDS_USE = ["applications:submit"] as const;

async function ownApplication(context: UnitContext, id: string) {
  const row = await applicationById(context.tx, {
    ...org(context),
    id,
    filedByUserId: context.actor.userId,
  });
  if (!row) throw new ORPCError("NOT_FOUND");
  return row;
}

async function draftOf(context: UnitContext, id: string) {
  const row = await ownApplication(context, id);
  if (row.state !== "draft")
    throw new ORPCError("CONFLICT", { message: "application.sent" });
  return row;
}

async function country(context: UnitContext) {
  return (
    (await schoolProfile(context.tx, context.schoolId))?.countryCode ?? "EG"
  );
}

async function descriptors(context: UnitContext, namespace: string) {
  return descriptorsFor(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace,
    today: context.today,
  });
}

/** The identity documents a family may give for a child: those the identifiers system seals. */
async function documentSystems(context: UnitContext) {
  return (await descriptors(context, "external_id_system")).filter((row) =>
    isSealed(row.meaning),
  );
}

const MIN_FILL_MS = 2500;
const REGISTER_PER_NETWORK = 5;
const REGISTER_PER_ADDRESS = 3;
const REGISTER_WINDOW_MINUTES = 60;

type SchoolProcedureContext = Parameters<
  Parameters<typeof schoolProcedure.handler>[0]
>[0]["context"];

/**
 * Whether the school takes applications filed for someone else: that opens
 * the family context, which only a school with families on keeps.
 */
async function takesFamilies(context: SchoolProcedureContext) {
  const { school } = context;
  return context.cell.withTenant(
    {
      tenantId: school.tenantId,
      requestId: context.requestId,
      actor: { kind: "user" },
    },
    "read",
    async (tx) =>
      (
        await modulesOf({
          tx,
          tenantId: school.tenantId,
          schoolId: school.schoolId,
          school,
          extensions: context.extensions,
        })
      ).families,
  );
}

/** Who the portal's registration lets someone apply for. */
export const registration = schoolProcedure.handler(async ({ context }) => ({
  forOthers: await takesFamilies(context),
}));

/**
 * Someone registers on the portal to apply, for themself or, where the
 * school keeps families, for someone in their care. Turnstile is checked
 * where it is set up, the hidden field and the fill time where it is not,
 * then the limits per network and per address. The answer is the same whatever happened, so
 * nobody learns who has an account: a new address is sent a link that
 * confirms it and chooses the password, and an address that already signs
 * in is told so in its own inbox.
 */
export const register = schoolProcedure
  .input(registerApplicantSchema)
  .handler(async ({ input, context }) => {
    const { school } = context;
    if (input.applyingFor === "other" && !(await takesFamilies(context)))
      throw new ORPCError("BAD_REQUEST", { message: "application.self_only" });
    const turnstile = context.turnstile;
    // Turnstile's answer, where it is set up, outranks the hidden field and
    // the fill time, which autofill trips for real families.
    if (!turnstile && (input.website || input.elapsed < MIN_FILL_MS))
      return { registered: true };
    if (
      turnstile &&
      !(await turnstile.verify({
        token: input.turnstile,
        remoteIp: clientAddress(
          context.headers.get("x-forwarded-for"),
          context.trustedProxyHops,
        ),
        action: "register",
        hostAllowed: (hostname) => servesSchool(context, school, hostname),
      }))
    )
      throw new ORPCError("BAD_REQUEST", { message: "site.challenge" });
    const mail = context.mail;
    if (!mail)
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message: "register.no_mail",
      });
    const { tenantId, schoolId } = school;
    const limited = await context.cell.withTenant(
      { tenantId, requestId: context.requestId, actor: { kind: "user" } },
      "write",
      async (tx) => {
        const network = ipPrefix(context.headers, context.trustedProxyHops);
        const networkKey = network
          ? attemptKey(context.cellSecret, tenantId, `register:${network}`)
          : null;
        const addressKey = attemptKey(
          context.cellSecret,
          tenantId,
          `register-address:${input.email}`,
        );
        if (
          (networkKey &&
            (await attemptsSoFar(tx, tenantId, networkKey)) >=
              REGISTER_PER_NETWORK) ||
          (await attemptsSoFar(tx, tenantId, addressKey)) >=
            REGISTER_PER_ADDRESS
        )
          return true;
        if (networkKey)
          await countAttempt(tx, tenantId, networkKey, REGISTER_WINDOW_MINUTES);
        await countAttempt(tx, tenantId, addressKey, REGISTER_WINDOW_MINUTES);
        const arabic = input.locale === "ar";
        const schoolName =
          (arabic ? school.nameAr : school.nameEn) ??
          school.nameEn ??
          school.nameAr ??
          "";
        const signedIn = await findPasswordIdentity(tx, input.email);
        const holder = signedIn
          ? null
          : await holderOfName(tx, { tenantId, loginName: input.email });
        if (signedIn || (holder && holder.accountState !== "invited")) {
          const { receipt } = await mail.send({
            to: input.email,
            ...alreadyRegisteredMessage({
              locale: input.locale,
              school: schoolName,
              loginName: input.email,
              signIn: portalUrl(school, context.domains, "/sign-in").toString(),
              reset: portalUrl(
                school,
                context.domains,
                "/forgot-password",
              ).toString(),
            }),
          });
          const existing = signedIn?.userId ?? holder?.userId;
          if (existing)
            await logLinkDelivery(tx, {
              tenantId,
              orgId: schoolId,
              userId: existing,
              purpose: "register",
              address: input.email,
              locale: input.locale,
              receipt,
              error: null,
            });
          await writeAudit(tx, tenantId, {
            action: "account.register_existing",
            objectType: "user",
            objectId: signedIn?.userId ?? holder?.userId ?? null,
            orgId: schoolId,
            subjectUserId: signedIn?.userId ?? holder?.userId ?? null,
          });
          return false;
        }
        let userId = holder?.userId ?? null;
        if (!userId) {
          const created = await insertPerson(tx, {
            tenantId,
            schoolId,
            names: input.names,
          });
          userId = created.id;
          await addContact(tx, {
            tenantId,
            userId,
            kind: "email",
            value: input.email,
            normalized: input.email,
            label: "personal",
            source: "self_service",
          });
          const phone = input.phone
            ? toE164(
                input.phone,
                (await schoolProfile(tx, schoolId))?.countryCode ?? "EG",
              )
            : null;
          if (input.phone && phone)
            await addContact(tx, {
              tenantId,
              userId,
              kind: "phone",
              value: input.phone,
              normalized: phone,
              label: "mobile",
              source: "self_service",
            });
          await reserveLoginName(tx, {
            tenantId,
            userId,
            loginName: input.email,
          });
          await writeAudit(tx, tenantId, {
            action: "user.register",
            objectType: "user",
            objectId: userId,
            orgId: schoolId,
            subjectUserId: userId,
            change: {
              table: "core.users",
              before: null,
              after: nameColumns(input.names),
            },
          });
        }
        const { secret, secretHash } = issueBadgeSecret();
        const invite = await issueInvite(tx, {
          tenantId,
          userId,
          secretHash,
          expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
          sentToUserId: userId,
          linkedByUserId: null,
          purpose: "register",
          applyingFor: input.applyingFor,
        });
        if (!invite) return false;
        const names = arabic ? input.names.ar : input.names.en;
        let receipt: string | null;
        try {
          ({ receipt } = await mail.send({
            to: input.email,
            ...registerMessage({
              locale: input.locale,
              school: schoolName,
              name:
                names.given ??
                input.names.en.given ??
                input.names.ar.given ??
                input.email,
              loginName: input.email,
              link: welcomeLink(school, context.domains, secret, input.intake),
              days: INVITE_DAYS,
            }),
          }));
        } catch {
          throw new ORPCError("BAD_GATEWAY", { message: "register.not_sent" });
        }
        await logLinkDelivery(tx, {
          tenantId,
          orgId: schoolId,
          userId,
          purpose: "register",
          address: input.email,
          locale: input.locale,
          receipt,
          error: null,
        });
        return false;
      },
    );
    if (limited)
      throw new ORPCError("TOO_MANY_REQUESTS", { message: "site.too_many" });
    return { registered: true };
  });

const optionView = (row: {
  id: string;
  meaning: string | null;
  labelEn: string | null;
  labelAr: string | null;
}) => ({
  id: row.id,
  meaning: row.meaning,
  labelEn: row.labelEn,
  labelAr: row.labelAr,
});

/** The choices the application form offers: relations, sexes and identity documents, as the school labels them. */
async function formOptions(context: UnitContext) {
  const [relations, sexes, systems] = await Promise.all([
    descriptors(context, "relation"),
    descriptors(context, "sex"),
    documentSystems(context),
  ]);
  return {
    relations: relations.map(optionView),
    sexes: sexes.map(optionView),
    documents: systems.map(optionView),
  };
}

function intakeView(
  intake: Awaited<ReturnType<typeof intakesOf>>[number],
  today: string,
) {
  return {
    id: intake.id,
    titleEn: intake.titleEn,
    titleAr: intake.titleAr,
    startsOn: intake.startsOn,
    opensOn: intake.opensOn,
    closesOn: intake.closesOn,
    currency: intake.currency,
    fees: intake.fees,
    decisionsOn: intake.decisionsOn,
    ageCutoffOn: intake.ageCutoffOn,
    minAgeMonths: intake.minAgeMonths,
    maxAgeMonths: intake.maxAgeMonths,
    window: intakeWindow(intake, today),
  };
}

/** An application as its family reads it: a decision not yet released is still under review to them. */
function applicationView(row: ApplicationRow) {
  const state = familyState(row.state);
  return {
    id: row.id,
    version: row.version,
    intakeId: row.intakeId,
    state,
    stateChangedAt:
      row.state === state
        ? row.stateChangedAt
        : (row.submittedAt ?? row.stateChangedAt),
    offerExpiresOn: state === "offered" ? row.offerExpiresOn : null,
    reference: row.reference,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    applicantId: row.applicantUserId,
    applicant: { nameEn: row.applicant.nameEn, nameAr: row.applicant.nameAr },
  };
}

/**
 * Everything a family's applying starts from: the applications they made
 * with what each still needs, the children they applied for, and the
 * intakes open today.
 */
export const mine = readProcedure.handler(async ({ context }) => {
  applying(context);
  const [rows, open, all, options] = await Promise.all([
    applicationsFiledBy(context.tx, {
      ...org(context),
      filedByUserId: context.actor.userId,
    }),
    intakesOf(context.tx, { ...org(context), openOn: context.today }),
    intakesOf(context.tx, org(context)),
    formOptions(context),
  ]);
  const ids = rows.map((row) => row.id);
  const [items, letters, events] = await Promise.all([
    itemsOf(context.tx, { tenantId: context.tenantId, applicationIds: ids }),
    lettersOf(context.tx, { tenantId: context.tenantId, applicationIds: ids }),
    eventsOf(context.tx, { tenantId: context.tenantId, applicationIds: ids }),
  ]);
  const children = new Map<
    string,
    { id: string; nameEn: string | null; nameAr: string | null }
  >();
  for (const row of rows)
    children.set(row.applicantUserId, {
      id: row.applicantUserId,
      nameEn: row.applicant.nameEn,
      nameAr: row.applicant.nameAr,
    });
  return {
    today: context.today,
    applications: rows.map((row) => {
      const intake = all.find((each) => each.id === row.intakeId);
      return {
        ...applicationView(row),
        intake: intake ? intakeView(intake, context.today) : null,
        needed: items.filter(
          (item) =>
            item.applicationId === row.id &&
            item.required &&
            item.kind === "document" &&
            (item.state === "pending" || item.state === "rejected"),
        ).length,
        letters: letters
          .filter((letter) => letter.applicationId === row.id)
          .map((letter) => ({
            id: letter.id,
            kind: letter.kind,
            title: letter.title,
            createdAt: letter.createdAt,
          })),
        events: events
          .filter(
            (event) =>
              event.applicationId === row.id && event.outcome === "scheduled",
          )
          .map((event) => ({
            id: event.id,
            kind: event.kind,
            startsOn: event.startsOn,
            startTime: event.startTime,
            endTime: event.endTime,
            location: event.location,
          })),
        moves: {
          withdraw: canMove(row.state, "withdrawn", "family"),
          answer: canMove(row.state, "accepted", "family"),
        },
      };
    }),
    children: [...children.values()],
    self: !forOthers(context),
    options,
    intakes: open
      .filter((intake) => intake.formVersionId !== null)
      .map((intake) => intakeView(intake, context.today)),
  };
});

/**
 * Keeps the child's identity document through the identifiers system,
 * sealed. Answers whether it noted on the application that the number is
 * someone else's already, which changes the application's version.
 */
async function keepDocument(
  context: UnitContext,
  input: {
    applicationId: string;
    childId: string;
    document: ChildInput["document"];
  },
) {
  const systems = await documentSystems(context);
  const held = (
    await identifiersOf(context.tx, {
      tenantId: context.tenantId,
      userId: input.childId,
      except: [],
    })
  ).filter((row) => isSealed(row.meaning));
  const wanted = input.document;
  for (const row of held)
    if (!wanted || row.systemId !== wanted.systemId)
      await removeIdentifier(context.tx, {
        tenantId: context.tenantId,
        id: row.id,
        expectedVersion: row.version,
      });
  if (!wanted) return false;
  const system = systems.find((row) => row.id === wanted.systemId);
  if (!system?.meaning)
    throw new ORPCError("BAD_REQUEST", { message: "identifiers.system" });
  const existing = held.find((row) => row.systemId === wanted.systemId);
  if (!wanted.number && !existing) return false;
  if (wanted.number) {
    const lookup = await context.keys.active(
      context.tx,
      context.tenantId,
      "identifier_lookup",
    );
    const normalised = normaliseIdentifier(wanted.number);
    const holders = (
      await studentsByIdentifier(context.tx, {
        tenantId: context.tenantId,
        hmac: await lookupHmac(lookup.key, normalised),
        plain: normalised,
      })
    ).filter((userId) => userId !== input.childId);
    // The number is someone's the school already keeps: the office learns
    // who when the application is sent, and the family's draft keeps it as
    // given without a second copy of the number.
    if (holders.length > 0) {
      await noteDocumentHolders(context.tx, {
        ...org(context),
        id: input.applicationId,
        holders,
      });
      return true;
    }
  }
  const rowId = existing?.id ?? Bun.randomUUIDv7();
  const value = wanted.number
    ? await identifierValue(context, {
        rowId,
        meaning: system.meaning,
        number: wanted.number,
      })
    : null;
  if (existing) {
    await updateIdentifier(context.tx, {
      tenantId: context.tenantId,
      id: existing.id,
      expectedVersion: existing.version,
      value:
        value ??
        (existing.ciphertext && existing.keyVersion !== null
          ? {
              identifier: null,
              sealed: {
                ciphertext: existing.ciphertext,
                hmac: existing.hmac ?? new Uint8Array(),
                keyVersion: existing.keyVersion,
                last4: existing.last4,
              },
            }
          : { identifier: existing.identifier ?? "", sealed: null }),
      issuingCountry: wanted.issuingCountry || null,
      from: existing.from,
      to: existing.to,
    });
    return false;
  }
  if (!value) return false;
  await insertIdentifier(context.tx, {
    tenantId: context.tenantId,
    id: rowId,
    userId: input.childId,
    systemId: system.id,
    meaning: system.meaning,
    value,
    issuingCountry: wanted.issuingCountry || null,
    assigningOrgId: null,
    from: context.today,
    to: null,
  });
  return false;
}

/**
 * Starts an application to an intake open today: for the filer themself,
 * or, where a module lets someone apply for another person, for one they
 * have applied for before or a new one, who becomes a person now so their
 * documents and needs are kept in the systems that keep them.
 */
export const start = writeProcedure
  .input(startApplicationSchema)
  .handler(async ({ input, context }) => {
    applying(context);
    const intake = await intakeOf(context, input.intakeId);
    if (intakeWindow(intake, context.today) !== "open" || !intake.formVersionId)
      throw new ORPCError("CONFLICT", { message: "application.intake_closed" });
    if (input.self === forOthers(context))
      throw new ORPCError("BAD_REQUEST", { message: "application.self_only" });
    let applicantId = input.self ? context.actor.userId : input.applicantId;
    if (!input.self && applicantId) {
      if (
        !(await appliedFor(context.tx, {
          ...org(context),
          filedByUserId: context.actor.userId,
          applicantUserId: applicantId,
        }))
      )
        throw new ORPCError("NOT_FOUND");
    } else if (!input.self && input.child) {
      const created = await insertPerson(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        names: input.child.names,
        birthDate: input.child.birthDate,
        sexId: input.child.sexId,
      });
      applicantId = created.id;
      await audit(context, {
        action: "user.create",
        objectType: "user",
        objectId: applicantId,
        subjectUserId: applicantId,
        change: {
          table: "core.users",
          before: null,
          after: {
            ...nameColumns(input.child.names),
            birthDate: input.child.birthDate,
          },
        },
      });
    }
    if (!applicantId)
      throw new ORPCError("BAD_REQUEST", { message: "application.child" });
    const created = await insertApplication(context.tx, {
      ...org(context),
      intakeId: intake.id,
      formVersionId: intake.formVersionId,
      filedByUserId: context.actor.userId,
      applicantUserId: applicantId,
      locale: input.locale,
      form: emptyApplicationForm(),
      checklist: intake.checklist,
    });
    const noted = input.child?.document
      ? await keepDocument(context, {
          applicationId: created.id,
          childId: applicantId,
          document: input.child.document,
        })
      : false;
    await audit(context, {
      action: "admission_application.create",
      objectType: "admission_application",
      objectId: created.id,
      subjectUserId: applicantId,
      details: { intakeId: intake.id },
    });
    return { id: created.id, version: created.version + (noted ? 1 : 0) };
  });

async function itemsWithFiles(context: UnitContext, applicationId: string) {
  const items = await itemsOf(context.tx, {
    tenantId: context.tenantId,
    applicationIds: [applicationId],
  });
  const files = await filesOfHosts(context.tx, context.tenantId, {
    type: "admission_item",
    ids: items.map((item) => item.id),
  });
  return items.map((item) => ({
    id: item.id,
    version: item.version,
    kind: item.kind,
    labelEn: item.labelEn,
    labelAr: item.labelAr,
    required: item.required,
    state: item.state,
    files: files
      .filter((file) => file.hostId === item.id)
      .map((file) => ({
        id: file.id,
        name: file.name,
        mediaType: file.mediaType,
        sizeBytes: file.sizeBytes,
      })),
  }));
}

/**
 * One of the family's applications with everything its form shows: the
 * intake, the school's questions, the child as saved, the document given,
 * health and needs, the checklist with the files uploaded, and the consents
 * the school will ask when it is sent.
 */
export const draft = readProcedure
  .input(applicationRefSchema)
  .handler(async ({ input, context }) => {
    applying(context);
    const row = await ownApplication(context, input.id);
    const [intake, version, child, held, items] = await Promise.all([
      intakeOf(context, row.intakeId),
      formVersionById(context.tx, {
        tenantId: context.tenantId,
        id: row.formVersionId,
      }),
      readPerson(context.tx, row.applicantUserId),
      identifiersOf(context.tx, {
        tenantId: context.tenantId,
        userId: row.applicantUserId,
        except: [],
      }),
      itemsWithFiles(context, row.id),
    ]);
    if (!child || !version) throw new ORPCError("NOT_FOUND");
    const needs = await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: row.applicantUserId,
        reason: "Opened the application's health and needs",
        write: false,
        capabilities: NEEDS_USE,
      },
      () => readNeeds(context, row.applicantUserId),
    );
    const consents =
      row.state === "draft" ? await admissionConsents(context) : [];
    const words = await Promise.all(
      consents.map((consent) =>
        consent.notice
          ? consentWords(context, consent.notice.id)
          : Promise.resolve(null),
      ),
    );
    const document = held.find((each) => isSealed(each.meaning));
    const documentGiven =
      (row.matches.documentHolders?.length ?? 0) > 0 && !document;
    return {
      application: {
        ...applicationView(row),
        locale: row.locale,
        form: row.form,
        answers: row.answers,
        moves: { withdraw: canMove(row.state, "withdrawn", "family") },
      },
      intake: intakeView(intake, context.today),
      questions: {
        primaryLocale: version.primaryLocale,
        body: version.body,
        translation: version.translation,
      },
      child: {
        version: child.version,
        names: {
          ar: {
            given: child.givenNameAr,
            middle: child.middleNameAr,
            family: child.familyNameAr,
          },
          en: {
            given: child.givenNameEn,
            middle: child.middleNameEn,
            family: child.familyNameEn,
          },
        },
        birthDate: child.birthDate,
        sexId: child.sexId,
        document: document
          ? {
              systemId: document.systemId,
              issuingCountry: document.issuingCountry,
              shown: document.last4 ? `•••• ${document.last4}` : "••••••••",
            }
          : documentGiven
            ? { systemId: null, issuingCountry: null, shown: "••••••••" }
            : null,
        age: ageFit(
          {
            cutoffOn: intake.ageCutoffOn,
            minMonths: intake.minAgeMonths,
            maxMonths: intake.maxAgeMonths,
          },
          child.birthDate,
        ),
      },
      needs: Object.fromEntries(
        NEEDS_KINDS.map((kind) => [kind, needs[kind]]),
      ) as Needs,
      asksNeeds: (await needsKeeper(context)) !== null,
      items,
      consents: consents.map((consent, index) => ({
        meaning: consent.meaning,
        labelEn: consent.labelEn,
        labelAr: consent.labelAr,
        notice: consent.notice
          ? {
              id: consent.notice.id,
              versionLabel: consent.notice.versionLabel,
              primaryLocale: consent.notice.locale,
              body: words[index]?.body ?? null,
              translation: words[index]?.translation ?? null,
            }
          : null,
      })),
      options: await formOptions(context),
    };
  });

/**
 * Saves a draft as the family left it: the child on their person, the
 * document through the identifiers system, health and needs as health
 * records behind their purpose, and the rest on the application. Needs come
 * only when they changed, so an autosave of other answers reads none.
 */
export const save = writeProcedure
  .input(saveDraftSchema)
  .handler(async ({ input, context }) => {
    applying(context);
    const row = await draftOf(context, input.id);
    const child = await readPerson(context.tx, row.applicantUserId);
    if (!child) throw new ORPCError("NOT_FOUND");
    const updated = await updatePerson(context.tx, {
      tenantId: context.tenantId,
      userId: child.id,
      expectedVersion: child.version,
      names: input.child.names,
      preferredGivenName: child.preferredGivenName,
      birthDate: input.child.birthDate,
      sexId: input.child.sexId,
    });
    if (!updated) throw conflict();
    const needs = input.needs;
    const changed = needs
      ? await withPurposeFor(
          context,
          {
            purpose: "health",
            subjectUserId: child.id,
            reason: "Saved the application's health and needs",
            write: true,
            capabilities: NEEDS_USE,
          },
          () => writeNeeds(context, child.id, needs),
        )
      : [];
    const version = await saveDraftForm(context.tx, {
      ...org(context),
      id: row.id,
      expectedVersion: input.expectedVersion,
      form: input.form,
      additionalNeeds: needs
        ? needs.additional_needs.trim() !== ""
        : row.additionalNeeds,
    });
    if (version === null) throw conflict();
    const noted = await keepDocument(context, {
      applicationId: row.id,
      childId: child.id,
      document: input.child.document,
    });
    await audit(context, {
      action: "admission_application.save",
      objectType: "admission_application",
      objectId: row.id,
      subjectUserId: child.id,
      details: { needs: changed.join(",") || null },
      change: changeOf(
        "core.users",
        {
          ...nameColumns({
            ar: {
              given: child.givenNameAr,
              middle: child.middleNameAr,
              family: child.familyNameAr,
            },
            en: {
              given: child.givenNameEn,
              middle: child.middleNameEn,
              family: child.familyNameEn,
            },
          }),
          birthDate: child.birthDate,
        },
        {
          ...nameColumns(input.child.names),
          birthDate: input.child.birthDate,
        },
      ),
    });
    return { version: version + (noted ? 1 : 0) };
  });

/**
 * Sends a draft. The child must be named, born and of age for the intake,
 * the person applying must hold parental responsibility, the school's
 * questions are checked in the language the family read them, and each
 * consent is recorded with the words agreed. The family's people become
 * people of the school, the ones the school may already know are found, an
 * open enquiry from the same family is marked converted, and the office is
 * told.
 */
export const submit = writeProcedure
  .input(submitApplicationSchema)
  .handler(async ({ input, context }) => {
    applying(context);
    const row = await draftOf(context, input.id);
    const intake = await intakeOf(context, row.intakeId);
    if (intakeWindow(intake, context.today) !== "open")
      throw new ORPCError("CONFLICT", { message: "application.intake_closed" });
    const self = row.applicantUserId === row.filedByUserId;
    const filing = self ? null : await filingModule(context);
    if (!self && !filing)
      throw new ORPCError("BAD_REQUEST", { message: "application.self_only" });
    const [version, child] = await Promise.all([
      formVersionById(context.tx, {
        tenantId: context.tenantId,
        id: row.formVersionId,
      }),
      readPerson(context.tx, row.applicantUserId),
    ]);
    if (!version || !child) throw new ORPCError("NOT_FOUND");
    if (!child.birthDate || !child.sexId)
      throw new ORPCError("BAD_REQUEST", { message: "application.child" });
    const fit = ageFit(
      {
        cutoffOn: intake.ageCutoffOn,
        minMonths: intake.minAgeMonths,
        maxMonths: intake.maxAgeMonths,
      },
      child.birthDate,
    );
    if (fit === "young" || fit === "old")
      throw new ORPCError("BAD_REQUEST", {
        message:
          fit === "young" ? "application.age_young" : "application.age_old",
      });
    const form = row.form;
    // Someone applying for themself consents for themself, which only one of
    // the age the school's learners decide from may do.
    if (
      self &&
      !(await decidingLearners(context, [child.id], context.today)).has(
        child.id,
      )
    )
      throw new ORPCError("BAD_REQUEST", { message: "application.self_minor" });
    const read = readApplicationAnswers(version, input.locale, form.answers);
    if (!read.ok)
      throw new ORPCError("BAD_REQUEST", {
        message:
          read.code === "required"
            ? "validation.required"
            : "validation.invalid",
        data: { questionId: read.questionId },
      });
    const needs = await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: child.id,
        reason: "Sent the application with its health and needs",
        write: false,
        capabilities: NEEDS_USE,
      },
      () => readNeeds(context, child.id),
    );
    const anyNeeds = NEEDS_KINDS.some((kind) => needs[kind] !== "");
    const consents = await admissionConsents(context);
    const answered = new Map(
      input.consents.map((consent) => [consent.noticeId, consent.agreed]),
    );
    for (const consent of consents) {
      const required =
        consent.meaning === "admission_processing" ||
        (consent.meaning === "special_category" && anyNeeds);
      if (!required) continue;
      if (!consent.notice)
        throw new ORPCError("CONFLICT", {
          message: "application.consent_words",
        });
      if (answered.get(consent.notice.id) !== true)
        throw new ORPCError("BAD_REQUEST", {
          message: "application.consent",
          data: { meaning: consent.meaning },
        });
    }
    if (
      !consents.some(
        (consent) =>
          consent.meaning === "admission_processing" && consent.notice,
      )
    )
      throw new ORPCError("CONFLICT", { message: "application.consent_words" });

    const filed = filing
      ? await filing.sent(context, { applicantId: child.id, form })
      : null;
    const otherId = filed?.otherId ?? null;
    const schoolCountry = await country(context);
    const phone = form.phone ? toE164(form.phone, schoolCountry) : null;
    if (form.phone && phone)
      await addContact(context.tx, {
        tenantId: context.tenantId,
        userId: context.actor.userId,
        kind: "phone",
        value: form.phone,
        normalized: phone,
        label: "mobile",
        source: "self_service",
      });

    const age = ageOn(child.birthDate, context.today);
    for (const consent of consents) {
      if (!consent.notice || !answered.has(consent.notice.id)) continue;
      const agreed = answered.get(consent.notice.id) === true;
      const consentId = await insertAnswer(context.tx, {
        tenantId: context.tenantId,
        studentId: child.id,
        purposeId: consent.purposeId,
        decision: agreed ? "granted" : "refused",
        noticeId: consent.notice.id,
        givenById: context.actor.userId,
        capacity: filed ? "guardian" : "self",
        method: "electronic",
        evidenceFileId: null,
        recordedById: context.actor.userId,
        givenOn: context.today,
        ageAtDecision: age?.years ?? null,
        refreshDueOn: refreshDueOn({
          birthDate: child.birthDate,
          givenOn: context.today,
          country: schoolCountry,
        }),
        note: null,
      });
      if (filed)
        await keepConsentLink(context, { consentId, linkId: filed.linkId });
      await audit(context, {
        action: "consent.record",
        objectType: "consent_record",
        subjectUserId: child.id,
        details: {
          purposeId: consent.purposeId,
          noticeId: consent.notice.id,
          decision: agreed ? "granted" : "refused",
          applicationId: row.id,
        },
      });
    }

    const [reach] = await reachability(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      userIds: [context.actor.userId],
    });
    const scope = scopeFor(context, "school");
    const columns = nameColumns({
      ar: {
        given: child.givenNameAr,
        middle: child.middleNameAr,
        family: child.familyNameAr,
      },
      en: {
        given: child.givenNameEn,
        middle: child.middleNameEn,
        family: child.familyNameEn,
      },
    });
    const sameChild = await studentMatches(context.tx, scope, {
      fullNameEn: columns.fullNameEn,
      fullNameAr: columns.fullNameAr,
      birthDate: child.birthDate,
      exceptId: child.id,
    });
    const holders = row.matches.documentHolders ?? [];
    const students = [
      ...sameChild.map((each) => ({
        id: each.id,
        nameEn: each.fullNameEn,
        nameAr: each.fullNameAr,
      })),
      ...(
        await Promise.all(
          holders
            .filter((id) => !sameChild.some((each) => each.id === id))
            .map((id) => readPerson(context.tx, id)),
        )
      ).flatMap((each) =>
        each
          ? [{ id: each.id, nameEn: each.fullNameEn, nameAr: each.fullNameAr }]
          : [],
      ),
    ];
    const contacts: {
      as: "applicant" | "other";
      kind: "email" | "phone";
      normalized: string;
    }[] = [];
    if (reach?.email)
      contacts.push({
        as: "applicant",
        kind: "email",
        normalized: reach.email.toLowerCase(),
      });
    const applicantPhone = phone ?? reach?.phone ?? null;
    if (applicantPhone)
      contacts.push({
        as: "applicant",
        kind: "phone",
        normalized: applicantPhone,
      });
    const other = filed ? form.other : null;
    if (other?.email)
      contacts.push({
        as: "other",
        kind: "email",
        normalized: other.email,
      });
    const otherPhone = other?.phone ? toE164(other.phone, schoolCountry) : null;
    if (otherPhone)
      contacts.push({ as: "other", kind: "phone", normalized: otherPhone });
    const guardians: {
      id: string;
      nameEn: string | null;
      nameAr: string | null;
      as: "applicant" | "other";
    }[] = [];
    for (const contact of contacts)
      for (const found of await peopleByContact(context.tx, context.tenantId, {
        kind: contact.kind,
        normalized: contact.normalized,
      }))
        if (
          found.id !== context.actor.userId &&
          found.id !== otherId &&
          !guardians.some((each) => each.id === found.id)
        )
          guardians.push({
            id: found.id,
            nameEn: found.fullNameEn,
            nameAr: found.fullNameAr,
            as: contact.as,
          });
    const parents = [context.actor.userId, ...guardians.map((each) => each.id)];
    const [siblings, staffParent] = await Promise.all([
      filing ? filing.relatives(context, parents) : Promise.resolve([]),
      holdsStaffRole(context.tx, {
        ...org(context),
        userIds: parents,
        today: context.today,
        roles: STAFF_ROLES,
      }),
    ]);
    const matches = { students, guardians, siblings, staffParent };
    const priorities = prioritiesMet(
      intake.priorities,
      prioritiesFound(matches, needs.additional_needs !== ""),
    );

    const enquiry = await enquiryToConvert(context.tx, {
      ...org(context),
      email: reach?.email ?? "",
      phone: applicantPhone ?? "",
    });
    if (
      enquiry &&
      (await convertEnquiry(context.tx, {
        ...org(context),
        id: enquiry.id,
        expectedVersion: enquiry.version,
        enquirerUserId: context.actor.userId,
        applicantUserId: child.id,
      }))
    ) {
      const threadId = await openEnquiryConversation(context.tx, {
        tenantId: context.tenantId,
        enquiryId: enquiry.id,
      });
      if (threadId)
        await writeEntry(scopeOf(context), {
          threadId,
          kind: "event",
          authorUserId: null,
          content: null,
          details: {
            event: "state",
            from: enquiry.state,
            to: "converted",
            automatic: true,
          },
          notify: false,
        });
      await audit(context, {
        action: "enquiry.state",
        objectType: "site_enquiry",
        objectId: enquiry.id,
        details: {
          from: enquiry.state,
          to: "converted",
          applicationId: row.id,
        },
      });
    }

    const prefix = String(intake.entryYear);
    const reference = applicationReference(
      intake.entryYear,
      await nextReferenceCount(context.tx, { ...org(context), prefix }),
    );
    const sent = await markSubmitted(context.tx, {
      ...org(context),
      id: row.id,
      expectedVersion: input.expectedVersion,
      reference,
      locale: input.locale,
      answers: read.answers,
      matches,
      priorities,
      additionalNeeds: needs.additional_needs !== "",
      enquiryId: enquiry?.id ?? null,
    });
    if (sent === null) throw conflict();
    await insertApplicationEntry(context.tx, {
      ...org(context),
      applicationId: row.id,
      kind: "state",
      body: "",
      details: { from: "draft", to: "submitted" },
      authorUserId: context.actor.userId,
    });
    await audit(context, {
      action: "admission_application.submit",
      objectType: "admission_application",
      objectId: row.id,
      subjectUserId: child.id,
      details: {
        from: "draft",
        to: "submitted",
        reference,
        priorities: priorities.join(",") || null,
      },
    });
    // The receipt is the family's record that the school has it, so it
    // reaches the family although they sent it themselves.
    await notifyIn(
      {
        tx: context.tx,
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        school: context.school,
        extensions: context.extensions,
        actorUserId: null,
        now: context.now,
        channels: context.channels,
      },
      [context.actor.userId],
      {
        kind: "application",
        subject: { type: "admission_application", id: row.id },
        params: {
          title: child.fullNameEn ?? child.fullNameAr ?? "",
          titleAr: child.fullNameAr ?? undefined,
          intakeName: intake.titleEn ?? intake.titleAr ?? undefined,
          intakeNameAr: intake.titleAr ?? undefined,
          reference,
          received: true,
        },
      },
    );
    const office = await capabilityHolders(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      today: context.today,
      capability: "admissions:manage",
    });
    await notify(
      context,
      office.map((each) => each.id),
      {
        kind: "application",
        subject: { type: "admission_application", id: row.id },
        params: {
          title: child.fullNameEn ?? child.fullNameAr ?? "",
          titleAr: child.fullNameAr ?? undefined,
          intakeName: intake.titleEn ?? intake.titleAr ?? undefined,
          intakeNameAr: intake.titleAr ?? undefined,
        },
        needsAction: true,
      },
    );
    return { version: sent, reference };
  });

/** The family takes an application back, a draft or one already sent and not yet decided. */
export const withdraw = writeProcedure
  .input(withdrawApplicationSchema)
  .handler(async ({ input, context }) => {
    applying(context);
    const row = await ownApplication(context, input.id);
    if (!canMove(row.state, "withdrawn", "family"))
      throw new ORPCError("CONFLICT", { message: "application.state" });
    const version = await setApplicationState(context.tx, {
      ...org(context),
      id: row.id,
      expectedVersion: input.expectedVersion,
      from: row.state,
      state: "withdrawn",
      exitReason: input.reason,
    });
    if (version === null) throw conflict();
    await insertApplicationEntry(context.tx, {
      ...org(context),
      applicationId: row.id,
      kind: "state",
      body: input.note,
      details: { from: row.state, to: "withdrawn", reason: input.reason },
      authorUserId: context.actor.userId,
    });
    await audit(context, {
      action: "admission_application.state",
      objectType: "admission_application",
      objectId: row.id,
      subjectUserId: row.applicantUserId,
      details: { from: row.state, to: "withdrawn", reason: input.reason },
    });
    return { version };
  });

/**
 * The family accepts the place they were offered, or declines it, by the
 * offer's last day; the office hears either way.
 */
export const answer = writeProcedure
  .input(answerOfferSchema)
  .handler(async ({ input, context }) => {
    applying(context);
    const row = await ownApplication(context, input.id);
    const to = input.answer === "accept" ? "accepted" : "offer_declined";
    if (
      !canMove(row.state, to, "family") ||
      (row.offerExpiresOn !== null && row.offerExpiresOn < context.today)
    )
      throw new ORPCError("CONFLICT", { message: "application.state" });
    const intake = await intakeOf(context, row.intakeId);
    const version = await moveApplication(admissionScope(context), {
      row,
      intake,
      to,
      expectedVersion: input.expectedVersion,
      note: input.note,
      answered: true,
    });
    if (version === null) throw conflict();
    const office = await capabilityHolders(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      today: context.today,
      capability: "admissions:manage",
    });
    await notify(
      context,
      office.map((each) => each.id),
      {
        kind: "application",
        subject: { type: "admission_application", id: row.id },
        params: {
          title: row.applicant.nameEn ?? row.applicant.nameAr ?? "",
          titleAr: row.applicant.nameAr ?? undefined,
          actorName: row.filer.nameEn ?? row.filer.nameAr ?? "",
          actorNameAr: row.filer.nameAr ?? undefined,
          intakeName: intake.titleEn ?? intake.titleAr ?? undefined,
          intakeNameAr: intake.titleAr ?? undefined,
          outcome: to,
        },
        needsAction: to === "accepted",
      },
    );
    return { version };
  });

/** A letter the school sent the family, as they read it. */
export const letter = readProcedure
  .input(letterRefSchema)
  .handler(async ({ input, context }) => {
    applying(context);
    return letterView(context, input.id, context.actor.userId);
  });

export const attach = writeProcedure
  .input(attachDocumentSchema)
  .handler(async ({ input, context }) => {
    applying(context);
    const row = await ownApplication(context, input.applicationId);
    return fileDocument(context, row, input);
  });

/** The family takes back a document the office has not yet checked. */
export const detach = writeProcedure
  .input(detachDocumentSchema)
  .handler(async ({ input, context }) => {
    applying(context);
    const row = await ownApplication(context, input.applicationId);
    const [file] = await filesByIds(context.tx, context.tenantId, [
      input.fileId,
    ]);
    if (!file || file.hostType !== "admission_item" || !file.hostId)
      throw new ORPCError("NOT_FOUND");
    const item = await documentStep(context, row.id, file.hostId);
    if (item.state !== "received" && item.state !== "rejected")
      throw new ORPCError("CONFLICT", { message: "application.item_done" });
    const held = await filesOfHosts(context.tx, context.tenantId, {
      type: "admission_item",
      ids: [item.id],
    });
    const keep = held
      .filter((each) => each.id !== file.id)
      .map((each) => each.id);
    await unlinkFiles(context.tx, {
      tenantId: context.tenantId,
      host: { type: "admission_item", id: item.id },
      keep,
    });
    if (keep.length === 0 && item.state === "received")
      await setItemState(context.tx, {
        tenantId: context.tenantId,
        applicationId: row.id,
        id: item.id,
        from: ["received"],
        state: "pending",
      });
    await audit(context, {
      action: "admission_item.unfile",
      objectType: "admission_item",
      objectId: item.id,
      subjectUserId: row.applicantUserId,
      details: { fileId: file.id, applicationId: row.id },
    });
    return { removed: true };
  });
