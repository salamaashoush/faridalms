import type { ContentDocument } from "@faridalms/domain/content";

import {
  authenticationsOf,
  courseworkOf,
  examSessionById,
} from "@faridalms/database/stores/exams";
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
