import type { YearEndStudent } from "@faridalms/database/stores/rollovers";

import type { UnitContext } from "../core/context";

import { notify } from "../core/notify";
import { decidersTold, decidingLearners } from "../people/acting";

/**
 * Who is asked whether each learner returns next year: those who decide
 * for the learner and take the school's notices through a module, and the
 * learner themself once they decide for themself. Where both decide, both
 * may answer; the latest answer stands and the audit log keeps each.
 */
export async function askedAboutReturning(
  context: UnitContext,
  studentIds: readonly string[],
) {
  const [told, deciding] = await Promise.all([
    decidersTold(context, { studentIds, on: context.today }),
    decidingLearners(context, studentIds, context.today),
  ]);
  return [
    ...told.filter((link) => link.linkId !== null),
    ...[...deciding].map((studentId) => ({
      studentId,
      userId: studentId,
      linkId: null,
    })),
  ];
}

/**
 * Sends each learner's question to whoever is asked about them, one notice
 * per learner naming the learner its answer is for; the learner's own
 * notice says it is theirs. Answers how many were sent.
 */
export async function askAboutReturning(
  context: UnitContext,
  input: {
    placed: readonly YearEndStudent[];
    next: { titleEn: string | null; titleAr: string | null };
  },
) {
  const deciding = await askedAboutReturning(
    context,
    input.placed.map((row) => row.studentId),
  );
  let asked = 0;
  for (const student of input.placed) {
    const askedOf = deciding
      .filter((row) => row.studentId === student.studentId)
      .map((row) => row.userId);
    const params = {
      studentId: student.studentId,
      studentName: student.fullNameEn ?? undefined,
      studentNameAr: student.fullNameAr ?? undefined,
      title: input.next.titleEn ?? input.next.titleAr ?? undefined,
      titleAr: input.next.titleAr ?? input.next.titleEn ?? undefined,
    };
    const notice = {
      kind: "reenrolment" as const,
      subject: { type: "student_school_year", id: student.placementId },
      needsAction: true,
    };
    asked += await notify(
      context,
      askedOf.filter((userId) => userId !== student.studentId),
      { ...notice, params },
    );
    if (askedOf.includes(student.studentId))
      asked += await notify(context, [student.studentId], {
        ...notice,
        params: { ...params, own: true },
      });
  }
  return asked;
}
