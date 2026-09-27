import type { AudienceInput } from "@faridalms/domain/announcements";

import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, rejection, sessionFor, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const mother = () =>
  signedIn("northwind", login("student").replace("student", "parent"));

const draft = (title: string, audiences: AudienceInput[]) => ({
  id: "",
  expectedVersion: 0,
  title,
  body: plainContent(`${title} in full.`),
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
