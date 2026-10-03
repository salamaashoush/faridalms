// Runs students' JavaScript for marking in QuickJS, an engine compiled to
// WebAssembly that holds only what it is handed: a console that writes to
// the test's output, prompt() that reads its input, and timers that run once
// the program's own code has. No host global, file or socket is reachable.
import type { QuickJSWASMModule } from "quickjs-emscripten-core";

import { consoleSource } from "@faridalms/domain/console";
import variant from "@jitl/quickjs-singlefile-mjs-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  shouldInterruptAfterDeadline,
} from "quickjs-emscripten-core";

declare const self: Worker;

/** A program may use up to this much memory. */
const MAX_MEMORY = 64 * 1024 * 1024;
/** Past this much output a program is stopped. */
const MAX_OUTPUT = 64 * 1024;
/** How long one run may take; the thread is ended a little later regardless. */
const RUN_MS = 4000;

// As in the browser: console.log prints, prompt() asks on standard error so
// only what a program prints is marked, and a timer waits for the program
// to finish rather than for the clock.
const PRELUDE = `${consoleSource}
(() => {
  const print = (stream) => (...values) =>
    __write(stream, values.map((value) => faridaShow(value)).join(" ") + "\\n");
  globalThis.console = {
    log: print("out"), info: print("out"), debug: print("out"),
    warn: print("err"), error: print("err"),
  };
  globalThis.prompt = (question) => {
    if (question !== undefined) __write("err", faridaShow(question) + " ");
    return __read();
  };
  const timers = [];
  globalThis.setTimeout = (callback, delay = 0, ...args) => {
    timers.push({ callback, delay: Number(delay) || 0, args, order: timers.length });
    return timers.length;
  };
  globalThis.__runTimers = () => {
    while (timers.length) {
      timers.sort((a, b) => a.delay - b.delay || a.order - b.order);
      const timer = timers.shift();
      timer.callback(...timer.args);
    }
  };
})();
`;

let quickjs: QuickJSWASMModule;

function run(code: string, stdin: string) {
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(MAX_MEMORY);
  runtime.setMaxStackSize(512 * 1024);
  runtime.setInterruptHandler(
    shouldInterruptAfterDeadline(Date.now() + RUN_MS),
  );
  const vm = runtime.newContext();
  let stdout = "";
  let stderr = "";
  let overflow = false;
  const lines = stdin.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const write = vm.newFunction("__write", (stream, text) => {
    const chunk = vm.getString(text);
    if (stdout.length + stderr.length + chunk.length > MAX_OUTPUT) {
      overflow = true;
      throw new Error("output");
    }
    if (vm.getString(stream) === "out") stdout += chunk;
    else stderr += chunk;
  });
  const read = vm.newFunction("__read", () => {
    const line = lines.shift();
    return line === undefined ? vm.null : vm.newString(line);
  });
  vm.setProp(vm.global, "__write", write);
  vm.setProp(vm.global, "__read", read);
  write.dispose();
  read.dispose();
  let exit = 0;
  let timedOut = false;
  const settle = (result: ReturnType<typeof vm.evalCode>) => {
    if (!result.error) {
      result.value.dispose();
      return true;
    }
    const error = vm.dump(result.error) as { name?: string; message?: string };
    result.error.dispose();
    exit = 1;
    if (error.name === "InternalError" && error.message === "interrupted")
      timedOut = true;
    else stderr += `${error.name ?? "Error"}: ${error.message ?? ""}\n`;
    return false;
  };
  if (settle(vm.evalCode(PRELUDE, "prelude.js")))
    if (settle(vm.evalCode(code, "main.js"))) {
      runtime.executePendingJobs();
      if (settle(vm.evalCode("__runTimers()", "timers.js")))
        runtime.executePendingJobs();
    }
  vm.dispose();
  runtime.dispose();
  return { exit, stdout, stderr, overflow, timedOut };
}

self.addEventListener("message", (event: MessageEvent) => {
  const message = event.data as
    | { type: "init" }
    | { type: "run"; code: string; stdin: string };
  if (message.type === "init") {
    void newQuickJSWASMModuleFromVariant(variant).then((module) => {
      quickjs = module;
      postMessage({ type: "ready" });
    });
    return;
  }
  postMessage({ type: "result", ...run(message.code, message.stdin) });
});
