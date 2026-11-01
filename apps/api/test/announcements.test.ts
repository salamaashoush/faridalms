import type { AudienceInput } from "@faridalms/domain/announcements";

import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { runGoLive } from "../src/core/publication";
import {
  login,
  rejection,
  seeded,
  sessionFor,
  signedIn,
  timeHasCome,
} from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const mother = () =>
  signedIn("northwind", login("student").replace("student", "parent"));

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

    await family.announcements.seen({ id: trip.id, acknowledge: true });
    const opened = await family.announcements.record({ id: trip.id });
    expect(opened.acknowledgedAt).not.toBeNull();
    expect(opened.report).toBeNull();

    const office = await principal();
    const report = await office.announcements.record({ id: trip.id });
    const me = await family.identity.currentUser();
    expect(
      report.report?.find((row) => row.userId === me.id)?.acknowledgedAt,
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
        { scope: "class", classId: eight.id, gradeId: "" },
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
      draft("Next term", [{ scope: "families", classId: "", gradeId: "" }]),
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
        { scope: "families", classId: "", gradeId: "" },
      ]),
    );
    const out = await office.announcements.publish({
      id: now.id,
      expectedVersion: now.version,
    });
    await family.announcements.seen({ id: now.id, acknowledge: false });
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
          draft("Not mine", [{ scope: "school", classId: "", gradeId: "" }]),
        ),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

const tenantId = () => seeded().tenants[0]?.tenantId ?? "";

describe("announcements going out", () => {
  const families: AudienceInput[] = [
    { scope: "families", classId: "", gradeId: "" },
  ];
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
    await runGoLive(seeded().cell, tenantId(), { channels });
    expect(await notices()).toHaveLength(0);

    await timeHasCome("broadcasts", saved.id);
    await runGoLive(seeded().cell, tenantId(), { channels });
    await runGoLive(seeded().cell, tenantId(), { channels });
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
    await family.announcements.seen({ id: saved.id, acknowledge: false });
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
});

describe("announcements in two languages", () => {
  test("a family reads the Arabic, the notice carries its words, and a duplicate keeps both", async () => {
    const office = await principal();
    const saved = await office.announcements.save({
      ...draft("Early closing on Thursday", [
        { scope: "families", classId: "", gradeId: "" },
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

    const copy = await office.announcements.duplicate({ id: saved.id });
    const opened = await office.announcements.editor({ id: copy.id });
    expect(opened.state).toBe("draft");
    expect(opened.titleAr).toBe("انصراف مبكر يوم الخميس");
    expect(opened.translationReview?.current).toBe(true);
  });

  test("an Arabic-only announcement needs its Arabic title", async () => {
    const office = await principal();
    expect(
      await rejection(
        office.announcements.save({
          ...draft("", [{ scope: "families", classId: "", gradeId: "" }]),
          primaryLocale: "ar",
          titleEn: "Only English",
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
  });
});
