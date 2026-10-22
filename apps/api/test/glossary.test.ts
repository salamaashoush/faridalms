import type { ContentDocument, ContentNode } from "@faridalms/domain/content";

import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

const teacher = () => signedIn("northwind", login("teacher", 0, 0));
const student = () => signedIn("northwind", login("student"));

const text = (words: string): ContentNode => ({
  type: "text",
  version: 1,
  text: words,
  format: 0,
});

/** A lesson's words defining one term. */
const defining = (words: string, definition: string): ContentDocument => ({
  root: {
    type: "root",
    version: 1,
    children: [
      {
        type: "paragraph",
        version: 1,
        children: [
          text("Rivers end in a "),
          {
            type: "term",
            version: 1,
            definition,
            children: [text(words)],
          },
        ],
      },
    ],
  },
});

describe("a module's glossary", () => {
  test("gathers the words every lesson defines, each with its lesson, for those who teach it", async () => {
    const keeper = await teacher();
    const classId = (await keeper.classes.mine({})).rows[0]?.id;
    if (!classId) throw new Error("the seed teacher keeps no class");
    const module = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "River words",
      summary: "",
      classIds: [classId],
      prerequisiteId: "",
      sequential: false,
    });
    const lesson = (title: string, content: ContentDocument) =>
      keeper.learning.saveLesson({
        id: "",
        moduleId: module.id,
        expectedVersion: 0,
        title,
        completion: "view",
        passScore: null,
        content,
        publish: false,
      });
    await lesson(
      "Deltas",
      defining("delta", "Land a river builds at its mouth"),
    );
    await lesson("Mouths", defining("estuary", "Where a river meets the sea"));
    const words = await keeper.learning.moduleGlossary({ id: module.id });
    expect(words.map((entry) => [entry.words, entry.lessonTitle])).toEqual([
      ["delta", "Deltas"],
      ["estuary", "Mouths"],
    ]);
    // A module nobody has been shown yet is no student's to read.
    expect(
      await rejection(
        (await student()).learning.moduleGlossary({ id: module.id }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});
