import type { SearchResult } from "@faridalms/domain/search";

import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, rejection, sessionFor, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const mother = () =>
  sessionFor("northwind", login("student").replace("student", "parent"));
const teacher = () => signedIn("northwind", login("teacher", 0, 1));

const ids = (result: SearchResult, kind: string) =>
  result.groups
    .filter((group) => group.kind === kind)
    .flatMap((group) => group.rows.map((row) => row.id));

describe("search", () => {
  test("staff find a student by either script, with their grade", async () => {
    const student = await signedIn("northwind", login("student"));
    const me = await student.identity.currentUser();
    const family = me.nameEn?.split(" ").at(-1) ?? "";
    const arabic = (me.nameAr?.split(" ").at(-1) ?? "")
      .replaceAll("ة", "ه")
      .replaceAll("أ", "ا");
    const office = await principal();

    const english = await office.search.find({ q: family, kind: "students" });
    const hit = english.groups[0]?.rows.find((row) => row.id === me.id);
    expect(hit?.target).toBe("student");
    expect(hit?.context).not.toBeNull();
    expect(
      ids(
        await office.search.find({ q: arabic, kind: "students" }),
        "students",
      ),
    ).toContain(me.id);
  });

  test("a family finds its child's work and its own news, never people or drafts", async () => {
    const family = await mother();
    const student = await signedIn("northwind", login("student"));
    const me = await student.identity.currentUser();
    const work = await family.api.coursework.child({ studentId: me.id });

    const found = await family.api.search.find({ q: "chapter review" });
    expect(found.groups.map((group) => group.kind)).not.toContain("students");
    expect(found.groups.map((group) => group.kind)).not.toContain("people");
    const assignments = ids(found, "assignments");
    expect(assignments.length).toBeGreaterThan(0);
    const theirs = new Set(work.rows.map((row) => row.assignmentId));
    expect(assignments.every((id) => theirs.has(id))).toBe(true);

    const evening = await family.api.search.find({ q: "parents evening" });
    expect(
      evening.groups.flatMap((group) => group.rows).every((row) => !row.flag),
    ).toBe(true);
    expect(
      await rejection(family.api.search.find({ q: "a", kind: "students" })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("one kind pages on from its cursor without repeating a hit", async () => {
    const author = await teacher();
    const { classes } = await author.coursework.options();
    const target = classes[0];
    if (!target) throw new Error("the seeded teacher has no class");
    for (let number = 1; number <= 23; number++)
      await author.coursework.save({
        classId: target.id,
        title: `Tidepool survey ${number}`,
        brief: plainContent("Count what lives in the rock pool."),
        audience: "class",
        latePolicy: "accept",
        submissionFormat: "both",
        points: 10,
        rubric: null,
      });

    const first = await author.search.find({
      q: "tidepool survey",
      kind: "assignments",
    });
    const rows = first.groups[0]?.rows ?? [];
    expect(rows).toHaveLength(20);
    expect(rows.every((row) => row.flag === "draft")).toBe(true);
    expect(first.next).not.toBeNull();
    const second = await author.search.find({
      q: "tidepool survey",
      kind: "assignments",
      after: first.next ?? undefined,
    });
    const next = second.groups[0]?.rows ?? [];
    const all = new Set([...rows, ...next].map((row) => row.id));
    expect(next).toHaveLength(3);
    expect(all.size).toBe(23);
    expect(second.next).toBeNull();

    const family = await mother();
    const theirs = await family.api.search.find({ q: "tidepool survey" });
    expect(ids(theirs, "assignments")).toHaveLength(0);
  });

  test("words in a conversation find it for its members, not the office", async () => {
    const family = await mother();
    const inbox = await family.api.messages.inbox({});
    const thread = inbox.rows[0];
    if (!thread) throw new Error("the seed has no family thread");
    const opened = await family.api.messages.thread({ id: thread.id });
    const word = (opened.messages[0]?.body ?? "")
      .split(/\W+/)
      .toSorted((a, b) => b.length - a.length)[0];
    if (!word) throw new Error("the seeded thread has no words");

    const found = await family.api.search.find({ q: word, kind: "messages" });
    const hit = found.groups[0]?.rows.find((row) => row.id === thread.id);
    expect(hit?.target).toBe("thread");
    expect(hit?.snippet).toContain("\u0002");

    const office = await principal();
    const theirs = await office.search.find({ q: word, kind: "messages" });
    expect(ids(theirs, "messages")).not.toContain(thread.id);
  });
});
