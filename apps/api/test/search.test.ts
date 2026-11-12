import type { SearchResult } from "@faridalms/domain/search";

import { plainContent } from "@faridalms/domain/content-conversion";
import { addDays } from "@faridalms/domain/school";
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

const lastOf = (year: { endsBefore: string }) => addDays(year.endsBefore, -1);

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

  test("classes of the same name at different times carry their dates, the one running today first", async () => {
    // The group's second school, so the classes made here change no count
    // another suite reads.
    const office = await signedIn("northwind-east", login("principal", 0, 1));
    const added = await office.years.save({
      titleEn: "2045–2046",
      titleAr: "",
      startsOn: "2045-09-10",
      endsOn: "2046-06-14",
      terms: [],
    });
    const { years, workingYearId } = await office.years.options();
    const { grades } = await office.gradeLevels.options();
    const working = years.find((row) => row.id === workingYearId);
    const next = years.find((row) => row.id === added.id);
    const [grade] = grades;
    if (!working || !next || !grade) throw new Error("the seed has no year");
    const name = "Salama Ashoush tutor group";
    const save = async (year: typeof working) =>
      (
        await office.classes.save({
          startsOn: year.startsOn,
          endsOn: lastOf(year),
          parts: { year: { yearId: year.id }, grade: { gradeId: grade.id } },
          code: "SAT",
          titleEn: name,
          titleAr: "",
          teacherIds: [],
        })
      ).id;
    // The later class is made last, so its id alone would rank it first.
    const currentClass = await save(working);
    const laterClass = await save(next);

    const found = await office.search.find({ q: name, kind: "classes" });
    const rows = found.groups[0]?.rows ?? [];
    expect(rows.map((row) => row.id)).toEqual([currentClass, laterClass]);
    expect(rows.map((row) => row.context)).toEqual([
      `SAT · ${working.startsOn} – ${lastOf(working)}`,
      `SAT · ${next.startsOn} – ${lastOf(next)}`,
    ]);
    const preview = await office.search.find({ q: name });
    expect(ids(preview, "classes")[0]).toBe(currentClass);
  });

  test("words in a conversation find it for its members, not another family", async () => {
    const family = await mother();
    const inbox = await family.api.messages.inbox({});
    const thread = inbox.rows[0];
    if (!thread) throw new Error("the seed has no family thread");
    const opened = await family.api.messages.thread({ id: thread.id });
    // Letters only: a fragment of an id such as "1e31d5" reads as a number.
    const word = (opened.messages[0]?.body ?? "")
      .split(/\W+/)
      .filter((part) => /^\p{L}+$/u.test(part))
      .toSorted((a, b) => b.length - a.length)[0];
    if (!word) throw new Error("the seeded thread has no words");

    const found = await family.api.search.find({ q: word, kind: "messages" });
    const hit = found.groups[0]?.rows.find((row) => row.id === thread.id);
    expect(hit?.target).toBe("thread");
    expect(hit?.snippet).toContain("\u0002");

    const me = await family.api.identity.currentUser();
    const parents = [login("parent", 0, 0), login("parent", 0, 1)];
    let outsider = await signedIn("northwind", parents[0] ?? "");
    if ((await outsider.identity.currentUser()).id === me.id)
      outsider = await signedIn("northwind", parents[1] ?? "");
    const theirs = await outsider.search.find({ q: word, kind: "messages" });
    expect(ids(theirs, "messages")).not.toContain(thread.id);
  });

  test("a family finds its own conversation however many of the school's say the same word", async () => {
    const family = await mother();
    const office = await principal();
    const word = Array.from(
      crypto.getRandomValues(new Uint8Array(10)),
      (byte) => String.fromCodePoint(97 + (byte % 26)),
    ).join("");
    const { rows } = await family.api.messages.recipients({});
    const to = rows.find((row) => row.kind === "staff");
    if (!to) throw new Error("the family reaches no staff");
    const { threadId } = await family.api.messages.start({
      kind: "direct",
      recipientIds: [to.userId],
      content: plainContent(`A question about the ${word} outing`),
    });
    const staff = (await office.messages.recipients({ among: "people" })).rows
      .filter((row) => row.kind === "staff")
      .slice(0, 2)
      .map((row) => row.userId);
    if (staff.length < 2) throw new Error("the seed has too few staff");
    // More than the index used to rank across the whole school before it
    // asked who could read them, all newer than the family's.
    await Array.from({ length: 260 }, (_, index) => index).reduce<
      Promise<unknown>
    >(
      (previous, index) =>
        previous.then(() =>
          office.messages.start({
            kind: "group",
            recipientIds: staff,
            subject: `Planning ${index}`,
            content: plainContent(`Planning the ${word} outing`),
          }),
        ),
      Promise.resolve(),
    );

    const found = await family.api.search.find({ q: word, kind: "messages" });
    expect(ids(found, "messages")).toEqual([threadId]);
  }, 120_000);

  test("a team finds its own notes in its mailbox's conversations; nobody else does", async () => {
    const office = await principal();
    const logged = await office.admissions.logEnquiry({
      source: "walk_in",
      purpose: "enquiry",
      locale: "en",
      name: "Salama Ashoush",
      email: "salama.search@example.com",
      phone: "",
      childName: "",
      childYear: "",
      message: "",
      assigneeId: "",
    });
    const threadId = logged.threadId ?? "";
    await office.messages.send({
      threadId,
      kind: "note",
      content: plainContent("Prefers the pomegranate orchard tour."),
    });
    const notes = await office.search.find({ q: "pomegranate", kind: "notes" });
    const hit = notes.groups[0]?.rows.find((row) => row.id === threadId);
    expect(hit?.target).toBe("thread");
    expect(hit?.snippet).toContain("pomegranate");
    expect(
      ids(await office.search.find({ q: "pomegranate" }), "messages"),
    ).not.toContain(threadId);
    const other = await teacher();
    expect(
      await rejection(other.search.find({ q: "pomegranate", kind: "notes" })),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await other.search.find({ q: "pomegranate" })).groups.some(
        (group) => group.kind === "notes",
      ),
    ).toBe(false);
  });
});
