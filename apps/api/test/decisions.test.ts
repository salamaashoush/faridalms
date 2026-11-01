import { contentPlainText } from "@faridalms/domain/content";
import { plainContent } from "@faridalms/domain/content-conversion";
import { newSection } from "@faridalms/domain/site-sections";
import { describe, expect, test } from "bun:test";

import { runAdmissionsClock } from "../src/core/admissions-clock";
import {
  consents,
  filledDraft,
  intakeFor,
  names,
  officer,
  principal,
  registeredFamily,
} from "./admission-fixtures";
import { client, login, rejection, seeded, signedIn } from "./harness";

type Family = Awaited<ReturnType<typeof registeredFamily>>["api"];
type Office = Awaited<ReturnType<typeof officer>>;

/** A family's application sent and under review by the office. */
async function inReview(
  family: Family,
  intakeId: string,
  input: Parameters<typeof filledDraft>[2] = {},
) {
  const office = await officer();
  const draft = await filledDraft(family, intakeId, input);
  const sent = await family.applying.submit({
    id: draft.id,
    expectedVersion: draft.version,
    locale: "en",
    consents: await consents(family, draft.id),
  });
  const { version } = await office.applications.move({
    id: draft.id,
    expectedVersion: sent.version,
    state: "in_review",
    note: "",
  });
  return { id: draft.id, version, reference: sent.reference };
}

const versionOf = async (office: Office, id: string) =>
  (await office.applications.application({ id })).version;

const decide = async (
  office: Office,
  ids: string[],
  decision: "offer" | "waitlist" | "decline",
) =>
  office.decisions.decide({
    applications: await Promise.all(
      ids.map(async (id) => ({
        id,
        expectedVersion: await versionOf(office, id),
      })),
    ),
    decision,
    note: "",
  });

const release = async (office: Office, ids: string[]) =>
  office.decisions.release({
    applications: await Promise.all(
      ids.map(async (id) => ({
        id,
        expectedVersion: await versionOf(office, id),
      })),
    ),
  });

const mineOf = async (family: Family, id: string) => {
  const mine = await family.applying.mine();
  const row = mine.applications.find((each) => each.id === id);
  if (!row) throw new Error("the family does not see its application");
  return row;
};

const tenantId = () => seeded().tenants[0]?.tenantId ?? "";

let madeLater: Promise<unknown> | null = null;
/** A school year well after the seeded ones, made once, for intakes no other test uses. */
function laterYear() {
  madeLater ??= principal().then((api) =>
    api.years.save({
      titleEn: "2033–2034",
      titleAr: "",
      startsOn: "2033-09-10",
      endsOn: "2034-06-15",
      terms: [],
    }),
  );
  return madeLater;
}

describe("deciding", () => {
  test("a decision stays the office's until it is released, then the family reads the offer and accepts it", async () => {
    const { intakeId } = await intakeFor("Grade 8", { capacity: 2 });
    const { api: family } = await registeredFamily("salama.offer@example.com");
    const office = await officer();
    const { id } = await inReview(family, intakeId, {
      birthDate: "2014-02-02",
    });

    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.decisions.decide({
          applications: [{ id, expectedVersion: 1 }],
          decision: "offer",
          note: "",
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });

    await decide(office, [id], "offer");
    const hidden = await mineOf(family, id);
    expect(hidden.state).toBe("in_review");
    expect(hidden.letters).toEqual([]);
    expect(hidden.moves.answer).toBe(false);

    const record = await office.applications.application({ id });
    expect(record).toMatchObject({ state: "decided", decision: "offer" });
    await release(office, [id]);
    const offered = await mineOf(family, id);
    expect(offered.state).toBe("offered");
    expect(offered.offerExpiresOn).not.toBeNull();
    expect(offered.moves.answer).toBe(true);
    expect(offered.letters.map((letter) => letter.kind)).toEqual(["offer"]);
    const letter = await family.applying.letter({
      id: offered.letters[0]?.id ?? "",
    });
    const words = contentPlainText(letter.content);
    expect(words).toContain("Omar Ashoush");
    expect(words).toContain("Grade 8");
    expect(words).not.toMatch(/\{[a-z]+\}/);

    // The letter is also a message in the family's conversation with
    // admissions, which they read in Messages.
    const { threadId } = await office.applications.application({ id });
    if (!threadId) throw new Error("the letter opened no conversation");
    const conversation = await family.messages.thread({ id: threadId });
    expect(
      conversation.messages.some((message) =>
        message.body.includes("Omar Ashoush"),
      ),
    ).toBe(true);

    // Another family reaches none of it.
    const { api: stranger } = await registeredFamily(
      "salama.notmine@example.com",
    );
    expect(
      await rejection(stranger.applying.letter({ id: letter.id })),
    ).toMatchObject({ code: "NOT_FOUND" });

    await family.applying.answer({
      id,
      expectedVersion: offered.version,
      answer: "accept",
      note: "",
    });
    expect((await mineOf(family, id)).state).toBe("accepted");
    const board = await office.decisions.board({ intake: intakeId });
    expect(board.places).toMatchObject({ capacity: 2, accepted: 1, left: 1 });
  });

  test("an offer past the places refuses the release, the waiting list is ranked, and a declined offer frees a place", async () => {
    const { intakeId } = await intakeFor("Grade 9", { capacity: 1 });
    const office = await officer();
    const first = await registeredFamily("salama.first@example.com");
    const younger = await registeredFamily("salama.younger@example.com");
    const older = await registeredFamily("salama.older@example.com");
    const a = await inReview(first.api, intakeId, { birthDate: "2013-05-05" });
    const b = await inReview(younger.api, intakeId, {
      birthDate: "2013-09-01",
    });
    const c = await inReview(older.api, intakeId, { birthDate: "2012-11-11" });

    await decide(office, [a.id, b.id], "offer");
    expect(await rejection(release(office, [a.id, b.id]))).toMatchObject({
      code: "CONFLICT",
      message: "admissions.full",
    });
    // Nothing was released: the release goes all or not at all.
    expect((await mineOf(first.api, a.id)).state).toBe("in_review");

    await decide(office, [b.id, c.id], "waitlist");
    await release(office, [a.id, b.id, c.id]);
    const board = await office.decisions.board({ intake: intakeId });
    expect(board.places).toMatchObject({ offered: 1, left: 0 });
    const rank = (id: string) =>
      board.applications.find((row) => row.id === id)?.rank;
    expect([rank(c.id), rank(b.id)]).toEqual([1, 2]);
    expect(
      await rejection(
        office.decisions.offer({
          applications: [
            { id: c.id, expectedVersion: await versionOf(office, c.id) },
          ],
        }),
      ),
    ).toMatchObject({ message: "admissions.full" });

    const offer = await mineOf(first.api, a.id);
    await first.api.applying.answer({
      id: a.id,
      expectedVersion: offer.version,
      answer: "decline",
      note: "",
    });
    await office.decisions.offer({
      applications: [
        { id: c.id, expectedVersion: await versionOf(office, c.id) },
      ],
    });
    expect((await mineOf(older.api, c.id)).state).toBe("offered");
    expect(
      (await mineOf(younger.api, b.id)).letters.map((l) => l.kind),
    ).toEqual(["waitlist"]);
  });

  test("the intake's day releases decisions on the clock, and an offer lapses after its last day", async () => {
    const { intakeId } = await intakeFor("Grade 10", {
      decisionsOn: "2027-04-15",
    });
    const office = await officer();
    const { api: family } = await registeredFamily("salama.clock@example.com");
    const { id } = await inReview(family, intakeId, {
      birthDate: "2011-06-06",
    });
    await decide(office, [id], "offer");
    const channels = { email: false, sms: false };
    await runAdmissionsClock(seeded().cell, tenantId(), {
      now: new Date("2027-04-14T12:00:00Z"),
      channels,
    });
    expect((await mineOf(family, id)).state).toBe("in_review");
    await runAdmissionsClock(seeded().cell, tenantId(), {
      now: new Date("2027-04-15T12:00:00Z"),
      channels,
    });
    const offered = await mineOf(family, id);
    expect(offered.state).toBe("offered");
    await runAdmissionsClock(seeded().cell, tenantId(), {
      now: new Date("2099-01-01T12:00:00Z"),
      channels,
    });
    expect((await mineOf(family, id)).state).toBe("offer_expired");
    const notices = await family.notifications.list({});
    expect(
      notices.rows.some(
        (row) =>
          row.kind === "application" && row.params.outcome === "offer_expired",
      ),
    ).toBe(true);
  });

  test("deciding after the intake's day releases at once", async () => {
    const { intakeId } = await intakeFor("Grade 11", {
      decisionsOn: "2020-01-01",
    });
    const office = await officer();
    const { api: family } = await registeredFamily("salama.late@example.com");
    const { id } = await inReview(family, intakeId, {
      birthDate: "2010-06-06",
    });
    const decided = await decide(office, [id], "decline");
    expect(decided.released).toEqual([id]);
    const row = await mineOf(family, id);
    expect(row.state).toBe("declined_by_school");
    expect(row.letters.map((letter) => letter.kind)).toEqual(["decline"]);
  });
});

describe("deferring", () => {
  test("an application moves to an intake of a later year, numbered for that year", async () => {
    await laterYear();
    const now = await intakeFor("Grade 12");
    const later = await intakeFor("Grade 12", {
      year: "2033–2034",
      anyAge: true,
    });
    const office = await officer();
    const { api: family } = await registeredFamily("salama.defer@example.com");
    const { id, version } = await inReview(family, now.intakeId, {
      birthDate: "2009-07-07",
    });
    const moved = await office.decisions.defer({
      id,
      expectedVersion: version,
      intakeId: later.intakeId,
      note: "The family moves back to Cairo next year.",
    });
    expect(moved.reference).toMatch(/^2033-\d{4}$/);
    const old = await office.applications.application({ id });
    expect(old).toMatchObject({ state: "deferred", deferredToId: moved.id });
    const carried = await office.applications.application({ id: moved.id });
    expect(carried).toMatchObject({
      state: "submitted",
      deferredFromId: id,
      answers: [{ label: "Which bus route?", value: "Maadi" }],
    });
    expect(
      await rejection(
        office.decisions.defer({
          id: moved.id,
          expectedVersion: carried.version,
          intakeId: now.intakeId,
          note: "",
        }),
      ),
    ).toMatchObject({ code: "CONFLICT" });
  });
});

/** An application accepted by its family, ready to enrol. */
async function accepted(
  family: Family,
  intakeId: string,
  input: Parameters<typeof filledDraft>[2] = {},
) {
  const office = await officer();
  const { id } = await inReview(family, intakeId, input);
  await decide(office, [id], "offer");
  await release(office, [id]);
  const row = await mineOf(family, id);
  await family.applying.answer({
    id,
    expectedVersion: row.version,
    answer: "accept",
    note: "",
  });
  return id;
}

describe("enrolling", () => {
  test("an accepted applicant becomes a student placed for the intake's year, and the family their parent", async () => {
    const { intakeId } = await intakeFor("Grade 2", { capacity: 5 });
    const office = await officer();
    const { api: family } = await registeredFamily("salama.enrol@example.com");
    const id = await accepted(family, intakeId, { birthDate: "2020-04-04" });
    const before = await office.applications.application({ id });
    const { enrolled } = await office.decisions.convert({
      applications: [{ id, expectedVersion: before.version }],
    });
    const studentId = enrolled[0]?.studentId ?? "";
    expect(studentId).toBe(before.child.id);

    const record = await office.applications.application({ id });
    expect(record).toMatchObject({
      state: "enrolled",
      studentId,
      moves: [],
    });
    const student = await office.people.student({ id: studentId });
    expect(student.reference).toBe(before.reference);
    const placement = student.placements.find(
      (row) => row.yearTitleEn === "2027–2028",
    );
    expect(placement).toMatchObject({ from: "2027-09-12" });
    expect(placement?.previousSchool).toBe("Little Steps Nursery");
    const parent = student.guardians?.find(
      (row) => row.userId === before.family.id,
    );
    expect(parent).toMatchObject({ legalGuardian: true, portalAccess: true });

    const me = await family.identity.currentUser();
    expect(me.capabilities).toContain("applications:submit");
    const mine = await mineOf(family, id);
    expect(mine.letters.map((letter) => letter.kind)).toEqual([
      "offer",
      "welcome",
    ]);
    expect(
      await rejection(
        office.decisions.convert({
          applications: [{ id, expectedVersion: record.version }],
        }),
      ),
    ).toMatchObject({ code: "CONFLICT" });
  });

  test("a former student applying again is enrolled as the student the school already has", async () => {
    const office = await officer();
    const { rows } = await office.people.students({});
    const known = rows[0];
    if (!known) throw new Error("the seed has no student");
    const full = await office.people.student({ id: known.id });
    if (!full.birthDate || !full.fullNameEn || !full.fullNameAr)
      throw new Error("the seed's student has no birth date or name");
    const { intakeId } = await intakeFor("Grade 5", {
      capacity: 5,
      anyAge: true,
    });
    const { api: family } = await registeredFamily("salama.again@example.com");
    const id = await accepted(family, intakeId, {
      birthDate: full.birthDate,
      childNames: names(full.fullNameEn, full.fullNameAr),
    });
    const before = await office.applications.application({ id });
    expect(before.matches.students.map((row) => row.id)).toContain(known.id);
    expect(
      await rejection(
        office.decisions.convert({
          applications: [
            {
              id,
              expectedVersion: before.version,
              studentId: before.family.id,
            },
          ],
        }),
      ),
    ).toMatchObject({ message: "enrol.not_matched" });
    const { enrolled } = await office.decisions.convert({
      applications: [
        { id, expectedVersion: before.version, studentId: known.id },
      ],
    });
    expect(enrolled[0]?.studentId).toBe(known.id);
    const student = await office.people.student({ id: known.id });
    expect(student.reference).toBe(full.reference);
    expect(
      student.guardians?.some((row) => row.userId === before.family.id),
    ).toBe(true);
  });
});

describe("events", () => {
  test("an interview is booked with who attends, and attending it has its step in", async () => {
    await laterYear();
    const { intakeId } = await intakeFor("Grade 3", {
      year: "2033–2034",
      anyAge: true,
      interview: true,
    });
    const office = await officer();
    const { api: family } = await registeredFamily("salama.meet@example.com");
    const { id } = await inReview(family, intakeId, {
      birthDate: "2019-01-01",
    });
    const record = await office.applications.application({ id });
    const step = record.items.find((item) => item.kind === "interview");
    const team = await office.decisions.attendees();
    const booked = await office.decisions.saveEvent({
      applicationId: id,
      expectedVersion: 0,
      kind: "interview",
      itemId: step?.id ?? "",
      date: "2027-02-10",
      startTime: "10:00",
      endTime: "10:30",
      location: "Admissions office",
      attendeeIds: team.slice(0, 1).map((row) => row.id),
    });
    const seen = await mineOf(family, id);
    expect(seen.events).toMatchObject([
      { kind: "interview", startsOn: "2027-02-10", startTime: "10:00" },
    ]);
    await office.decisions.recordEvent({
      applicationId: id,
      id: booked.id,
      expectedVersion: booked.version,
      outcome: "attended",
      result: "A warm, curious child.",
    });
    const after = await office.applications.application({ id });
    expect(after.items.find((item) => item.id === step?.id)?.state).toBe(
      "received",
    );
    expect(after.events[0]).toMatchObject({
      outcome: "attended",
      result: "A warm, curious child.",
    });
  });
});

describe("letters", () => {
  test("each phase's letter is a template the school edits in either language, and never removes", async () => {
    const office = await officer();
    const letters = await office.templates.list({ kind: "admission_letter" });
    expect(
      letters
        .map((row) => row.builtinKey ?? "")
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual([
      "admission_decline_ar",
      "admission_decline_en",
      "admission_offer_ar",
      "admission_offer_en",
      "admission_waitlist_ar",
      "admission_waitlist_en",
      "admission_welcome_ar",
      "admission_welcome_en",
    ]);
    const waitlist = letters.find(
      (row) => row.builtinKey === "admission_waitlist_en",
    );
    if (!waitlist) throw new Error("no waiting-list letter");
    await office.templates.update({
      id: waitlist.id,
      expectedVersion: waitlist.version,
      title: "On our waiting list",
      content: plainContent(
        "Dear {family},\n\n{child} is on the waiting list for {grade} at {school}.",
      ),
    });
    expect(
      await rejection(office.templates.remove({ id: waitlist.id })),
    ).toMatchObject({ message: "templates.kept" });

    await laterYear();
    const { intakeId } = await intakeFor("Grade 6", {
      year: "2033–2034",
      anyAge: true,
    });
    const { api: family } = await registeredFamily("salama.words@example.com");
    const { id } = await inReview(family, intakeId, {
      birthDate: "2016-01-01",
    });
    await decide(office, [id], "waitlist");
    await release(office, [id]);
    const row = await mineOf(family, id);
    expect(row.letters[0]?.title).toBe("On our waiting list");
    const letter = await family.applying.letter({
      id: row.letters[0]?.id ?? "",
    });
    expect(contentPlainText(letter.content)).toContain(
      "Omar Ashoush is on the waiting list for Grade 6",
    );
  });
});

describe("the website's doors into admissions", () => {
  test("a published page lists the intakes from admissions and leads into applying, without their places", async () => {
    const api = await principal();
    const admissions = { ...newSection("admissions"), id: crypto.randomUUID() };
    const door = {
      ...newSection("registerApply"),
      id: crypto.randomUUID(),
      data: {
        ...newSection("registerApply").data,
        heading: "Ready to apply?",
        intake: "",
        button: "Register and apply",
      },
    };
    const saved = await api.site.savePage({
      id: "",
      expectedVersion: 0,
      parentId: "",
      slug: "places",
      titleEn: "Places",
      titleAr: "المقاعد",
      inMenu: false,
      content: {
        sections: [admissions, door],
        description: "",
        reviewed: [],
      },
      translation: null,
    });
    await api.site.publishPage({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const page = await client("northwind").site.publicSitePage({
      school: "northwind",
      locale: "en",
      slug: "places",
    });
    const kg1 = page.intakes.find((intake) => intake.gradeEn === "KG1");
    expect(kg1).toMatchObject({
      yearTitleEn: "2027–2028",
      currency: "EGP",
      decisionsOn: "2027-04-15",
    });
    expect(kg1?.fees.map((fee) => fee.kind)).toContain("tuition");
    expect(kg1).not.toHaveProperty("capacity");
  });
});
