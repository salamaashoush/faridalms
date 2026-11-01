import type { PersonReach } from "@faridalms/database/stores/persons";
import type { Scope } from "@faridalms/database/stores/students";
import type { Capability } from "@faridalms/domain/capabilities";

import {
  reachesClass as storeReachesClass,
  teachesClass as storeTeachesClass,
} from "@faridalms/database/stores/classes";
import { personReach } from "@faridalms/database/stores/persons";
import { reachedStudents } from "@faridalms/database/stores/students";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

import { can } from "./procedure";

/**
 * Which capabilities open the whole school to each kind of work. Without
 * one, a viewer reaches only through their own relationships: the classes
 * they teach, the children they follow, the people they talk to, and
 * themselves. `school` is for a procedure that has already checked a
 * capability over every student, `own` for one that never opens the school.
 */
export const SCHOOL_WIDE = {
  teaching: ["classes:manage"],
  people: ["people:manage"],
  classes: ["classes:manage", "people:manage"],
  consents: ["people:manage", "privacy:manage"],
  support: ["people:manage", "support:manage"],
  registers: ["attendance:manage"],
  attendance: ["attendance:manage", "classes:manage"],
  timetable: ["timetable:manage", "classes:manage"],
  school: "everyone",
  own: [],
} as const satisfies Record<string, readonly Capability[] | "everyone">;

export type ReachScope = keyof typeof SCHOOL_WIDE;

/** The viewer's reach for one kind of work, as the stores' reach rules take it. */
export function scopeFor(context: UnitContext, reach: ReachScope): Scope {
  const opens: readonly Capability[] | "everyone" = SCHOOL_WIDE[reach];
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    viewerId: context.actor.userId,
    schoolWide:
      opens === "everyone" ||
      opens.some((capability) => can(context, capability)),
  };
}

/**
 * Staff are the people signed in as staff, which only someone holding one
 * of the staff roles can be; the stores ask the same of the roles held
 * (`app.is_staff`).
 */
export function isStaff(context: UnitContext): boolean {
  return context.actor.context === "staff";
}

const notFound = () => new ORPCError("NOT_FOUND");

export function studentsReached(
  context: UnitContext,
  reach: ReachScope,
  studentIds: readonly string[],
): Promise<Set<string>> {
  return reachedStudents(context.tx, scopeFor(context, reach), studentIds);
}

export async function reachesStudent(
  context: UnitContext,
  reach: ReachScope,
  studentId: string,
): Promise<boolean> {
  return (await studentsReached(context, reach, [studentId])).has(studentId);
}

/** A student the viewer reaches, or not found, so a URL never tells that one exists. */
export async function requireStudent(
  context: UnitContext,
  reach: ReachScope,
  studentId: string,
): Promise<void> {
  if (!(await reachesStudent(context, reach, studentId))) throw notFound();
}

/** Whether the viewer may open the class on a day: one they or a child they follow is in, or any with school-wide reach. */
export function reachesClass(
  context: UnitContext,
  reach: ReachScope,
  classId: string,
  on: string = context.today,
): Promise<boolean> {
  return storeReachesClass(context.tx, scopeFor(context, reach), classId, on);
}

/** Whether the viewer teaches or assists in the class, or has school-wide reach over teaching. */
export function teaches(
  context: UnitContext,
  reach: ReachScope,
  classId: string,
): Promise<boolean> {
  return storeTeachesClass(context.tx, scopeFor(context, reach), classId);
}

export async function requireTaught(
  context: UnitContext,
  reach: ReachScope,
  classId: string,
): Promise<void> {
  if (!(await teaches(context, reach, classId))) throw notFound();
}

/** How far the viewer reaches each of these people; those left out are not reached. */
export function peopleReach(
  context: UnitContext,
  reach: ReachScope,
  userIds: readonly string[],
): Promise<Map<string, PersonReach>> {
  return personReach(context.tx, scopeFor(context, reach), userIds);
}

export async function reachesPerson(
  context: UnitContext,
  reach: ReachScope,
  userId: string,
): Promise<PersonReach | null> {
  return (await peopleReach(context, reach, [userId])).get(userId) ?? null;
}

/** A person whose whole record the viewer reaches, or not found. */
export async function requirePerson(
  context: UnitContext,
  reach: ReachScope,
  userId: string,
): Promise<void> {
  if ((await reachesPerson(context, reach, userId)) !== "record")
    throw notFound();
}

export type RecordLink = "student" | "person" | "profile" | null;

/**
 * Where a person's name leads the viewer: a student's record for staff who
 * read students and reach that one, otherwise the person's record or their
 * limited profile, as far as the viewer reaches them; nowhere when they do
 * not. Showing the name grants nothing.
 */
export async function recordLinks(
  context: UnitContext,
  userIds: readonly (string | null)[],
): Promise<(userId: string | null) => RecordLink> {
  const ids = [
    ...new Set(
      userIds.filter(
        (userId): userId is string =>
          userId !== null && userId !== context.actor.userId,
      ),
    ),
  ];
  const readsStudents =
    can(context, "people:read") || can(context, "people:manage");
  const [people, students] = await Promise.all([
    peopleReach(context, "people", ids),
    readsStudents
      ? studentsReached(context, "people", ids)
      : Promise.resolve(new Set<string>()),
  ]);
  return (userId) =>
    userId === null || userId === context.actor.userId
      ? null
      : students.has(userId)
        ? "student"
        : people.get(userId) === "record"
          ? "person"
          : people.has(userId)
            ? "profile"
            : null;
}
