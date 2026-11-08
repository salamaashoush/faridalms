import { plainContent } from "@faridalms/domain/content-conversion";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import { login, rejection, sessionFor, signedIn, testCell } from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const ahead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

/** A class event written by the seeded teacher, which the principal may edit too. */
async function teachersEvent(title: string) {
  const teacher = await sessionFor("northwind", login("teacher", 0, 1));
  const own = (await teacher.api.calendar.options()).classes[0];
  if (!own) throw new Error("the seeded teacher has no class");
  const input = {
    id: "",
    expectedVersion: 0,
    titleEn: title,
    titleAr: "",
    category: "meeting" as const,
    startsOn: ahead,
    endsOn: ahead,
    allDay: false,
    startTime: "09:00",
    endTime: "10:00",
    location: "Room 12",
    provisional: false,
    audiences: [{ scope: "class" as const, classId: own.id, gradeId: "" }],
    description: plainContent(`${title} agenda.`),
  };
  const saved = await teacher.api.calendar.save(input);
  return {
    teacher: teacher.api,
    input: { ...input, id: saved.id, expectedVersion: saved.version },
    host: { hostType: "calendar_event", hostId: saved.id },
  };
}

/** Lets a hold run out as if its editor had stopped renewing it a while ago. */
async function lapse(host: { hostType: string; hostId: string }) {
  const admin = new SQL(testCell().adminUrl);
  try {
    await admin`
      update core.document_holds
      set held_since = statement_timestamp() - interval '10 minutes',
          expires_at = statement_timestamp() - interval '1 minute'
      where host_type = ${host.hostType} and host_id = ${host.hostId}::uuid`;
  } finally {
    await admin.close();
  }
}

describe("holding a document while it is edited", () => {
  test("the editor holds it, renews it, and lets go of it", async () => {
    const { teacher, host } = await teachersEvent("Holding a meeting");
    const me = await teacher.identity.currentUser();

    const first = await teacher.documents.hold(host);
    expect(first).toMatchObject({ mine: true, holder: { id: me.id } });
    const renewed = await teacher.documents.hold(host);
    expect(renewed).toMatchObject({ mine: true, since: first.since });

    const office = await principal();
    expect(await office.documents.hold(host)).toMatchObject({
      mine: false,
      holder: { id: me.id, nameEn: me.nameEn },
      since: first.since,
    });

    await teacher.documents.release(host);
    expect(await office.documents.hold(host)).toMatchObject({ mine: true });
  });

  test("a hold nobody renews lapses, and the next editor has it", async () => {
    const { teacher, host } = await teachersEvent("A laptop closed");
    await teacher.documents.hold(host);
    const office = await principal();
    expect(await office.documents.hold(host)).toMatchObject({ mine: false });

    await lapse(host);
    expect(await office.documents.hold(host)).toMatchObject({ mine: true });
    expect(await teacher.documents.hold(host)).toMatchObject({ mine: false });
  });

  test("taking it over refuses the previous holder's next save and tells them who", async () => {
    const { teacher, input, host } = await teachersEvent("Taken over");
    await teacher.documents.hold(host);
    const office = await principal();
    const head = await office.identity.currentUser();

    // Opening it does not take it, and a save while it is held is refused.
    expect(await office.documents.hold(host)).toMatchObject({ mine: false });
    expect(
      await rejection(
        office.calendar.save({ ...input, titleEn: "Not while it is held" }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "documents.held" });

    expect(await office.documents.hold({ ...host, take: true })).toMatchObject({
      mine: true,
      holder: { id: head.id },
    });

    expect(await teacher.documents.hold(host)).toMatchObject({
      mine: false,
      holder: { id: head.id },
    });
    expect(
      await rejection(
        teacher.calendar.save({ ...input, titleEn: "My late change" }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "documents.held" });

    const saved = await office.calendar.save({
      ...input,
      titleEn: "Taken over and changed",
    });
    expect(saved.version).toBeGreaterThan(input.expectedVersion);

    // Taking it back is the teacher's to do, as anyone's who may edit it.
    expect(await teacher.documents.hold({ ...host, take: true })).toMatchObject(
      { mine: true },
    );
    expect(
      await rejection(
        teacher.calendar.save({ ...input, titleEn: "On a stale version" }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "conflict.version" });
    const kept = await teacher.calendar.save({
      ...input,
      expectedVersion: saved.version,
      titleEn: "Mine, kept on top of theirs",
    });
    expect((await teacher.calendar.event({ id: kept.id })).titleEn).toBe(
      "Mine, kept on top of theirs",
    );
  });

  test("only someone who may edit it holds it or learns who does", async () => {
    const { teacher, host } = await teachersEvent("Not theirs to hold");
    await teacher.documents.hold(host);
    const colleague = await signedIn("northwind", login("teacher", 0, 2));
    expect(await rejection(colleague.documents.hold(host))).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      await rejection(colleague.documents.hold({ ...host, take: true })),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("an announcement is held by whoever manages announcements", async () => {
    const office = await principal();
    const saved = await office.broadcasts.announcements.save({
      id: "",
      expectedVersion: 0,
      primaryLocale: "en",
      titleEn: "Held notice",
      titleAr: "",
      body: plainContent("Held notice in full."),
      translation: null,
      audiences: [{ scope: "families", classId: "", gradeId: "" }],
      urgency: "normal",
      pinnedUntil: "",
      expiresOn: "",
      requiresAck: false,
      ackDueOn: "",
    });
    const host = { hostType: "announcement", hostId: saved.id };
    expect(await office.documents.hold(host)).toMatchObject({ mine: true });
    const teacher = await signedIn("northwind", login("teacher", 0, 1));
    expect(await rejection(teacher.documents.hold(host))).toMatchObject({
      code: "NOT_FOUND",
    });
    await office.documents.release(host);
  });

  test("live documents are shared, never held, and held ones never go live", async () => {
    const office = await principal();
    const lesson = { hostType: "lesson", hostId: crypto.randomUUID() };
    expect(await rejection(office.documents.hold(lesson))).toMatchObject({
      code: "NOT_FOUND",
    });
    const { host } = await teachersEvent("Never live");
    expect(await rejection(office.documents.collaborate(host))).toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
