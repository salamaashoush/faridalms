import type { ContentDocument } from "@faridalms/domain/content";
import type { PublishIssue } from "@faridalms/domain/content-checks";

import { publishIssues } from "@faridalms/domain/content-checks";

import * as m from "~/i18n/messages";

const LABEL: Record<PublishIssue, () => string> = {
  alt: m.siteIssueAlt,
  order: m.siteIssueOrder,
  link: m.siteIssueLink,
  heading: m.siteIssueHeading,
  captions: m.contentIssueCaptions,
  unreviewed: m.contentIssueUnreviewed,
  consent: m.contentErrConsent,
};

/** What a document needs before it reaches readers, by the one check list, in the writer's words. */
export const contentIssueMessages = (document: ContentDocument): string[] =>
  publishIssues(document).map((code) => LABEL[code]());
