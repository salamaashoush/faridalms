import { addDays } from "@faridalms/domain/school";
import { dayOpen } from "@faridalms/domain/school-days";

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

/** The year the school works in today. */
export async function workingYear(api: Api) {
  const { years, workingYearId } = await api.years.options();
  const year = years.find((row) => row.id === workingYearId);
  if (!year) throw new Error("the school has no working year");
  return year;
}

/** A homeroom running for the whole of a year, with the subjects and teachers given. */
export async function newClass(
  api: Api,
  input: {
    yearId: string;
    title: string;
    homeroomTeacherId?: string;
    subjects?: { subjectId: string; teacherIds: string[] }[];
  },
) {
  const [{ grades }, { years }] = await Promise.all([
    api.gradeLevels.options(),
    api.years.options(),
  ]);
  const grade = grades[0];
  if (!grade) throw new Error("the school has no grades");
  const year = years.find((row) => row.id === input.yearId);
  if (!year) throw new Error("the school has no such year");
  const saved = await api.homerooms.save({
    code: `SA-${crypto.randomUUID().slice(0, 6)}`,
    titleEn: input.title,
    titleAr: "",
    homeroomTeacherId: input.homeroomTeacherId ?? "",
    subjects: input.subjects ?? [],
    startsOn: year.startsOn,
    endsOn: addDays(year.endsBefore, -1),
    parts: { year: { yearId: year.id }, grade: { gradeId: grade.id } },
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
  const { startsOn } = await api.years.record({ id: yearId });
  const read = await api.schoolDays.days({ from: startsOn, to: last });
  const marks = new Map(read.days.map((day) => [day.day, day.meaning]));
  const days: string[] = [];
  for (let day = startsOn; day <= last; day = addDays(day, 1))
    if (dayOpen(read, day, marks.get(day) ?? null)) days.push(day);
  return days;
}
