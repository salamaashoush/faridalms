import type { ContentNode } from "@faridalms/domain/content";
import type { LtiLink } from "@faridalms/domain/lti";

import type { RequestContext } from "../core/context";
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
