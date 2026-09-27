import type { PageSection } from "@faridalms/domain/website";

import { plainContent } from "@faridalms/domain/content-conversion";
import { newSection } from "@faridalms/domain/website";
import { describe, expect, test } from "bun:test";

import {
  client,
  login,
  raw,
  rejection,
  seeded,
  sessionFor,
  signedIn,
} from "./harness";

const visitor = () => client("northwind").site;
const principal = () => sessionFor("northwind", login("principal"));

const PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

const publicMedia = (key: string) =>
  seeded().handler(new Request(`http://api.test/public-media/${key}`));

describe("the public website", () => {
  test("visitors read published pages and posts in their language, never drafts", async () => {
    const site = visitor();
    const shell = await site.publicSite({ school: "northwind", locale: "ar" });
    expect(shell.locale).toBe("ar");
    expect(shell.menu.map((entry) => entry.title)).toEqual([
      "الرئيسية",
      "من نحن",
      "الأكاديمي",
      "القبول",
      "زُرنا",
      "أولياء الأمور",
      "تواصل معنا",
    ]);
    expect(shell.theme.id).toBe("meridian");
    expect(shell.actions.map((action) => action.label)).toEqual([
      "استفسر",
      "زُرنا",
      "قدّم الآن",
    ]);

    const home = await site.publicSitePage({
      school: "northwind",
      locale: "ar",
      slug: "",
    });
    const [hero] = home.sections;
    expect(hero?.section).toMatchObject({
      type: "hero",
      data: { heading: "مدرسة يُعرف فيها كل طفل ويُتحدّى" },
    });
    expect(home.news.map((row) => row.title)).toContain("أهلًا بعودتكم");

    expect(
      await rejection(
        site.publicSitePage({
          school: "northwind",
          locale: "en",
          slug: "no-such-page",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    const news = await site.publicSitePosts({ school: "northwind", locale: "en" });
    expect(news.rows[0]?.title).toBe("Welcome back");
    expect(news.rows.map((row) => row.title)).not.toContain("Sports day");

    const fair = await site.publicSitePost({
      school: "northwind",
      locale: "ar",
      slug: "science-fair",
    });
    expect(fair.title).toBe("الفائزون في معرض العلوم");
    expect(fair.bodyLocale).toBe("ar");

    expect(
      await rejection(site.publicSite({ school: "no-such-school" })),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("a teacher cannot manage the website", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    expect(await rejection(teacher.site.overview())).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("publishing a page", () => {
  test("a picture needs a description in every language, edits stay private until published, and history restores", async () => {
    const { api, token } = await principal();
    const file = await api.files.initiate({
      purpose: "document_media",
      name: "library.png",
      mediaType: "image/png",
      sizeBytes: PIXEL.byteLength,
    });
    const put = await raw("northwind", token, `/v1/files/${file.id}/content`, {
      method: "PUT",
      body: PIXEL,
    });
    expect(put.status).toBe(200);

    const { pages } = await api.site.overview();
    const about = pages.find((row) => row.slug === "about");
    if (!about) throw new Error("the seed has no about page");
    const opened = await api.site.page({ id: about.id });
    const heroId = crypto.randomUUID();
    const blank = newSection("hero");
    const hero = (alt: string, heading = "Our library"): PageSection => ({
      ...blank,
      id: heroId,
      data: {
        ...blank.data,
        heading,
        media: {
          kind: "image",
          fileId: file.id,
          alt,
          posterFileId: null,
          captionsFileId: null,
        },
      },
    });
    const save = (english: string, arabic: string, expectedVersion: number) =>
      api.site.savePage({
        id: about.id,
        expectedVersion,
        parentId: "",
        slug: "about",
        titleEn: "About us",
        titleAr: "من نحن",
        inMenu: true,
        content: {
          sections: [hero(english), ...opened.content.sections],
          description: "",
          reviewed: [],
        },
        translation: {
          sections: [
            hero(arabic, "مكتبتنا"),
            ...(opened.translation?.sections ?? []),
          ],
          description: "",
          reviewed: [],
        },
      });

    let saved = await save("", "", opened.version);
    expect(
      await rejection(
        api.site.publishPage({ id: about.id, expectedVersion: saved.version }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "site.issues" });
    const flagged = await api.site.page({ id: about.id });
    expect(flagged.issues.en).toContainEqual({
      sectionId: heroId,
      code: "alt",
    });
    expect(flagged.issues.ar).toContainEqual({
      sectionId: heroId,
      code: "alt",
    });

    saved = await save(
      "Pupils reading in the library",
      "تلاميذ يقرؤون",
      saved.version,
    );
    const published = await api.site.publishPage({
      id: about.id,
      expectedVersion: saved.version,
    });
    const page = await visitor().publicSitePage({
      school: "northwind",
      locale: "ar",
      slug: "about",
    });
    expect(page.sections[0]?.section).toMatchObject({
      data: {
        heading: "مكتبتنا",
        media: { fileId: file.id, alt: "تلاميذ يقرؤون" },
      },
    });
    const key = page.media[file.id];
    if (!key) throw new Error("the picture was not published");
    const served = await publicMedia(key);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");

    const edited = await api.site.savePage({
      id: about.id,
      expectedVersion: published.version,
      parentId: "",
      slug: "about",
      titleEn: "Who we are",
      titleAr: "من نحن",
      inMenu: true,
      content: {
        sections: [hero("Pupils reading in the library")],
        description: "",
        reviewed: [],
      },
      translation: null,
    });
    const stillPublic = await visitor().publicSitePage({
      school: "northwind",
      locale: "en",
      slug: "about",
    });
    expect(stillPublic.title).toBe("About us");
    expect(stillPublic.sections.length).toBeGreaterThan(1);
    const changed = await api.site.page({ id: about.id });
    expect(changed.revisedAt).not.toBeNull();

    const snapshot = changed.history.find(
      (row) => row.reason === "publish" && row.locale === "en",
    );
    if (!snapshot) throw new Error("no publish snapshot");
    await api.site.restorePage({
      id: about.id,
      locale: "en",
      documentVersion: snapshot.documentVersion,
    });
    const restored = await api.site.page({ id: about.id });
    expect(restored.content.sections.length).toBe(
      opened.content.sections.length + 1,
    );

    await api.site.unpublishPage({
      id: about.id,
      expectedVersion: restored.version,
    });
    expect(
      await rejection(
        visitor().publicSitePage({
          school: "northwind",
          locale: "en",
          slug: "about",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect((await publicMedia(key)).status).toBe(404);
    expect(edited.version).toBeGreaterThan(published.version);
  });
});

describe("publishing a post", () => {
  test("a post without its translation reads in the original language, marked as such", async () => {
    const { api } = await principal();
    const { categories } = await api.site.postOptions();
    const saved = await api.site.savePost({
      id: "",
      expectedVersion: 0,
      categoryId: categories[0]?.id ?? "",
      slug: "book-week",
      titleEn: "Book week",
      titleAr: "",
      excerptEn: "Dress as your favourite character.",
      excerptAr: "",
      coverFileId: "",
      coverAltEn: "",
      coverAltAr: "",
      pinned: false,
      content: {
        body: plainContent("Book week starts on Sunday."),
        reviewed: false,
      },
      translation: null,
    });
    await api.site.publishPost({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const read = await visitor().publicSitePost({
      school: "northwind",
      locale: "ar",
      slug: "book-week",
    });
    expect(read.title).toBe("Book week");
    expect(read.bodyLocale).toBe("en");
    const { rows } = await api.site.posts({ tab: "published", q: "book" });
    expect(rows.map((row) => row.slug)).toEqual(["book-week"]);
  });
});

/** Every page but the one a starter recreates, as it stood. */
const untouched = (
  rows: { id: string; slug: string; state: string; version: number }[],
) =>
  rows
    .filter((row) => row.slug !== "visit")
    .map((row) => [row.id, row.state, row.version]);

describe("starting from a starter", () => {
  test("adds the starter's missing pages as drafts in both languages and takes its theme", async () => {
    const { api } = await principal();
    const before = await api.site.overview();
    const visitBefore = before.pages.find((row) => row.slug === "visit");
    if (!visitBefore) throw new Error("no seeded visit page");
    await api.site.removeSitePage({ id: visitBefore.id });
    const { created } = await api.site.applyStarter({
      starter: "heritage",
      withTheme: true,
    });
    expect(created).toHaveLength(1);
    const after = await api.site.overview();
    const visit = after.pages.find((row) => row.slug === "visit");
    expect(visit?.state).toBe("draft");
    expect(untouched(after.pages)).toEqual(untouched(before.pages));
    expect(after.settings.theme.id).toBe("heritage");
    if (!visit) throw new Error("no visit page");
    const page = await api.site.page({ id: visit.id });
    expect(page.content.sections.length).toBeGreaterThan(0);
    expect(page.gaps.missing).toEqual([]);
  });
});
