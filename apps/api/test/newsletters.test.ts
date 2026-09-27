import type { AudienceInput } from "@faridalms/domain/announcements";

import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, rejection, sessionFor, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const mother = () =>
  signedIn("northwind", login("student").replace("student", "parent"));

const families: AudienceInput[] = [
  { scope: "families", classId: "", gradeId: "" },
];

const edition = (title: string, heading: string, arabic?: string) => {
  const sectionId = crypto.randomUUID();
  return {
    id: "",
    expectedVersion: 0,
    title,
    primaryLocale: "en" as const,
    bilingual: arabic !== undefined,
    audiences: families,
    content: {
      sections: [
        { id: sectionId, heading, body: plainContent(`${heading} in full.`) },
      ],
      reviewed: [],
    },
    translation:
      arabic === undefined
        ? null
        : {
            sections: [
              {
                id: sectionId,
                heading: arabic,
                body: plainContent(`${arabic} بالتفصيل.`),
              },
            ],
            reviewed: [sectionId],
          },
  };
};

describe("reading newsletters", () => {
  test("a family opens September's edition in both languages and the office sees it read", async () => {
    const family = await mother();
    const { rows } = await family.newsletters.list({});
    const september = rows.find((row) => row.title === "September newsletter");
    if (!september) throw new Error("the seed has no September edition");
    expect(september.readAt).toBeNull();
    expect(september.summary).toContain("From the principal");

    const opened = await family.newsletters.record({ id: september.id });
    expect(opened.content.sections.map((section) => section.heading)).toEqual([
      "From the principal",
      "Dates for October",
      "Clubs",
    ]);
    expect(opened.translation?.sections[0]?.heading).toBe("كلمة المديرة");
    expect(opened.report).toBeNull();
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

    const draft = await office.newsletters.editor({ id: saved.id });
    const sectionId = draft.content?.sections[0]?.id ?? "";
    const changed = await office.newsletters.save({
      ...edition(
        "Sports day",
        "Sports day moves to Monday",
        "يوم الرياضة الاثنين",
      ),
      id: saved.id,
      expectedVersion: sent.version,
      content: {
        sections: [
          {
            id: sectionId,
            heading: "Sports day moves to Monday",
            body: plainContent("Rain on Friday."),
          },
        ],
        reviewed: [],
      },
    });

    const family = await mother();
    const before = await family.newsletters.record({ id: saved.id });
    expect(before.content.sections[0]?.heading).toBe("Sports day is Friday");
    expect(
      (await office.newsletters.record({ id: saved.id })).changedSince,
    ).toBe(true);

    await office.newsletters.publish({
      id: saved.id,
      expectedVersion: changed.version,
    });
    const after = await family.newsletters.record({ id: saved.id });
    expect(after.content.sections[0]?.heading).toBe(
      "Sports day moves to Monday",
    );
    expect(after.revisedAt).not.toBeNull();
  });

  test("a scheduled edition waits, and a duplicate starts as a draft in both languages", async () => {
    const office = await principal();
    const later = await office.newsletters.save(
      edition("Winter term", "Winter term plans", "خطط الفصل الشتوي"),
    );
    await office.newsletters.publish({
      id: later.id,
      expectedVersion: later.version,
      publishAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    const family = await mother();
    expect(
      (await family.newsletters.list({})).rows.some(
        (row) => row.id === later.id,
      ),
    ).toBe(false);
    expect(
      await rejection(family.newsletters.record({ id: later.id })),
    ).toMatchObject({ code: "NOT_FOUND" });

    const copy = await office.newsletters.duplicate({ id: later.id });
    const opened = await office.newsletters.editor({ id: copy.id });
    expect(opened.state).toBe("draft");
    expect(opened.audiences.map((row) => row.scope)).toEqual(["families"]);
    expect(opened.translation?.sections[0]?.heading).toBe("خطط الفصل الشتوي");
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
