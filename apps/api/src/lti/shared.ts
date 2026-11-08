import type { CellTransaction } from "@faridalms/database/context";
import type { LtiCourse } from "@faridalms/database/stores/lti";
import type { ContentNode } from "@faridalms/domain/content";
import type { LtiLink } from "@faridalms/domain/lti";

import { classById } from "@faridalms/database/stores/classes";
import { moduleById } from "@faridalms/database/stores/learning";

import type { RequestContext, SchoolContext } from "../core/context";
import type { LtiSecrets } from "./crypto";

import { ltiSecrets } from "./crypto";

const secretsOf = new WeakMap<Uint8Array, LtiSecrets>();
export const secretsFor = (context: RequestContext) => {
  let found = secretsOf.get(context.cellSecret);
  if (!found) {
    found = ltiSecrets(context.cellSecret);
    secretsOf.set(context.cellSecret, found);
  }
  return found;
};

/** The school's address as tools know it, which every message names. */
export const issuerOf = (school: { appHost: string }) =>
  `https://${school.appHost}/lti`;

export const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export const refused = (status: number, code: string) =>
  Response.json({ code }, { status });

/**
 * A link's id as tools know it: its place, the lesson or brief, with its
 * own id there, so a link copied into another lesson is another link, as
 * LTI asks.
 */
export const resourceLinkId = (hostId: string, linkId: string) =>
  `${hostId}:${linkId}`;

/** A link to an outside tool in a document, found by its id. */
export function findLink(
  content: Record<string, unknown> | undefined,
  linkId: string,
): LtiLink | null {
  const pending = [
    ...((content?.root as ContentNode | undefined)?.children ?? []),
  ];
  for (let node = pending.shift(); node; node = pending.shift()) {
    if (node.type === "lti" && node.lti?.linkId === linkId) return node.lti;
    if (node.children) pending.push(...node.children);
  }
  return null;
}

/** A course's id and title as tools are told them. */
export async function courseNamed(
  tx: CellTransaction,
  context: SchoolContext,
  course: LtiCourse,
): Promise<{ id: string; title: string } | null> {
  if ("moduleId" in course) {
    const module = await moduleById(
      tx,
      context.school.tenantId,
      course.moduleId,
    );
    return module ? { id: module.id, title: module.title } : null;
  }
  const taught = await classById(
    tx,
    { tenantId: context.school.tenantId, schoolId: context.school.schoolId },
    course.classId,
  );
  return taught
    ? { id: taught.id, title: taught.titleEn ?? taught.titleAr ?? taught.code }
    : null;
}
