import {
  plainContent,
  withFileBlocks,
} from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { names } from "./admission-fixtures";
import {
  login,
  raw,
  rejection,
  sessionFor,
  signedIn,
  withoutModules,
} from "./harness";

// Acme, so the people and classes made here leave Northwind's counts alone.
const SCHOOL = "acme";
const principal = () => signedIn(SCHOOL, login("principal", 1));
const teacher = () => sessionFor(SCHOOL, login("teacher", 1, 2));

type Office = Awaited<ReturnType<typeof principal>>;
type Session = Awaited<ReturnType<typeof teacher>>;

const FULL = {
  legalGuardian: true,
  portalAccess: true,
  receivesNotifications: true,
  primaryContact: true,
  emergencyContact: true,
  residence: "primary" as const,
  pickup: "allowed" as const,
};

const word = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) =>
    String.fromCodePoint(97 + (byte % 26)),
  ).join("");

async function relationId(office: Office) {
  const relations = await office.guardians.relations();
  const found = relations.find((row) => row.code === "father") ?? relations[0];
  if (!found) throw new Error("the seed has no relations");
  return found.id;
}

/**
 * A new learner whose guardian is the teacher, and a conversation the
 * office began with the learner's family, in which the teacher wrote a
 * word nobody else did and the office answered with a file.
 */
async function familyThread(staff: Session) {
  const desk = await sessionFor(SCHOOL, login("principal", 1));
  const office = desk.api;
  const me = await staff.api.identity.currentUser();
  const { id: studentId } = await office.people.saveStudent({
    names: names("Salama Ashoush", "سلامة عشوش"),
    reference: `STD-${word().slice(0, 6).toUpperCase()}`,
    birthDate: "",
  });
  const { id: linkId } = await office.guardians.saveLink({
    studentId,
    existingUserId: me.id,
    flags: { ...FULL, relationId: await relationId(office) },
  });
  const { threadId } = await office.messages.start({
    kind: "family",
    studentId,
    content: plainContent("A word about the trip."),
  });
  const said = word();
  await staff.api.messages.send({
    threadId,
    content: plainContent(`We agree, ${said}.`),
  });
  const body = new TextEncoder().encode("%PDF-1.4\nThe trip letter.\n");
  const file = await office.files.initiate({
    purpose: "message_attachment",
    name: "Trip.pdf",
    mediaType: "application/pdf",
    sizeBytes: body.byteLength,
  });
  const path = `/v1/files/${file.id}/content`;
  expect(
    (await raw(SCHOOL, desk.token, path, { method: "PUT", body })).status,
  ).toBe(200);
  // The office answers, so the teacher has a notice and an unread conversation.
  await office.messages.send({
    threadId,
    content: withFileBlocks(plainContent("The letter is attached."), [file]),
  });
  return { office, me, studentId, linkId, threadId, said, path };
}

type Thread = Awaited<ReturnType<typeof familyThread>>;

/** Every way a person reads a conversation: listed, opened, searched, told of, its files, counted. */
async function reads(staff: Session, thread: Thread) {
  const api = staff.api;
  const [inbox, unread, opened, found, notices, file] = await Promise.all([
    api.messages.inbox({}),
    api.messages.inbox({ show: "unread" }),
    api.messages.thread({ id: thread.threadId }).then(
      () => true,
      () => false,
    ),
    api.search.find({ q: thread.said, kind: "messages" }),
    api.notifications.list({}),
    raw(SCHOOL, staff.token, thread.path),
  ]);
  return {
    listed: inbox.rows.some((row) => row.id === thread.threadId),
    unread: unread.rows.some((row) => row.id === thread.threadId),
    opened,
    found: found.groups.some((group) =>
      group.rows.some((row) => row.id === thread.threadId),
    ),
    told: notices.rows.some(
      (row) =>
        row.subjectType === "message_thread" &&
        row.subjectId === thread.threadId,
    ),
    file: file.status === 200,
  };
}

const EVERY = {
  listed: true,
  unread: true,
  opened: true,
  found: true,
  told: true,
  file: true,
};
const NONE = {
  listed: false,
  unread: false,
  opened: false,
  found: false,
  told: false,
  file: false,
};

async function unreadCounts(staff: Session) {
  const [threads, notices] = await Promise.all([
    staff.api.messages.unread(),
    staff.api.notifications.recent(),
  ]);
  return { threads: threads.threads, notices: notices.unread };
}

/** The notices about the conversation the person has not read. */
async function unreadAbout(staff: Session, threadId: string) {
  const { rows } = await staff.api.notifications.list({});
  return rows.filter(
    (row) =>
      row.subjectType === "message_thread" &&
      row.subjectId === threadId &&
      row.readAt === null,
  ).length;
}

async function linkOf(office: Office, studentId: string, linkId: string) {
  const { links } = await office.guardians.custody({ studentId });
  const link = links.find((row) => row.relationshipId === linkId);
  if (!link) throw new Error("the teacher's link");
  return link;
}

describe("a member of staff who acts for a learner reads the learner's family conversations only while they do", () => {
  test("their link ends: nothing about the conversation reaches them, nothing is deleted, and a new link brings it back", async () => {
    const staff = await teacher();
    const thread = await familyThread(staff);
    expect(await reads(staff, thread)).toEqual(EVERY);
    const before = await unreadCounts(staff);
    const about = await unreadAbout(staff, thread.threadId);
    expect(about).toBeGreaterThan(0);

    const link = await linkOf(thread.office, thread.studentId, thread.linkId);
    await thread.office.guardians.endLink({
      relationshipId: thread.linkId,
      expectedVersion: link.version,
    });
    expect(await reads(staff, thread)).toEqual(NONE);
    expect(await unreadCounts(staff)).toEqual({
      threads: before.threads - 1,
      notices: before.notices - about,
    });
    for (const call of [
      () => staff.api.messages.markRead({ threadId: thread.threadId }),
      () =>
        staff.api.messages.send({
          threadId: thread.threadId,
          content: plainContent("Still here?"),
        }),
    ])
      expect(await rejection(call())).toMatchObject({ code: "NOT_FOUND" });

    // What they wrote stays in the conversation, and a new message there
    // tells them nothing.
    await thread.office.messages.send({
      threadId: thread.threadId,
      content: plainContent("One more thing."),
    });
    expect(await unreadCounts(staff)).toEqual({
      threads: before.threads - 1,
      notices: before.notices - about,
    });
    const kept = await thread.office.messages.thread({ id: thread.threadId });
    expect(
      kept.messages.some(
        (row) =>
          row.authorId === thread.me.id && row.body.includes(thread.said),
      ),
    ).toBe(true);

    await thread.office.guardians.saveLink({
      studentId: thread.studentId,
      existingUserId: thread.me.id,
      flags: { ...FULL, relationId: await relationId(thread.office) },
    });
    expect(await reads(staff, thread)).toEqual(EVERY);
  });

  test("their link is restricted from contact: the conversation is gone until the restriction is lifted", async () => {
    const staff = await teacher();
    const thread = await familyThread(staff);
    const link = await linkOf(thread.office, thread.studentId, thread.linkId);
    const custody = {
      studentId: thread.studentId,
      relationshipId: thread.linkId,
      contactRestrictions: link.contactRestrictions ?? "",
      educationalRights: link.educationalRights,
      pickup: link.pickup,
    };
    await thread.office.guardians.saveCustody({
      ...custody,
      expectedVersion: link.version,
      communicationIsolated: true,
    });
    expect(await reads(staff, thread)).toEqual(NONE);

    await thread.office.guardians.saveCustody({
      ...custody,
      expectedVersion: (
        await linkOf(thread.office, thread.studentId, thread.linkId)
      ).version,
      communicationIsolated: false,
    });
    expect(await reads(staff, thread)).toEqual(EVERY);
  });

  test("with families off the conversation is gone, and back once families is on", async () => {
    const staff = await teacher();
    const thread = await familyThread(staff);
    await withoutModules(SCHOOL, ["families"], async () => {
      expect(await reads(staff, thread)).toEqual(NONE);
    });
    expect(await reads(staff, thread)).toEqual(EVERY);
  });

  test("one who still teaches the learner keeps them as staff: their own conversation as the teacher, not the family's", async () => {
    const staff = await teacher();
    const thread = await familyThread(staff);
    const office = thread.office;
    const options = await office.classes.options();
    const { id: classId } = await office.classes.save({
      startsOn: options.today,
      code: `ST-${word().slice(0, 5).toUpperCase()}`,
      titleEn: "Chess club",
      titleAr: "نادي الشطرنج",
      teacherIds: [thread.me.id],
    });
    await office.classes.enrol({ studentId: thread.studentId, classId });
    await office.guardians.saveLink({
      studentId: thread.studentId,
      person: { names: names("Omar Ashoush", "عمر عشوش"), phone: "" },
      flags: { ...FULL, relationId: await relationId(office) },
    });
    // As the learner's teacher they write to the family themself.
    const own = await staff.api.messages.start({
      kind: "family",
      studentId: thread.studentId,
      content: plainContent("Welcome to the club."),
    });

    const link = await linkOf(office, thread.studentId, thread.linkId);
    await office.guardians.endLink({
      relationshipId: thread.linkId,
      expectedVersion: link.version,
    });
    expect(await reads(staff, thread)).toEqual(NONE);
    expect(
      (await staff.api.messages.inbox({})).rows.some(
        (row) => row.id === own.threadId,
      ),
    ).toBe(true);
    expect(
      (await staff.api.messages.thread({ id: own.threadId })).messages.at(-1)
        ?.body,
    ).toBe("Welcome to the club.");
    expect((await staff.api.people.student({ id: thread.studentId })).id).toBe(
      thread.studentId,
    );
    expect(
      await rejection(staff.api.home.details({ studentId: thread.studentId })),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});
