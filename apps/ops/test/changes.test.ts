import { beforeAll, describe, expect, test } from "bun:test";

import { directory, inDirectory, tenantWith } from "./harness";

let schoolId = "";
let tenantId = "";
const HOST = "learn.willowmere.example.com";

beforeAll(async () => {
  ({
    tenantId,
    schoolIds: [schoolId = ""],
  } = await tenantWith(["willowmere"]));
  await inDirectory(async (sql) => {
    await sql`insert into hosts (hostname, school_id, role, challenge)
      values ('learn.willowmere.example.com', ${schoolId}, 'portal', ${"c".repeat(32)})`;
    const rows = [
      [
        "operator:op-sara",
        "school",
        schoolId,
        "administrator.invite",
        "Lost the first link",
        40,
      ],
      [
        "operator:op-omar",
        "tenant",
        tenantId,
        "tenant.lifecycle",
        "Overdue invoice INV-WLM-7",
        20,
      ],
      [
        "cell:eg-1",
        "host",
        "learn.willowmere.example.com",
        "host.verified",
        "The worker checked it",
        5,
      ],
      [
        "operator:op-sara",
        "exam_series",
        "cambridge-2027-06",
        "series.create",
        "Board timetable",
        1,
      ],
    ] as const;
    for (const [actor, type, subject, action, reason, daysAgo] of rows)
      await sql`insert into changes (occurred_at, actor, subject_type, subject_id, action, reason)
        values (now() - ${`${daysAgo} days`}::interval, ${actor}, ${type}, ${subject}, ${action}, ${reason})`;
  });
});

const page = { offset: 0, limit: 50 };
/** The actions of this file's own changes, since the directory is shared. */
const actionsOf = (changes: { action: string; subjectId: string }[]) =>
  changes
    .filter((change) =>
      [schoolId, tenantId, HOST, "cambridge-2027-06"].includes(
        change.subjectId,
      ),
    )
    .map((change) => change.action);

describe("the change log", () => {
  test("reads newest first, with each host's school", async () => {
    const { changes, total } = await directory().changeLog(page);
    expect(total).toBeGreaterThanOrEqual(4);
    expect(actionsOf(changes)).toEqual([
      "series.create",
      "host.verified",
      "tenant.lifecycle",
      "administrator.invite",
    ]);
    expect(changes.find((change) => change.subjectId === HOST)?.schoolId).toBe(
      schoolId,
    );
  });

  test("narrows by what was done, by whom and since when", async () => {
    const byAction = await directory().changeLog({
      ...page,
      actions: ["tenant.lifecycle"],
    });
    expect(actionsOf(byAction.changes)).toEqual(["tenant.lifecycle"]);
    const byActor = await directory().changeLog({
      ...page,
      actors: ["operator:op-sara"],
      since: new Date(Date.now() - 10 * 86_400_000),
    });
    expect(actionsOf(byActor.changes)).toEqual(["series.create"]);
  });

  test("finds a school's changes, and its hosts', by the school's name", async () => {
    const found = await directory().changeLog({
      ...page,
      words: "willowmere",
      named: { schools: [schoolId], tenants: [], subjects: [schoolId] },
    });
    expect(actionsOf(found.changes)).toEqual([
      "host.verified",
      "administrator.invite",
    ]);
  });

  test("finds words in a reason, and counts across every page", async () => {
    const found = await directory().changeLog({
      offset: 0,
      limit: 1,
      words: "inv-wlm-7",
    });
    expect(found.total).toBe(1);
    expect(actionsOf(found.changes)).toEqual(["tenant.lifecycle"]);
    const second = await directory().changeLog({ offset: 1, limit: 1 });
    expect(second.changes).toHaveLength(1);
    expect(second.total).toBeGreaterThanOrEqual(4);
  });

  test("counts each kind of change and each actor", async () => {
    const counts = await directory().changeCounts();
    expect(counts.actions).toContainEqual({
      value: "series.create",
      count: 1,
    });
    expect(counts.actors).toContainEqual({
      value: "operator:op-omar",
      count: 1,
    });
  });
});
