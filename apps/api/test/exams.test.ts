import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

describe("a school's exam sessions", () => {
  test("an official session follows the board's date until the school sets its own, with a reason", async () => {
    const officer = await signedIn("northwind", login("principal"));
    const first = await officer.exams.overview();
    expect(first.available.map((series) => series.id)).toContain(
      "cambridge-2026-11",
    );

    const added = await officer.exams.addOfficial({
      series: "cambridge-2026-11",
    });
    expect(added).toMatchObject({
      official: { series: "cambridge-2026-11", board: "cambridge" },
      sitsIn: "2026-11-01",
      keepUntil: "2027-04-09",
      ownKeepUntil: null,
      boardKeepUntil: "2027-04-09",
      declarationRequired: true,
      aiEvidenceRequired: true,
    });
    const after = await officer.exams.overview();
    expect(after.available.map((series) => series.id)).not.toContain(
      "cambridge-2026-11",
    );
    expect(
      await rejection(
        officer.exams.addOfficial({ series: "cambridge-2026-11" }),
      ),
    ).toMatchObject({ message: "exam.session_exists" });

    const change = {
      id: added.id,
      titleEn: null,
      titleAr: null,
      sitsIn: added.sitsIn,
      keepUntil: "2027-06-30",
      declarationRequired: true,
      aiEvidenceRequired: false,
      reason: "",
    };
    expect(await rejection(officer.exams.saveSession(change))).toMatchObject({
      message: "exam.reason_needed",
    });
    const longer = await officer.exams.saveSession({
      ...change,
      reason: "The board keeps samples into the summer",
    });
    expect(longer).toMatchObject({
      keepUntil: "2027-06-30",
      ownKeepUntil: "2027-06-30",
      aiEvidenceRequired: false,
    });

    const shorter = {
      ...change,
      keepUntil: "2027-03-01",
      reason: "Storage is short",
    };
    expect(await rejection(officer.exams.saveSession(shorter))).toMatchObject({
      message: "exam.below_board",
    });
    expect(
      await officer.exams.saveSession({ ...shorter, belowBoard: true }),
    ).toMatchObject({ keepUntil: "2027-03-01", boardKeepUntil: "2027-04-09" });

    const back = await officer.exams.saveSession({
      ...change,
      keepUntil: null,
      reason: "Back to the board's date",
    });
    expect(back).toMatchObject({ keepUntil: "2027-04-09", ownKeepUntil: null });

    const { rows } = await officer.exams.history({});
    expect(rows.slice(0, 4).map((row) => row.action)).toEqual([
      "exam_session.update",
      "exam_session.update",
      "exam_session.update",
      "exam_session.create",
    ]);
    expect(rows[1]?.details).toMatchObject({
      reason: "Storage is short",
      series: "cambridge-2026-11",
      belowBoard: "2027-04-09",
      before: { keepUntil: "2027-06-30" },
      after: { keepUntil: "2027-03-01" },
    });

    await officer.exams.retireSession({ id: added.id, reason: "Test done" });
    const retired = await officer.exams.overview();
    expect(retired.sessions.some((row) => row.id === added.id)).toBe(false);
    expect(retired.available.map((series) => series.id)).toContain(
      "cambridge-2026-11",
    );
  });

  test("a school's own board takes sessions with their own dates and rules", async () => {
    const officer = await signedIn("northwind", login("principal"));
    const board = await officer.exams.saveBoard({
      titleEn: "Northwind mocks",
      titleAr: "الامتحانات التجريبية",
    });
    const own = {
      boardId: board.id,
      titleEn: "Year 11 mocks, January",
      titleAr: null,
      sitsIn: "2027-01-01",
      keepUntil: null,
      declarationRequired: true,
      aiEvidenceRequired: false,
      reason: "",
    };
    expect(await rejection(officer.exams.saveSession(own))).toMatchObject({
      message: "exam.keep_until_needed",
    });
    expect(
      await rejection(
        officer.exams.saveSession({ ...own, keepUntil: "2026-12-01" }),
      ),
    ).toMatchObject({ message: "exam.keep_until_early" });
    const session = await officer.exams.saveSession({
      ...own,
      keepUntil: "2027-07-31",
    });
    expect(session).toMatchObject({
      official: null,
      boardId: board.id,
      keepUntil: "2027-07-31",
      boardKeepUntil: null,
      aiEvidenceRequired: false,
    });
    const { boards, sessions } = await officer.exams.overview();
    expect(boards.map((row) => row.titleEn)).toContain("Northwind mocks");
    expect(sessions.some((row) => row.id === session.id)).toBe(true);
  });

  test("teachers see the sessions to set coursework for, and change nothing", async () => {
    const officer = await signedIn("northwind", login("principal"));
    const added = await officer.exams.addOfficial({ series: "ib-2027-05" });
    const teacher = await signedIn("northwind", login("teacher"));
    const seen = await teacher.exams.overview();
    expect(seen.sessions.some((row) => row.id === added.id)).toBe(true);
    expect(seen.available).toEqual([]);
    expect(
      await rejection(teacher.exams.addOfficial({ series: "ib-2026-11" })),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      await rejection(teacher.exams.saveBoard({ titleEn: "x", titleAr: null })),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(await rejection(teacher.exams.history({}))).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
