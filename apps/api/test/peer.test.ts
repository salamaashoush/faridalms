import { plainContent } from "@faridalms/domain/content-conversion";
import { briefWithQuiz } from "@faridalms/domain/lesson-content";
import { describe, expect, test } from "bun:test";

import { remindPeerReviews } from "../src/peer/clock";
import {
  login,
  raw,
  rejection,
  seeded,
  sessionFor,
  withoutModules,
  workerModules,
} from "./harness";

type Session = Awaited<ReturnType<typeof sessionFor>>;

/** A student of the seeded Arabic teacher's class, and a classmate who signs in too. */
async function classmates(teacher: Session) {
  const first = await sessionFor("northwind", login("student"));
  const me = await first.api.identity.currentUser();
  const { classes } = await teacher.api.coursework.options();
  for (const row of classes.filter((item) => item.subjectId !== null)) {
    const { roster } = await teacher.api.coursework.groups({ classId: row.id });
    if (!roster.some((pupil) => pupil.id === me.id)) continue;
    for (let index = 1; index < 40; index++) {
      const session = await sessionFor("northwind", login("student", 0, index));
      const who = await session.api.identity.currentUser();
      if (who.id !== me.id && roster.some((pupil) => pupil.id === who.id))
        return { classId: row.id, first, second: session };
    }
  }
  throw new Error("no two classmates sign in");
}

/** A student's own recording or picture, as an answer to a question keeps one. */
async function answerFile(
  session: Session,
  kind: "sound" | "picture",
): Promise<string> {
  const body =
    kind === "sound"
      ? new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])])
      : new Blob([
          new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
          ]),
        ]);
  const file = await session.api.files.initiate({
    purpose: "document_media",
    name: kind === "sound" ? "answer.webm" : "drawing.png",
    mediaType: kind === "sound" ? "audio/webm" : "image/png",
    sizeBytes: body.size,
  });
  await raw("northwind", session.token, `/v1/files/${file.id}/content`, {
    method: "PUT",
    body,
  });
  return file.id;
}

async function uploadAs(session: Session, name: string) {
  const body = new Blob([`contents of ${name}`]);
  const file = await session.api.files.initiate({
    purpose: "document_media",
    name,
    mediaType: "text/plain",
    sizeBytes: body.size,
  });
  await raw("northwind", session.token, `/v1/files/${file.id}/content`, {
    method: "PUT",
    body,
  });
  return file.id;
}

const rubric = {
  criteria: [
    {
      id: "ideas",
      title: "Ideas",
      levels: [
        { id: "clear", title: "Clear and developed", points: 10 },
        { id: "thin", title: "Thin", points: 4 },
      ],
    },
  ],
};

describe("peer review", () => {
  test("classmates review each other's work unnamed, and authors read the reviews once released", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const { classId, first, second } = await classmates(teacher);
    const saved = await teacher.api.coursework.save({
      classId,
      title: "A letter to the river",
      brief: plainContent("Write the Nile a letter."),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 10,
      rubric,
      parts: { peer: { reviews: 2, anonymous: true } },
    });
    const published = await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    // Reviews need two pieces of work to swap.
    expect(
      await rejection(teacher.api.peer.start({ assignmentId: saved.id })),
    ).toMatchObject({ message: "coursework.peer_too_few" });

    const sketch = await uploadAs(first, "map.txt");
    const letter = plainContent("Dear river, you carry the boats.");
    letter.root.children?.push({
      type: "file",
      version: 1,
      format: "",
      fileId: sketch,
      name: "map.txt",
      mime: "text/plain",
      bytes: 20,
    });
    for (const [session, content] of [
      [first, letter],
      [second, plainContent("Dear Nile, thank you for the fish.")],
    ] as const) {
      const drafted = await session.api.coursework.saveDraft({
        assignmentId: saved.id,
        expectedVersion: 0,
        content,
      });
      await session.api.coursework.handIn({
        assignmentId: saved.id,
        expectedVersion: drafted.version,
      });
    }
    const opens = async (session: Session) =>
      (await raw("northwind", session.token, `/v1/files/${sketch}/content`))
        .status;
    expect(await opens(second)).toBe(404);

    expect(await teacher.api.peer.start({ assignmentId: saved.id })).toEqual({
      added: 2,
    });
    // The classmate given the work reads it, its files included, and its
    // author can no longer take it back.
    expect(await opens(second)).toBe(200);
    expect(
      await rejection(
        first.api.coursework.undoHandIn({ assignmentId: saved.id }),
      ),
    ).toMatchObject({ message: "coursework.peer_handed_out" });
    const mine = await first.api.peer.mine({ assignmentId: saved.id });
    expect(mine).toMatchObject({ started: true, released: false });
    expect(mine.toGive).toHaveLength(1);
    expect(mine.toGive[0]).toMatchObject({ number: 1, author: null });
    expect(JSON.stringify(mine.toGive[0]?.content)).toContain("thank you");
    const giving = mine.toGive[0]?.id ?? "";
    expect(
      await rejection(
        first.api.peer.send({
          reviewId: giving,
          strengths: "The fish.",
          suggestion: "Say more.",
        }),
      ),
    ).toMatchObject({ message: "coursework.peer_rubric" });
    // Only the reviewer it was given to writes a review.
    expect(
      await rejection(
        second.api.peer.send({
          reviewId: giving,
          rubricScores: { ideas: "clear" },
          strengths: "Mine now.",
          suggestion: "None.",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    await first.api.peer.send({
      reviewId: giving,
      rubricScores: { ideas: "thin" },
      strengths: "Thanking the river for fish is a warm opening.",
      suggestion: "Tell the river what you would ask of it.",
    });
    const back = (await second.api.peer.mine({ assignmentId: saved.id }))
      .toGive[0];
    await second.api.peer.send({
      reviewId: back?.id ?? "",
      rubricScores: { ideas: "thin" },
      strengths: "Nothing.",
      suggestion: "Start again.",
    });

    // The teacher reads every review with names, and hides the unkind one.
    const overview = await teacher.api.peer.overview({
      assignmentId: saved.id,
    });
    expect(overview.given).toHaveLength(2);
    expect(overview.given.every((review) => review.sentAt !== null)).toBe(true);
    expect(overview.students).toHaveLength(2);
    // Marking a student, the teacher is told the work was peer reviewed.
    expect(
      await teacher.api.peer.settings({ assignmentId: saved.id }),
    ).toMatchObject({ reviews: 2, anonymous: true, started: true });
    await teacher.api.peer.hide({ reviewId: back?.id ?? "", hidden: true });
    expect(
      (await second.api.peer.mine({ assignmentId: saved.id })).received,
    ).toEqual([]);

    await teacher.api.peer.release({ assignmentId: saved.id });
    expect(
      (await second.api.peer.mine({ assignmentId: saved.id })).received,
    ).toEqual([
      {
        id: giving,
        number: 1,
        reviewer: null,
        rubricScores: { ideas: "thin" },
        strengths: "Thanking the river for fish is a warm opening.",
        suggestion: "Tell the river what you would ask of it.",
        comments: [],
        helpfulness: null,
      },
    ]);
    // The hidden review never reaches its author.
    expect(
      (await first.api.peer.mine({ assignmentId: saved.id })).received,
    ).toEqual([]);
    expect(
      await rejection(
        first.api.peer.send({
          reviewId: giving,
          rubricScores: { ideas: "clear" },
          strengths: "Changed.",
          suggestion: "Changed.",
        }),
      ),
    ).toMatchObject({ message: "coursework.peer_released" });
    // Handed-out reviews keep peer review on.
    expect(
      await rejection(
        teacher.api.coursework.save({
          id: saved.id,
          expectedVersion: published.version + 1,
          classId,
          title: "A letter to the river",
          brief: plainContent("Write the Nile a letter."),
          audience: "class",
          latePolicy: "accept",
          submissionFormat: "both",
          points: 10,
          rubric,
          parts: { peer: null },
        }),
      ),
    ).toMatchObject({ message: "coursework.peer_started" });
  });

  test("a review date reminds the reviewers still writing once, reviewers comment on passages, and authors rate each review", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const { classId, first, second } = await classmates(teacher);
    const due = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const reviewsDue = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const base = {
      classId,
      title: "A poem for the sea",
      brief: plainContent("Write the sea a poem."),
      audience: "class" as const,
      latePolicy: "accept" as const,
      submissionFormat: "online" as const,
      points: 10,
      rubric: null,
      dueAt: due,
    };
    expect(
      await rejection(
        teacher.api.coursework.save({
          ...base,
          parts: {
            peer: {
              reviews: 1,
              anonymous: false,
              dueAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
          },
        }),
      ),
    ).toMatchObject({ message: "coursework.peer_due_early" });
    const saved = await teacher.api.coursework.save({
      ...base,
      parts: { peer: { reviews: 1, anonymous: false, dueAt: reviewsDue } },
    });
    const kept = await teacher.api.peer.settings({ assignmentId: saved.id });
    expect(Date.parse(kept?.dueAt ?? "")).toBe(
      Math.floor(Date.parse(reviewsDue) / 1000) * 1000,
    );
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    for (const [session, words] of [
      [first, "The sea is wide and the sea is blue."],
      [second, "Waves come and waves go."],
    ] as const) {
      const drafted = await session.api.coursework.saveDraft({
        assignmentId: saved.id,
        expectedVersion: 0,
        content: plainContent(words),
      });
      await session.api.coursework.handIn({
        assignmentId: saved.id,
        expectedVersion: drafted.version,
      });
    }
    await teacher.api.peer.start({ assignmentId: saved.id });
    // Each reviewer hears there is work to review, and by when.
    const handedOut = (await first.api.notifications.list({ tab: "all" })).rows
      .filter((row) => row.kind === "peer_review" && row.subjectId === saved.id)
      .map((row) => row.params);
    expect(handedOut).toEqual([
      expect.objectContaining({ date: expect.any(String) }),
    ]);

    const mine = await first.api.peer.mine({ assignmentId: saved.id });
    expect(mine.dueAt).not.toBeNull();
    const giving = mine.toGive[0];
    if (!giving?.content) throw new Error("no work to review");
    const block = giving.content.root.children?.[0]?.$?.id ?? "";
    const anchor = {
      start: { block, offset: 0 },
      end: { block, offset: 5 },
    };
    const said = await first.api.peer.comment({
      reviewId: giving.id,
      anchor,
      body: "A strong start.",
    });
    const dropped = await first.api.peer.comment({
      reviewId: giving.id,
      anchor,
      body: "Changed my mind.",
    });
    await first.api.peer.uncomment({ id: dropped.id });
    expect(
      await rejection(second.api.peer.uncomment({ id: said.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      (await first.api.peer.mine({ assignmentId: saved.id })).toGive[0]
        ?.comments,
    ).toEqual([
      {
        id: said.id,
        reviewId: giving.id,
        anchor,
        words: "Waves",
        body: "A strong start.",
      },
    ]);
    await first.api.peer.send({
      reviewId: giving.id,
      strengths: "The repeating waves.",
      suggestion: "Say what the waves bring.",
    });

    // A day before the review date, only the reviewer still writing hears.
    const { cell, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const channels = { email: false, sms: false };
    const later = new Date(Date.parse(reviewsDue) - 12 * 3_600_000);
    expect(
      await remindPeerReviews(cell, tenantId, {
        now: new Date(),
        channels,
        modules: workerModules(),
      }),
    ).toBe(0);
    expect(
      await remindPeerReviews(cell, tenantId, {
        now: later,
        channels,
        modules: workerModules(),
      }),
    ).toBe(1);
    expect(
      await remindPeerReviews(cell, tenantId, {
        now: later,
        channels,
        modules: workerModules(),
      }),
    ).toBe(0);
    const reminded = async (session: Session) =>
      (await session.api.notifications.list({ tab: "all" })).rows.filter(
        (row) =>
          row.kind === "peer_review" &&
          row.subjectId === saved.id &&
          row.params.dueSoon === true,
      ).length;
    expect(await reminded(second)).toBe(1);
    expect(await reminded(first)).toBe(0);

    await teacher.api.peer.release({ assignmentId: saved.id });
    expect(
      await rejection(
        first.api.peer.comment({ reviewId: giving.id, anchor, body: "Late." }),
      ),
    ).toMatchObject({ message: "coursework.peer_released" });
    const received = (await second.api.peer.mine({ assignmentId: saved.id }))
      .received;
    expect(received[0]).toMatchObject({
      reviewer: { fullNameEn: expect.any(String) },
      comments: [{ words: "Waves", body: "A strong start." }],
      helpfulness: null,
    });
    // Only the author rates a review of their work.
    expect(
      await rejection(
        first.api.peer.rate({ reviewId: giving.id, helpfulness: "not" }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    await second.api.peer.rate({ reviewId: giving.id, helpfulness: "very" });
    expect(
      (await teacher.api.peer.overview({ assignmentId: saved.id })).given.find(
        (review) => review.id === giving.id,
      ),
    ).toMatchObject({ helpfulness: "very", comments: [{ words: "Waves" }] });
  });

  test("a quiz's reviewer hears and sees the spoken and drawn answers they review, and opens no other file", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const { classId, first, second } = await classmates(teacher);
    const question = {
      points: 4,
      wordLimit: null,
      hints: [],
      explanation: "",
      tries: null,
      type: "written" as const,
    };
    const spoken = {
      ...question,
      id: crypto.randomUUID(),
      prompt: "Say why the tide turns.",
      recordSeconds: 45 as const,
    };
    const drawn = {
      ...question,
      id: crypto.randomUUID(),
      prompt: "Draw the moon and the sea.",
      answerWith: "drawing" as const,
    };
    const quiz = await teacher.api.coursework.save({
      classId,
      title: "Tides spoken and drawn",
      brief: briefWithQuiz(plainContent("Answer aloud, then draw."), {
        version: 2,
        blocks: [spoken, drawn],
      }),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "quiz",
      points: null,
      rubric: null,
      quiz: {
        attempts: 1,
        keep: "highest",
        reveal: "returned",
        shuffle: false,
      },
      parts: { peer: { reviews: 1, anonymous: true } },
    });
    await teacher.api.coursework.publish({
      id: quiz.id,
      expectedVersion: quiz.version,
    });
    const files = new Map<Session, { sound: string; picture: string }>();
    for (const session of [first, second]) {
      const sound = await answerFile(session, "sound");
      const picture = await answerFile(session, "picture");
      files.set(session, { sound, picture });
      await session.api.coursework.saveQuizAnswer({
        assignmentId: quiz.id,
        blockId: spoken.id,
        response: {
          type: "written",
          text: "",
          recording: { fileId: sound, seconds: 12 },
        },
      });
      await session.api.coursework.saveQuizAnswer({
        assignmentId: quiz.id,
        blockId: drawn.id,
        response: { type: "written", text: "", picture: { fileId: picture } },
      });
    }
    // A recording kept with the work but left out of every answer.
    const spare = await answerFile(second, "sound");
    await second.api.coursework.saveQuizAnswer({
      assignmentId: quiz.id,
      blockId: spoken.id,
      response: {
        type: "written",
        text: "",
        recording: { fileId: spare, seconds: 3 },
      },
    });
    await second.api.coursework.saveQuizAnswer({
      assignmentId: quiz.id,
      blockId: spoken.id,
      response: {
        type: "written",
        text: "",
        recording: { fileId: files.get(second)?.sound ?? "", seconds: 12 },
      },
    });
    const opens = async (session: Session, fileId: string) =>
      (
        await raw("northwind", session.token, `/v1/files/${fileId}/content`, {
          redirect: "manual",
        })
      ).status !== 404;
    const theirs = files.get(second);
    if (!theirs) throw new Error("no answers");
    // Before the reviews are handed out, a classmate opens none of it.
    expect(await opens(first, theirs.sound)).toBe(false);
    expect(await opens(first, theirs.picture)).toBe(false);
    for (const session of [first, second]) {
      const work = await session.api.coursework.work({ id: quiz.id });
      await session.api.coursework.handIn({
        assignmentId: quiz.id,
        expectedVersion: work.submission.version,
      });
    }
    await teacher.api.peer.start({ assignmentId: quiz.id });
    const reviewing = (await first.api.peer.mine({ assignmentId: quiz.id }))
      .toGive[0];
    expect(reviewing?.answers).toEqual([
      {
        blockId: spoken.id,
        prompt: spoken.prompt,
        text: "",
        recording: { fileId: theirs.sound, video: false },
        picture: null,
      },
      {
        blockId: drawn.id,
        prompt: drawn.prompt,
        text: "",
        recording: null,
        picture: { fileId: theirs.picture },
      },
    ]);
    // The reviewer opens exactly the files of the answers they review.
    expect(await opens(first, theirs.sound)).toBe(true);
    expect(await opens(first, theirs.picture)).toBe(true);
    expect(await opens(first, spare)).toBe(false);
    // With peer review off a review opens nothing, and opens it again once back on.
    await withoutModules("northwind", ["peer_review"], async () => {
      expect(await opens(first, theirs.sound)).toBe(false);
      expect(await opens(first, theirs.picture)).toBe(false);
    });
    expect(await opens(first, theirs.sound)).toBe(true);
    // Each opens of the other's only what their own review shows them; and
    // someone reviewing neither opens nothing.
    const mine = files.get(first);
    // Someone who reviews none of it.
    const outsider = await sessionFor("northwind", login("parent"));
    if (mine) {
      expect(await opens(second, mine.sound)).toBe(
        (await second.api.peer.mine({ assignmentId: quiz.id })).toGive.some(
          (review) =>
            review.answers.some(
              (answer) => answer.recording?.fileId === mine.sound,
            ),
        ),
      );
      expect(await opens(outsider, mine.sound)).toBe(false);
    }
    expect(await opens(outsider, theirs.sound)).toBe(false);
    expect(await opens(outsider, theirs.picture)).toBe(false);
  });

  test("classmates review a quiz's written answers and a discussion's posts", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const { classId, first, second } = await classmates(teacher);
    const written = {
      id: crypto.randomUUID(),
      type: "written" as const,
      prompt: "Why do tides rise?",
      points: 4,
      wordLimit: null,
      hints: [],
      explanation: "",
      tries: null,
    };
    const quiz = await teacher.api.coursework.save({
      classId,
      title: "Tides quiz",
      brief: briefWithQuiz(plainContent("Answer in your own words."), {
        version: 2,
        blocks: [written],
      }),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "quiz",
      points: null,
      rubric: null,
      quiz: {
        attempts: 1,
        keep: "highest",
        reveal: "returned",
        shuffle: false,
      },
      parts: { peer: { reviews: 1, anonymous: true } },
    });
    await teacher.api.coursework.publish({
      id: quiz.id,
      expectedVersion: quiz.version,
    });
    for (const [session, text] of [
      [first, "The moon pulls the water."],
      [second, "The wind pushes it."],
    ] as const) {
      await session.api.coursework.saveQuizAnswer({
        assignmentId: quiz.id,
        blockId: written.id,
        response: { type: "written", text },
      });
      const work = await session.api.coursework.work({ id: quiz.id });
      await session.api.coursework.handIn({
        assignmentId: quiz.id,
        expectedVersion: work.submission.version,
      });
    }
    await teacher.api.peer.start({ assignmentId: quiz.id });
    const reviewing = (await first.api.peer.mine({ assignmentId: quiz.id }))
      .toGive[0];
    expect(reviewing).toMatchObject({
      content: null,
      answers: [
        {
          blockId: written.id,
          prompt: "Why do tides rise?",
          text: "The wind pushes it.",
        },
      ],
    });
    // A quiz has no page to comment on passages of.
    expect(
      await rejection(
        first.api.peer.comment({
          reviewId: reviewing?.id ?? "",
          anchor: {
            start: { block: "p0zzzzzz", offset: 0 },
            end: { block: "p0zzzzzz", offset: 2 },
          },
          body: "Here.",
        }),
      ),
    ).toMatchObject({ message: "coursework.peer_no_passage" });

    const discussion = await teacher.api.coursework.save({
      classId,
      title: "Should we swim at night?",
      brief: plainContent("Say what you think."),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "discussion",
      points: 10,
      rubric: null,
      discussion: { postFirst: false, replies: 0 },
      parts: { peer: { reviews: 1, anonymous: true } },
    });
    await teacher.api.coursework.publish({
      id: discussion.id,
      expectedVersion: discussion.version,
    });
    const hiddenPost = await second.api.coursework.post({
      assignmentId: discussion.id,
      content: plainContent("Something unkind."),
    });
    await second.api.coursework.post({
      assignmentId: discussion.id,
      content: plainContent("No, the currents are strong."),
    });
    await first.api.coursework.post({
      assignmentId: discussion.id,
      content: plainContent("Only with a grown-up."),
    });
    await teacher.api.coursework.hidePost({ id: hiddenPost.id, hidden: true });
    await teacher.api.peer.start({ assignmentId: discussion.id });
    const posts = (await first.api.peer.mine({ assignmentId: discussion.id }))
      .toGive[0]?.posts;
    expect(posts?.map((post) => JSON.stringify(post.content))).toEqual([
      expect.stringContaining("currents are strong"),
    ]);
  });

  test("with peer review off, work takes no review settings, nothing holds handed-in work, and no reviewer is reminded", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const { classId, first, second } = await classmates(teacher);
    const base = {
      classId,
      title: "A song for the rain",
      brief: plainContent("Write the rain a song."),
      audience: "class" as const,
      latePolicy: "accept" as const,
      submissionFormat: "online" as const,
      points: 10,
      rubric: null,
    };
    const reviewsDue = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const saved = await teacher.api.coursework.save({
      ...base,
      parts: { peer: { reviews: 1, anonymous: true, dueAt: reviewsDue } },
    });
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    for (const [session, words] of [
      [first, "The rain taps the window."],
      [second, "The rain fills the river."],
    ] as const) {
      const drafted = await session.api.coursework.saveDraft({
        assignmentId: saved.id,
        expectedVersion: 0,
        content: plainContent(words),
      });
      await session.api.coursework.handIn({
        assignmentId: saved.id,
        expectedVersion: drafted.version,
      });
    }
    await teacher.api.peer.start({ assignmentId: saved.id });
    expect((await first.api.coursework.work({ id: saved.id })).canUndo).toBe(
      false,
    );
    const { cell, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const later = new Date(Date.parse(reviewsDue) - 12 * 3_600_000);
    const remind = () =>
      remindPeerReviews(cell, tenantId, {
        now: later,
        channels: { email: false, sms: false },
        modules: workerModules(),
      });

    await withoutModules("northwind", ["peer_review"], async () => {
      expect(
        await rejection(
          teacher.api.coursework.save({
            ...base,
            parts: { peer: { reviews: 1, anonymous: true } },
          }),
        ),
      ).toMatchObject({ message: "coursework.part_unknown" });
      expect(
        await rejection(teacher.api.peer.settings({ assignmentId: saved.id })),
      ).toMatchObject({ code: "NOT_FOUND" });
      expect(
        await rejection(first.api.peer.mine({ assignmentId: saved.id })),
      ).toMatchObject({ code: "NOT_FOUND" });
      // Nothing of peer review holds the work as handed in.
      expect((await first.api.coursework.work({ id: saved.id })).canUndo).toBe(
        true,
      );
      expect(await remind()).toBe(0);
    });

    // Back on, the reviews hold the work again and the reminder goes.
    expect((await first.api.coursework.work({ id: saved.id })).canUndo).toBe(
      false,
    );
    expect(await remind()).toBe(1);
  });
});
