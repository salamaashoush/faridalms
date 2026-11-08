import type { IntakeLetters } from "@faridalms/domain/admissions";

import { changeOf } from "@faridalms/database/audit";
import {
  formsOf,
  insertForm,
  insertIntake,
  intakesOf,
  publishForm as publishFormRow,
  updateForm,
  updateIntake,
} from "@faridalms/database/stores/admissions";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import { schoolProfile } from "@faridalms/database/stores/identity";
import {
  templateById,
  templatesOf,
} from "@faridalms/database/stores/templates";
import { schoolYears } from "@faridalms/database/stores/years";
import {
  admissionsYear,
  formRefSchema,
  intakeListSchema,
  intakeRefSchema,
  formUnready,
  saveFormSchema,
  saveIntakeSchema,
  suggestedAges,
  suggestedCutoff,
} from "@faridalms/domain/admissions";
import { formQuestions } from "@faridalms/domain/questions";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { admissionConsents, intakeOf } from "../core/admissions";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

const conflict = () =>
  new ORPCError("CONFLICT", { message: "conflict.version" });

const readsAdmissions = (context: UnitContext) =>
  requireCapability(
    context,
    "admissions:read",
    "admissions:manage",
    "admissions:configure",
  );

const org = (context: UnitContext) => ({
  tenantId: context.tenantId,
  orgId: context.schoolId,
});

/** The years an intake may be for: the current one and those still to come. */
async function entryYears(context: UnitContext) {
  return (
    await schoolYears(context.tx, context.tenantId, context.schoolId)
  ).filter((year) => year.lifecycle !== "closed");
}

async function grades(context: UnitContext) {
  return descriptorsFor(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace: "grade_level",
    today: context.today,
  });
}

async function formOf(context: UnitContext, id: string) {
  const [form] = await formsOf(context.tx, { ...org(context), id });
  if (!form) throw new ORPCError("NOT_FOUND");
  return form;
}

/**
 * What setting up admissions chooses from: the years and grades an intake
 * may be for, the school's forms, the age range and cut-off each grade
 * starts with, and whether the consents an application asks have words.
 */
export const options = readProcedure.handler(async ({ context }) => {
  readsAdmissions(context);
  const [years, gradeRows, forms, school, consents, letters] =
    await Promise.all([
      entryYears(context),
      grades(context),
      formsOf(context.tx, org(context)),
      schoolProfile(context.tx, context.schoolId),
      admissionConsents(context),
      templatesOf(context.tx, {
        ...org(context),
        viewerId: context.actor.userId,
        kind: "admission_letter",
      }),
    ]);
  const country = school?.countryCode ?? null;
  return {
    years: years.map((year) => ({
      id: year.id,
      titleEn: year.titleEn,
      titleAr: year.titleAr,
      startsOn: year.startsOn,
      lifecycle: year.lifecycle,
      cutoffOn: suggestedCutoff(year.startsOn, country),
    })),
    grades: gradeRows.map((grade) => ({
      id: grade.id,
      labelEn: grade.labelEn,
      labelAr: grade.labelAr,
      ...suggestedAges(grade.meaning),
    })),
    forms: forms.map((form) => ({
      id: form.id,
      nameEn: form.nameEn,
      nameAr: form.nameAr,
      published: form.published !== null,
    })),
    consents: consents.map((consent) => ({
      meaning: consent.meaning,
      labelEn: consent.labelEn,
      labelAr: consent.labelAr,
      published: consent.notice !== null,
    })),
    letters: letters.map((letter) => ({ id: letter.id, title: letter.title })),
    configures: can(context, "admissions:configure"),
    privacy: can(context, "privacy:manage"),
  };
});

/** A year's intakes, grade by grade, with how many families are applying to each. */
export const list = readProcedure
  .input(intakeListSchema)
  .handler(async ({ input, context }) => {
    readsAdmissions(context);
    const years = await entryYears(context);
    const yearId =
      input.year || admissionsYear(years, context.today)?.id || null;
    const intakes = yearId
      ? await intakesOf(context.tx, { ...org(context), yearId })
      : [];
    return {
      yearId,
      today: context.today,
      intakes,
      configures: can(context, "admissions:configure"),
    };
  });

export const intake = readProcedure
  .input(intakeRefSchema)
  .handler(async ({ input, context }) => {
    readsAdmissions(context);
    return intakeOf(context, input.id);
  });

/**
 * Creates an intake for a year and grade, or changes one. Its year and
 * grade are fixed once made; the form it uses must have been published, so
 * families never meet questions the office is still writing.
 */
/** Refuses a letter that is not one of the school's admission letters. */
async function requireLetters(context: UnitContext, letters: IntakeLetters) {
  const ids = new Set(
    Object.values(letters).flatMap((choice) => Object.values(choice)),
  );
  for (const id of ids) {
    const template = await templateById(context.tx, context.tenantId, id);
    if (
      !template ||
      template.kind !== "admission_letter" ||
      template.orgId !== context.schoolId
    )
      throw new ORPCError("BAD_REQUEST", { message: "intake.letter" });
  }
}

export const saveIntake = writeProcedure
  .input(saveIntakeSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:configure");
    const form = await formOf(context, input.formId);
    if (!form.published)
      throw new ORPCError("BAD_REQUEST", {
        message: "intake.form_unpublished",
      });
    const fields = {
      opensOn: input.opensOn,
      closesOn: input.closesOn,
      capacity: input.capacity,
      formId: input.formId,
      checklist: input.checklist,
      currency: input.currency,
      fees: input.fees,
      decisionsOn: input.decisionsOn || null,
      offerDays: input.offerDays,
      ageCutoffOn: input.ageCutoffOn,
      minAgeMonths: input.minAgeMonths,
      maxAgeMonths: input.maxAgeMonths,
      priorities: input.priorities,
      letters: input.letters,
    };
    await requireLetters(context, input.letters);
    if (input.id) {
      const before = await intakeOf(context, input.id);
      if (
        before.schoolYearId !== input.schoolYearId ||
        before.gradeId !== input.gradeId
      )
        throw new ORPCError("BAD_REQUEST", { message: "intake.fixed" });
      const version = await updateIntake(context.tx, {
        ...org(context),
        id: input.id,
        expectedVersion: input.expectedVersion,
        ...fields,
      });
      if (version === null) throw conflict();
      await audit(context, {
        action: "admission_intake.update",
        objectType: "admission_intake",
        objectId: input.id,
        change: {
          table: "core.admission_intakes",
          before: {
            opensOn: before.opensOn,
            closesOn: before.closesOn,
            capacity: before.capacity,
            formId: before.formId,
            checklist: before.checklist,
            currency: before.currency,
            fees: before.fees,
            decisionsOn: before.decisionsOn,
            offerDays: before.offerDays,
            ageCutoffOn: before.ageCutoffOn,
            minAgeMonths: before.minAgeMonths,
            maxAgeMonths: before.maxAgeMonths,
            priorities: before.priorities,
            letters: before.letters,
          },
          after: fields,
        },
      });
      return { id: input.id, version };
    }
    const years = await entryYears(context);
    if (!years.some((year) => year.id === input.schoolYearId))
      throw new ORPCError("BAD_REQUEST", { message: "intake.year" });
    if (!(await grades(context)).some((grade) => grade.id === input.gradeId))
      throw new ORPCError("BAD_REQUEST", { message: "intake.grade" });
    const created = await insertIntake(context.tx, {
      ...org(context),
      schoolYearId: input.schoolYearId,
      gradeId: input.gradeId,
      ...fields,
    });
    await audit(context, {
      action: "admission_intake.create",
      objectType: "admission_intake",
      objectId: created.id,
      change: {
        table: "core.admission_intakes",
        before: null,
        after: {
          schoolYearId: input.schoolYearId,
          gradeId: input.gradeId,
          ...fields,
        },
      },
    });
    return created;
  });

/** The school's application forms, each with whether it has changes not yet published. */
export const forms = readProcedure.handler(async ({ context }) => {
  readsAdmissions(context);
  return {
    forms: await formsOf(context.tx, org(context)),
    configures: can(context, "admissions:configure"),
  };
});

export const form = readProcedure
  .input(v.object({ id: v.pipe(v.string(), v.uuid()) }))
  .handler(async ({ input, context }) => {
    readsAdmissions(context);
    return {
      ...(await formOf(context, input.id)),
      configures: can(context, "admissions:configure"),
    };
  });

export const saveForm = writeProcedure
  .input(saveFormSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:configure");
    if (input.id) {
      const before = await formOf(context, input.id);
      const version = await updateForm(context.tx, {
        ...org(context),
        id: input.id,
        expectedVersion: input.expectedVersion,
        nameEn: input.nameEn,
        nameAr: input.nameAr,
        primaryLocale: input.primaryLocale,
        body: input.body,
        translation: input.translation,
      });
      if (version === null) throw conflict();
      await audit(context, {
        action: "admission_form.update",
        objectType: "admission_form",
        objectId: input.id,
        change: changeOf(
          "core.admission_forms",
          {
            nameEn: before.nameEn,
            nameAr: before.nameAr,
            questions: formQuestions(before.body).length,
          },
          {
            nameEn: input.nameEn,
            nameAr: input.nameAr,
            questions: formQuestions(input.body).length,
          },
        ),
      });
      return { id: input.id, version };
    }
    const created = await insertForm(context.tx, {
      ...org(context),
      nameEn: input.nameEn,
      nameAr: input.nameAr,
      primaryLocale: input.primaryLocale,
      body: input.body,
      translation: input.translation,
    });
    await audit(context, {
      action: "admission_form.create",
      objectType: "admission_form",
      objectId: created.id,
      details: { questions: formQuestions(input.body).length },
    });
    return created;
  });

/**
 * Publishes a form as it stands. Applications started from now are answered
 * against it; those already started keep the version they began with.
 */
export const publishForm = writeProcedure
  .input(formRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:configure");
    const current = await formOf(context, input.id);
    const unready = formUnready(current);
    if (unready !== null)
      throw new ORPCError("BAD_REQUEST", {
        message: "form.question_unready",
        data: { questionId: unready },
      });
    if (!current.changed)
      throw new ORPCError("CONFLICT", { message: "form.unchanged" });
    const published = await publishFormRow(context.tx, {
      ...org(context),
      id: current.id,
      expectedVersion: input.expectedVersion,
      userId: context.actor.userId,
    });
    if (!published) throw conflict();
    await audit(context, {
      action: "admission_form.publish",
      objectType: "admission_form",
      objectId: current.id,
      details: { number: published.number, versionId: published.id },
    });
    return published;
  });
