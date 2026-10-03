import type {
  LessonResponse,
  ProgramBlock,
  ProgramResult,
} from "@faridalms/domain/learning";

import { outputMatches } from "@faridalms/domain/learning";
import { ORPCError } from "@orpc/server";

import type { PythonRun, PythonRunner } from "./python";

/** The line Python ends a traceback with: the error and what it says. */
function errorLine(stderr: string): string | null {
  const last = stderr.trimEnd().split("\n").at(-1) ?? "";
  return /^[A-Za-z_][\w.]*(Error|Exception|Exit|Interrupt)\b/.test(last)
    ? last.slice(0, 500)
    : null;
}

function resultOf(
  test: ProgramBlock["tests"][number],
  run: PythonRun,
): ProgramResult {
  const error = errorLine(run.stderr);
  return {
    passed:
      !run.timedOut &&
      !run.overflow &&
      run.exit === 0 &&
      outputMatches(test.expected, run.stdout),
    // A hidden test's input stays hidden, and with it what the program
    // printed from it and what its error said; only the error's name shows.
    output: test.hidden ? null : run.stdout.slice(0, 4000),
    error: test.hidden ? (error?.split(":")[0] ?? null) : error,
    stopped: run.timedOut ? "time" : run.overflow ? "output" : null,
  };
}

/**
 * A code exercise's answer as it is kept: the student's program with how
 * it did in each test, run here. Results a student sent are never kept.
 */
export async function markedProgram(
  python: PythonRunner | null,
  block: ProgramBlock,
  response: Extract<LessonResponse, { type: "program" }>,
): Promise<LessonResponse> {
  if (!python)
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "learning.no_python",
    });
  const runs = await python.run(
    response.code,
    block.tests.map((test) =>
      test.input === "" || test.input.endsWith("\n")
        ? test.input
        : `${test.input}\n`,
    ),
  );
  return {
    type: "program",
    code: response.code,
    results: Object.fromEntries(
      block.tests.flatMap((test, index) => {
        const run = runs[index];
        return run ? [[test.id, resultOf(test, run)]] : [];
      }),
    ),
  };
}
