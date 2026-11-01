import {
  plainContent,
  withFileBlocks,
} from "@faridalms/domain/content-conversion";
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
      content: plainContent("We will send the permission slip tomorrow."),
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
      content: plainContent("Thank you, received."),
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
            content: plainContent("Hello"),
          }),
        ),
      ).toMatchObject({ code: "FORBIDDEN" });
    }
    expect(
      await rejection(
        mother.api.messages.start({
          kind: "family",
          studentId: await studentId(),
          content: plainContent("Hello"),
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
      content: plainContent("Can we swap duty on Tuesday?"),
    });
    const second = await keeper.api.messages.start({
      kind: "direct",
      recipientIds: [colleague.userId],
      content: plainContent("Or Wednesday works too."),
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
      content: plainContent("Kick-off on Sunday."),
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
      purpose: "document_media",
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
      content: withFileBlocks(plainContent("The slip is attached."), [file]),
    });
    const opened = await mother.api.messages.thread({ id: threadId });
    expect(
      opened.messages
        .at(-1)
        ?.content?.root.children?.filter((node) => node.type === "file")
        .map((node) => node.name),
    ).toEqual(["slip.txt"]);
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

describe("a family's attachments", () => {
  test("go on the family's own draft and message, checked like any upload, and open for the conversation alone", async () => {
    const mother = await parent();
    const child = await studentId();
    const thread = (await mother.api.messages.inbox({})).rows.find(
      (row) => row.studentId === child,
    );
    if (!thread) throw new Error("the seed has no family thread for the child");
    expect(
      await rejection(
        mother.api.files.initiate({
          purpose: "message_attachment",
          name: "run-me.exe",
          mediaType: "application/octet-stream",
          sizeBytes: 10,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    const body = new TextEncoder().encode("%PDF-1.4\nExcused from swimming.\n");
    const file = await mother.api.files.initiate({
      purpose: "message_attachment",
      name: "Doctor's note.pdf",
      mediaType: "application/pdf",
      sizeBytes: body.byteLength,
    });
    const path = `/v1/files/${file.id}/content`;
    expect(
      (await raw("northwind", mother.token, path, { method: "PUT", body }))
        .status,
    ).toBe(200);
    const content = withFileBlocks(plainContent("The note from the doctor."), [
      file,
    ]);
    const kept = await mother.api.messages.saveDraft({
      threadId: thread.id,
      content,
    });
    const keeper = await teacher();
    expect((await raw("northwind", keeper.token, path)).status).toBe(404);

    await mother.api.messages.send({ threadId: thread.id, content });
    expect(await mother.api.messages.draft({ id: kept.id })).toBeNull();
    const seen = await keeper.api.messages.thread({ id: thread.id });
    expect(
      seen.messages
        .at(-1)
        ?.content?.root.children?.filter((node) => node.type === "file")
        .map((node) => node.name),
    ).toEqual(["Doctor's note.pdf"]);
    const read = await raw("northwind", keeper.token, path);
    expect(read.status).toBe(200);
    expect(await read.text()).toContain("Excused from swimming.");
    const outsider = await sessionFor("northwind", login("teacher", 0, 3));
    expect((await raw("northwind", outsider.token, path)).status).toBe(404);
  });
});

type Session = Awaited<ReturnType<typeof sessionFor>>;

async function upload(session: Session, name: string) {
  const body = new Blob([`contents of ${name}`]);
  const file = await session.api.files.initiate({
    purpose: "document_media",
    name,
    mediaType: "text/plain",
    sizeBytes: body.size,
  });
  const put = await raw(
    "northwind",
    session.token,
    `/v1/files/${file.id}/content`,
    { method: "PUT", body },
  );
  expect(put.status).toBe(200);
  return file;
}

/** Words in bold, as the editor's toolbar writes them. */
function bold(words: string) {
  const document = plainContent(words);
  return JSON.parse(
    JSON.stringify(document).replace('"format":0', '"format":1'),
  ) as typeof document;
}

const isBold = (content: unknown) =>
  JSON.stringify(content).includes('"format":1');

type Recipients = Awaited<ReturnType<Session["api"]["messages"]["recipients"]>>;

/** Everyone a session may write to, every page of them. */
async function everyone(
  session: Session,
  after: Recipients["next"] = null,
): Promise<Recipients["rows"]> {
  const page = await session.api.messages.recipients({ after });
  return page.next
    ? [...page.rows, ...(await everyone(session, page.next))]
    : page.rows;
}

/** Runs one call after another, in order, since each entry's time matters. */
function inTurn<T>(items: readonly T[], run: (item: T) => Promise<unknown>) {
  return items.reduce<Promise<unknown>>(
    (previous, item) => previous.then(() => run(item)),
    Promise.resolve(),
  );
}

describe("drafts", () => {
  test("a new message kept as a draft keeps its words, formatting and file, reopens, and sends once", async () => {
    const writer = await teacher();
    const { rows } = await writer.api.messages.recipients({});
    const colleague = rows.find((row) => row.kind === "staff");
    if (!colleague) throw new Error("the seed has no colleague");
    const file = await upload(writer, "reading-log.txt");
    const words = `Salama will finish this later ${crypto.randomUUID()}`;
    const first = await writer.api.messages.saveDraft({
      kind: "direct",
      recipientIds: [colleague.userId],
      content: bold("Salama"),
    });
    expect(first.id).not.toBe("");
    const kept = await writer.api.messages.saveDraft({
      id: first.id,
      version: first.version,
      kind: "direct",
      recipientIds: [colleague.userId],
      content: withFileBlocks(bold(words), [file]),
    });
    expect(kept.version).toBeGreaterThan(first.version);
    expect(
      await rejection(
        writer.api.messages.saveDraft({
          id: first.id,
          version: first.version,
          kind: "direct",
          content: plainContent("from another tab"),
        }),
      ),
    ).toMatchObject({
      code: "CONFLICT",
      message: "message_draft.revision_conflict",
    });

    const listed = await writer.api.messages.drafts({});
    const row = listed.rows.find((draft) => draft.id === first.id);
    expect(row).toMatchObject({ threadId: null, hasFiles: true });
    expect(row?.body).toBe(`${words}\nreading-log.txt`);
    expect(row?.to.map((person) => person.userId)).toEqual([colleague.userId]);

    const reopened = await writer.api.messages.draft({ id: first.id });
    if (!reopened || reopened.reply)
      throw new Error("the draft did not reopen");
    expect(reopened.recipients.map((person) => person.userId)).toEqual([
      colleague.userId,
    ]);
    expect(isBold(reopened.content)).toBe(true);
    expect(
      reopened.content.root.children
        ?.filter((node) => node.type === "file")
        .map((node) => node.name),
    ).toEqual(["reading-log.txt"]);

    const stranger = await parent();
    expect(
      (await raw("northwind", stranger.token, `/v1/files/${file.id}/content`))
        .status,
    ).toBe(404);

    const sent = await writer.api.messages.start({
      kind: "direct",
      recipientIds: [colleague.userId],
      content: withFileBlocks(bold(words), [file]),
      draftId: first.id,
      draftVersion: kept.version,
    });
    expect(
      await rejection(
        writer.api.messages.start({
          kind: "direct",
          recipientIds: [colleague.userId],
          content: withFileBlocks(bold(words), [file]),
          draftId: first.id,
          draftVersion: kept.version,
        }),
      ),
    ).toMatchObject({
      code: "CONFLICT",
      message: "message_draft.revision_conflict",
    });
    const thread = await writer.api.messages.thread({ id: sent.threadId });
    expect(
      thread.messages.filter((entry) => entry.body.startsWith(words)),
    ).toHaveLength(1);
    expect(isBold(thread.messages.at(-1)?.content)).toBe(true);
    expect(await writer.api.messages.draft({ id: first.id })).toBeNull();
    expect(
      (await writer.api.messages.drafts({})).rows.some(
        (draft) => draft.id === first.id,
      ),
    ).toBe(false);
  });

  test("a draft is deleted at the version read, and only its writer reaches it", async () => {
    const mother = await parent();
    const kept = await mother.api.messages.saveDraft({
      kind: "direct",
      content: plainContent("A thought for later"),
    });
    const keeper = await teacher();
    expect(await keeper.api.messages.draft({ id: kept.id })).toBeNull();
    expect(
      await rejection(
        keeper.api.messages.discardDraft({
          id: kept.id,
          version: kept.version,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT" });
    expect(
      await rejection(
        mother.api.messages.discardDraft({
          id: kept.id,
          version: kept.version + 1,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT" });
    await mother.api.messages.discardDraft({
      id: kept.id,
      version: kept.version,
    });
    expect(await mother.api.messages.draft({ id: kept.id })).toBeNull();
  });

  test("emptying a draft lets it go", async () => {
    const mother = await parent();
    const kept = await mother.api.messages.saveDraft({
      kind: "direct",
      content: plainContent("Never mind"),
    });
    const emptied = await mother.api.messages.saveDraft({
      id: kept.id,
      version: kept.version,
      kind: "direct",
      content: plainContent(""),
    });
    expect(emptied).toEqual({ id: "", version: 0 });
    expect(await mother.api.messages.draft({ id: kept.id })).toBeNull();
  });

  test("a reply being written keeps its formatting and file, and goes when it is sent", async () => {
    const keeper = await teacher();
    const child = await studentId();
    const inbox = await keeper.api.messages.inbox({});
    const family = inbox.rows.find(
      (row) => row.kind === "family" && row.studentId === child,
    );
    if (!family) throw new Error("the seed has no family thread for the child");
    const file = await upload(keeper, "signed-slip.txt");
    const words = `Signed and attached ${crypto.randomUUID()}`;
    const kept = await keeper.api.messages.saveDraft({
      threadId: family.id,
      content: withFileBlocks(bold(words), [file]),
    });
    const opened = await keeper.api.messages.thread({ id: family.id });
    expect(opened.draft?.id).toBe(kept.id);
    expect(isBold(opened.draft?.content)).toBe(true);
    expect(
      opened.draft?.content.root.children
        ?.filter((node) => node.type === "file")
        .map((node) => node.name),
    ).toEqual(["signed-slip.txt"]);
    expect(
      (await keeper.api.messages.inbox({})).rows.find(
        (row) => row.id === family.id,
      )?.hasDraft,
    ).toBe(true);
    expect(
      (await keeper.api.messages.drafts({})).rows.find(
        (row) => row.id === kept.id,
      )?.threadId,
    ).toBe(family.id);
    expect(
      await rejection(
        keeper.api.messages.saveDraft({
          threadId: family.id,
          content: plainContent("a second draft of the same reply"),
        }),
      ),
    ).toMatchObject({ code: "CONFLICT" });

    await keeper.api.messages.send({
      threadId: family.id,
      content: withFileBlocks(bold(words), [file]),
    });
    const after = await keeper.api.messages.thread({ id: family.id });
    expect(after.draft).toBeNull();
    const sent = after.messages.at(-1);
    expect(sent?.body).toBe(`${words}\nsigned-slip.txt`);
    expect(
      sent?.content?.root.children
        ?.filter((node) => node.type === "file")
        .map((node) => node.fileId),
    ).toEqual([file.id]);
    const mother = await parent();
    expect(
      (await raw("northwind", mother.token, `/v1/files/${file.id}/content`))
        .status,
    ).toBe(200);
  });
});

describe("paging", () => {
  test("recipient search pages past its first results with a cursor", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const first = await office.api.messages.recipients({});
    expect(first.rows).toHaveLength(30);
    if (!first.next) throw new Error("the seed has too few people to page");
    const second = await office.api.messages.recipients({ after: first.next });
    expect(second.rows.length).toBeGreaterThan(0);
    const ids = [...first.rows, ...second.rows].map((row) => row.userId);
    expect(new Set(ids).size).toBe(ids.length);
    const kinds = [...first.rows, ...second.rows].map((row) => row.kind);
    const rank = { staff: 0, guardian: 1, student: 2 } as const;
    expect(kinds.map((kind) => rank[kind])).toEqual(
      kinds.map((kind) => rank[kind]).toSorted((a, b) => a - b),
    );
  });

  test("the inbox pages past its first conversations, and an old unread one is reachable", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const keeper = await teacher();
    const keeperId = (await keeper.api.identity.currentUser()).id;
    const answered = await office.api.messages.start({
      kind: "direct",
      recipientIds: [keeperId],
      content: plainContent(`Can you cover the trip? ${crypto.randomUUID()}`),
    });
    const file = await upload(keeper, "rota.txt");
    await keeper.api.messages.send({
      threadId: answered.threadId,
      content: withFileBlocks(plainContent("Yes, rota attached."), [file]),
    });
    // The answer is unread, and 51 conversations the office writes later
    // push it below the first page.
    const people = (await everyone(office)).filter(
      (row) => row.userId !== keeperId,
    );
    if (people.length < 51) throw new Error("the seed has too few people");
    await inTurn(people.slice(0, 51), (person) =>
      office.api.messages.start({
        kind: "direct",
        recipientIds: [person.userId],
        content: plainContent(`Term notes ${crypto.randomUUID()}`),
      }),
    );

    const page = await office.api.messages.inbox({});
    expect(page.rows).toHaveLength(50);
    if (!page.next) throw new Error("the inbox did not page");
    expect(page.rows.some((row) => row.id === answered.threadId)).toBe(false);
    const rest = await office.api.messages.inbox({ after: page.next });
    const ids = [...page.rows, ...rest.rows].map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    const row = rest.rows.find((one) => one.id === answered.threadId);
    expect(row).toMatchObject({ messageCount: 2, hasFiles: true, unread: 1 });

    const unread = await office.api.messages.inbox({ show: "unread" });
    expect(unread.rows.map((one) => one.id)).toContain(answered.threadId);
    expect(unread.rows.every((one) => one.unread > 0)).toBe(true);
  }, 30_000);

  test("a conversation reads back past its latest hundred entries", async () => {
    const keeper = await teacher();
    const { rows } = await keeper.api.messages.recipients({});
    const colleague = rows.findLast((row) => row.kind === "staff");
    if (!colleague) throw new Error("the seed has no colleague");
    const { threadId } = await keeper.api.messages.start({
      kind: "group",
      recipientIds: [
        colleague.userId,
        ...rows
          .filter(
            (row) => row.kind === "staff" && row.userId !== colleague.userId,
          )
          .slice(0, 1)
          .map((row) => row.userId),
      ],
      subject: `Long thread ${crypto.randomUUID().slice(0, 8)}`,
      content: plainContent("Entry 0"),
    });
    await inTurn(
      Array.from({ length: 104 }, (_, index) => index + 1),
      (index) =>
        keeper.api.messages.send({
          threadId,
          content: plainContent(`Entry ${index}`),
        }),
    );
    const latest = await keeper.api.messages.thread({ id: threadId });
    expect(latest.messages).toHaveLength(100);
    expect(latest.hasMore).toBe(true);
    expect(latest.messages[0]?.body).toBe("Entry 5");
    const earlier = await keeper.api.messages.thread({
      id: threadId,
      before: latest.messages[0]?.id ?? "",
    });
    expect(earlier.hasMore).toBe(false);
    expect(earlier.messages.map((entry) => entry.body)).toEqual([
      "Entry 0",
      "Entry 1",
      "Entry 2",
      "Entry 3",
      "Entry 4",
    ]);
  }, 30_000);
});

describe("what a conversation says about its people", () => {
  test("a guardian says which child a message is about, and only their own", async () => {
    const mother = await parent();
    const child = await studentId();
    const inbox = await mother.api.messages.inbox({});
    expect(inbox.children.map((row) => row.userId)).toContain(child);
    const { rows } = await mother.api.messages.recipients({});
    const keeper = rows.find((row) => row.kind === "staff");
    if (!keeper) throw new Error("no one for the parent to write to");
    const { threadId } = await mother.api.messages.start({
      kind: "direct",
      recipientIds: [keeper.userId],
      studentId: child,
      content: plainContent("About the multiplication worksheet"),
    });
    const opened = await mother.api.messages.thread({ id: threadId });
    expect(opened.student?.id).toBe(child);
    const office = await sessionFor("northwind", login("principal"));
    const other = (await everyone(office)).find(
      (row) => row.kind === "student" && row.userId !== child,
    );
    if (!other) throw new Error("the seed has no other student");
    expect(
      await rejection(
        mother.api.messages.start({
          kind: "direct",
          recipientIds: [keeper.userId],
          studentId: other.userId,
          content: plainContent("About someone else's child"),
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("names link to people only where the viewer already reaches them", async () => {
    const mother = await parent();
    const child = await studentId();
    const family = (await mother.api.messages.inbox({})).rows.find(
      (row) => row.kind === "family" && row.studentId === child,
    );
    if (!family) throw new Error("the seed has no family thread for the child");
    const theirs = await mother.api.messages.thread({ id: family.id });
    expect(theirs.members.every((row) => row.link === null)).toBe(true);
    expect(theirs.messages.every((row) => row.authorLink === null)).toBe(true);

    const keeper = await teacher();
    const ours = await keeper.api.messages.thread({ id: family.id });
    const guardians = ours.members.filter((row) => row.role === "member");
    expect(guardians.length).toBeGreaterThan(0);
    expect(guardians.every((row) => row.link === "person")).toBe(true);
    const self = ours.members.find((row) => row.role === "owner");
    expect(self?.link).toBeNull();
  });
});
