import { existsSync } from "node:fs";
import { join } from "node:path";

export interface PythonRun {
  exit: number;
  stdout: string;
  stderr: string;
  /** Stopped for printing too much. */
  overflow: boolean;
  /** Stopped for running too long. */
  timedOut: boolean;
}

/** Runs a student's program once for each input it is checked with. */
export interface PythonRunner {
  run(code: string, inputs: readonly string[]): Promise<PythonRun[]>;
}

/** How long one run may take before it is stopped as stuck. */
const RUN_MS = 5000;
/** How long all of one answer's runs may take together. */
const ANSWER_MS = 20_000;
/** Answers marked at once; more wait their turn. */
const AT_ONCE = 2;

// The worker sits beside this module in the source, and beside the bundle
// once built, where it is its own entry point.
const WORKER = join(
  import.meta.dir,
  import.meta.path.endsWith(".ts") ? "python-worker.ts" : "python-worker.js",
);

const stopped = (timedOut: boolean): PythonRun => ({
  exit: 1,
  stdout: "",
  stderr: "",
  overflow: false,
  timedOut,
});

/**
 * Runs the inputs it can in one worker, from `first` on. A run that takes
 * too long ends the worker; the runs after it get a fresh one.
 */
function runFrom(
  dir: string,
  code: string,
  inputs: readonly string[],
  first: number,
  deadline: number,
): Promise<{ runs: PythonRun[]; stuck: boolean }> {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER);
    const runs: PythonRun[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (stuck: boolean) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ runs, stuck });
    };
    const next = () => {
      const index = first + runs.length;
      if (index >= inputs.length) {
        finish(false);
        return;
      }
      timer = setTimeout(
        () => {
          runs.push(stopped(true));
          finish(true);
        },
        Math.max(0, Math.min(RUN_MS, deadline - Date.now())),
      );
      worker.postMessage({ type: "run", code, stdin: inputs[index] }, []);
    };
    worker.addEventListener("message", (event: MessageEvent) => {
      const message = event.data as
        | { type: "ready" }
        | ({ type: "result" } & Omit<PythonRun, "timedOut">);
      if (message.type === "result") {
        clearTimeout(timer);
        const { type: _type, ...run } = message;
        runs.push({ ...run, timedOut: false });
      }
      next();
    });
    worker.addEventListener("error", () => {
      runs.push(stopped(false));
      finish(true);
    });
    worker.postMessage({ type: "init", dir }, []);
  });
}

/**
 * Python for marking, or null when it was not fetched (see
 * `apps/api/scripts/python-wasi.ts`), when code exercises cannot be marked.
 */
export function createPythonRunner(dir: string): PythonRunner | null {
  if (!existsSync(join(dir, "python.wasm"))) return null;
  let busy = 0;
  const waiting: (() => void)[] = [];
  return {
    async run(code, inputs) {
      if (busy >= AT_ONCE)
        await new Promise<void>((turn) => waiting.push(turn));
      busy += 1;
      try {
        const deadline = Date.now() + ANSWER_MS;
        const runs: PythonRun[] = [];
        while (runs.length < inputs.length) {
          if (Date.now() >= deadline) {
            runs.push(stopped(true));
            continue;
          }
          const part = await runFrom(dir, code, inputs, runs.length, deadline);
          runs.push(...part.runs);
        }
        return runs;
      } finally {
        busy -= 1;
        waiting.shift()?.();
      }
    },
  };
}
