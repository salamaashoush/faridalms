import { SCHOOL_DAY_MEANINGS } from "@faridalms/domain/calendar";

import type { Api } from "./api";

/** Awaits a call that must fail and returns what it threw. */
export async function refusal(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error("The call succeeded but was expected to fail");
}

export const names = (given: string, family: string) => ({
  en: { given, middle: "", family },
  ar: { given: "سلامة", middle: "", family: "عشوش" },
});

const mobile = () =>
  `010${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

/** A student of the school's own, placed nowhere, with a mother who has no account. */
export async function newStudent(api: Api, family: string) {
  const options = await api.people.options();
  const mother = options.relations.find((row) => row.code === "mother");
  if (!mother) throw new Error("the school has no mother relation");
  const reference = `SA-${crypto.randomUUID().slice(0, 8)}`;
  const saved = await api.people.saveStudent({
    names: names("Salama", family),
    reference,
    guardians: [
      {
        person: { names: names("Mona", family), phone: mobile() },
        flags: {
          relationId: mother.id,
          legalGuardian: true,
          portalAccess: false,
          receivesNotifications: false,
          primaryContact: true,
          emergencyContact: true,
          residence: "primary",
          pickup: "allowed",
        },
      },
    ],
  });
  return { id: saved.id, reference, name: `Salama ${family}` };
}

/** A homeroom of a year, with the subjects and teachers given. */
export async function newClass(
  api: Api,
  input: {
    yearId: string;
    title: string;
    homeroomTeacherId?: string;
    subjects?: { subjectId: string; teacherIds: string[] }[];
  },
) {
  const options = await api.classes.options();
  const grade = options.grades[0];
  if (!grade) throw new Error("the school has no grades");
  const saved = await api.classes.save({
    yearId: input.yearId,
    code: `SA-${crypto.randomUUID().slice(0, 6)}`,
    titleEn: input.title,
    titleAr: "",
    gradeId: grade.id,
    homeroomTeacherId: input.homeroomTeacherId ?? "",
    subjects: input.subjects ?? [],
  });
  return { id: saved.id, title: input.title };
}

/** A school year of the school's own, with no terms. */
export async function newYear(
  api: Api,
  input: { title: string; startsOn: string; endsOn: string },
) {
  return api.years.save({
    titleEn: input.title,
    titleAr: input.title,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    terms: [],
  });
}

/** The school days of a year up to and including a day, earliest first. */
export async function schoolDaysTo(api: Api, yearId: string, last: string) {
  const { days } = await api.years.days({ id: yearId });
  return days
    .filter(
      (day) => day.day <= last && SCHOOL_DAY_MEANINGS.includes(day.meaning),
    )
    .map((day) => day.day);
}
