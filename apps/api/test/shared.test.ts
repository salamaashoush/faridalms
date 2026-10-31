import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";

import { client, login, raw, rejection, sessionFor, signedIn } from "./harness";

const teacher = (index = 0) =>
  signedIn("northwind", login("teacher", 0, index));
const student = () => signedIn("northwind", login("student"));
const principal = () => signedIn("northwind", login("principal"));

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

  test("its teacher sees which documents show it, and every version it was saved in", async () => {
    const session = await sessionFor("northwind", login("teacher", 0, 0));
    const keeper = session.api;
    const other = await teacher(1);
    const kept = await keeper.shared.save({
      expectedVersion: 0,
      title: "Field trip kit",
      scope: "school",
      content: plainContent("Bring water and a hat."),
    });
    const classId = (await keeper.classes.mine({})).rows[0]?.id;
    if (!classId) throw new Error("the seed teacher keeps no class");
    const module = await keeper.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Rivers outdoors",
      summary: "",
      classIds: [classId],
      prerequisiteId: "",
      sequential: false,
    });
    const lesson = plainContent("At the river bank.");
    await keeper.learning.saveLesson({
      id: "",
      moduleId: module.id,
      expectedVersion: 0,
      title: "Before we go",
      completion: "view",
      passScore: null,
      content: {
        root: {
          ...lesson.root,
          children: [
            { type: "shared", version: 1, sharedId: kept.id },
            ...(lesson.root.children ?? []),
          ],
        },
      },
      publish: false,
    });
    expect(await keeper.shared.uses({ id: kept.id })).toEqual([
      {
        hostType: "lesson",
        hostId: expect.any(String),
        titleEn: "Before we go",
        titleAr: "Before we go",
        placeEn: "Rivers outdoors",
        placeAr: "Rivers outdoors",
      },
    ]);
    // Any teacher who may show it sees where it already shows.
    expect(await other.shared.uses({ id: kept.id })).toHaveLength(1);

    await keeper.shared.save({
      id: kept.id,
      expectedVersion: kept.version,
      title: "Field trip kit",
      scope: "school",
      content: plainContent("Bring water, a hat and sun cream."),
    });
    const host = { hostType: "shared_block", hostId: kept.id };
    const { versions } = await keeper.documents.history(host);
    expect(versions.map((row) => row.reason)).toEqual(["publish", "publish"]);
    const first = versions.at(-1);
    if (!first) throw new Error("no first version");
    const restored = await keeper.documents.restore({
      ...host,
      documentVersion: first.documentVersion,
    });
    expect(JSON.stringify(restored.content)).toContain(
      "Bring water and a hat.",
    );
    expect(await rejection(other.documents.history(host))).toMatchObject({
      code: "NOT_FOUND",
    });

    // A module taken to another system carries the block's words in place.
    const exported = await raw(
      "northwind",
      session.token,
      `/v1/modules/${module.id}/cartridge.imscc`,
    );
    expect(exported.status).toBe(200);
    const files = unzipSync(new Uint8Array(await exported.arrayBuffer()));
    const page = Object.entries(files).find(([name]) => name.endsWith(".html"));
    expect(page ? strFromU8(page[1]) : "").toContain(
      "Bring water, a hat and sun cream.",
    );
  });

  test("the office shows one in news, which goes on the website as it reads when published", async () => {
    const office = await principal();
    const kept = await office.shared.save({
      expectedVersion: 0,
      title: "Visiting the school",
      scope: "mine",
      content: plainContent("Sign in at the front desk."),
    });
    const body = plainContent("Parents' evening is on Tuesday.");
    const post = await office.news.save({
      id: "",
      expectedVersion: 0,
      visibility: "public",
      primaryLocale: "en",
      titleEn: "Parents' evening",
      titleAr: "",
      excerptEn: "",
      excerptAr: "",
      slug: "parents-evening-shared",
      categoryId: "",
      coverFileId: "",
      coverAltEn: "",
      coverAltAr: "",
      pinned: false,
      audiences: [],
      body: {
        root: {
          ...body.root,
          children: [
            ...(body.root.children ?? []),
            { type: "shared", version: 1, sharedId: kept.id },
          ],
        },
      },
      translation: null,
    });
    expect(
      (await office.shared.uses({ id: kept.id })).map((row) => row.hostType),
    ).toEqual(["site_post"]);
    await office.news.publish({ id: post.id, expectedVersion: post.version });

    // A change after publishing waits for the next one to reach the website.
    await office.shared.save({
      id: kept.id,
      expectedVersion: kept.version,
      title: "Visiting the school",
      scope: "mine",
      content: plainContent("Sign in at the front desk with photo ID."),
    });
    const read = await client("northwind").site.publicSitePost({
      school: "northwind",
      locale: "en",
      slug: "parents-evening-shared",
    });
    const words = JSON.stringify(read.body);
    expect(words).toContain("Sign in at the front desk.");
    expect(words).not.toContain('"shared"');
  });
});
