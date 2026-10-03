// Runs students' Python for marking, in a thread of its own so a program
// that never ends can be stopped by ending the thread. CPython is compiled
// to WebAssembly for WASI and given only an in-memory copy of its standard
// library and the program: no host file, socket or process is reachable.
import {
  ConsoleStdout,
  Directory,
  File,
  OpenFile,
  PreopenDirectory,
  WASI,
} from "@bjorn3/browser_wasi_shim";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

declare const self: Worker;

/** A program may use up to this much memory, in 64 KiB pages: 256 MiB. */
const MAX_PAGES = 4096;
/** Past this much output a program is stopped. */
const MAX_OUTPUT = 64 * 1024;

// Questions asked with input() go to standard error, so what a program is
// marked on is only what it prints.
const RUNNER = `import builtins, sys
_read = builtins.input
def _ask(prompt=""):
    sys.stderr.write(str(prompt))
    return _read()
builtins.input = _ask
with open("/work/main.py", encoding="utf-8") as source:
    program = compile(source.read(), "main.py", "exec")
exec(program, {"__name__": "__main__", "__builtins__": builtins})
`;

function unsigned(
  bytes: Uint8Array<ArrayBuffer>,
  at: number,
): [number, number] {
  let value = 0;
  let shift = 0;
  let position = at;
  for (;;) {
    const byte = bytes[position] ?? 0;
    position += 1;
    value += (byte & 0x7f) * 2 ** shift;
    shift += 7;
    if (!(byte & 0x80)) return [value, position];
  }
}

function leb(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  do {
    const byte = rest & 0x7f;
    rest = Math.floor(rest / 128);
    out.push(rest ? byte | 0x80 : byte);
  } while (rest);
  return out;
}

/**
 * The module with its memory capped. CPython declares a memory that may
 * grow to four gigabytes, which one program could ask the server for.
 */
function capped(wasm: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  let at = 8;
  while (at < wasm.length) {
    const id = wasm[at] ?? 0;
    const [size, start] = unsigned(wasm, at + 1);
    if (id === 5) {
      const [count, first] = unsigned(wasm, start);
      const flags = wasm[first] ?? 0;
      if (count !== 1 || flags & 1) return wasm;
      const [minimum] = unsigned(wasm, first + 1);
      const body = [...leb(1), 1, ...leb(minimum), ...leb(MAX_PAGES)];
      const section = Uint8Array.from([5, ...leb(body.length), ...body]);
      const tail = wasm.subarray(start + size);
      const out = new Uint8Array(at + section.length + tail.length);
      out.set(wasm.subarray(0, at));
      out.set(section, at);
      out.set(tail, at + section.length);
      return out;
    }
    at = start + size;
  }
  return wasm;
}

function tree(dir: string): Map<string, Directory | File> {
  const entries = new Map<string, Directory | File>();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    entries.set(
      name,
      statSync(path).isDirectory()
        ? new Directory(tree(path))
        : new File(readFileSync(path), { readonly: true }),
    );
  }
  return entries;
}

let python: { module: WebAssembly.Module; lib: Map<string, Directory | File> };

function run(code: string, stdin: string) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let stdout = "";
  let stderr = "";
  let written = 0;
  let overflow = false;
  const sink = (target: "out" | "err") =>
    new ConsoleStdout((bytes) => {
      written += bytes.length;
      if (written > MAX_OUTPUT) {
        overflow = true;
        throw new Error("output");
      }
      const text = decoder.decode(bytes, { stream: true });
      if (target === "out") stdout += text;
      else stderr += text;
    });
  const wasi = new WASI(
    ["python", "-I", "-S", "/work/run.py"],
    [
      "PYTHONHOME=/",
      "PYTHONDONTWRITEBYTECODE=1",
      "PYTHONIOENCODING=utf-8",
      "NO_COLOR=1",
    ],
    [
      new OpenFile(new File(encoder.encode(stdin))),
      sink("out"),
      sink("err"),
      new PreopenDirectory("/lib", python.lib),
      new PreopenDirectory(
        "/work",
        new Map([
          ["run.py", new File(encoder.encode(RUNNER))],
          ["main.py", new File(encoder.encode(code))],
        ]),
      ),
    ],
    { debug: false },
  );
  let exit = 1;
  try {
    const instance = new WebAssembly.Instance(python.module, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });
    exit = wasi.start(instance as unknown as Parameters<typeof wasi.start>[0]);
  } catch {
    exit = 1;
  }
  return { exit, stdout, stderr, overflow };
}

self.addEventListener("message", (event: MessageEvent) => {
  const message = event.data as
    | { type: "init"; dir: string }
    | { type: "run"; code: string; stdin: string };
  if (message.type === "init") {
    const lib = tree(join(message.dir, "lib"));
    // Python looks for its compiled extensions here and warns on every run
    // when the folder is missing; this build has none.
    for (const [name, entry] of lib)
      if (name.startsWith("python3") && entry instanceof Directory)
        entry.contents.set("lib-dynload", new Directory(new Map()));
    python = {
      module: new WebAssembly.Module(
        capped(new Uint8Array(readFileSync(join(message.dir, "python.wasm")))),
      ),
      lib,
    };
    postMessage({ type: "ready" });
    return;
  }
  postMessage({ type: "result", ...run(message.code, message.stdin) });
});
