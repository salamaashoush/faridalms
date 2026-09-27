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
  const editor = buildContentEditor();
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
    const target = classes.find((row) => row.classType === "scheduled");
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

  test("a teacher without the class gets no ticket, and a forged one is refused", async () => {
    const teacher = await arabicTeacher();
    const { classes } = await teacher.api.coursework.options();
    const target = classes.find((row) => row.classType === "scheduled");
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
