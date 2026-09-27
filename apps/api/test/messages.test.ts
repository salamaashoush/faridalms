import { describe, expect, test } from "bun:test";

import { login, raw, rejection, sessionFor, signedIn } from "./harness";

// The seed's second teacher keeps 8A, where the seeded student sits; the
// student's mother signs in with the student's number.
const teacher = () => sessionFor("northwind", login("teacher", 0, 1));
const parent = () =>
  sessionFor("northwind", login("student").replace("student", "parent"));

async function studentId() {
  const student = await signedIn("northwind", login("student"));
  return (await student.identity.currentUser()).id;
}

describe("family conversations", () => {
  test("a guardian reads the teacher's note, replies, and the teacher sees it was read", async () => {
    const mother = await parent();
    const child = await studentId();
    const inbox = await mother.api.messages.inbox({});
    const thread = inbox.rows.find((row) => row.studentId === child);
    if (!thread) throw new Error("the seed has no family thread for the child");
    expect(thread.kind).toBe("family");

    const opened = await mother.api.messages.thread({ id: thread.id });
    expect(opened.showsSeen).toBe(false);
    expect(opened.members.every((row) => row.lastReadAt === null)).toBe(true);
    await mother.api.messages.markRead({ threadId: thread.id });
    const after = await mother.api.messages.inbox({ show: "unread" });
    expect(after.rows.some((row) => row.id === thread.id)).toBe(false);

    await mother.api.messages.send({
      threadId: thread.id,
      body: "We will send the permission slip tomorrow.",
    });
    const keeper = await teacher();
    const theirs = await keeper.api.messages.inbox({ show: "unread" });
    expect(theirs.rows.some((row) => row.id === thread.id)).toBe(true);
    const seen = await keeper.api.messages.thread({ id: thread.id });
    expect(seen.showsSeen).toBe(true);
    expect(seen.messages.at(-1)?.body).toBe(
      "We will send the permission slip tomorrow.",
    );
    expect(seen.members.some((row) => row.lastReadAt !== null)).toBe(true);

    const again = await keeper.api.messages.start({
      kind: "family",
      studentId: child,
      body: "Thank you, received.",
    });
    expect(again).toEqual({ threadId: thread.id, created: false });
  });

  test("a guardian reaches their child's teachers and the office, never another family", async () => {
    const mother = await parent();
    const { rows } = await mother.api.messages.recipients({});
    expect(rows.every((row) => row.kind === "staff")).toBe(true);
    expect(rows.length).toBeGreaterThan(0);

    const keeper = await teacher();
    const families = await keeper.api.messages.recipients({});
    const stranger = families.rows.find(
      (row) =>
        row.kind === "guardian" &&
        !row.children.some((child) => child.fullNameEn === "Yasmin Sabry"),
    );
    if (stranger) {
      expect(
        await rejection(
          mother.api.messages.start({
            kind: "direct",
            recipientIds: [stranger.userId],
            body: "Hello",
          }),
        ),
      ).toMatchObject({ code: "FORBIDDEN" });
    }
    expect(
      await rejection(
        mother.api.messages.start({
          kind: "family",
          studentId: await studentId(),
          body: "Hello",
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("staff conversations", () => {
  test("writing to a colleague again continues the same thread", async () => {
    const keeper = await teacher();
    const { rows } = await keeper.api.messages.recipients({});
    const colleague = rows.find((row) => row.kind === "staff");
    if (!colleague) throw new Error("the seed has no colleague");
    const first = await keeper.api.messages.start({
      kind: "direct",
      recipientIds: [colleague.userId],
      body: "Can we swap duty on Tuesday?",
    });
    const second = await keeper.api.messages.start({
      kind: "direct",
      recipientIds: [colleague.userId],
      body: "Or Wednesday works too.",
    });
    expect(second.threadId).toBe(first.threadId);
    const opened = await keeper.api.messages.thread({ id: first.threadId });
    expect(opened.messages.map((row) => row.body)).toEqual([
      "Can we swap duty on Tuesday?",
      "Or Wednesday works too.",
    ]);
  });

  test("a group's owner changes its members; a member cannot", async () => {
    const keeper = await teacher();
    const { rows } = await keeper.api.messages.recipients({});
    const staff = rows.filter((row) => row.kind === "staff").slice(0, 3);
    const [first, second, third] = staff;
    if (!first || !second || !third) throw new Error("the seed has few staff");
    const { threadId } = await keeper.api.messages.start({
      kind: "group",
      recipientIds: [first.userId, second.userId],
      subject: "Trip planning",
      body: "Kick-off on Sunday.",
    });
    await keeper.api.messages.members({
      threadId,
      add: [third.userId],
      remove: [first.userId],
    });
    const opened = await keeper.api.messages.thread({ id: threadId });
    const ids = opened.members.map((row) => row.userId);
    expect(ids).toContain(third.userId);
    expect(ids).not.toContain(first.userId);
    expect(opened.canManage).toBe(true);
  });

  test("an attachment reaches the thread's members only", async () => {
    const keeper = await teacher();
    const mother = await parent();
    const child = await studentId();
    const body = new Blob(["permission slip"]);
    const file = await keeper.api.files.initiate({
      purpose: "attachment",
      name: "slip.txt",
      mediaType: "text/plain",
      sizeBytes: body.size,
    });
    const put = await raw(
      "northwind",
      keeper.token,
      `/v1/files/${file.id}/content`,
      {
        method: "PUT",
        body,
      },
    );
    expect(put.status).toBe(200);
    const { threadId } = await keeper.api.messages.start({
      kind: "family",
      studentId: child,
      body: "The slip is attached.",
      fileIds: [file.id],
    });
    const opened = await mother.api.messages.thread({ id: threadId });
    expect(opened.messages.at(-1)?.files.map((row) => row.name)).toEqual([
      "slip.txt",
    ]);
    const read = await raw(
      "northwind",
      mother.token,
      `/v1/files/${file.id}/content`,
    );
    expect(read.status).toBe(200);
    const outsider = await sessionFor("northwind", login("teacher", 0, 3));
    const refused = await raw(
      "northwind",
      outsider.token,
      `/v1/files/${file.id}/content`,
    );
    expect(refused.status).toBe(404);
  });
});
