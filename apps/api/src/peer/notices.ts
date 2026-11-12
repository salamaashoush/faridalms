import { schoolDate } from "@faridalms/domain/school";

import type { NoticeScope } from "../core/notify";
import type { NoticeAssignment } from "../coursework/notices";

import { notifyIn } from "../core/notify";
import { schoolZone } from "../core/procedure";
import { titlesOf } from "../coursework/notices";

/**
 * Tells reviewers of a classmate's work to review, as reviews are handed
 * out, or reminds those still writing that the reviews are due. Only the
 * students hear: reviewing is between classmates.
 */
export async function tellReviewers(
  scope: NoticeScope,
  assignment: NoticeAssignment,
  reviewDueAt: string | null,
  reviewerIds: readonly string[],
  kind: "handed_out" | "due_soon",
): Promise<number> {
  if (reviewerIds.length === 0) return 0;
  const zone = await schoolZone(scope.tx, scope.schoolId);
  return notifyIn(scope, reviewerIds, {
    kind: "peer_review",
    subject: { type: "assignment", id: assignment.id },
    params: {
      ...titlesOf(assignment),
      ...(kind === "due_soon" ? { dueSoon: true } : {}),
      ...(reviewDueAt ? { date: schoolDate(zone, new Date(reviewDueAt)) } : {}),
    },
  });
}
