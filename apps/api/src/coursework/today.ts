import {
  learnerAssignments,
  teacherAssignments,
} from "@faridalms/database/stores/coursework";
import { GRACE_MS, learnerState } from "@faridalms/domain/coursework";
import { addDays } from "@faridalms/domain/school";

import type { UnitContext } from "../core/context";

import { classesInView } from "../classes/points";
import { readProcedure, requireCapability } from "../core/procedure";
import { scopeFor } from "../core/reach";
import { learnerOfToday, todaySchema } from "../people/today";

const RECENT_MS = 7 * 86_400_000;

/** A teacher's work waiting to be marked, and what is due this week. */
async function teachingWork(context: UnitContext) {
  const weekEnd = addDays(context.today, 7);
  const work = await teacherAssignments(context.tx, scopeFor(context, "own"), {
    viewed: await classesInView(context),
    classId: "",
    q: "",
    now: context.now,
    graceMs: GRACE_MS,
  });
  const waiting = work
    .filter((row) => row.toGrade > 0)
    .toSorted((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
  const due = work
    .filter(
      (row) =>
        row.state !== "draft" &&
        row.dueAt !== null &&
        row.dueAt.slice(0, 10) >= context.today &&
        row.dueAt.slice(0, 10) < weekEnd,
    )
    .toSorted((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))
    .slice(0, 5);
  return {
    review: waiting.slice(0, 5).map((row) => ({
      id: row.id,
      title: row.title,
      classCode: row.classCode,
      classTitleEn: row.classTitleEn,
      classTitleAr: row.classTitleAr,
      toGrade: row.toGrade,
    })),
    reviewTotal: waiting.reduce((total, row) => total + row.toGrade, 0),
    due: due.map((row) => ({
      id: row.id,
      title: row.title,
      classCode: row.classCode,
      classTitleEn: row.classTitleEn,
      classTitleAr: row.classTitleAr,
      dueAt: row.dueAt,
      handedIn: row.handedIn,
      recipients: row.recipients,
    })),
  };
}

/** A learner's work as it stands today, with what is due this week and what was returned lately. */
async function learnerWork(context: UnitContext, studentId: string) {
  const weekEnd = addDays(context.today, 7);
  const rows = await learnerAssignments(context.tx, {
    tenantId: context.tenantId,
    studentId,
    viewed: await classesInView(context),
  });
  return rows
    .filter(
      (row) =>
        !row.availableFrom ||
        Date.parse(row.availableFrom) <= context.now.getTime(),
    )
    .map((row) => {
      const state = learnerState(
        {
          availableFrom: row.availableFrom,
          dueAt: row.dueAt,
          excused: row.excused,
          needsRevision: row.needsRevision,
          hasDraft: row.hasDraft,
          latestAttempt: row.attemptId ? { isLate: row.isLate } : null,
          released: row.released,
        },
        context.now,
      );
      return {
        assignmentId: row.assignmentId,
        title: row.title,
        classCode: row.classCode,
        classTitleEn: row.classTitleEn,
        classTitleAr: row.classTitleAr,
        dueAt: row.dueAt,
        points: row.points,
        effectiveScore: row.effectiveScore,
        releasedAt: row.releasedAt,
        state,
        dueThisWeek:
          row.dueAt !== null &&
          row.dueAt.slice(0, 10) >= context.today &&
          row.dueAt.slice(0, 10) < weekEnd,
        newResult:
          state === "returned" &&
          row.releasedAt !== null &&
          context.now.getTime() - Date.parse(row.releasedAt) < RECENT_MS,
      };
    });
}

/**
 * Today's coursework for Today: a teacher's work to mark and due this
 * week, or a learner's work, the viewer's own or one they follow.
 */
export const today = readProcedure
  .input(todaySchema)
  .handler(async ({ input, context }) => {
    requireCapability(
      context,
      "assignments:author",
      "submissions:grade",
      "own-work:read",
      "children:read",
    );
    const learner = await learnerOfToday(context, input.studentId);
    return learner
      ? {
          today: context.today,
          review: [],
          reviewTotal: 0,
          due: [],
          work: await learnerWork(context, learner),
        }
      : { today: context.today, ...(await teachingWork(context)), work: [] };
  });
