import type { ConsentAnswer } from "@faridalms/database/stores/consents";
import type { Descriptor } from "@faridalms/database/stores/descriptors";

import {
  answerCounts,
  answersFor,
  currentAnswers,
  discardDraft,
  enrolledStudents,
  formById,
  formsOf,
  insertAnswer,
  insertForm,
  nextVersionLabel,
  publishForm as publishFormRow,
  updateDraft,
} from "@faridalms/database/stores/consents";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import { filesByIds, linkFiles } from "@faridalms/database/stores/files";
import { schoolProfile } from "@faridalms/database/stores/identity";
import { markActed } from "@faridalms/database/stores/notifications";
import { namesOf } from "@faridalms/database/stores/persons";
import { endPublicationsShowing } from "@faridalms/database/stores/public-files";
import { person } from "@faridalms/database/stores/students";
import { translationReview } from "@faridalms/database/stores/translations";
import {
  answerConsentSchema,
  consentFormRefSchema,
  consentFormSchema,
  decisionFor,
  recordConsentSchema,
  refreshDueOn,
  reviewConsentFormSchema,
  saveConsentFormSchema,
} from "@faridalms/domain/consents";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { CONTENT_ISSUE_CODE } from "@faridalms/domain/content-checks";
import { ageOn } from "@faridalms/domain/school";
import { documentWritten } from "@faridalms/domain/translations";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { askedElsewhere } from "../consents/points";
import { consentWords } from "../consents/words";
import { refuseIfHeld } from "../core/holds";
import { notify } from "../core/notify";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { publishWords, saveWords, wordsIssues } from "../core/publication";
import { reachesStudent, requireStudent, studentsReached } from "../core/reach";
import { checkTranslation } from "../core/translation-review";
import { coreReader, coreWriter } from "../files/authorize";
import { withFileGate } from "../files/gate";
import {
  actorsFor,
  answerersFor,
  keepConsentLink,
  learnersAnsweredBy,
} from "../people/acting";

const id = v.pipe(v.string(), v.uuid());

const host = (formId: string) => ({ type: "privacy_notice", id: formId });

const conflict = () =>
  new ORPCError("CONFLICT", { message: "conflict.version" });

function purposesOf(context: UnitContext): Promise<Descriptor[]> {
  return descriptorsFor(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace: "consent_purpose",
    today: context.today,
  });
}

const purposeView = (row: Descriptor) => ({
  id: row.id,
  code: row.code,
  meaning: row.meaning,
  labelEn: row.labelEn,
  labelAr: row.labelAr,
});

/** The words a family is asked to agree to: the latest published form of each purpose. */
async function publishedForms(context: UnitContext) {
  const [purposes, { published }, elsewhere] = await Promise.all([
    purposesOf(context),
    formsOf(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
    }),
    askedElsewhere(context),
  ]);
  return purposes.flatMap((purpose) => {
    const notice = published.find((row) => row.purposeId === purpose.id);
    return notice && !elsewhere.has(purpose.meaning ?? "")
      ? [{ purpose, notice }]
      : [];
  });
}

coreWriter("privacy_notice", async (context, formId) => {
  if (!can(context, "privacy:manage")) return false;
  const row = await formById(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    id: formId,
  });
  return row !== null && row.publishedAt === null;
});

/** Files a family or the office sent as proof of an answer, read by those who keep the register. */
coreReader(
  "consent_record",
  async (context) =>
    can(context, "people:manage") || can(context, "privacy:manage"),
);

/** A consent form's words are the school's privacy team's to write, and to comment on while writing. */
coreWriter(
  "privacy_notice",
  async (context, formId) =>
    can(context, "privacy:manage") &&
    (await formById(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      id: formId,
    })) !== null,
);

/** The purposes the school asks consent for, each with its form and how families answered. */
export const forms = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "privacy:manage");
  const scope = {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
  };
  const [purposes, rows, counts, students] = await Promise.all([
    purposesOf(context),
    formsOf(context.tx, scope),
    answerCounts(context.tx, scope),
    enrolledStudents(context.tx, scope),
  ]);
  return {
    students: students.length,
    purposes: purposes.map((purpose) => {
      const published = rows.published.find(
        (row) => row.purposeId === purpose.id,
      );
      const draft = rows.drafts.find((row) => row.purposeId === purpose.id);
      const count = counts.find((row) => row.purposeId === purpose.id);
      return Object.assign(purposeView(purpose), {
        published: published
          ? {
              id: published.id,
              versionLabel: published.versionLabel,
              publishedAt: published.publishedAt,
            }
          : null,
        draftId: draft?.id ?? null,
        granted: count?.granted ?? 0,
        refused: count?.refused ?? 0,
      });
    }),
  };
});

/** One purpose's form for writing: its draft if one is open, and the version families now see. */
export const form = readProcedure
  .input(consentFormSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    const purpose = (await purposesOf(context)).find(
      (row) => row.id === input.purposeId,
    );
    if (!purpose) throw new ORPCError("NOT_FOUND");
    const rows = await formsOf(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
    });
    const draft = rows.drafts.find((row) => row.purposeId === purpose.id);
    const published = rows.published.find(
      (row) => row.purposeId === purpose.id,
    );
    const [draftWords, review, publishedWords] = await Promise.all([
      draft ? consentWords(context, draft.id) : null,
      draft
        ? translationReview(context.tx, {
            tenantId: context.tenantId,
            host: "privacy_notice",
            id: draft.id,
          })
        : null,
      published ? consentWords(context, published.id) : null,
    ]);
    return {
      purpose: purposeView(purpose),
      draft:
        draft && draftWords
          ? {
              id: draft.id,
              version: draft.version,
              versionLabel: draft.versionLabel,
              primaryLocale: draft.locale,
              body: draftWords.body,
              translation: draftWords.translation,
              translationReview: review,
            }
          : null,
      published:
        published && publishedWords
          ? {
              id: published.id,
              versionLabel: published.versionLabel,
              publishedAt: published.publishedAt,
              primaryLocale: published.locale,
              body: publishedWords.body,
              translation: publishedWords.translation,
            }
          : null,
    };
  });

/**
 * Writes the draft of a purpose's form, opening one the first time. Forms
 * are words only: what a family agrees to must read the same everywhere it
 * is shown, so it carries no pictures or files.
 */
export const saveForm = writeProcedure
  .input(saveConsentFormSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    if (
      contentFileIds(input.body).length > 0 ||
      (input.translation && contentFileIds(input.translation).length > 0)
    )
      throw new ORPCError("BAD_REQUEST", { message: "consents.words_only" });
    const purpose = (await purposesOf(context)).find(
      (row) => row.id === input.purposeId,
    );
    if (!purpose) throw new ORPCError("NOT_FOUND");
    let formId: string;
    let version = 0;
    if (input.id) {
      formId = input.id;
      const row = await formById(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        id: formId,
      });
      if (!row || row.purposeId !== purpose.id)
        throw new ORPCError("NOT_FOUND");
      if (row.publishedAt !== null)
        throw new ORPCError("CONFLICT", { message: "consents.published" });
      await refuseIfHeld(context, host(formId));
      const next = await updateDraft(context.tx, {
        tenantId: context.tenantId,
        id: formId,
        expectedVersion: input.expectedVersion,
        locale: input.primaryLocale,
      });
      if (next === null) throw conflict();
      version = next;
    } else {
      const { drafts } = await formsOf(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
      });
      if (drafts.some((row) => row.purposeId === purpose.id))
        throw new ORPCError("CONFLICT", { message: "consents.draft_open" });
      formId = Bun.randomUUIDv7();
    }
    const words = await saveWords(context, host(formId), {
      primaryLocale: input.primaryLocale,
      body: input.body,
      translation: input.translation,
      review: "privacy_notice",
    });
    if (!input.id) {
      const { label, supersedesId } = await nextVersionLabel(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        purposeId: purpose.id,
      });
      version = await insertForm(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        id: formId,
        purposeId: purpose.id,
        locale: input.primaryLocale,
        versionLabel: label,
        documentId: words.originalId,
        supersedesId,
      });
    } else if (words.version !== null) version = words.version;
    return {
      id: formId,
      version,
      translationReview: await translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "privacy_notice",
        id: formId,
      }),
    };
  });

export const reviewForm = writeProcedure
  .input(reviewConsentFormSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    const row = await formById(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      id: input.id,
    });
    if (!row) throw new ORPCError("NOT_FOUND");
    return checkTranslation(context, {
      host: "privacy_notice",
      id: row.id,
      version: row.version,
      expectedVersion: input.expectedVersion,
      reviewed: input.reviewed,
      translated: documentWritten(
        (await consentWords(context, row.id)).translation,
      ),
    });
  });

/**
 * Puts a draft in front of those who answer it. Its words freeze, every
 * answer given to it points at exactly them, and each learner who decides
 * for themself, and each person who answers for a learner and can be asked
 * in the app, is asked once, whatever number of learners they answer for.
 */
export const publishForm = writeProcedure
  .input(consentFormRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    const row = await formById(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      id: input.id,
    });
    if (!row) throw new ORPCError("NOT_FOUND");
    if (row.publishedAt !== null)
      throw new ORPCError("CONFLICT", { message: "consents.published" });
    const { body, translation } = await consentWords(context, row.id);
    if (!body || !contentPlainText(body).trim())
      throw new ORPCError("BAD_REQUEST", { message: "consents.empty" });
    const [problem] = await wordsIssues(context, [body, translation]);
    if (problem)
      throw new ORPCError("BAD_REQUEST", {
        message: CONTENT_ISSUE_CODE[problem],
      });
    const version = await publishFormRow(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
    });
    if (version === null) throw conflict();
    const purpose = (await purposesOf(context)).find(
      (item) => item.id === row.purposeId,
    );
    await publishWords(context, host(row.id), {
      live: true,
      title: purpose?.labelEn ?? purpose?.code ?? "",
      ...(purpose?.labelAr ? { titleAr: purpose.labelAr } : {}),
    });
    const students = (await askedElsewhere(context)).has(purpose?.meaning ?? "")
      ? []
      : await enrolledStudents(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          today: context.today,
        });
    const [answerers, contactable] = await Promise.all([
      answerersFor(context, {
        studentIds: students,
        on: context.today,
        purpose: "consent",
      }),
      actorsFor(context, {
        studentIds: students,
        on: context.today,
        purpose: "contact",
      }),
    ]);
    const asked = await notify(
      context,
      [
        ...new Set(
          answerers
            .filter(
              (answerer) =>
                answerer.linkId === null ||
                contactable.some((link) => link.linkId === answerer.linkId),
            )
            .map((answerer) => answerer.userId),
        ),
      ],
      {
        kind: "consent",
        subject: host(row.id),
        params: {
          title: purpose?.labelEn ?? purpose?.code ?? "",
          titleAr: purpose?.labelAr ?? undefined,
        },
        needsAction: true,
      },
    );
    await audit(context, {
      action: "consent_form.publish",
      objectType: "privacy_notice",
      objectId: row.id,
      details: { purposeId: row.purposeId, versionLabel: row.versionLabel },
    });
    return { version, asked };
  });

export const discardForm = writeProcedure
  .input(consentFormRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    const row = await formById(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      id: input.id,
    });
    if (!row) throw new ORPCError("NOT_FOUND");
    if (row.publishedAt !== null)
      throw new ORPCError("CONFLICT", { message: "consents.published" });
    if (
      !(await discardDraft(context.tx, {
        tenantId: context.tenantId,
        ...input,
      }))
    )
      throw conflict();
    return { id: row.id };
  });

const answerView = (answer: ConsentAnswer) => ({
  id: answer.id,
  decision: answer.decision,
  versionLabel: answer.versionLabel,
  method: answer.method,
  givenOn: answer.givenOn,
  recordedAt: answer.recordedAt,
  refreshDueOn: answer.refreshDueOn,
  note: answer.note,
  evidenceFileId: answer.evidenceFileId,
  capacity: answer.capacity,
  givenBy: answer.givenBy,
  recordedBy: answer.recordedBy,
});

/**
 * Who may answer for a learner on the office's paper: the learner who
 * decides for themself, those who act for them, and the office itself
 * where the learner does not decide.
 */
async function officeAnswerers(context: UnitContext, studentId: string) {
  const links = await answerersFor(context, {
    studentIds: [studentId],
    on: context.today,
    purpose: "consent",
  });
  const names = await namesOf(
    context.tx,
    context.tenantId,
    links.map((link) => link.userId),
  );
  return {
    links,
    answerers: links.map((link) => {
      const name = names.find((row) => row.id === link.userId);
      return {
        answeredBy: link.linkId ?? "self",
        nameEn: name?.fullNameEn ?? null,
        nameAr: name?.fullNameAr ?? null,
      };
    }),
    office: !links.some((link) => link.linkId === null),
  };
}

/** A student's consents: the answer in force for each purpose asked, with the ones before it. */
export const student = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage", "privacy:manage");
    await requireStudent(context, "consents", input.id);
    const [asked, answers, answerers] = await Promise.all([
      publishedForms(context),
      answersFor(context.tx, {
        tenantId: context.tenantId,
        studentId: input.id,
      }),
      officeAnswerers(context, input.id),
    ]);
    return {
      purposes: asked.map(({ purpose, notice }) => {
        const given = answers.filter((row) => row.purposeId === purpose.id);
        return Object.assign(purposeView(purpose), {
          formId: notice.id,
          versionLabel: notice.versionLabel,
          current: given[0] ? answerView(given[0]) : null,
          earlier: given.slice(1).map(answerView),
        });
      }),
      answerers: answerers.answerers,
      office: answerers.office,
      canRecord: can(context, "people:manage"),
      today: context.today,
    };
  });

/** Clears someone's request once every learner they answer for has answered this version. */
async function settleRequest(
  context: UnitContext,
  userId: string,
  formId: string,
) {
  const links = await learnersAnsweredBy(context, {
    userId,
    on: context.today,
    purpose: "consent",
    learner: true,
  });
  const answers = await currentAnswers(context.tx, {
    tenantId: context.tenantId,
    studentIds: links.map((link) => link.studentId),
  });
  const done = links.every((link) =>
    answers.some(
      (row) => row.studentId === link.studentId && row.noticeId === formId,
    ),
  );
  if (done)
    await markActed(context.tx, {
      tenantId: context.tenantId,
      userId,
      subjectType: "privacy_notice",
      subjectId: formId,
    });
}

/**
 * A family that no longer agrees to the website gets their child's pictures
 * taken off it at once; the objects go once the answer is stored.
 */
async function takeDownPhotos(context: UnitContext, studentId: string) {
  const ended = await endPublicationsShowing(context.tx, {
    tenantId: context.tenantId,
    userId: studentId,
  });
  if (ended.length === 0) return;
  context.afterCommit(async () => {
    await Promise.all(
      ended.map((row) => context.publicMedia.remove(row.publicKey)),
    );
  });
  await audit(context, {
    action: "file.unpublish",
    objectType: "user",
    objectId: studentId,
    subjectUserId: studentId,
    studentUserId: studentId,
    details: {
      reason: "consent",
      hosts: ended.map((row) => `${row.hostType}:${row.hostId}`),
    },
  });
}

/** Writes an answer into the register for one student and purpose. */
async function writeAnswer(
  context: UnitContext,
  input: {
    studentId: string;
    purpose: Descriptor;
    formId: string;
    agreed: boolean;
    /** Who gave it, or null when the office answered on the learner's behalf. */
    givenById: string | null;
    /** The module's link they gave it through, if they act for the learner. */
    linkId: string | null;
    method: "electronic" | "paper_scanned" | "verbal_recorded";
    givenOn: string;
    fileId: string | null;
    note: string | null;
  },
) {
  const [subject, current, profile] = await Promise.all([
    person(context.tx, input.studentId),
    currentAnswers(context.tx, {
      tenantId: context.tenantId,
      studentIds: [input.studentId],
    }),
    schoolProfile(context.tx, context.schoolId),
  ]);
  if (!subject) throw new ORPCError("NOT_FOUND");
  const was =
    current.find((row) => row.purposeId === input.purpose.id)?.decision ?? null;
  const decision = decisionFor(input.agreed, was);
  const answerId = await insertAnswer(context.tx, {
    tenantId: context.tenantId,
    studentId: input.studentId,
    purposeId: input.purpose.id,
    decision,
    noticeId: input.formId,
    givenById: input.givenById,
    capacity:
      input.givenById === null
        ? "school_on_behalf"
        : input.linkId === null
          ? "self"
          : "guardian",
    method: input.method,
    evidenceFileId: input.fileId,
    recordedById: context.actor.userId,
    givenOn: input.givenOn,
    ageAtDecision: ageOn(subject.birthDate, input.givenOn)?.years ?? null,
    refreshDueOn: refreshDueOn({
      birthDate: subject.birthDate,
      givenOn: input.givenOn,
      country: profile?.countryCode ?? null,
    }),
    note: input.note,
  });
  if (input.linkId)
    await keepConsentLink(context, {
      consentId: answerId,
      linkId: input.linkId,
    });
  if (input.fileId) {
    const fileId = input.fileId;
    const linked = await withFileGate(context.tx, "evidence", (tx) =>
      linkFiles(tx, {
        tenantId: context.tenantId,
        userId: context.actor.userId,
        ids: [fileId],
        purpose: "evidence",
        host: { type: "consent_record", id: answerId },
      }),
    );
    if (linked.length !== 1)
      throw new ORPCError("CONFLICT", { message: "files.not_linkable" });
  }
  await audit(context, {
    action: "consent.record",
    objectType: "consent_record",
    objectId: answerId,
    subjectUserId: input.studentId,
    studentUserId: input.studentId,
    details: {
      purposeId: input.purpose.id,
      decision,
      method: input.method,
    },
  });
  if (decision !== "granted" && input.purpose.meaning === "photo_website")
    await takeDownPhotos(context, input.studentId);
  if (input.givenById)
    await settleRequest(context, input.givenById, input.formId);
  return { id: answerId, decision };
}

/**
 * The office records an answer given on paper or in person: by the learner
 * who decides for themself, by someone acting for them, or by the office on
 * their behalf where they do not decide. A paper answer keeps its scan;
 * each names who gave it and the day.
 */
export const record = writeProcedure
  .input(recordConsentSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage");
    await requireStudent(context, "consents", input.studentId);
    if (input.givenOn > context.today)
      throw new ORPCError("BAD_REQUEST", { message: "consents.future" });
    const entry = (await publishedForms(context)).find(
      (row) => row.purpose.id === input.purposeId,
    );
    if (!entry) throw new ORPCError("NOT_FOUND");
    const { links, office } = await officeAnswerers(context, input.studentId);
    const answerer =
      input.answeredBy === "office"
        ? office
          ? { userId: null, linkId: null }
          : null
        : (links.find((link) => (link.linkId ?? "self") === input.answeredBy) ??
          null);
    if (!answerer)
      throw new ORPCError("FORBIDDEN", { message: "consents.not_answerer" });
    if (input.fileId) {
      const fileId = input.fileId;
      const [file] = await withFileGate(context.tx, "evidence", (tx) =>
        filesByIds(tx, context.tenantId, [fileId]),
      );
      if (!file || file.purpose !== "evidence")
        throw new ORPCError("BAD_REQUEST", { message: "validation.file_type" });
    }
    return writeAnswer(context, {
      studentId: input.studentId,
      purpose: entry.purpose,
      formId: entry.notice.id,
      agreed: input.agreed,
      givenById: answerer.userId,
      linkId: answerer.linkId,
      method: input.method,
      givenOn: input.givenOn,
      fileId: input.fileId || null,
      note: input.note || null,
    });
  });

/**
 * The learners the viewer may see consents for in the app: themself when
 * they are a learner, and those they follow. Each says whether the viewer
 * answers for them: a learner who decides for themself, or someone a
 * module lets consent for them.
 */
async function learnersOfViewer(context: UnitContext) {
  const own = context.actor.context === "student" ? [context.actor.userId] : [];
  const reached = await studentsReached(context, "consents", [
    ...own,
    ...context.actor.follows,
  ]);
  const ids = [...own, ...context.actor.follows].filter((learner) =>
    reached.has(learner),
  );
  const answers = await learnersAnsweredBy(context, {
    userId: context.actor.userId,
    on: context.today,
    purpose: "consent",
    learner: own.length > 0,
  });
  const names = await namesOf(context.tx, context.tenantId, ids);
  return names.map((row) => {
    const link = answers.find((answer) => answer.studentId === row.id);
    return {
      studentId: row.id,
      fullNameEn: row.fullNameEn,
      fullNameAr: row.fullNameAr,
      self: row.id === context.actor.userId,
      mayAnswer: link !== undefined,
      linkId: link?.linkId ?? null,
    };
  });
}

/** The forms the viewer is asked to answer, and each learner's answers, in the app. */
export const mine = readProcedure.handler(async ({ context }) => {
  const learners = await learnersOfViewer(context);
  const asked = await publishedForms(context);
  const [answers, texts] = await Promise.all([
    currentAnswers(context.tx, {
      tenantId: context.tenantId,
      studentIds: learners.map((learner) => learner.studentId),
    }),
    Promise.all(asked.map(({ notice }) => consentWords(context, notice.id))),
  ]);
  return {
    today: context.today,
    forms: asked.map(({ purpose, notice }, index) => ({
      id: notice.id,
      purposeId: purpose.id,
      labelEn: purpose.labelEn,
      labelAr: purpose.labelAr,
      versionLabel: notice.versionLabel,
      publishedAt: notice.publishedAt,
      primaryLocale: notice.locale,
      body: texts[index]?.body ?? null,
      translation: texts[index]?.translation ?? null,
    })),
    learners: learners.map((learner) => ({
      studentId: learner.studentId,
      fullNameEn: learner.fullNameEn,
      fullNameAr: learner.fullNameAr,
      self: learner.self,
      mayAnswer: learner.mayAnswer,
      answers: answers
        .filter((row) => row.studentId === learner.studentId)
        .map((row) => ({
          purposeId: row.purposeId,
          formId: row.noticeId,
          decision: row.decision,
          givenOn: row.givenOn,
          due: row.refreshDueOn !== null && row.refreshDueOn <= context.today,
          givenByMe: row.givenById === context.actor.userId,
          givenByEn: row.givenByEn,
          givenByAr: row.givenByAr,
        })),
    })),
  };
});

/** The viewer answers a form for one learner they answer for, in the app. */
export const answer = writeProcedure
  .input(answerConsentSchema)
  .handler(async ({ input, context }) => {
    if (!(await reachesStudent(context, "consents", input.studentId)))
      throw new ORPCError("NOT_FOUND");
    const learner = (await learnersOfViewer(context)).find(
      (row) => row.studentId === input.studentId,
    );
    if (!learner) throw new ORPCError("NOT_FOUND");
    if (!learner.mayAnswer)
      throw new ORPCError("FORBIDDEN", { message: "consents.not_answerer" });
    const entry = (await publishedForms(context)).find(
      (row) => row.notice.id === input.noticeId,
    );
    if (!entry)
      throw new ORPCError("CONFLICT", { message: "consents.superseded" });
    return writeAnswer(context, {
      studentId: input.studentId,
      purpose: entry.purpose,
      formId: entry.notice.id,
      agreed: input.agreed,
      givenById: context.actor.userId,
      linkId: learner.linkId,
      method: "electronic",
      givenOn: context.today,
      fileId: null,
      note: null,
    });
  });
