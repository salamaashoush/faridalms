import { useQuery } from "@tanstack/react-query";

import type { TemplateUse } from "~/components/templates/slots";

import * as m from "~/i18n/messages";
import { sectionTemplateQuery } from "~/queries/templates";

import { SavedSectionPreview } from "./studio/SavedSections";

interface SectionPreviewProps {
  templateId: string;
}

function SectionPreview({ templateId }: SectionPreviewProps) {
  const kept = useQuery(sectionTemplateQuery(templateId)).data;
  return kept ? (
    <SavedSectionPreview saved={kept.section} />
  ) : (
    <div aria-busy="true" className="min-h-40" />
  );
}

/** A section kept for the website, added from the page builder. */
export const SECTION_TEMPLATE: TemplateUse = {
  kind: "section",
  Preview: SectionPreview,
  elsewhere: m.templatesSectionHint,
};
