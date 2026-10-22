import type { Cell } from "@faridalms/database/context";
import type { Directory } from "@faridalms/database/directory/client";

import { versionContent } from "@faridalms/database/stores/documents";
import {
  finishProgramRemark,
  lessonById,
  lessonResponses,
  pendingProgramRemarks,
} from "@faridalms/database/stores/learning";
import {
  markResponse,
  responseSchema,
  upgradeLesson,
} from "@faridalms/domain/learning";
import * as v from "valibot";

import type { Remark } from "../core/remarks";
import type { CodeRunner } from "./run";

import { applyRemarks } from "../core/remarks";
import { markedProgram } from "./mark";

type Runners = { python: CodeRunner | null; javascript: CodeRunner };

const asWorker = (tenantId: string) => ({
  tenantId,
  requestId: crypto.randomUUID(),
  actor: { kind: "system" as const },
});

/** Runs every answer to one code exercise again, and the marks that come out differently. */
async function rerunAsk(
  cell: Cell,
  runners: Runners,
  tenantId: string,
  ask: Awaited<ReturnType<typeof pendingProgramRemarks>>[number],
): Promise<boolean> {
  const read = await cell.withWorker(
    asWorker(tenantId),
    "read",
    async (tx) => ({
      lesson: await lessonById(tx, tenantId, ask.lessonId),
      stored: await versionContent(tx, tenantId, ask.documentVersionId),
      rows: (
        await lessonResponses(tx, { tenantId, lessonId: ask.lessonId })
      ).filter((row) => row.blockId === ask.blockId),
    }),
  );
  const content = read.stored ? upgradeLesson(read.stored) : null;
  const block = content?.blocks.find((item) => item.id === ask.blockId);
  const changes: Remark[] = [];
  if (block?.type === "program")
    for (const row of read.rows) {
      if (row.state !== "answered") continue;
      const parsed = v.safeParse(responseSchema, row.response);
      if (!parsed.success || parsed.output.type !== "program") continue;
      const response = await markedProgram(runners, block, {
        type: "program",
        code: parsed.output.code,
      });
      const fraction = markResponse(block, response).fraction;
      // The try stands as it was last marked again, or as it was first marked.
      const was =
        read.rows.findLast(
          (other) =>
            other.state === "remarked" &&
            other.studentId === row.studentId &&
            other.attempt === row.attempt &&
            other.try === row.try,
        ) ?? row;
      if (
        fraction === was.fraction &&
        JSON.stringify(response) === JSON.stringify(was.response)
      )
        continue;
      changes.push({
        studentId: row.studentId,
        attempt: row.attempt,
        block,
        try: row.try,
        fraction,
        response,
      });
    }
  return cell.withWorker(asWorker(tenantId), "write", async (tx) => {
    const closed = await finishProgramRemark(tx, {
      tenantId,
      id: ask.id,
      version: ask.version,
      remarked: changes.length,
    });
    if (!closed) return false;
    if (read.lesson && content && changes.length > 0)
      await applyRemarks(
        { tx, tenantId },
        read.lesson,
        { content, versionId: ask.documentVersionId },
        await lessonResponses(tx, { tenantId, lessonId: ask.lessonId }),
        changes,
      );
    return true;
  });
}

/**
 * Runs again the answers to one tenant's code exercises whose tests changed
 * and whose teachers chose to mark them again. Code runs between
 * transactions: the answers are read in one and the marks kept in another,
 * which first closes the ask and so keeps nothing if a newer version of the
 * lesson moved it on meanwhile. One exercise that cannot run is logged and
 * left waiting without holding up the rest.
 */
export async function rerunPrograms(
  cell: Cell,
  runners: Runners,
  tenantId: string,
  limit = 5,
): Promise<number> {
  const asks = await cell.withWorker(asWorker(tenantId), "read", (tx) =>
    pendingProgramRemarks(tx, { tenantId, limit }),
  );
  let finished = 0;
  for (const ask of asks)
    try {
      if (await rerunAsk(cell, runners, tenantId, ask)) finished += 1;
    } catch (error) {
      console.error(
        JSON.stringify({
          worker: "program-remarks",
          tenantId,
          ask: ask.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  return finished;
}

/**
 * Runs the code re-marking pass tenant by tenant on a timer, in the process
 * that holds the code runners. Each pass waits for the previous one.
 */
export function startProgramReruns(input: {
  cell: Cell;
  directory: Directory;
  cellId: string;
  runners: Runners;
  intervalMs: number;
}): () => Promise<void> {
  let stopped = false;
  let running: Promise<void> | null = null;
  const pass = async () => {
    const tenants = await input.directory.tenantsOfCell(input.cellId);
    for (const tenantId of tenants) {
      if (stopped) return;
      await rerunPrograms(input.cell, input.runners, tenantId);
    }
  };
  const timer = setInterval(() => {
    if (running || stopped) return;
    running = pass()
      .catch((error: unknown) =>
        console.error(
          JSON.stringify({ worker: "program-remarks", error: String(error) }),
        ),
      )
      .finally(() => {
        running = null;
      });
  }, input.intervalMs);
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}
