import type { TranslatedHost } from "@faridalms/database/stores/translations";

import {
  reviewTranslation,
  translationReview,
} from "@faridalms/database/stores/translations";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

import { audit } from "./procedure";

const AUDIT_ACTIONS = {
  news: {
    checked: "news.translation_checked",
    unchecked: "news.translation_unchecked",
  },
  announcement: {
    checked: "announcement.translation_checked",
    unchecked: "announcement.translation_unchecked",
  },
  privacy_notice: {
    checked: "privacy_notice.translation_checked",
    unchecked: "privacy_notice.translation_unchecked",
  },
  lesson: {
    checked: "lesson.translation_checked",
    unchecked: "lesson.translation_unchecked",
  },
  assignment: {
    checked: "assignment.translation_checked",
    unchecked: "assignment.translation_unchecked",
  },
  calendar_event: {
    checked: "calendar_event.translation_checked",
    unchecked: "calendar_event.translation_unchecked",
  },
} as const satisfies Record<
  TranslatedHost,
  { checked: string; unchecked: string }
>;

/**
 * Records that a host's translation was checked against the original as it
 * now reads, or takes the check back, for a caller that has already
 * established the person may change the host. Only a written translation can
 * be checked; `nothingToCheck` is the host's refusal when there is none.
 */
export async function checkTranslation(
  context: UnitContext,
  input: {
    host: TranslatedHost;
    id: string;
    version: number;
    expectedVersion: number;
    reviewed: boolean;
    translated: boolean;
    nothingToCheck: string;
  },
) {
  if (input.version !== input.expectedVersion)
    throw new ORPCError("CONFLICT", { message: "conflict.version" });
  if (input.reviewed && !input.translated)
    throw new ORPCError("CONFLICT", { message: input.nothingToCheck });
  const version = await reviewTranslation(context.tx, {
    tenantId: context.tenantId,
    host: input.host,
    id: input.id,
    userId: context.actor.userId,
    reviewed: input.reviewed,
  });
  await audit(context, {
    action: input.reviewed
      ? AUDIT_ACTIONS[input.host].checked
      : AUDIT_ACTIONS[input.host].unchecked,
    objectType: input.host,
    objectId: input.id,
  });
  return {
    version: version ?? input.version,
    review: await translationReview(context.tx, {
      tenantId: context.tenantId,
      host: input.host,
      id: input.id,
    }),
  };
}
