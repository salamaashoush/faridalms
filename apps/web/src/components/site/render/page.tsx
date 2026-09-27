import type { PageSection, SiteLocale } from "@faridalms/domain/site-sections";
import type { ReactNode } from "react";

import { defaultStyle } from "@faridalms/domain/site-sections";
import { Fragment } from "react";

import type { RenderContext } from "./parts";

import { SiteSection } from "./sections";

export interface ShownSection {
  section: PageSection;
  locale: SiteLocale;
}

const OPENERS = new Set<PageSection["type"]>(["hero", "pageHeader"]);

/** Whether a page's first section already says its title as the one first-level heading. */
export function opensWithTitle(sections: ShownSection[]): boolean {
  const first = sections[0]?.section;
  return Boolean(
    first &&
    OPENERS.has(first.type) &&
    (first.data as { heading: string }).heading.trim(),
  );
}

/** Whether the page opens on a full-bleed picture an overlay header can sit on. */
export function opensOnPicture(sections: ShownSection[]): boolean {
  const first = sections[0]?.section;
  return (
    first?.type === "hero" &&
    first.variant === "fullbleed" &&
    Boolean(first.data.media.fileId)
  );
}

/**
 * A page's sections, each in the language it is shown in. A page that does
 * not open with a hero or page header gets one with its title, so every page
 * has exactly one first-level heading.
 */
export function PageSections({
  sections,
  title,
  context,
  renderSection,
}: {
  sections: ShownSection[];
  title: string;
  context: RenderContext;
  /** The builder wraps each section to select and move it. */
  renderSection?: (
    item: ShownSection,
    index: number,
    rendered: ReactNode,
  ) => ReactNode;
}) {
  const titled = opensWithTitle(sections);
  const header: PageSection = {
    id: "title",
    type: "pageHeader",
    variant: "plain",
    style: { ...defaultStyle(), scheme: "soft", spacing: "s" },
    data: {
      eyebrow: "",
      heading: title,
      text: "",
      media: {
        kind: "image",
        fileId: null,
        alt: "",
        posterFileId: null,
        captionsFileId: null,
      },
    },
  };
  return (
    <>
      {titled || !title ? null : (
        <SiteSection
          section={header}
          shownIn={context.locale}
          context={context}
          first
        />
      )}
      {sections.map((item, index) => {
        const rendered = (
          <SiteSection
            section={item.section}
            shownIn={item.locale}
            context={context}
            first={titled && index === 0}
          />
        );
        return (
          <Fragment key={item.section.id}>
            {renderSection ? renderSection(item, index, rendered) : rendered}
          </Fragment>
        );
      })}
    </>
  );
}
