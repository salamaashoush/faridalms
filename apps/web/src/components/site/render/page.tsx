import type { PageSection, SiteLocale } from "@faridalms/domain/site-sections";
import type { ReactNode } from "react";

import { defaultStyle } from "@faridalms/domain/site-sections";
import { Fragment } from "react";

import type { RenderContext } from "./parts";

import { fullBleed } from "./parts";
import { hasContent, SiteSection } from "./sections";

export interface ShownSection {
  section: PageSection;
  locale: SiteLocale;
}

const OPENERS = new Set<PageSection["type"]>(["hero", "pageHeader"]);

/** Whether a page's first section already says its title as the one first-level heading. */
export function opensWithTitle(sections: ShownSection[]): boolean {
  const first = sections[0]?.section;
  if (first?.type === "slides")
    return Boolean(first.data.items[0]?.heading.trim());
  return Boolean(
    first &&
    OPENERS.has(first.type) &&
    (first.data as { heading: string }).heading.trim(),
  );
}

/** Whether the page opens on a full-bleed picture, film or artwork an overlay header can sit on. */
export function opensOnPicture(sections: ShownSection[]): boolean {
  const first = sections[0]?.section;
  return first ? fullBleed(first) : false;
}

const EDGE = new Set<PageSection["type"]>(["hero", "slides"]);

/**
 * Whether a section runs on from the one above: the same colour, no
 * picture behind either and no shaped edge between them.
 */
function continues(
  before: PageSection | undefined,
  section: PageSection,
): boolean {
  if (
    !before ||
    EDGE.has(before.type) ||
    EDGE.has(section.type) ||
    fullBleed(before) ||
    fullBleed(section)
  )
    return false;
  return (
    before.style.scheme === section.style.scheme &&
    before.style.background.kind === "none" &&
    section.style.background.kind === "none" &&
    before.style.dividerBottom === "none" &&
    section.style.dividerTop === "none"
  );
}

export interface PageSectionsProps {
  sections: ShownSection[];
  title: string;
  context: RenderContext;
  /** The builder wraps each section to select and move it. */
  renderSection?: (
    item: ShownSection,
    index: number,
    rendered: ReactNode,
  ) => ReactNode;
}

/**
 * A page's sections, each in the language it is shown in, less any with
 * nothing to show a visitor yet. A page that does not open with a hero or
 * page header gets one with its title, so every page has exactly one
 * first-level heading.
 */
export function PageSections({
  sections,
  title,
  context,
  renderSection,
}: PageSectionsProps) {
  const page = sections.map((item) => item.section);
  const shown = sections.filter((item) =>
    hasContent(item.section, page, context),
  );
  const titled = opensWithTitle(shown);
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
      {shown.map((item, index) => {
        const rendered = (
          <SiteSection
            section={item.section}
            shownIn={item.locale}
            context={context}
            first={titled && index === 0}
            joined={continues(shown[index - 1]?.section, item.section)}
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
