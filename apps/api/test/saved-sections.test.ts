import type { PageSection } from "@faridalms/domain/website";

import { plainContent } from "@faridalms/domain/content-conversion";
import { savedSectionOf } from "@faridalms/domain/saved-sections";
import { blankPage, newSection } from "@faridalms/domain/website";
import { describe, expect, test } from "bun:test";

import { client, login, rejection, sessionFor } from "./harness";

const visitor = () => client("northwind").site;
const principal = () => sessionFor("northwind", login("principal"));

function textSection(heading: string, words: string): PageSection {
  const section = newSection("text");
  return {
    ...section,
    data: { ...section.data, heading, body: plainContent(words) },
  };
}

/** A hero whose button leads nowhere, which publishing refuses. */
function unfinished(): PageSection {
  const hero = newSection("hero");
  return {
    ...hero,
    data: {
      ...hero.data,
      heading: "Open mornings",
      actions: [{ id: crypto.randomUUID(), label: "Book", href: "" }],
    },
  };
}

const headings = (sections: { section: PageSection }[]) =>
  sections.map((item) => (item.section.data as { heading?: string }).heading);

describe("saved sections", () => {
  test("a shared section is kept once, drawn on every page and changed everywhere, published pages too", async () => {
    const { api } = await principal();
    const slug = `open-days-${crypto.randomUUID().slice(0, 8)}`;
    const welcome = textSection("Welcome", "Our school in brief.");
    const band = textSection("Open mornings", "Every Tuesday at nine.");
    const created = await api.site.savePage({
      id: "",
      expectedVersion: 0,
      parentId: "",
      slug,
      titleEn: "Open days",
      titleAr: "الأيام المفتوحة",
      inMenu: false,
      content: blankPage([welcome, band]),
      translation: null,
    });

    const kept = await api.shared.saveSection({
      id: "",
      expectedVersion: 0,
      title: "Open mornings band",
      scope: "school",
      section: savedSectionOf(band, null, "en"),
    });
    const opened = await api.site.page({ id: created.id });
    const named = opened.content.sections.map((section) =>
      section.id === band.id ? { ...section, shared: kept.id } : section,
    );
    const saved = await api.site.savePage({
      id: created.id,
      expectedVersion: opened.version,
      parentId: "",
      slug,
      titleEn: "Open days",
      titleAr: "الأيام المفتوحة",
      inMenu: false,
      content: { ...opened.content, sections: named },
      translation: opened.translation,
    });
    const shown = await api.site.page({ id: created.id });
    expect(shown.shared.sections).toMatchObject([
      { id: kept.id, title: "Open mornings band", editable: true },
    ]);
    await api.site.publishPage({
      id: created.id,
      expectedVersion: saved.version,
    });
    const read = () =>
      visitor().publicSitePage({ school: "northwind", locale: "en", slug });
    expect(headings((await read()).sections)).toEqual([
      "Welcome",
      "Open mornings",
    ]);

    // The builder's copy on the page cannot change the shared section.
    const meddled = await api.site.page({ id: created.id });
    await api.site.savePage({
      id: created.id,
      expectedVersion: meddled.version,
      parentId: "",
      slug,
      titleEn: "Open days",
      titleAr: "الأيام المفتوحة",
      inMenu: false,
      content: {
        ...meddled.content,
        sections: meddled.content.sections.map((section) =>
          section.shared
            ? ({
                ...section,
                data: { ...section.data, heading: "Changed on the page" },
              } as PageSection)
            : section,
        ),
      },
      translation: meddled.translation,
    });
    expect(
      headings(
        (await api.site.page({ id: created.id })).content.sections.map(
          (section) => ({ section }),
        ),
      ),
    ).toEqual(["Welcome", "Open mornings"]);

    // Changed where it is shared, it reaches the published page at once,
    // and the sitemap says the page changed.
    const before = await visitor().publicSitemap({ school: "northwind" });
    const lastmod = (sitemap: typeof before) =>
      sitemap.entries.find((entry) => entry.path === `/pages/${slug}`)
        ?.locales[0]?.lastmod ?? "";
    await api.shared.saveSection({
      id: kept.id,
      expectedVersion: kept.version,
      title: "Open mornings band",
      scope: "school",
      section: savedSectionOf(
        textSection("Open mornings, now on Thursdays", "Every Thursday."),
        null,
        "en",
      ),
    });
    expect(headings((await read()).sections)).toEqual([
      "Welcome",
      "Open mornings, now on Thursdays",
    ]);
    const after = await visitor().publicSitemap({ school: "northwind" });
    expect(lastmod(after) > lastmod(before)).toBe(true);
    expect(await api.shared.uses({ id: kept.id })).toMatchObject([
      { hostType: "site_page", hostId: created.id, live: true },
    ]);

    // A change a published page could not carry is refused.
    const unsaid = await api.shared.section({ id: kept.id });
    expect(
      await rejection(
        api.shared.saveSection({
          id: kept.id,
          expectedVersion: unsaid.version,
          title: "Open mornings band",
          scope: "school",
          section: savedSectionOf(unfinished(), null, "en"),
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "site.issues" });

    // Taken out, it leaves the published page at once and shows as gone.
    await api.shared.remove({ id: kept.id });
    expect(headings((await read()).sections)).toEqual(["Welcome"]);
    expect((await api.site.page({ id: created.id })).shared).toMatchObject({
      sections: [],
      gone: [band.id],
    });
    await api.site.removeSitePage({ id: created.id });
  });

  test("only those who manage the website keep or see shared sections", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.api.shared.list({ kind: "section", search: "", scope: "all" }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      await rejection(
        teacher.api.shared.saveSection({
          id: "",
          expectedVersion: 0,
          title: "Mine",
          scope: "mine",
          section: savedSectionOf(textSection("A", "B."), null, "en"),
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    // A shared section never stands in a document as a block.
    const { api } = await principal();
    const kept = await api.shared.saveSection({
      id: "",
      expectedVersion: 0,
      title: "Contact strip",
      scope: "mine",
      section: savedSectionOf(textSection("Call us", "Any day."), null, "en"),
    });
    expect(await rejection(api.shared.read({ id: kept.id }))).toMatchObject({
      code: "NOT_FOUND",
    });
    const blocks = await api.shared.list({ search: "", scope: "all" });
    expect(blocks.rows.some((row) => row.id === kept.id)).toBe(false);
    const sections = await api.shared.list({
      kind: "section",
      search: "",
      scope: "all",
    });
    expect(sections.rows.some((row) => row.id === kept.id)).toBe(true);
    await api.shared.remove({ id: kept.id });
  });

  test("a section template is kept in both languages and started from as a copy", async () => {
    const { api } = await principal();
    const english = textSection("Our values", "Kindness and curiosity.");
    const arabic = {
      ...english,
      data: {
        ...english.data,
        heading: "قيمنا",
        body: plainContent("اللطف وحب الاستطلاع."),
      },
    } as PageSection;
    const kept = await api.templates.saveSection({
      title: "Values",
      description: "For the about page",
      section: savedSectionOf(english, arabic, "en"),
    });
    const listed = await api.templates.list({ kind: "section" });
    expect(listed.find((row) => row.id === kept.id)).toMatchObject({
      kind: "section",
      title: "Values",
    });
    const opened = await api.templates.openSection({ id: kept.id });
    expect(opened.section.translation?.data).toMatchObject({
      heading: "قيمنا",
    });
    expect(await rejection(api.templates.open({ id: kept.id }))).toMatchObject({
      code: "NOT_FOUND",
    });
    const teacher = await sessionFor("northwind", login("teacher"));
    expect(
      await rejection(teacher.api.templates.openSection({ id: kept.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    await api.templates.remove({ id: kept.id });
  });
});
