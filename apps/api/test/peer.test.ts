import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, raw, rejection, sessionFor } from "./harness";

type Session = Awaited<ReturnType<typeof sessionFor>>;

/** A student of the seeded Arabic teacher's class, and a classmate who signs in too. */
async function classmates(teacher: Session) {
  const first = await sessionFor("northwind", login("student"));
  const me = await first.api.identity.currentUser();
  const { classes } = await teacher.api.coursework.options();
  for (const row of classes.filter((item) => item.classType === "scheduled")) {
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
      peer: { reviews: 2, anonymous: true },
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
    const author = await first.api.identity.currentUser();
    expect(
      (
        await teacher.api.coursework.grading({
          assignmentId: saved.id,
          studentId: author.id,
        })
      ).assignment.peer,
    ).toBe(true);
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
          peer: null,
        }),
      ),
    ).toMatchObject({ message: "coursework.peer_started" });
  });
});
