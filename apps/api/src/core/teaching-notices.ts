import type {
  NoticeParams,
  NotificationKind,
} from "@faridalms/domain/notifications";

import { classById } from "@faridalms/database/stores/classes";
import { studentWork } from "@faridalms/database/stores/coursework";
import { noticeGuardians } from "@faridalms/database/stores/messages";
import { schoolDate } from "@faridalms/domain/school";

import type { UnitContext } from "./context";
import type { NoticeScope } from "./notify";

import { notifyIn } from "./notify";
import { schoolZone } from "./procedure";

/** Where a teaching notice is written: a unit of work and the school's day. */
export type TeachingScope = NoticeScope & { today: string };

export function teachingScope(context: UnitContext): TeachingScope {
  return {
    tx: context.tx,
    tenantId: context.tenantId,
    schoolId: context.schoolId,
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
 * Tells the students themselves, then each one's guardians who take
 * notices, naming the child, as one producer: the child's family hears what
 * the child hears.
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
  const families = await Promise.all(
    learners.map(async (learner) => ({
      learner,
      guardians: await noticeGuardians(scope.tx, {
        tenantId: scope.tenantId,
        studentId: learner.studentId,
        on: scope.today,
      }),
    })),
  );
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

/** Tells everyone the work was set for, and their families, that it is out. */
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

/** Tells students, and their families, that their work came back marked or for revision. */
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

/** Tells students, and their families, that a class's grades for a period are out. */
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
