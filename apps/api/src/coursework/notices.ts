import type {
  NoticeParams,
  NotificationKind,
} from "@faridalms/domain/notifications";

import { classById } from "@faridalms/database/stores/classes";
import { studentWork } from "@faridalms/database/stores/coursework";
import { schoolDate } from "@faridalms/domain/school";

import type { UnitContext } from "../core/context";
import type { ModuleScope } from "../core/extension";
import type { NoticeScope } from "../core/notify";

import { notifyIn } from "../core/notify";
import { schoolZone } from "../core/procedure";
import { actorsFor } from "../people/acting";

/**
 * Where a teaching notice is written: a unit of work and the school's day,
 * with the modules on there, which say who else hears for a learner.
 */
export type TeachingScope = NoticeScope &
  Pick<ModuleScope, "school" | "extensions"> & { today: string };

export function teachingScope(context: UnitContext): TeachingScope {
  return {
    tx: context.tx,
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    school: context.school,
    extensions: context.extensions,
    actorUserId: context.actor.userId,
    now: context.now,
    channels: context.channels,
    today: context.today,
  };
}

interface Learner {
  studentId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
}

interface Assignment {
  id: string;
  classId: string;
  title: string;
  language: "en" | "ar" | null;
  translationTitle: string | null;
  dueAt: string | null;
}

/** The work's title in each language it has one in, the brief's own first. */
function titlesOf(assignment: Assignment): NoticeParams {
  const other = assignment.translationTitle || undefined;
  return assignment.language === "ar"
    ? { title: other ?? assignment.title, titleAr: assignment.title }
    : { title: assignment.title, titleAr: other ?? assignment.title };
}

async function classNames(
  scope: TeachingScope,
  classId: string,
): Promise<NoticeParams> {
  const row = await classById(scope.tx, scope, classId);
  if (!row) return {};
  return {
    classId: row.id,
    className: row.titleEn ?? row.titleAr ?? row.code,
    classNameAr: row.titleAr ?? row.titleEn ?? row.code,
  };
}

/**
 * Tells the students themselves, then whoever takes the school's notices
 * for each, naming the learner, as one producer: those who act for a
 * learner hear what the learner hears.
 */
async function tellLearners(
  scope: TeachingScope,
  learners: readonly Learner[],
  notice: {
    kind: NotificationKind;
    subject: { type: string; id: string };
    params: NoticeParams;
  },
): Promise<number> {
  const actors = await actorsFor(scope, {
    studentIds: learners.map((learner) => learner.studentId),
    on: scope.today,
    purpose: "notice",
  });
  const families = learners.map((learner) => ({
    learner,
    guardians: [
      ...new Set(
        actors
          .filter((link) => link.studentId === learner.studentId)
          .map((link) => link.userId),
      ),
    ],
  }));
  const told = await Promise.all([
    notifyIn(
      scope,
      learners.map((learner) => learner.studentId),
      notice,
    ),
    ...families
      .filter((family) => family.guardians.length > 0)
      .map(({ learner, guardians }) =>
        notifyIn(scope, guardians, {
          ...notice,
          params: {
            ...notice.params,
            studentId: learner.studentId,
            studentName: learner.fullNameEn ?? learner.fullNameAr ?? "",
            studentNameAr: learner.fullNameAr ?? learner.fullNameEn ?? "",
          },
        }),
      ),
  ]);
  return told.reduce((sum, count) => sum + count, 0);
}

/** Tells everyone the work was set for, and those who hear for them, that it is out. */
export async function tellAssigned(
  scope: TeachingScope,
  assignment: Assignment,
): Promise<number> {
  const [learners, names, zone] = await Promise.all([
    studentWork(scope.tx, {
      tenantId: scope.tenantId,
      assignmentId: assignment.id,
    }),
    classNames(scope, assignment.classId),
    schoolZone(scope.tx, scope.schoolId),
  ]);
  return tellLearners(scope, learners, {
    kind: "assignment",
    subject: { type: "assignment", id: assignment.id },
    params: {
      ...titlesOf(assignment),
      ...names,
      ...(assignment.dueAt
        ? { date: schoolDate(zone, new Date(assignment.dueAt)) }
        : {}),
    },
  });
}

/** Tells students, and those who hear for them, that their work came back marked or for revision. */
export async function tellReturned(
  scope: TeachingScope,
  assignment: Assignment,
  learners: readonly Learner[],
  revise: boolean,
): Promise<number> {
  if (learners.length === 0) return 0;
  return tellLearners(scope, learners, {
    kind: "feedback",
    subject: { type: "assignment", id: assignment.id },
    params: {
      ...titlesOf(assignment),
      ...(await classNames(scope, assignment.classId)),
      ...(revise ? { revise: true } : {}),
    },
  });
}

/** Tells students, and those who hear for them, that a grade held back on returned work is now shown. */
export async function tellGradeShown(
  scope: TeachingScope,
  assignment: Assignment,
  learners: readonly Learner[],
): Promise<number> {
  if (learners.length === 0) return 0;
  return tellLearners(scope, learners, {
    kind: "feedback",
    subject: { type: "assignment", id: assignment.id },
    params: {
      ...titlesOf(assignment),
      ...(await classNames(scope, assignment.classId)),
      gradeShown: true,
    },
  });
}

/** Tells students, and those who hear for them, that a class's grades for a period are out. */
export async function tellPeriodGrades(
  scope: TeachingScope,
  input: {
    classId: string;
    period: { id: string; titleEn: string | null; titleAr: string | null };
    learners: readonly Learner[];
  },
): Promise<number> {
  if (input.learners.length === 0) return 0;
  return tellLearners(scope, input.learners, {
    kind: "grades",
    subject: { type: "grading_period", id: input.period.id },
    params: {
      title: input.period.titleEn ?? input.period.titleAr ?? "",
      titleAr: input.period.titleAr ?? input.period.titleEn ?? "",
      ...(await classNames(scope, input.classId)),
    },
  });
}

/**
 * Tells reviewers of a classmate's work to review, as reviews are handed
 * out, or reminds those still writing that the reviews are due. Only the
 * students hear: reviewing is between classmates.
 */
export async function tellReviewers(
  scope: NoticeScope,
  assignment: Assignment & { peerDueAt: string | null },
  reviewerIds: readonly string[],
  kind: "assignment" | "reminder",
): Promise<number> {
  if (reviewerIds.length === 0) return 0;
  const zone = await schoolZone(scope.tx, scope.schoolId);
  return notifyIn(scope, reviewerIds, {
    kind,
    subject: { type: "assignment", id: assignment.id },
    params: {
      ...titlesOf(assignment),
      peerReview: true,
      ...(assignment.peerDueAt
        ? { date: schoolDate(zone, new Date(assignment.peerDueAt)) }
        : {}),
    },
  });
}
