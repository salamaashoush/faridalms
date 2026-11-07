import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

const author = () => signedIn("northwind", login("teacher", 0, 1));
const otherTeacher = () => signedIn("northwind", login("teacher", 0, 2));
const student = () => signedIn("northwind", login("student"));
const parent = () =>
  signedIn("northwind", login("student").replace("student", "parent"));

const passage = {
  start: { block: "p0x0zzzz", offset: 4 },
  end: { block: "p0x0zzzz", offset: 8 },
};

/** A brief only its own teacher writes, as the collaboration tests make one. */
async function brief(title: string) {
  const teacher = await author();
  const { classes } = await teacher.coursework.options();
  const target = classes.find((row) => row.classType === "scheduled");
  if (!target) throw new Error("the teacher has no scheduled class");
  const saved = await teacher.coursework.save({
    classId: target.id,
    title,
    brief: plainContent("Read the Nile chapter before Sunday."),
    audience: "class",
    latePolicy: "accept",
    submissionFormat: "both",
    points: 10,
    rubric: null,
  });
  return {
    teacher,
    host: { hostType: "assignment", hostId: saved.id },
  };
}

describe("comments while writing", () => {
  test("start a thread on a passage, reply to it, and list it with both comments", async () => {
    const { teacher, host } = await brief("Commented brief");
    const started = await teacher.comments.start({
      ...host,
      anchor: passage,
      quote: "Nile",
      body: "Which edition of the chapter?",
    });
    await teacher.comments.reply({
      threadId: started.id,
      body: "The second, I think.",
    });
    const [thread, ...rest] = await teacher.comments.threads(host);
    expect(rest).toEqual([]);
    expect(thread).toMatchObject({
      id: started.id,
      part: "body",
      anchor: passage,
      quote: "Nile",
      resolvedAt: null,
    });
    expect(thread?.comments.map((row) => [row.body, row.own])).toEqual([
      ["Which edition of the chapter?", true],
      ["The second, I think.", true],
    ]);
  });

  test("keep comments out of the document and its versions", async () => {
    const { teacher, host } = await brief("Words stay the words");
    await teacher.comments.start({
      ...host,
      anchor: passage,
      quote: "Nile",
      body: "A note only writers see.",
    });
    const history = await teacher.documents.history(host);
    const texts = JSON.stringify(history);
    expect(texts).not.toContain("A note only writers see.");
  });

  test("resolve a thread and reopen it", async () => {
    const { teacher, host } = await brief("Resolved brief");
    const started = await teacher.comments.start({
      ...host,
      anchor: passage,
      quote: "Nile",
      body: "Fix the date.",
    });
    const [open] = await teacher.comments.threads(host);
    if (!open) throw new Error("the thread was not listed");
    const resolved = await teacher.comments.resolve({
      threadId: started.id,
      expectedVersion: open.version,
      resolved: true,
    });
    const [closed] = await teacher.comments.threads(host);
    expect(closed?.resolvedAt).toEqual(expect.any(String));
    expect(closed?.resolvedByNameEn ?? closed?.resolvedByNameAr).toBeTruthy();
    expect(
      await rejection(
        teacher.comments.resolve({
          threadId: started.id,
          expectedVersion: open.version,
          resolved: false,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT" });
    await teacher.comments.resolve({
      threadId: started.id,
      expectedVersion: resolved.version,
      resolved: false,
    });
    const [reopened] = await teacher.comments.threads(host);
    expect(reopened?.resolvedAt).toBeNull();
  });

  test("edit and delete only one's own comment, the thread going with its last", async () => {
    const { teacher, host } = await brief("Edited brief");
    const started = await teacher.comments.start({
      ...host,
      anchor: passage,
      quote: "Nile",
      body: "Frist thought.",
    });
    const [thread] = await teacher.comments.threads(host);
    const first = thread?.comments[0];
    if (!first) throw new Error("the comment was not listed");
    await teacher.comments.edit({
      commentId: first.id,
      expectedVersion: first.version,
      body: "First thought.",
    });
    const [edited] = await teacher.comments.threads(host);
    const changed = edited?.comments[0];
    expect(changed).toMatchObject({ body: "First thought." });
    expect(changed?.editedAt).toEqual(expect.any(String));
    if (!changed) throw new Error("the comment was not listed");
    await teacher.comments.remove({
      commentId: changed.id,
      expectedVersion: changed.version,
    });
    expect(
      (await teacher.comments.threads(host)).find(
        (row) => row.id === started.id,
      ),
    ).toBeUndefined();
  });

  test("tell a colleague a comment mentions, and nobody who is not staff", async () => {
    const { teacher, host } = await brief("Mentioning brief");
    const colleague = await otherTeacher();
    const learner = await student();
    const [named, pupil] = await Promise.all([
      colleague.identity.currentUser(),
      learner.identity.currentUser(),
    ]);
    const told = async () =>
      (await colleague.notifications.list({ tab: "all" })).rows.filter(
        (row) =>
          row.kind === "mention" &&
          row.params.comment === true &&
          row.subjectId === host.hostId,
      );
    const started = await teacher.comments.start({
      ...host,
      anchor: passage,
      quote: "Nile",
      body: "Could you check this?",
      mentions: [named.id, pupil.id],
    });
    const notices = await told();
    expect(notices).toHaveLength(1);
    expect(notices[0]?.params).toMatchObject({
      threadId: started.id,
      title: "Nile",
      preview: "Could you check this?",
    });
    expect(
      (await learner.notifications.list({ tab: "all" })).rows.filter(
        (row) => row.kind === "mention" && row.subjectId === host.hostId,
      ),
    ).toEqual([]);
    // An edit tells only someone it names for the first time.
    const [thread] = await teacher.comments.threads(host);
    const first = thread?.comments[0];
    if (!first) throw new Error("the comment was not listed");
    expect(first.mentionedUserIds).toEqual([named.id]);
    await teacher.comments.edit({
      commentId: first.id,
      expectedVersion: first.version,
      body: "Could you check this, please?",
      mentions: [named.id],
    });
    expect(await told()).toHaveLength(1);
  });

  test("find colleagues to mention, never the writer themself", async () => {
    const { teacher, host } = await brief("Colleagues brief");
    const me = await teacher.identity.currentUser();
    const found = await teacher.comments.colleagues({ ...host, q: "" });
    expect(found.length).toBeGreaterThan(0);
    expect(found.map((row) => row.id)).not.toContain(me.id);
  });

  test("refuse a colleague who may not change the document, a student and a parent", async () => {
    const { teacher, host } = await brief("Private brief for comments");
    const started = await teacher.comments.start({
      ...host,
      anchor: passage,
      quote: "Nile",
      body: "Only for writers.",
    });
    const [thread] = await teacher.comments.threads(host);
    const first = thread?.comments[0];
    if (!thread || !first) throw new Error("the thread was not listed");
    const outsiders = await Promise.all([otherTeacher(), student(), parent()]);
    const refusals = await Promise.all(
      outsiders.flatMap((outsider) => [
        rejection(outsider.comments.threads(host)),
        rejection(
          outsider.comments.start({
            ...host,
            anchor: passage,
            quote: "Nile",
            body: "Let me in.",
          }),
        ),
        rejection(
          outsider.comments.reply({ threadId: started.id, body: "Me too." }),
        ),
        rejection(
          outsider.comments.resolve({
            threadId: started.id,
            expectedVersion: thread.version,
            resolved: true,
          }),
        ),
        rejection(
          outsider.comments.edit({
            commentId: first.id,
            expectedVersion: first.version,
            body: "Changed.",
          }),
        ),
        rejection(outsider.comments.colleagues({ ...host, q: "" })),
      ]),
    );
    expect(refusals).toHaveLength(18);
    for (const refusal of refusals)
      expect(refusal).toMatchObject({ code: "NOT_FOUND" });
  });

  test("let a writer resolve a colleague's thread but not change their words", async () => {
    const principal = await signedIn("northwind", login("principal"));
    const { teacher, host } = await brief("Shared brief");
    const started = await teacher.comments.start({
      ...host,
      anchor: passage,
      quote: "Nile",
      body: "The teacher's words.",
    });
    // A principal manages classes, so writes every brief at the school.
    const [thread] = await principal.comments.threads(host);
    const first = thread?.comments[0];
    if (!thread || !first) throw new Error("the thread was not listed");
    expect(first.own).toBe(false);
    expect(
      await rejection(
        principal.comments.edit({
          commentId: first.id,
          expectedVersion: first.version,
          body: "Someone else's words.",
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      await rejection(
        principal.comments.remove({
          commentId: first.id,
          expectedVersion: first.version,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    await principal.comments.resolve({
      threadId: started.id,
      expectedVersion: thread.version,
      resolved: true,
    });
    const [resolved] = await teacher.comments.threads(host);
    expect(resolved?.resolvedAt).toEqual(expect.any(String));
  });
});
