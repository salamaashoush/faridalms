import type { PageSection, SiteLocale } from "@faridalms/domain/site-sections";
import type { ReactElement, ReactNode } from "react";

import { siteThemeFor } from "@faridalms/domain/site-brand";
import { SECTION_SPECS, SECTION_TYPES } from "@faridalms/domain/site-sections";
import { buildSection } from "@faridalms/domain/site-templates";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render as mount } from "@testing-library/react";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { RenderContext, TextEditing } from "../render/parts";
import type { SectionTexts } from "./CanvasText";

import { PageSections } from "../render/page";
import { TextEditContext } from "../render/parts";
import { withWords } from "./canvas-text";
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
    data: section.data,
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

  it("names an item's words by the item, and a button's by the button", () => {
    const cards = buildSection("cards", "grid", "en").content;
    const hero = buildSection("hero", "split", "en").content;
    const { getByRole } = render(
      <Studio sections={[cards, hero]} locale="en" />,
    );
    expect(
      getByRole("textbox", { name: "Title, card 2, cards section" }),
    ).toBeTruthy();
    expect(
      getByRole("textbox", {
        name: "Text, card 3, cards section",
      }).getAttribute("aria-multiline"),
    ).toBe("true");
    expect(
      getByRole("textbox", { name: "Button words, button 1, hero section" }),
    ).toBeTruthy();
  });

  it("sends an item's words to the item by its id, not its place", () => {
    const cards = buildSection("cards", "grid", "en").content;
    if (cards.type !== "cards") throw new Error("not cards");
    const [first, second, ...rest] = cards.data.items;
    if (!first || !second) throw new Error("too few cards");
    const section = {
      ...cards,
      data: { ...cards.data, items: [second, first, ...rest] },
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
    const title = getByRole("textbox", {
      name: "Title, card 2, cards section",
    });
    expect(title.textContent).toBe(first.title);
    act(() => {
      title.textContent = "Forest school";
      fireEvent.input(title);
    });
    expect(edit).toHaveBeenLastCalledWith(
      `items.${first.id}.title`,
      "Forest school",
      undefined,
    );
  });

  it("types a button's words where it is drawn, which is no link in the builder", () => {
    const hero = buildSection("hero", "split", "en").content;
    if (hero.type !== "hero") throw new Error("not a hero");
    const [action] = hero.data.actions;
    if (!action) throw new Error("no button");
    const edit = vi.fn<SectionTexts["edit"]>();
    const { getByRole } = render(
      <Typing texts={texts(hero, edit)}>
        <PageSections
          sections={[{ section: hero, locale: "en" }]}
          title=""
          context={{ ...contextIn("en"), editing: true }}
        />
      </Typing>,
    );
    const label = getByRole("textbox", {
      name: "Button words, button 1, hero section",
    });
    expect(label.closest("a")).toBeNull();
    expect(label.closest(".site-button")).toBeTruthy();
    act(() => {
      label.textContent = "Book a visit today";
      fireEvent.input(label);
    });
    expect(edit).toHaveBeenLastCalledWith(
      `actions.${action.id}.label`,
      "Book a visit today",
      undefined,
    );
    act(() => {
      label.textContent = "x".repeat(61);
      fireEvent.input(label);
    });
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it("draws again only the section an item is typed in", () => {
    const typedIn = buildSection("cards", "grid", "en").content;
    const sections = [
      buildSection("hero", "split", "en").content,
      typedIn,
      buildSection("people", "grid", "en").content,
    ];
    const context = contextIn("en");
    // A drawn section is kept, unless one of what it is drawn from changed.
    const drawnFrom = new Map<string, Record<string, unknown>[]>();
    function Page() {
      const [shown, setShown] = useState(sections);
      const edit: SectionTexts["edit"] = (field, value) =>
        setShown((current) =>
          current.map((section) => {
            if (section.id !== typedIn.id) return section;
            const data = withWords(section.data, field, value);
            return data ? ({ ...section, data } as PageSection) : section;
          }),
        );
      return (
        <PageSections
          sections={shown.map((section) => ({ section, locale: "en" }))}
          title=""
          context={context}
          renderSection={(item, _index, rendered) => {
            const props = (rendered as ReactElement<Record<string, unknown>>)
              .props;
            drawnFrom.set(item.section.id, [
              ...(drawnFrom.get(item.section.id) ?? []),
              props,
            ]);
            return item.section.id === typedIn.id ? (
              <Typing texts={texts(item.section, edit)}>{rendered}</Typing>
            ) : (
              rendered
            );
          }}
        />
      );
    }
    const { getByRole } = render(<Page />);
    const title = getByRole("textbox", {
      name: "Title, card 2, cards section",
    });
    act(() => {
      title.textContent = "Forest school";
      fireEvent.input(title);
    });
    expect(title.textContent).toBe("Forest school");
    const changed = (id: string) => {
      const [before, after] = (drawnFrom.get(id) ?? []).slice(-2);
      if (!before || !after) throw new Error("not drawn twice");
      return Object.keys({ ...before, ...after }).filter(
        (key) => !Object.is(before[key], after[key]),
      );
    };
    expect(changed(typedIn.id)).toEqual(["section"]);
    expect(
      sections
        .filter((section) => section.id !== typedIn.id)
        .flatMap((section) => changed(section.id)),
    ).toEqual([]);
  });
});
