import type { AudienceInput } from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";

import {
  headedContent,
  plainContent,
} from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { client, login, rejection, sessionFor, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const mother = () =>
  signedIn("northwind", login("student").replace("student", "parent"));

const families: AudienceInput[] = [
  { scope: "families", classId: "", gradeId: "" },
];

/** The level-two headings of a document, in order. */
const headings = (document: ContentDocument | null | undefined) =>
  (document?.root.children ?? [])
    .filter((node) => node.type === "heading")
    .map((node) => node.children?.map((child) => child.text).join("") ?? "");

const story = (
  title: string,
  heading: string,
  arabic?: string,
  body = `${heading} in full.`,
) => ({
  id: "",
  expectedVersion: 0,
  visibility: "school" as const,
  primaryLocale: "en" as const,
  titleEn: title,
  titleAr: "",
  excerptEn: "",
  excerptAr: "",
  slug: `${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-news`,
  categoryId: "",
  coverFileId: "",
  coverAltEn: "",
  coverAltAr: "",
  pinned: false,
  audiences: families,
  body: headedContent([{ heading, body: plainContent(body) }]),
  translation:
    arabic === undefined
      ? null
      : headedContent([
          { heading: arabic, body: plainContent(`${arabic} بالتفصيل.`) },
        ]),
});

describe("reading school news", () => {
  test("a family opens September's news in both languages and the office sees it read", async () => {
    const family = await mother();
    const { rows } = await family.news.list({});
    const september = rows.find(
      (row) => row.titleEn === "September newsletter",
    );
    if (!september) throw new Error("the seed has no September news");
    expect(september.readAt).toBeNull();
    expect(september.recipient).toBe(true);
    expect(september.summary).toContain("From the principal");

    const opened = await family.news.record({ id: september.id });
    expect(headings(opened.body)).toEqual([
      "From the principal",
      "Dates for October",
      "Clubs",
    ]);
    expect(headings(opened.translation)[0]).toBe("كلمة المديرة");
    expect(opened.report).toBeNull();
    expect(opened.translationReview).toBeNull();
    await family.news.seen({ id: september.id });

    const office = await principal();
    const report = await office.news.record({ id: september.id });
    const me = await family.identity.currentUser();
    expect(
      report.report?.find((row) => row.userId === me.id)?.readAt,
    ).not.toBeNull();
    expect(
      (await family.news.list({})).rows.some(
        (row) => row.titleEn === "October newsletter",
      ),
    ).toBe(false);
  });

  test("the list pages past its first posts and sorts by date or title", async () => {
    const office = await principal();
    const tag = crypto.randomUUID().slice(0, 8);
    // One after another, so each goes out after the one before.
    await Array.from({ length: 27 }, (_, index) => index).reduce<
      Promise<unknown>
    >(
      (previous, index) =>
        previous
          .then(() =>
            office.news.save(
              story(`Paged ${tag} ${String(index).padStart(2, "0")}`, "A note"),
            ),
          )
          .then((saved) =>
            office.news.publish({
              id: saved.id,
              expectedVersion: saved.version,
            }),
          ),
      Promise.resolve(),
    );
    const family = await mother();
    const first = await family.news.list({ q: tag });
    expect(first).toMatchObject({ total: 27, page: 1, pages: 2 });
    expect(first.rows).toHaveLength(25);
    const second = await family.news.list({ q: tag, page: 2 });
    expect(second.rows).toHaveLength(2);
    const ids = [...first.rows, ...second.rows].map((row) => row.id);
    expect(new Set(ids).size).toBe(27);
    expect(first.rows[0]?.titleEn).toBe(`Paged ${tag} 26`);

    const byTitle = await family.news.list({
      q: tag,
      sort: "title",
      direction: "asc",
    });
    expect(byTitle.rows.slice(0, 3).map((row) => row.titleEn)).toEqual([
      `Paged ${tag} 00`,
      `Paged ${tag} 01`,
      `Paged ${tag} 02`,
    ]);
    const oldest = await family.news.list({ q: tag, direction: "asc" });
    expect(oldest.rows[0]?.titleEn).toBe(`Paged ${tag} 00`);
  }, 30_000);

  test("school news never reaches the website", async () => {
    const visitor = client("northwind").site;
    const { rows } = await visitor.publicSitePosts({ school: "northwind" });
    expect(rows.some((row) => row.slug === "september-newsletter")).toBe(false);
  });
});

describe("writing school news", () => {
  test("edits to a sent post stay private until it is published again", async () => {
    const office = await principal();
    const saved = await office.news.save(
      story("Sports day", "Sports day is Friday", "يوم الرياضة الجمعة"),
    );
    const sent = await office.news.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect(sent.recipients).toBeGreaterThan(0);

    const changed = await office.news.save({
      ...story(
        "Sports day",
        "Sports day moves to Monday",
        "يوم الرياضة الاثنين",
        "Rain on Friday.",
      ),
      id: saved.id,
      expectedVersion: sent.version,
    });

    const family = await mother();
    const before = await family.news.record({ id: saved.id });
    expect(headings(before.body)).toEqual(["Sports day is Friday"]);
    expect((await office.news.record({ id: saved.id })).changedSince).toBe(
      true,
    );

    await office.news.publish({
      id: saved.id,
      expectedVersion: changed.version,
    });
    const after = await family.news.record({ id: saved.id });
    expect(headings(after.body)).toEqual(["Sports day moves to Monday"]);
    expect(after.updatedAt).not.toBeNull();
  });

  test("a checked translation lapses once either language's words change", async () => {
    const office = await principal();
    const saved = await office.news.save(
      story("Library week", "Library week", "أسبوع المكتبة"),
    );
    const checked = await office.news.review({
      id: saved.id,
      expectedVersion: saved.version,
      reviewed: true,
    });
    expect(checked.review?.current).toBe(true);

    const respaced = await office.news.save({
      ...story("Library week", "Library week", "أسبوع المكتبة"),
      id: saved.id,
      expectedVersion: checked.version,
      body: headedContent([
        {
          heading: "Library  week",
          body: plainContent("Library week in full. "),
        },
      ]),
    });
    expect(
      (await office.news.editor({ id: saved.id })).translationReview?.current,
    ).toBe(true);

    const moved = await office.news.save({
      ...story(
        "Library week",
        "Library week",
        "أسبوع المكتبة",
        "Bring a book to swap.",
      ),
      id: saved.id,
      expectedVersion: respaced.version,
    });
    const stale = await office.news.editor({ id: saved.id });
    expect(stale.translationReview?.current).toBe(false);

    const again = await office.news.review({
      id: saved.id,
      expectedVersion: moved.version,
      reviewed: true,
    });
    expect(again.review?.current).toBe(true);

    await office.news.save({
      ...story(
        "Library week",
        "Library week",
        "أسبوع المكتبة والقراءة",
        "Bring a book to swap.",
      ),
      id: saved.id,
      expectedVersion: again.version,
    });
    expect(
      (await office.news.editor({ id: saved.id })).translationReview,
    ).toBeNull();
  });

  test("an unwritten translation cannot be checked", async () => {
    const office = await principal();
    const saved = await office.news.save({
      ...story("One language", "One language"),
      translation: plainContent(""),
    });
    expect(
      await rejection(
        office.news.review({
          id: saved.id,
          expectedVersion: saved.version,
          reviewed: true,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "news.nothing_to_check" });
  });

  test("a scheduled post waits, and a duplicate starts as a draft in both languages", async () => {
    const office = await principal();
    const written = await office.news.save(
      story("Winter term", "Winter term plans", "خطط الفصل الشتوي"),
    );
    const later = await office.news.review({
      id: written.id,
      expectedVersion: written.version,
      reviewed: true,
    });
    await office.news.publish({
      id: written.id,
      expectedVersion: later.version,
      publishAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    const family = await mother();
    expect(
      (await family.news.list({})).rows.some((row) => row.id === written.id),
    ).toBe(false);
    expect(
      await rejection(family.news.record({ id: written.id })),
    ).toMatchObject({ code: "NOT_FOUND" });

    const copy = await office.news.duplicate({ id: written.id });
    const opened = await office.news.editor({ id: copy.id });
    expect(opened.state).toBe("draft");
    expect(opened.audiences.map((row) => row.scope)).toEqual(["families"]);
    expect(headings(opened.translation)[0]).toBe("خطط الفصل الشتوي");
    expect(opened.translationReview?.current).toBe(true);
  });

  test("a post with nothing written cannot go out", async () => {
    const office = await principal();
    const empty = await office.news.save({
      ...story("Blank", "Blank"),
      body: plainContent(" "),
    });
    expect(
      await rejection(
        office.news.publish({ id: empty.id, expectedVersion: empty.version }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "news.empty" });
  });

  test("school news needs an audience; public news does not", async () => {
    const office = await principal();
    expect(
      await rejection(
        office.news.save({ ...story("Nobody", "Nobody"), audiences: [] }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    const open = await office.news.save({
      ...story("Open day", "Open day"),
      visibility: "public",
      audiences: [],
    });
    expect(open.id).toBeTruthy();
  });

  test("only those who manage news write it", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    expect(
      await rejection(teacher.api.news.save(story("Not mine", "Hello"))),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("public news", () => {
  test("a post without its translation reads on the website in the original language, marked as such", async () => {
    const office = await principal();
    const { categories } = await office.news.options();
    const saved = await office.news.save({
      ...story("Book week", "Book week"),
      visibility: "public",
      audiences: [],
      slug: "book-week",
      categoryId: categories[0]?.id ?? "",
      excerptEn: "Dress as your favourite character.",
      body: plainContent("Book week starts on Sunday."),
    });
    await office.news.publish({ id: saved.id, expectedVersion: saved.version });
    const read = await client("northwind").site.publicSitePost({
      school: "northwind",
      locale: "ar",
      slug: "book-week",
    });
    expect(read.title).toBe("Book week");
    expect(read.bodyLocale).toBe("en");
    const { rows } = await office.news.manage({ tab: "published", q: "book" });
    expect(rows.map((row) => row.slug)).toEqual(["book-week"]);
    const family = await mother();
    expect(
      (await family.news.list({})).rows.find((row) => row.slug === "book-week")
        ?.recipient,
    ).toBe(false);
  });

  test("a post made school-only comes off the website", async () => {
    const office = await principal();
    const saved = await office.news.save({
      ...story("Choir concert", "Choir concert"),
      visibility: "public",
      audiences: [],
      slug: "choir-concert",
    });
    const sent = await office.news.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const visitor = client("northwind").site;
    const before = await visitor.publicSitePosts({ school: "northwind" });
    expect(before.rows.some((row) => row.slug === "choir-concert")).toBe(true);
    const inside = await office.news.save({
      ...story("Choir concert", "Choir concert"),
      slug: "choir-concert",
      id: saved.id,
      expectedVersion: sent.version,
    });
    await office.news.publish({
      id: saved.id,
      expectedVersion: inside.version,
    });
    const after = await visitor.publicSitePosts({ school: "northwind" });
    expect(after.rows.some((row) => row.slug === "choir-concert")).toBe(false);
  });
});
