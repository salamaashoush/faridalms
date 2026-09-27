import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { PageContent, PageSection, SectionOf } from "./website";

import { plainContent } from "./content-conversion";
import {
  fitColumns,
  overlay,
  SECTION_SPECS,
  SECTION_TYPES,
  sectionIssues,
} from "./site-sections";
import {
  buildSection,
  buildTemplate,
  PAGE_TEMPLATE_IDS,
  STARTER_IDS,
  starterChrome,
  STARTERS,
} from "./site-templates";
import {
  contrast,
  resolveTheme,
  schemesOf,
  THEME_IDS,
  THEMES,
} from "./site-theme";
import {
  alignTranslation,
  isSiteHref,
  localizedSections,
  newSection,
  pageIssues,
  pageSectionSchema,
  translationGaps,
  wordless,
} from "./website";

const picture = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b44";

function hero(heading: string, alt: string, label: string): SectionOf<"hero"> {
  const section = newSection("hero");
  return {
    ...section,
    id: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b41",
    data: {
      ...section.data,
      heading,
      media: {
        kind: "image",
        fileId: picture,
        alt,
        posterFileId: null,
        captionsFileId: null,
      },
      actions: [
        {
          id: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b42",
          label,
          href: "/pages/admissions",
        },
      ],
    },
  };
}

function cards(): PageSection {
  const section = newSection("cards");
  return {
    ...section,
    id: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b45",
    data: {
      ...section.data,
      heading: "Explore",
      items: [
        {
          id: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b46",
          title: "Clubs",
          text: "After school",
          image: { fileId: null, alt: "" },
          icon: "star",
          href: "/pages/clubs",
        },
      ],
    },
  };
}

const english: PageContent = {
  sections: [hero("Welcome", "The front gate", "Apply now"), cards()],
  description: "",
  reviewed: [],
};

describe("sections", () => {
  it("validate against their declaration, including every type's first layout", () => {
    for (const section of english.sections)
      expect(v.safeParse(pageSectionSchema, section).success).toBe(true);
    expect(
      v.safeParse(pageSectionSchema, {
        ...english.sections[0],
        variant: "sideways",
      }).success,
    ).toBe(false);
  });
});

describe("the other language of a page", () => {
  it("keeps the original's pictures, links and layout and takes only the words", () => {
    const [original] = english.sections;
    if (!original || original.type !== "hero") throw new Error("hero");
    const arabic = hero("أهلًا", "البوابة", "قدّم الآن");
    const translated = {
      ...arabic,
      variant: "type",
      data: { ...arabic.data, media: { ...arabic.data.media, fileId: null } },
    } as PageSection;
    const aligned = alignTranslation(english, {
      sections: [translated],
      description: "",
      reviewed: [original.id, "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b45"],
    });
    const [first] = aligned.sections;
    expect(first?.variant).toBe("fullbleed");
    expect(first?.data).toMatchObject({
      heading: "أهلًا",
      media: { fileId: picture, alt: "البوابة" },
      actions: [{ label: "قدّم الآن", href: "/pages/admissions" }],
    });
    expect(aligned.reviewed).toEqual([original.id]);
    expect(translationGaps(english, aligned)).toEqual({
      missing: ["0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b45"],
      unreviewed: [],
    });
  });

  it("shows a missing or half-translated section in the original language", () => {
    const [first, second] = english.sections;
    if (!first || !second) throw new Error("sections");
    const partial = wordless(second);
    const shown = localizedSections(
      english,
      {
        sections: [
          first,
          {
            ...partial,
            data: { ...partial.data, heading: "استكشف" },
          } as PageSection,
        ],
        description: "",
        reviewed: [],
      },
      "en",
      "ar",
    );
    expect(shown.map((entry) => entry.locale)).toEqual(["ar", "en"]);
  });
});

describe("checks before publishing", () => {
  it("want a description for every picture and words that say where a button goes", () => {
    const sections = [hero("", " ", "Click here")];
    expect(
      pageIssues(sections)
        .map((issue) => issue.code)
        .toSorted(),
    ).toEqual(["alt", "link"]);
    const text = {
      ...newSection("text"),
      data: { eyebrow: "", heading: "", body: plainContent("Fine words") },
    } as PageSection;
    expect(pageIssues([text])).toEqual([]);
  });

  it("accept paths inside the site and safe addresses, nothing else", () => {
    expect(isSiteHref("/pages/about")).toBe(true);
    expect(isSiteHref("https://example.com/a")).toBe(true);
    expect(isSiteHref("javascript:alert(1)")).toBe(false);
    expect(isSiteHref("/Pages/../x")).toBe(false);
  });
});

describe("themes", () => {
  it("give every scheme of every theme readable text and visible buttons", () => {
    for (const id of THEME_IDS) {
      const schemes = schemesOf(THEMES[id].palette);
      for (const scheme of Object.values(schemes)) {
        expect(contrast(scheme.body, scheme.background)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(
          contrast(scheme.buttonText, scheme.button),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("layer a school's choices over its theme", () => {
    const theme = resolveTheme({
      id: "heritage",
      palette: { primary: "#003366" },
      fonts: {},
      radius: 8,
    });
    expect(theme.palette.primary).toBe("#003366");
    expect(theme.palette.canvas).toBe(THEMES.heritage.palette.canvas);
    expect(theme.radius).toBe(8);
    expect(theme.header).toBe("centered");
  });
});

/** Every link target anywhere in a value, however deeply nested. */
function hrefs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(hrefs);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) =>
    key === "href" && typeof inner === "string" ? [inner] : hrefs(inner),
  );
}

describe("templates", () => {
  it("build valid sections in both languages that line up as a translation", () => {
    for (const template of PAGE_TEMPLATE_IDS) {
      const { content, translation } = buildTemplate(template, "en");
      expect(translation.map((row) => row.id)).toEqual(
        content.map((row) => row.id),
      );
      for (const row of [...content, ...translation])
        expect(v.safeParse(pageSectionSchema, row).success).toBe(true);
      const gaps = translationGaps(
        { sections: content, description: "", reviewed: [] },
        { sections: translation, description: "", reviewed: [] },
      );
      expect(gaps.missing).toEqual([]);
    }
  });

  it("offer a sample of every section in every layout, aligned in both languages", () => {
    for (const type of SECTION_TYPES)
      for (const variant of SECTION_SPECS[type].variants) {
        const { content, translation } = buildSection(
          type,
          variant as never,
          "ar",
        );
        expect(content.variant).toBe(variant);
        expect(translation.id).toBe(content.id);
        for (const row of [content, translation])
          expect(v.safeParse(pageSectionSchema, row).success).toBe(true);
      }
  });

  it("link only to pages the starter creates", () => {
    for (const starter of STARTER_IDS) {
      const { pages } = STARTERS[starter];
      const known = new Set([
        "",
        "/",
        "/news",
        ...pages.map((page) => `/pages/${page.slug}`),
      ]);
      const linked = [
        ...pages.flatMap((page) =>
          hrefs(buildTemplate(page.template, "en").content),
        ),
        ...hrefs(starterChrome(pages)),
      ];
      expect(linked.filter((href) => !known.has(href))).toEqual([]);
    }
  });

  it("give every starter a home page and a theme", () => {
    for (const starter of STARTER_IDS) {
      expect(STARTERS[starter].pages.filter((page) => page.home)).toHaveLength(
        1,
      );
      expect(THEME_IDS).toContain(STARTERS[starter].theme);
    }
  });
});

describe("free-form blocks", () => {
  it("translate block by block, keeping the original's pictures and layout", () => {
    const { content, translation } = buildSection("blocks", "columns", "en");
    if (content.type !== "blocks" || translation.type !== "blocks")
      throw new Error("blocks");
    const withPicture = {
      ...content,
      data: {
        ...content.data,
        columns: content.data.columns.map((column) => ({
          ...column,
          blocks: column.blocks.map((block) =>
            block.type === "image"
              ? {
                  ...block,
                  data: { ...block.data, image: { fileId: picture, alt: "" } },
                }
              : block,
          ),
        })),
      },
    };
    expect(sectionIssues(withPicture)).toContain("alt");
    const shown = overlay(withPicture, translation);
    if (shown.type !== "blocks") throw new Error("blocks");
    const blocks = shown.data.columns.flatMap((column) => column.blocks);
    const heading = blocks.find((block) => block.type === "heading");
    const image = blocks.find((block) => block.type === "image");
    expect(heading?.type === "heading" && heading.data.text).toBe(
      "فصول صغيرة وطموحات كبيرة",
    );
    expect(image?.type === "image" && image.data.image.fileId).toBe(picture);
  });

  it("move the blocks of dropped columns into the last one kept", () => {
    const { content } = buildSection("blocks", "columns", "en");
    if (content.type !== "blocks") throw new Error("blocks");
    const count = content.data.columns.flatMap(
      (column) => column.blocks,
    ).length;
    const one = fitColumns(content.data.columns, "1");
    expect(one).toHaveLength(1);
    expect(one[0]?.blocks).toHaveLength(count);
    expect(fitColumns(content.data.columns, "1-1-1-1")).toHaveLength(4);
  });
});
