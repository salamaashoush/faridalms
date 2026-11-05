import type {
  LessonResponse,
  ProgramBlock,
  ProgramResult,
} from "@faridalms/domain/learning";
import type { SchoolPlan } from "@faridalms/domain/plans";

import { outputMatches } from "@faridalms/domain/learning";
import { availableModules } from "@faridalms/domain/plans";
import { ORPCError } from "@orpc/server";

import type { CodeRun, CodeRunner } from "./run";

/** The last line of an error, as Python or JavaScript states it. */
function errorLine(stderr: string): string | null {
  const last = stderr.trimEnd().split("\n").at(-1) ?? "";
  return /^[A-Za-z_][\w.]*(Error|Exception|Exit|Interrupt)\b/.test(last)
    ? last.slice(0, 500)
    : null;
}

function resultOf(
  test: ProgramBlock["tests"][number],
  run: CodeRun,
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
  runners: { python: CodeRunner | null; javascript: CodeRunner },
  block: ProgramBlock,
  response: Extract<LessonResponse, { type: "program" }>,
): Promise<LessonResponse> {
  const runner = runners[block.language];
  if (!runner)
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "learning.no_python",
    });
  const runs = await runner.run(
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

/**
 * A program a student hands in or runs, marked at a school that has the
 * coding module; one without it keeps the question in its documents but
 * runs nothing.
 */
export async function markedProgramAt(
  context: {
    runners: { python: CodeRunner | null; javascript: CodeRunner };
    school: { plan: SchoolPlan | null };
  },
  block: ProgramBlock,
  response: Extract<LessonResponse, { type: "program" }>,
): Promise<LessonResponse> {
  // A run holds no unit of work open, and coding is no switch a school
  // sets, so the plan alone says whether the school has it.
  if (!availableModules(context.school.plan).includes("coding"))
    throw new ORPCError("FORBIDDEN", { message: "coding.unavailable" });
  return markedProgram(context.runners, block, response);
}
