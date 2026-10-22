import type { ContentDocument, ContentNode } from "@faridalms/domain/content";

import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, signedIn } from "./harness";

const teacher = (index = 0) => signedIn("northwind", login("teacher", 0, index));

/** A lesson's words naming people, each by the name given here. */
function naming(...people: { id: string; label: string }[]): ContentDocument {
  const words = plainContent("Thanks to ");
  const [line] = words.root.children ?? [];
  const mentions: ContentNode[] = people.map(({ id, label }) => ({
    type: "mention",
    version: 1,
    mention: { kind: "person", id, label },
  }));
  return {
    root: {
      ...words.root,
      children: [
        {
          ...line,
          type: "paragraph",
          version: 1,
          children: [...(line?.children ?? []), ...mentions],
        },
      ],
    },
  };
}

describe("mentions", () => {
  test("read by the names they bear now, as far as the reader may find them", async () => {
    const keeper = await teacher(0);
    const other = await teacher(1);
    const me = await other.identity.currentUser();
    const names = await keeper.search.mentionNames({
      mentions: [{ kind: "person", id: me.id }],
    });
    expect(names).toEqual([{ id: me.id, name: expect.any(String) }]);
    expect(names[0]?.name).not.toBe("An old name");
  });

  test("tell each person they name when the lesson goes out, and only once", async () => {
    const keeper = await teacher(0);
    const colleague = await teacher(1);
    const third = await teacher(2);
    const [named, later] = await Promise.all([
      colleague.identity.currentUser(),
      third.identity.currentUser(),
    ]);
    const classId = (await keeper.classes.mine({})).rows[0]?.id;
    if (!classId) throw new Error("the seed teacher keeps no class");
    const module = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Mentions module",
      summary: "",
      classIds: [classId],
      prerequisiteId: "",
      sequential: false,
    });
    const told = async () =>
      (await colleague.notifications.list({ tab: "all" })).rows.filter(
        (row) => row.kind === "mention" && row.params.title === "Thank you",
      ).length;
    const draft = {
      moduleId: module.id,
      title: "Thank you",
      completion: "view" as const,
      passScore: null,
    };
    const saved = await keeper.learning.saveLesson({
      ...draft,
      id: "",
      expectedVersion: 0,
      content: naming({ id: named.id, label: "Colleague" }),
      publish: false,
    });
    // Words still being written tell nobody.
    expect(await told()).toBe(0);
    await keeper.learning.publishModule({
      id: module.id,
      expectedVersion: module.version,
    });
    expect(await told()).toBe(1);
    await keeper.learning.saveLesson({
      ...draft,
      id: saved.id,
      expectedVersion: saved.version,
      content: naming(
        { id: named.id, label: "Colleague" },
        { id: later.id, label: "Third" },
      ),
      publish: true,
    });
    expect(await told()).toBe(1);
    expect(
      (await third.notifications.list({ tab: "all" })).rows.filter(
        (row) => row.kind === "mention" && row.params.title === "Thank you",
      ),
    ).toHaveLength(1);
  });
});
