import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

const teacher = (index = 0) => signedIn("northwind", login("teacher", 0, index));
const student = () => signedIn("northwind", login("student"));

const rules = plainContent("Wear goggles. Tie long hair back.");

describe("shared blocks", () => {
  test("a teacher keeps a block for the school, and every reader at the school sees it as it is now", async () => {
    const keeper = await teacher(0);
    const other = await teacher(1);
    const kept = await keeper.shared.save({
      expectedVersion: 0,
      title: "Lab safety rules",
      scope: "school",
      content: rules,
    });
    expect((await other.shared.list({})).map((row) => row.title)).toContain(
      "Lab safety rules",
    );

    // A student reading a lesson that shows it may read it, never change it.
    const reader = await student();
    const read = await reader.shared.read({ id: kept.id });
    expect(read).toMatchObject({ title: "Lab safety rules", editable: false });
    expect(await rejection(reader.shared.list({}))).toMatchObject({
      code: "FORBIDDEN",
    });

    // Only the teacher who kept it changes it, and every document follows.
    const changed = plainContent("Wear goggles. Tie long hair back. No food.");
    expect(
      await rejection(
        other.shared.save({
          id: kept.id,
          expectedVersion: kept.version,
          title: "Lab safety rules",
          scope: "school",
          content: changed,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN", message: "shared.not_owner" });
    await keeper.shared.save({
      id: kept.id,
      expectedVersion: kept.version,
      title: "Lab safety rules",
      scope: "school",
      content: changed,
    });
    expect(
      JSON.stringify((await reader.shared.read({ id: kept.id })).content),
    ).toContain("No food.");

    await keeper.shared.remove({ id: kept.id });
    expect(await rejection(reader.shared.read({ id: kept.id }))).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("a teacher's own block is theirs to use, and holds no questions", async () => {
    const keeper = await teacher(0);
    const other = await teacher(1);
    const own = await keeper.shared.save({
      expectedVersion: 0,
      title: "My lesson opener",
      scope: "mine",
      content: rules,
    });
    expect((await other.shared.list({})).map((row) => row.id)).not.toContain(
      own.id,
    );
    expect(
      await rejection(
        keeper.shared.save({
          expectedVersion: 0,
          title: "A question",
          scope: "mine",
          content: {
            root: {
              type: "root",
              version: 1,
              children: [
                {
                  type: "question",
                  version: 1,
                  kind: "choice",
                  questionId: crypto.randomUUID(),
                  children: [],
                },
              ],
            },
          },
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
  });
});
