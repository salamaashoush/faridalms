import type { AudienceInput } from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";

import {
  headedContent,
  plainContent,
} from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { runGoLive } from "../src/core/publication";
import {
  client,
  login,
  rejection,
  seeded,
  sessionFor,
  signedIn,
  timeHasCome,
  withoutModules,
  workerModules,
} from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const mother = () =>
  signedIn("northwind", login("student").replace("student", "parent"));

const families: AudienceInput[] = [
  { scope: "families", classId: "", targetId: "" },
];

const draft = (title: string, audiences: AudienceInput[]) => ({
  id: "",
  expectedVersion: 0,
  primaryLocale: "en" as const,
  titleEn: title,
  titleAr: "",
  body: plainContent(`${title} in full.`),
  translation: null,
  audiences,
  urgency: "normal" as const,
  pinnedUntil: "",
  expiresOn: "",
  requiresAck: false,
  ackDueOn: "",
  excerptEn: "",
  excerptAr: "",
  coverFileId: "",
  coverAltEn: "",
  coverAltAr: "",
});

/** The level-two headings of a document, in order. */
const headings = (document: ContentDocument | null | undefined) =>
  (document?.root.children ?? [])
    .filter((node) => node.type === "heading")
    .map((node) => node.children?.map((child) => child.text).join("") ?? "");

/** An announcement to families written under a heading, with its Arabic where given. */
const story = (
  title: string,
  heading: string,
  arabic?: string,
  body = `${heading} in full.`,
) => ({
  ...draft(title, families),
  body: headedContent([{ heading, body: plainContent(body) }]),
  translation:
    arabic === undefined
      ? null
      : headedContent([
          { heading: arabic, body: plainContent(`${arabic} بالتفصيل.`) },
        ]),
});

describe("reading announcements", () => {
  test("a family's feed puts the pinned welcome first and takes an acknowledgement", async () => {
    const family = await mother();
    const { rows } = await family.announcements.feed({});
    expect(rows[0]?.title).toBe("Welcome to the new school year");
    expect(rows[0]?.pinned).toBe(true);
    const trip = rows.find((row) => row.title === "Museum trip permission");
    if (!trip) throw new Error("the seed has no trip notice");
    expect(trip.requiresAck).toBe(true);
    expect(trip.acknowledgedAt).toBeNull();

    await family.announcements.seen({
      id: trip.id,
      acknowledge: true,
    });
    const opened = await family.announcements.record({
      id: trip.id,
    });
    expect(opened.acknowledgedAt).not.toBeNull();
    expect(opened.report).toBeNull();

    const office = await principal();
    const me = await family.identity.currentUser();
    const report = await office.announcements.report({
      id: trip.id,
      q: me.nameEn ?? "",
    });
    expect(
      report.rows.find((row) => row.userId === me.id)?.acknowledgedAt,
    ).not.toBeNull();
  });
});

describe("writing announcements", () => {
  test("a class announcement reaches that class's families and teachers only", async () => {
    const office = await principal();
    const { classes } = await office.announcements.options();
    const eight = classes.find((row) => row.titleEn === "8A");
    const seven = classes.find((row) => row.titleEn === "7A");
    if (!eight || !seven) throw new Error("the seed has no 7A or 8A");
    const saved = await office.announcements.save(
      draft("8A reading week", [
        { scope: "class", classId: eight.id, targetId: "" },
      ]),
    );
    const sent = await office.announcements.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect(sent.recipients).toBeGreaterThan(0);

    const family = await mother();
    const feed = await family.announcements.feed({});
    expect(feed.rows.some((row) => row.id === saved.id)).toBe(true);
    const teacher = await signedIn("northwind", login("teacher", 0, 1));
    expect(
      (await teacher.announcements.feed({})).rows.some(
        (row) => row.id === saved.id,
      ),
    ).toBe(true);
    const outsider = await signedIn("northwind", login("parent", 0, 0));
    const theirs = await outsider.announcements.feed({});
    if (!theirs.rows.some((row) => row.id === saved.id))
      expect(
        await rejection(outsider.announcements.record({ id: saved.id })),
      ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("a scheduled announcement waits, and an update shows it unread again", async () => {
    const office = await principal();
    const later = await office.announcements.save(
      draft("Next term", [{ scope: "families", classId: "", targetId: "" }]),
    );
    const scheduled = await office.announcements.publish({
      id: later.id,
      expectedVersion: later.version,
      publishAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    expect(scheduled.recipients).toBeGreaterThan(0);
    const family = await mother();
    expect(
      (await family.announcements.feed({})).rows.some(
        (row) => row.id === later.id,
      ),
    ).toBe(false);

    const now = await office.announcements.save(
      draft("Uniform reminder", [
        { scope: "families", classId: "", targetId: "" },
      ]),
    );
    const out = await office.announcements.publish({
      id: now.id,
      expectedVersion: now.version,
    });
    await family.announcements.seen({
      id: now.id,
      acknowledge: false,
    });
    expect(
      await rejection(
        office.announcements.publish({
          id: now.id,
          expectedVersion: out.version,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "announcements.already_out" });
    await office.announcements.publish({
      id: now.id,
      expectedVersion: out.version,
      sendUpdate: true,
    });
    const again = await family.announcements.record({ id: now.id });
    expect(again.readAt).toBeNull();
    expect(again.updateSentAt).not.toBeNull();
  });

  test("only those who manage announcements write them", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    expect(
      await rejection(
        teacher.api.announcements.save(
          draft("Not mine", [{ scope: "school", classId: "", targetId: "" }]),
        ),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

const tenantId = () => seeded().tenants[0]?.tenantId ?? "";

describe("announcements going out", () => {
  const channels = { email: false, sms: false };

  test("a scheduled announcement tells its families once it goes live, and asks them to acknowledge it then", async () => {
    const office = await principal();
    const saved = await office.announcements.save({
      ...draft("Book fair permission", families),
      requiresAck: true,
    });
    await office.announcements.publish({
      id: saved.id,
      expectedVersion: saved.version,
      publishAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    });
    const family = await mother();
    const notices = async () =>
      (await family.notifications.list({ tab: "all" })).rows.filter(
        (row) => row.subjectId === saved.id,
      );
    await runGoLive(seeded().cell, tenantId(), {
      channels,
      modules: workerModules(),
    });
    expect(await notices()).toHaveLength(0);

    await timeHasCome("broadcasts", saved.id);
    await runGoLive(seeded().cell, tenantId(), {
      channels,
      modules: workerModules(),
    });
    await runGoLive(seeded().cell, tenantId(), {
      channels,
      modules: workerModules(),
    });
    const told = await notices();
    expect(told).toHaveLength(1);
    expect(told[0]?.kind).toBe("announcement");
    expect(told[0]?.needsAction).toBe(true);
    expect(told[0]?.params.preview).toBe("Book fair permission in full.");
    expect(
      (await family.announcements.feed({})).rows.some(
        (row) => row.id === saved.id,
      ),
    ).toBe(true);
  });

  test("families read what was sent until an update goes out, told or quietly", async () => {
    const office = await principal();
    const saved = await office.announcements.save({
      ...draft("Lunch menu", families),
      body: plainContent("Pasta on Monday."),
    });
    const sent = await office.announcements.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const family = await mother();
    await family.announcements.seen({
      id: saved.id,
      acknowledge: false,
    });
    const edited = await office.announcements.save({
      ...draft("Lunch menu", families),
      id: saved.id,
      expectedVersion: sent.version,
      body: plainContent("Rice on Monday."),
    });
    const words = async () =>
      (await family.announcements.record({ id: saved.id })).body.root
        .children?.[0]?.children?.[0]?.text;
    expect(await words()).toBe("Pasta on Monday.");
    expect(
      (await office.announcements.editor({ id: saved.id })).changedSince,
    ).toBe(true);

    await office.announcements.publish({
      id: saved.id,
      expectedVersion: edited.version,
      sendUpdate: true,
      quietly: true,
    });
    expect(await words()).toBe("Rice on Monday.");
    const read = await family.announcements.record({ id: saved.id });
    expect(read.readAt).not.toBeNull();
    expect(read.updateSentAt).toBeNull();
    expect(
      (await family.notifications.list({ tab: "all" })).rows.filter(
        (row) => row.subjectId === saved.id,
      ),
    ).toHaveLength(1);
  });

  test("edits taken back to what was sent wait for nothing, and the editor holds that copy", async () => {
    const office = await principal();
    const saved = await office.announcements.save({
      ...draft("Bus times", families),
      body: plainContent("The bus leaves at eight."),
    });
    const sent = await office.announcements.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const edited = await office.announcements.save({
      ...draft("Bus times", families),
      id: saved.id,
      expectedVersion: sent.version,
      body: plainContent("The bus leaves at nine."),
    });
    const opened = await office.announcements.editor({
      id: saved.id,
    });
    expect(opened.changedSince).toBe(true);
    expect(opened.sent?.body.root.children?.[0]?.children?.[0]?.text).toBe(
      "The bus leaves at eight.",
    );
    await office.announcements.save({
      ...draft("Bus times", families),
      id: saved.id,
      expectedVersion: edited.version,
      body: plainContent("The bus leaves at eight."),
    });
    expect(
      (await office.announcements.editor({ id: saved.id })).changedSince,
    ).toBe(false);
  });
});

describe("announcements in two languages", () => {
  test("a family reads the Arabic, the notice carries its words, and a duplicate keeps both", async () => {
    const office = await principal();
    const saved = await office.announcements.save({
      ...draft("Early closing on Thursday", [
        { scope: "families", classId: "", targetId: "" },
      ]),
      titleAr: "انصراف مبكر يوم الخميس",
      body: plainContent("School closes at noon on Thursday."),
      translation: plainContent("تنتهي الدراسة ظهر يوم الخميس."),
    });
    const checked = await office.announcements.review({
      id: saved.id,
      expectedVersion: saved.version,
      reviewed: true,
    });
    expect(checked.review?.current).toBe(true);
    await office.announcements.publish({
      id: saved.id,
      expectedVersion: checked.version,
    });

    const family = await mother();
    const read = await family.announcements.record({ id: saved.id });
    expect(read.titleAr).toBe("انصراف مبكر يوم الخميس");
    expect(read.primaryLocale).toBe("en");
    expect(read.translation?.root.children?.[0]?.children?.[0]?.text).toBe(
      "تنتهي الدراسة ظهر يوم الخميس.",
    );
    const me = await family.identity.currentUser();
    const notice = (await family.notifications.list({ tab: "all" })).rows.find(
      (row) => row.subjectId === saved.id,
    );
    expect(notice?.params.titleAr).toBe("انصراف مبكر يوم الخميس");
    expect(notice?.params.preview).toBe("School closes at noon on Thursday.");
    expect(me.id).toBeTruthy();

    const copy = await office.announcements.duplicate({
      id: saved.id,
    });
    const opened = await office.announcements.editor({
      id: copy.id,
    });
    expect(opened.state).toBe("draft");
    expect(opened.titleAr).toBe("انصراف مبكر يوم الخميس");
    expect(opened.translationReview?.current).toBe(true);
  });

  test("an Arabic-only announcement needs its Arabic title", async () => {
    const office = await principal();
    expect(
      await rejection(
        office.announcements.save({
          ...draft("", [{ scope: "families", classId: "", targetId: "" }]),
          primaryLocale: "ar",
          titleEn: "Only English",
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("newsletters", () => {
  test("a family opens September's newsletter in both languages and the office sees it read", async () => {
    const family = await mother();
    const { rows } = await family.announcements.feed({});
    const september = rows.find(
      (row) => row.titleEn === "September newsletter",
    );
    if (!september) throw new Error("the seed has no September newsletter");
    expect(september.readAt).toBeNull();
    expect(september.recipient).toBe(true);
    expect(september.summary).toContain("From the principal");

    const opened = await family.announcements.record({ id: september.id });
    expect(headings(opened.body)).toEqual([
      "From the principal",
      "Dates for October",
      "Clubs",
    ]);
    expect(headings(opened.translation)[0]).toBe("كلمة المديرة");
    expect(opened.report).toBeNull();
    expect(opened.translationReview).toBeNull();
    await family.announcements.seen({ id: september.id, acknowledge: false });

    const office = await principal();
    const me = await family.identity.currentUser();
    const report = await office.announcements.report({
      id: september.id,
      q: me.nameEn ?? "",
    });
    expect(
      report.rows.find((row) => row.userId === me.id)?.readAt,
    ).not.toBeNull();
    expect(
      (await family.announcements.feed({})).rows.some(
        (row) => row.titleEn === "October newsletter",
      ),
    ).toBe(false);
  });

  test("the feed pages past its first announcements, newest first", async () => {
    const office = await principal();
    const tag = crypto.randomUUID().slice(0, 8);
    // One after another, so each goes out after the one before.
    await Array.from({ length: 27 }, (_, index) => index).reduce<
      Promise<unknown>
    >(
      (previous, index) =>
        previous
          .then(() =>
            office.announcements.save(
              story(`Paged ${tag} ${String(index).padStart(2, "0")}`, "A note"),
            ),
          )
          .then((saved) =>
            office.announcements.publish({
              id: saved.id,
              expectedVersion: saved.version,
            }),
          ),
      Promise.resolve(),
    );
    const family = await mother();
    const first = await family.announcements.feed({ q: tag });
    expect(first).toMatchObject({ total: 27, page: 1, pages: 2 });
    expect(first.rows).toHaveLength(25);
    const second = await family.announcements.feed({ q: tag, page: 2 });
    expect(second.rows).toHaveLength(2);
    const ids = [...first.rows, ...second.rows].map((row) => row.id);
    expect(new Set(ids).size).toBe(27);
    expect(first.rows[0]?.titleEn).toBe(`Paged ${tag} 26`);
  }, 30_000);

  test("a newsletter for the school never reaches the website", async () => {
    const visitor = client("northwind").site;
    const { rows } = await visitor.publicSitePosts({ school: "northwind" });
    expect(rows.some((row) => row.title === "September newsletter")).toBe(
      false,
    );
  });
});

describe("writing announcements with headings", () => {
  test("edits to a sent announcement stay private until an update goes out", async () => {
    const office = await principal();
    const saved = await office.announcements.save(
      story("Sports day", "Sports day is Friday", "يوم الرياضة الجمعة"),
    );
    const sent = await office.announcements.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect(sent.recipients).toBeGreaterThan(0);

    const changed = await office.announcements.save({
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
    const before = await family.announcements.record({ id: saved.id });
    expect(headings(before.body)).toEqual(["Sports day is Friday"]);
    expect(
      (await office.announcements.record({ id: saved.id })).changedSince,
    ).toBe(true);

    await office.announcements.publish({
      id: saved.id,
      expectedVersion: changed.version,
      sendUpdate: true,
      quietly: true,
    });
    const after = await family.announcements.record({ id: saved.id });
    expect(headings(after.body)).toEqual(["Sports day moves to Monday"]);
    expect(after.updatedAt).not.toBeNull();
  });

  test("a checked translation lapses once either language's words change", async () => {
    const office = await principal();
    const saved = await office.announcements.save(
      story("Library week", "Library week", "أسبوع المكتبة"),
    );
    const checked = await office.announcements.review({
      id: saved.id,
      expectedVersion: saved.version,
      reviewed: true,
    });
    expect(checked.review?.current).toBe(true);

    const respaced = await office.announcements.save({
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
      (await office.announcements.editor({ id: saved.id })).translationReview
        ?.current,
    ).toBe(true);

    const moved = await office.announcements.save({
      ...story(
        "Library week",
        "Library week",
        "أسبوع المكتبة",
        "Bring a book to swap.",
      ),
      id: saved.id,
      expectedVersion: respaced.version,
    });
    const stale = await office.announcements.editor({ id: saved.id });
    expect(stale.translationReview?.current).toBe(false);

    const again = await office.announcements.review({
      id: saved.id,
      expectedVersion: moved.version,
      reviewed: true,
    });
    expect(again.review?.current).toBe(true);

    await office.announcements.save({
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
      (await office.announcements.editor({ id: saved.id })).translationReview,
    ).toBeNull();
  });

  test("an unwritten translation cannot be checked", async () => {
    const office = await principal();
    const saved = await office.announcements.save({
      ...story("One language", "One language"),
      translation: plainContent(""),
    });
    expect(
      await rejection(
        office.announcements.review({
          id: saved.id,
          expectedVersion: saved.version,
          reviewed: true,
        }),
      ),
    ).toMatchObject({
      code: "CONFLICT",
      message: "translation.nothing_to_check",
    });
  });

  test("a scheduled announcement waits, and a duplicate starts as a draft in both languages", async () => {
    const office = await principal();
    const written = await office.announcements.save(
      story("Winter term", "Winter term plans", "خطط الفصل الشتوي"),
    );
    const later = await office.announcements.review({
      id: written.id,
      expectedVersion: written.version,
      reviewed: true,
    });
    await office.announcements.publish({
      id: written.id,
      expectedVersion: later.version,
      publishAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    const family = await mother();
    expect(
      (await family.announcements.feed({})).rows.some(
        (row) => row.id === written.id,
      ),
    ).toBe(false);
    expect(
      await rejection(family.announcements.record({ id: written.id })),
    ).toMatchObject({ code: "NOT_FOUND" });

    const copy = await office.announcements.duplicate({ id: written.id });
    const opened = await office.announcements.editor({ id: copy.id });
    expect(opened.state).toBe("draft");
    expect(opened.audiences.map((row) => row.scope)).toEqual(["families"]);
    expect(headings(opened.translation)[0]).toBe("خطط الفصل الشتوي");
    expect(opened.translationReview?.current).toBe(true);
  });

  test("a scheduled announcement tells its audience once it goes live, and not if it is taken back first", async () => {
    const office = await principal();
    const channels = { email: false, sms: false };
    const later = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const kept = await office.announcements.save(
      story("Science fair", "Science fair"),
    );
    const keptOut = await office.announcements.publish({
      id: kept.id,
      expectedVersion: kept.version,
      publishAt: later,
    });
    const dropped = await office.announcements.save(
      story("Bake sale", "Bake sale"),
    );
    const droppedOut = await office.announcements.publish({
      id: dropped.id,
      expectedVersion: dropped.version,
      publishAt: later,
    });
    await office.announcements.unpublish({
      id: dropped.id,
      expectedVersion: droppedOut.version,
    });
    const family = await mother();
    const told = async (id: string) =>
      (await family.notifications.list({ tab: "all" })).rows.filter(
        (row) => row.subjectId === id && row.kind === "announcement",
      ).length;

    await timeHasCome("broadcasts", kept.id);
    await runGoLive(seeded().cell, tenantId(), {
      channels,
      modules: workerModules(),
    });
    await runGoLive(seeded().cell, tenantId(), {
      channels,
      modules: workerModules(),
    });
    expect(await told(kept.id)).toBe(1);
    expect(await told(dropped.id)).toBe(0);
    expect(keptOut.recipients).toBeGreaterThan(0);
    expect(
      (await family.announcements.feed({ q: "Science fair" })).rows.some(
        (row) => row.id === kept.id,
      ),
    ).toBe(true);
  });

  test("an announcement with nothing written cannot go out", async () => {
    const office = await principal();
    const empty = await office.announcements.save({
      ...story("Blank", "Blank"),
      body: plainContent(" "),
    });
    expect(
      await rejection(
        office.announcements.publish({
          id: empty.id,
          expectedVersion: empty.version,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "announcements.empty" });
  });

  test("one inside the school needs an audience; one on the website does not", async () => {
    const office = await principal();
    expect(
      await rejection(
        office.announcements.save({
          ...story("Nobody", "Nobody"),
          audiences: [],
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    const open = await office.announcements.save({
      ...story("Open day", "Open day"),
      audiences: [],
      parts: { website: { slug: "open-day-notice" } },
    });
    expect(open.id).toBeTruthy();
  });

  test("only those who manage announcements write one for the website", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    expect(
      await rejection(
        teacher.api.announcements.save(story("Not mine", "Hello")),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("announcements on the website", () => {
  test("one without its translation reads on the website in the original language, marked as such", async () => {
    const office = await principal();
    const { categories } = await office.site.announcementOptions();
    const saved = await office.announcements.save({
      ...story("Book week", "Book week"),
      audiences: [],
      parts: {
        website: { slug: "book-week", categoryId: categories[0]?.id ?? "" },
      },
      excerptEn: "Dress as your favourite character.",
      body: plainContent("Book week starts on Sunday."),
    });
    await office.announcements.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const read = await client("northwind").site.publicSitePost({
      school: "northwind",
      locale: "ar",
      slug: "book-week",
    });
    expect(read.title).toBe("Book week");
    expect(read.bodyLocale).toBe("en");
    const { rows } = await office.announcements.manage({
      tab: "published",
      q: "Book week",
    });
    expect(rows.map((row) => row.copies)).toEqual([["website"]]);
    expect(await office.site.announcementPost({ id: saved.id })).toMatchObject({
      slug: "book-week",
    });
    const family = await mother();
    expect(
      (await family.announcements.feed({})).rows.find(
        (row) => row.id === saved.id,
      )?.recipient,
    ).toBe(false);
  });

  test("one taken off the website comes off it", async () => {
    const office = await principal();
    const saved = await office.announcements.save({
      ...story("Choir concert", "Choir concert"),
      audiences: [],
      parts: { website: { slug: "choir-concert" } },
    });
    const sent = await office.announcements.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const visitor = client("northwind").site;
    const before = await visitor.publicSitePosts({ school: "northwind" });
    expect(before.rows.some((row) => row.slug === "choir-concert")).toBe(true);
    const inside = await office.announcements.save({
      ...story("Choir concert", "Choir concert"),
      id: saved.id,
      expectedVersion: sent.version,
      parts: { website: null },
    });
    await office.announcements.publish({
      id: saved.id,
      expectedVersion: inside.version,
      sendUpdate: true,
      quietly: true,
    });
    const after = await visitor.publicSitePosts({ school: "northwind" });
    expect(after.rows.some((row) => row.slug === "choir-concert")).toBe(false);
  });

  test("with the website off, one takes no website settings and one on the website reaches only its audience, until the website is back", async () => {
    const office = await principal();
    const saved = await office.announcements.save({
      ...story("Sports day", "Sports day"),
      audiences: [],
      parts: { website: { slug: "sports-day-closed" } },
    });
    await office.announcements.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const family = await mother();
    const listed = async () =>
      (await family.announcements.feed({})).rows.some(
        (row) => row.id === saved.id,
      );
    expect(await listed()).toBe(true);
    await withoutModules("northwind", ["website"], async () => {
      expect(
        await rejection(
          office.announcements.save({
            ...story("Fair", "Fair"),
            parts: { website: { slug: "fair-closed" } },
          }),
        ),
      ).toMatchObject({ message: "announcements.part_unknown" });
      expect(await listed()).toBe(false);
      expect(
        await rejection(family.announcements.record({ id: saved.id })),
      ).toMatchObject({ code: "NOT_FOUND" });
      expect(
        (await office.announcements.record({ id: saved.id })).copies,
      ).toEqual([]);
      // The office's list puts nothing first that the website pins.
      const { rows } = await office.announcements.manage({
        tab: "published",
        q: "Sports day",
      });
      expect(rows.find((row) => row.id === saved.id)?.copies).toEqual([]);
    });
    expect(await listed()).toBe(true);
  });
});
