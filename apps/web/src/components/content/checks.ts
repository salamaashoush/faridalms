import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentIssue } from "@faridalms/domain/content-checks";

import { contentIssues } from "@faridalms/domain/content-checks";

import * as m from "~/i18n/messages";

const LABEL: Record<ContentIssue, () => string> = {
  alt: m.siteIssueAlt,
  order: m.siteIssueOrder,
  link: m.siteIssueLink,
};

/** What a document needs before it reaches readers, in the writer's words. */
export const contentIssueMessages = (document: ContentDocument): string[] =>
  contentIssues(document).map((code) => LABEL[code]());
