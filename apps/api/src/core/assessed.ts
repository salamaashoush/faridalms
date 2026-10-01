import type { ContentDocument } from "@faridalms/domain/content";

import {
  authenticationsOf,
  courseworkOf,
  declarationsOf,
  examSessionById,
} from "@faridalms/database/stores/exams";
import { filesOfHosts } from "@faridalms/database/stores/files";
import { aiUseGaps, aiUsesOf } from "@faridalms/domain/content";

import type { UnitContext } from "./context";

/**
 * What handing in an assignment set as assessed coursework asks: the
 * session's rules, read as the work is handed in.
 */
export async function assessedRules(
  context: UnitContext,
  assignmentId: string,
) {
  const coursework = await courseworkOf(context.tx, {
    tenantId: context.tenantId,
    assignmentId,
  });
  if (!coursework) return null;
  const session = await examSessionById(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    id: coursework.sessionId,
    retired: true,
  });
  return {
    coursework,
    declarationRequired: session?.declarationRequired ?? true,
    aiEvidenceRequired: session?.aiEvidenceRequired ?? true,
  };
}

/**
 * Why a declaration cannot stand against the work it covers: a student who
 * says they used AI acknowledges it in the work, fully, and one who says
 * they did not has no acknowledgement in it.
 */
export function declarationProblem(
  content: ContentDocument | null,
  aiUsed: boolean,
  evidenceRequired: boolean,
): string | null {
  const uses = content ? aiUsesOf(content) : [];
  if (!aiUsed) return uses.length ? "coursework.ai_use_in_work" : null;
  if (!uses.length) return "coursework.ai_use_missing";
  return uses.some((node) => aiUseGaps(node, evidenceRequired).length)
    ? "coursework.ai_use_incomplete"
    : null;
}

/** The attempts whose teacher has confirmed them, which are final. */
export async function confirmedAttempts(
  context: UnitContext,
  attemptIds: readonly string[],
): Promise<Set<string>> {
  const rows = await authenticationsOf(context.tx, {
    tenantId: context.tenantId,
    attemptIds,
  });
  return new Set(
    rows
      .filter((row) => row.outcome === "confirmed")
      .map((row) => row.attemptId),
  );
}

export interface AttemptMarks {
  declaration: {
    kind: "student" | "paper";
    aiUsed: boolean | null;
    declaredAt: string;
    scan: { id: string; name: string } | null;
  } | null;
  authentication: {
    outcome: "confirmed" | "not_confirmed";
    note: string | null;
    teacherEn: string | null;
    teacherAr: string | null;
    at: string;
  } | null;
}

/**
 * Each attempt's declaration and its teacher's word, read once for every
 * view of assessed coursework: the teacher's work list, the grading sheet
 * and the exams officer's list.
 */
export async function attemptMarks(
  context: UnitContext,
  attemptIds: readonly string[],
): Promise<Map<string, AttemptMarks>> {
  const scope = { tenantId: context.tenantId, attemptIds };
  const [declarations, authentications] = await Promise.all([
    declarationsOf(context.tx, scope),
    authenticationsOf(context.tx, scope),
  ]);
  const scans = await filesOfHosts(context.tx, context.tenantId, {
    type: "attempt_declaration",
    ids: declarations.map((row) => row.id),
  });
  return new Map(
    attemptIds.map((attemptId) => {
      const declaration = declarations.find(
        (item) => item.attemptId === attemptId,
      );
      const authentication = authentications.find(
        (item) => item.attemptId === attemptId,
      );
      const scan = declaration
        ? scans.find((file) => file.hostId === declaration.id)
        : undefined;
      return [
        attemptId,
        {
          declaration: declaration
            ? {
                kind: declaration.kind,
                aiUsed: declaration.aiUsed,
                declaredAt: declaration.declaredAt,
                scan: scan ? { id: scan.id, name: scan.name } : null,
              }
            : null,
          authentication: authentication
            ? {
                outcome: authentication.outcome,
                note: authentication.note,
                teacherEn: authentication.teacherNameEn,
                teacherAr: authentication.teacherNameAr,
                at: authentication.at,
              }
            : null,
        },
      ];
    }),
  );
}
