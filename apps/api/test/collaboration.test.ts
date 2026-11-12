import type { Provider } from "@lexical/yjs";

import { createCollab, serve } from "@faridalms/collab";
import { openCollab } from "@faridalms/database/context";
import { plainContent } from "@faridalms/domain/content-conversion";
import { buildContentEditor } from "@faridalms/editor/headless";
import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  createBinding,
  syncLexicalUpdateToYjs,
  syncYjsChangesToLexical,
} from "@lexical/yjs";
import { afterAll, describe, expect, test } from "bun:test";
import { $createTextNode, $getRoot, $isElementNode } from "lexical";
import * as Y from "yjs";

import { login, rejection, seeded, sessionFor, signedIn } from "./harness";

const arabicTeacher = () => sessionFor("northwind", login("teacher", 0, 1));
const englishTeacher = () => signedIn("northwind", login("teacher", 0, 2));

const collab = openCollab(seeded().collabUrl);
const server = serve(
  createCollab({ collab, cellSecret: seeded().cellSecret, debounceMs: 50 }),
  0,
  seeded().cellSecret,
);
afterAll(async () => {
  await server.stop(true);
  await collab.close();
});

const quiet = {
  awareness: {
    getLocalState: () => null,
    getStates: () => new Map(),
    on: () => {},
    off: () => {},
    setLocalState: () => {},
    setLocalStateField: () => {},
  },
  connect: () => {},
  disconnect: () => {},
  on: () => {},
  off: () => {},
} as unknown as Provider;

/** A client as the browser editor runs it: a Lexical editor bound to the shared document. */
function client(room: string, token: string) {
  const doc = new Y.Doc();
  const editor = buildContentEditor({ empty: true });
  const binding = createBinding(
    editor,
    quiet,
    "root",
    doc,
    new Map([["root", doc]]),
  );
  binding.root.getSharedType().observeDeep((events, transaction) => {
    if (transaction.origin !== binding)
      syncYjsChangesToLexical(binding, quiet, events as never, false, () => {});
  });
  const failed: string[] = [];
  const provider = new HocuspocusProvider({
    url: `ws://127.0.0.1:${server.port}`,
    name: room,
    token,
    document: doc,
    onAuthenticationFailed: ({ reason }) => failed.push(reason),
  });
  // Like the editor plugin, local edits flow out only once the shared state
  // has arrived, so a client never offers its own empty page as content.
  const synced = new Promise<void>((resolve) => {
    provider.on("synced", () => {
      editor.registerUpdateListener(
        ({
          prevEditorState,
          editorState,
          dirtyElements,
          dirtyLeaves,
          normalizedNodes,
          tags,
        }) =>
          syncLexicalUpdateToYjs(
            binding,
            quiet,
            prevEditorState,
            editorState,
            dirtyElements,
            dirtyLeaves,
            normalizedNodes,
            tags,
          ),
      );
      resolve();
    });
  });
  const text = () =>
    editor.getEditorState().read(() => $getRoot().getTextContent());
  return { editor, provider, synced, failed, text };
}

const held = (value: unknown) =>
  JSON.stringify(value).includes("answer the questions");

/** Adds words to the end of a client's last paragraph, as typing would. */
function append(editor: ReturnType<typeof client>, words: string) {
  editor.editor.update(
    () => {
      const last = $getRoot().getLastChild();
      if ($isElementNode(last)) last.append($createTextNode(words));
    },
    { discrete: true },
  );
}

async function until(check: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await check()) return;
    await Bun.sleep(50);
  }
  throw new Error("timed out waiting");
}

describe("editing an assignment brief together", () => {
  test("two teachers' edits meet, and the brief keeps what they wrote", async () => {
    const teacher = await arabicTeacher();
    const { classes } = await teacher.api.coursework.options();
    const target = classes.find((row) => row.subjectId !== null);
    if (!target) throw new Error("the teacher has no scheduled class");
    const saved = await teacher.api.coursework.save({
      classId: target.id,
      title: "Shared brief",
      brief: plainContent("Read chapter one."),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 10,
      rubric: null,
    });

    const first = await teacher.api.documents.collaborate({
      hostType: "assignment",
      hostId: saved.id,
    });
    expect(first.access).toBe("write");
    const a = client(first.room, first.token);
    await a.synced;
    await until(() => a.text().includes("Read chapter one."));

    const second = await teacher.api.documents.collaborate({
      hostType: "assignment",
      hostId: saved.id,
    });
    const b = client(second.room, second.token);
    await b.synced;
    await until(() => b.text().includes("Read chapter one."));

    a.editor.update(
      () => {
        const opening = $getRoot().getFirstChild();
        if ($isElementNode(opening))
          opening.append($createTextNode(" Then summarise."));
      },
      { discrete: true },
    );
    await until(() => b.text().includes("Then summarise."));

    a.provider.destroy();
    b.provider.destroy();
    await until(async () => {
      const opened = await teacher.api.coursework.editor({ id: saved.id });
      return JSON.stringify(opened.brief).includes("Then summarise.");
    });
  });

  test("a room opened again from its stored state keeps the brief as it was", async () => {
    const teacher = await arabicTeacher();
    const { classes } = await teacher.api.coursework.options();
    const target = classes.find((row) => row.subjectId !== null);
    if (!target) throw new Error("the teacher has no scheduled class");
    const saved = await teacher.api.coursework.save({
      classId: target.id,
      title: "Reopened brief",
      brief: plainContent("First line."),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 10,
      rubric: null,
    });
    const open = async () => {
      const ticket = await teacher.api.documents.collaborate({
        hostType: "assignment",
        hostId: saved.id,
      });
      const editor = client(ticket.room, ticket.token);
      await editor.synced;
      return editor;
    };
    const stored = async () =>
      JSON.stringify(
        (await teacher.api.coursework.editor({ id: saved.id })).brief,
      );

    const first = await open();
    await until(() => first.text().includes("First line."));
    append(first, " Second.");
    await until(async () => (await stored()).includes("Second."));
    first.provider.destroy();
    await Bun.sleep(300);

    const again = await open();
    await until(() => again.text().includes("Second."));
    append(again, " Third.");
    await until(async () => (await stored()).includes("Third."));
    again.provider.destroy();
    const brief = (await teacher.api.coursework.editor({ id: saved.id })).brief;
    expect(brief?.root.children).toHaveLength(1);
    expect(JSON.stringify(brief)).toContain("First line. Second. Third.");
  });

  test("live edits to work already out wait for Update before students read them", async () => {
    const teacher = await arabicTeacher();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const { classes } = await teacher.api.coursework.options();
    let target: (typeof classes)[number] | undefined;
    for (const row of classes.filter((item) => item.subjectId !== null)) {
      const { roster } = await teacher.api.classes.groups({
        classId: row.id,
      });
      if (roster.some((pupil) => pupil.id === me.id)) target = row;
    }
    if (!target) throw new Error("the seeded student takes no Arabic class");
    const saved = await teacher.api.coursework.save({
      classId: target.id,
      title: "Held brief",
      brief: plainContent("Read chapter two."),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 10,
      rubric: null,
    });
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });

    const ticket = await teacher.api.documents.collaborate({
      hostType: "assignment",
      hostId: saved.id,
    });
    const a = client(ticket.room, ticket.token);
    await a.synced;
    await until(() => a.text().includes("Read chapter two."));
    a.editor.update(
      () => {
        const opening = $getRoot().getFirstChild();
        if ($isElementNode(opening))
          opening.append($createTextNode(" Then answer the questions."));
      },
      { discrete: true },
    );
    let opened = await teacher.api.coursework.editor({ id: saved.id });
    await until(async () => {
      opened = await teacher.api.coursework.editor({ id: saved.id });
      return JSON.stringify(opened.brief).includes("answer the questions");
    });
    a.provider.destroy();

    expect(held(opened.publishedBrief)).toBe(false);
    expect(
      held((await student.api.coursework.work({ id: saved.id })).brief),
    ).toBe(false);
    expect(
      held((await teacher.api.coursework.record({ id: saved.id })).brief),
    ).toBe(false);

    await teacher.api.coursework.save({
      id: saved.id,
      expectedVersion: opened.version,
      classId: target.id,
      title: "Held brief",
      brief: opened.brief ?? plainContent(""),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 10,
      rubric: null,
    });
    expect(
      held((await student.api.coursework.work({ id: saved.id })).brief),
    ).toBe(true);
  });

  test("a teacher without the class gets no ticket, and a forged one is refused", async () => {
    const teacher = await arabicTeacher();
    const { classes } = await teacher.api.coursework.options();
    const target = classes.find((row) => row.subjectId !== null);
    if (!target) throw new Error("the teacher has no scheduled class");
    const saved = await teacher.api.coursework.save({
      classId: target.id,
      title: "Private brief",
      brief: plainContent("Only for this class."),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 10,
      rubric: null,
    });
    const other = await englishTeacher();
    expect(
      await rejection(
        other.documents.collaborate({
          hostType: "assignment",
          hostId: saved.id,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    const real = await teacher.api.documents.collaborate({
      hostType: "assignment",
      hostId: saved.id,
    });
    const forged = client(real.room, `${real.token.split(".")[0]}.forged`);
    await until(() => forged.failed.length > 0);
    forged.provider.destroy();
  });
});

/** A conversation's presence room as the web joins it: awareness alone. */
function present(room: string, token: string) {
  const failed: string[] = [];
  const provider = new HocuspocusProvider({
    url: `ws://127.0.0.1:${server.port}`,
    name: room,
    token,
    document: new Y.Doc(),
    onAuthenticationFailed: ({ reason }) => failed.push(reason),
  });
  const replying = () =>
    [...(provider.awareness?.getStates() ?? new Map()).entries()]
      .filter(
        ([clientId, state]) =>
          clientId !== provider.awareness?.clientID &&
          (state as { typing?: unknown }).typing === true,
      )
      .map(([, state]) => (state as { name: string }).name);
  return { provider, failed, replying };
}

describe("someone replying in a conversation", () => {
  test("a colleague sees it while another writes, and nothing is stored", async () => {
    const office = await sessionFor("northwind", login("staff"));
    const head = await sessionFor("northwind", login("principal"));
    const logged = await office.api.admissions.logEnquiry({
      source: "walk_in",
      purpose: "enquiry",
      locale: "en",
      name: "Salama Ashoush",
      email: "salama.presence@example.com",
      phone: "",
      childName: "",
      childYear: "",
      message: "",
      assigneeId: "",
    });
    const threadId = logged.threadId ?? "";
    const mine = await office.api.messages.presence({ threadId });
    const theirs = await head.api.messages.presence({ threadId });
    expect(mine.room).toBe(theirs.room);
    expect(mine.room).toContain(":presence:");
    expect(
      await rejection((await englishTeacher()).messages.presence({ threadId })),
    ).toMatchObject({ code: "NOT_FOUND" });

    const writer = present(mine.room, mine.token);
    const colleague = present(theirs.room, theirs.token);
    writer.provider.awareness?.setLocalState({
      userId: "writer",
      name: "Salama Ashoush",
      typing: true,
    });
    await until(() => colleague.replying().includes("Salama Ashoush"));
    writer.provider.awareness?.setLocalStateField("typing", false);
    await until(() => colleague.replying().length === 0);

    // A presence room holds no document: what a client writes is refused.
    writer.provider.document.getText("words").insert(0, "hidden");
    await Bun.sleep(200);
    expect(colleague.provider.document.getText("words").length).toBe(0);

    const wrongRoom = present(`${mine.room}x`, mine.token);
    await until(() => wrongRoom.failed.length > 0);
    for (const one of [writer, colleague, wrongRoom]) one.provider.destroy();
  });
});
