import type { AudienceInput } from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";

import {
  headedContent,
  plainContent,
} from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, rejection, sessionFor, signedIn } from "./harness";

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

const edition = (
  title: string,
  heading: string,
  arabic?: string,
  body = `${heading} in full.`,
) => ({
  id: "",
  expectedVersion: 0,
  title,
  primaryLocale: "en" as const,
  bilingual: arabic !== undefined,
  audiences: families,
  body: headedContent([{ heading, body: plainContent(body) }]),
  translation:
    arabic === undefined
      ? null
      : headedContent([
          { heading: arabic, body: plainContent(`${arabic} بالتفصيل.`) },
        ]),
});

describe("reading newsletters", () => {
  test("a family opens September's edition in both languages and the office sees it read", async () => {
    const family = await mother();
    const { rows } = await family.newsletters.list({});
    const september = rows.find((row) => row.title === "September newsletter");
    if (!september) throw new Error("the seed has no September edition");
    expect(september.readAt).toBeNull();
    expect(september.summary).toContain("From the principal");

    const opened = await family.newsletters.record({ id: september.id });
    expect(headings(opened.body)).toEqual([
      "From the principal",
      "Dates for October",
      "Clubs",
    ]);
    expect(headings(opened.translation)[0]).toBe("كلمة المديرة");
    expect(opened.report).toBeNull();
    expect(opened.translationReview).toBeNull();
    await family.newsletters.seen({ id: september.id });

    const office = await principal();
    const report = await office.newsletters.record({ id: september.id });
    const me = await family.identity.currentUser();
    expect(
      report.report?.find((row) => row.userId === me.id)?.readAt,
    ).not.toBeNull();
    expect(
      (await family.newsletters.list({})).rows.some(
        (row) => row.title === "October newsletter",
      ),
    ).toBe(false);
  });
});

describe("writing newsletters", () => {
  test("edits to a sent edition stay private until it is published again", async () => {
    const office = await principal();
    const saved = await office.newsletters.save(
      edition("Sports day", "Sports day is Friday", "يوم الرياضة الجمعة"),
    );
    const sent = await office.newsletters.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect(sent.recipients).toBeGreaterThan(0);

    const changed = await office.newsletters.save({
      ...edition(
        "Sports day",
        "Sports day moves to Monday",
        "يوم الرياضة الاثنين",
        "Rain on Friday.",
      ),
      id: saved.id,
      expectedVersion: sent.version,
    });

    const family = await mother();
    const before = await family.newsletters.record({ id: saved.id });
    expect(headings(before.body)).toEqual(["Sports day is Friday"]);
    expect(
      (await office.newsletters.record({ id: saved.id })).changedSince,
    ).toBe(true);

    await office.newsletters.publish({
      id: saved.id,
      expectedVersion: changed.version,
    });
    const after = await family.newsletters.record({ id: saved.id });
    expect(headings(after.body)).toEqual(["Sports day moves to Monday"]);
    expect(after.revisedAt).not.toBeNull();
  });

  test("a checked translation lapses once either language's words change", async () => {
    const office = await principal();
    const saved = await office.newsletters.save(
      edition("Library week", "Library week", "أسبوع المكتبة"),
    );
    const checked = await office.newsletters.review({
      id: saved.id,
      expectedVersion: saved.version,
      reviewed: true,
    });
    expect(checked.review?.current).toBe(true);

    const respaced = await office.newsletters.save({
      ...edition("Library week", "Library week", "أسبوع المكتبة"),
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
      (await office.newsletters.editor({ id: saved.id })).translationReview
        ?.current,
    ).toBe(true);

    const moved = await office.newsletters.save({
      ...edition(
        "Library week",
        "Library week",
        "أسبوع المكتبة",
        "Bring a book to swap.",
      ),
      id: saved.id,
      expectedVersion: respaced.version,
    });
    const stale = await office.newsletters.editor({ id: saved.id });
    expect(stale.translationReview?.current).toBe(false);

    const again = await office.newsletters.review({
      id: saved.id,
      expectedVersion: moved.version,
      reviewed: true,
    });
    expect(again.review?.current).toBe(true);

    await office.newsletters.save({
      ...edition(
        "Library week",
        "Library week",
        "أسبوع المكتبة والقراءة",
        "Bring a book to swap.",
      ),
      id: saved.id,
      expectedVersion: again.version,
    });
    expect(
      (await office.newsletters.editor({ id: saved.id })).translationReview,
    ).toBeNull();
  });

  test("an unwritten translation cannot be checked", async () => {
    const office = await principal();
    const saved = await office.newsletters.save({
      ...edition("One language", "One language", ""),
      translation: plainContent(""),
    });
    expect(
      await rejection(
        office.newsletters.review({
          id: saved.id,
          expectedVersion: saved.version,
          reviewed: true,
        }),
      ),
    ).toMatchObject({
      code: "CONFLICT",
      message: "newsletters.nothing_to_check",
    });
  });

  test("a scheduled edition waits, and a duplicate starts as a draft in both languages", async () => {
    const office = await principal();
    const written = await office.newsletters.save(
      edition("Winter term", "Winter term plans", "خطط الفصل الشتوي"),
    );
    const later = await office.newsletters.review({
      id: written.id,
      expectedVersion: written.version,
      reviewed: true,
    });
    await office.newsletters.publish({
      id: written.id,
      expectedVersion: later.version,
      publishAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    const family = await mother();
    expect(
      (await family.newsletters.list({})).rows.some(
        (row) => row.id === written.id,
      ),
    ).toBe(false);
    expect(
      await rejection(family.newsletters.record({ id: written.id })),
    ).toMatchObject({ code: "NOT_FOUND" });

    const copy = await office.newsletters.duplicate({ id: written.id });
    const opened = await office.newsletters.editor({ id: copy.id });
    expect(opened.state).toBe("draft");
    expect(opened.audiences.map((row) => row.scope)).toEqual(["families"]);
    expect(headings(opened.translation)[0]).toBe("خطط الفصل الشتوي");
    expect(opened.translationReview?.current).toBe(true);
  });

  test("an edition with nothing written cannot go out", async () => {
    const office = await principal();
    const empty = await office.newsletters.save({
      ...edition("Blank", "Blank"),
      body: plainContent(" "),
    });
    expect(
      await rejection(
        office.newsletters.publish({
          id: empty.id,
          expectedVersion: empty.version,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "newsletters.empty" });
  });

  test("only those who manage newsletters write them", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    expect(
      await rejection(
        teacher.api.newsletters.save(edition("Not mine", "Hello")),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
