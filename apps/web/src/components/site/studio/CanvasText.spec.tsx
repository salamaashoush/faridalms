import type { PageSection, SiteLocale } from "@faridalms/domain/site-sections";
import type { ReactElement, ReactNode } from "react";

import { siteThemeFor } from "@faridalms/domain/site-brand";
import { SECTION_SPECS, SECTION_TYPES } from "@faridalms/domain/site-sections";
import { buildSection } from "@faridalms/domain/site-templates";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render as mount } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { RenderContext, TextEditing } from "../render/parts";
import type { SectionTexts } from "./CanvasText";

import { PageSections } from "../render/page";
import { TextEditContext } from "../render/parts";
import { CanvasText, SectionTextContext } from "./CanvasText";

const contextIn = (locale: SiteLocale): RenderContext => ({
  school: "acme",
  locale,
  theme: siteThemeFor(null, null),
  fileUrl: () => null,
  news: [],
  contact: null,
});

/** Every section type in each of its layouts, with sample words. */
const everySection = (locale: SiteLocale): PageSection[] =>
  SECTION_TYPES.flatMap((type) =>
    SECTION_SPECS[type].variants.map(
      (variant) => buildSection(type, variant as never, locale).content,
    ),
  );

/** A page drawn as the site draws it: with a query cache, as the reader of its words asks. */
const withQueries = (page: ReactElement) => (
  <QueryClientProvider client={new QueryClient()}>{page}</QueryClientProvider>
);

const render = (page: ReactElement) => mount(withQueries(page));

const editing: TextEditing = { Text: CanvasText, holds: () => false };

function texts(
  section: PageSection,
  edit: SectionTexts["edit"] = () => {},
): SectionTexts {
  return {
    type: section.type,
    label: section.type,
    locale: "en",
    edit,
    undo: () => {},
    redo: () => {},
    leave: () => {},
    setActive: () => {},
  };
}

interface TypingProps {
  texts: SectionTexts;
  children: ReactNode;
}

/** A section as the builder draws it once selected: its words take typing. */
function Typing({ texts: section, children }: TypingProps) {
  return (
    <SectionTextContext.Provider value={section}>
      <TextEditContext.Provider value={editing}>
        {children}
      </TextEditContext.Provider>
    </SectionTextContext.Provider>
  );
}

interface StudioProps {
  sections: PageSection[];
  locale: SiteLocale;
}

function Studio({ sections, locale }: StudioProps) {
  return (
    <PageSections
      sections={sections.map((section) => ({ section, locale }))}
      title=""
      context={contextIn(locale)}
      renderSection={(item, _index, rendered) => (
        <Typing texts={texts(item.section)}>{rendered}</Typing>
      )}
    />
  );
}

/**
 * The studio's markup less what it adds for typing, which a visitor never
 * gets: the attributes, and the bare span that holds words sitting inside
 * markup of their own (an announcement's, beside its date).
 */
function withoutTyping(root: HTMLElement): string {
  for (const element of root.querySelectorAll("[data-canvas-text]")) {
    for (const name of [
      "data-canvas-text",
      "role",
      "aria-label",
      "aria-multiline",
      "aria-describedby",
      "aria-keyshortcuts",
      "contenteditable",
      "spellcheck",
    ])
      element.removeAttribute(name);
    element.classList.remove("site-editable");
    if (element.classList.length === 0) element.removeAttribute("class");
    if (element.tagName === "SPAN" && !element.hasAttributes())
      element.replaceWith(...element.childNodes);
  }
  return root.innerHTML;
}

/** A browser's React counts ids across every tree it mounts, so two mounts never share one. */
const sameIds = (html: string) => html.replaceAll(/_r_[0-9a-z]+_/g, "_r_id_");

describe("a page's words typed on the canvas", () => {
  it.each(["en", "ar"] as const)(
    "draw exactly the visitor's markup, in every section and layout (%s)",
    (locale) => {
      const sections = everySection(locale);
      const visitor = render(
        <PageSections
          sections={sections.map((section) => ({ section, locale }))}
          title=""
          context={contextIn(locale)}
        />,
      );
      const seen = visitor.container.innerHTML;
      visitor.unmount();
      const studio = render(<Studio sections={sections} locale={locale} />);
      expect(
        studio.container.querySelectorAll("[data-canvas-text]").length,
      ).toBeGreaterThan(SECTION_TYPES.length);
      expect(sameIds(withoutTyping(studio.container))).toBe(sameIds(seen));
    },
  );

  it("leaves the visitor's HTML as it was where the builder supplies nothing", () => {
    for (const locale of ["en", "ar"] as const) {
      const sections = everySection(locale);
      const page = (
        <PageSections
          sections={sections.map((section) => ({ section, locale }))}
          title="Title"
          context={contextIn(locale)}
        />
      );
      expect(
        renderToStaticMarkup(
          withQueries(
            <TextEditContext.Provider value={null}>
              {page}
            </TextEditContext.Provider>,
          ),
        ),
      ).toBe(renderToStaticMarkup(withQueries(page)));
    }
  });

  it("names each field by what it is and the section it is in", () => {
    const hero = buildSection("hero", "split", "en").content;
    const { getByRole } = render(<Studio sections={[hero]} locale="en" />);
    expect(
      getByRole("textbox", { name: "Heading, hero section" }),
    ).toBeTruthy();
    expect(
      getByRole("textbox", { name: "Text, hero section" }).getAttribute(
        "aria-multiline",
      ),
    ).toBe("true");
  });

  it("sends typed words to the page as stored, asterisks and all", () => {
    const hero = buildSection("hero", "split", "en").content;
    const data = { ...hero.data, heading: "Curious minds, *global* futures" };
    const section = { ...hero, data } as PageSection;
    const edit = vi.fn<SectionTexts["edit"]>();
    const { getByRole } = render(
      <Typing texts={texts(section, edit)}>
        <PageSections
          sections={[{ section, locale: "en" }]}
          title=""
          context={contextIn("en")}
        />
      </Typing>,
    );
    const heading = getByRole("textbox", { name: "Heading, hero section" });
    expect(heading.innerHTML).toBe(
      'Curious minds, <em class="site-em">global</em> futures',
    );
    const em = heading.querySelector("em");
    act(() => {
      if (em) em.textContent = "global, local";
      fireEvent.input(heading);
    });
    expect(edit).toHaveBeenLastCalledWith(
      "heading",
      "Curious minds, *global, local* futures",
      undefined,
    );
  });

  it("refuses words past the field's limit and keeps the ones it had", () => {
    const hero = buildSection("hero", "split", "en").content;
    const section = {
      ...hero,
      data: { ...hero.data, eyebrow: "Open morning" },
    } as PageSection;
    const edit = vi.fn<SectionTexts["edit"]>();
    const { getByRole } = render(
      <Typing texts={texts(section, edit)}>
        <PageSections
          sections={[{ section, locale: "en" }]}
          title=""
          context={contextIn("en")}
        />
      </Typing>,
    );
    const eyebrow = getByRole("textbox", {
      name: "Label above the heading, hero section",
    });
    act(() => {
      eyebrow.textContent = "x".repeat(81);
      fireEvent.input(eyebrow);
    });
    expect(edit).not.toHaveBeenCalled();
    expect(eyebrow.textContent).toBe("Open morning");
    act(() => {
      eyebrow.textContent = "Open\nmorning";
      fireEvent.input(eyebrow);
    });
    expect(edit).toHaveBeenLastCalledWith("eyebrow", "Openmorning", undefined);
  });
});
