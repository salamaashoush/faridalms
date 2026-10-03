// @ts-check
// Runs a student's Python with Pyodide, one program at a time, each in a
// fresh namespace. Output is sent in batches, since a loop that prints
// thousands of lines would otherwise send thousands of messages.

/** @typedef {import("pyodide").PyodideAPI} Pyodide */

const FLUSH_MS = 50;
const FLUSH_CHARS = 4096;

/** @type {Promise<Pyodide> | null} */
let booting = null;
/** @type {string | null} */
let current = null;
let pending = "";
let pendingStream = "out";
let flushedAt = 0;

function flush() {
  if (pending && current)
    postMessage({
      type: "output",
      id: current,
      stream: pendingStream,
      text: pending,
    });
  pending = "";
  flushedAt = performance.now();
}

/**
 * @param {string} stream
 * @param {string} text
 */
function write(stream, text) {
  if (stream !== pendingStream) flush();
  pendingStream = stream;
  pending += text;
  if (pending.length > FLUSH_CHARS || performance.now() - flushedAt > FLUSH_MS)
    flush();
}

const decoder = new TextDecoder();

/** @param {string} stream */
const writer = (stream) => ({
  isatty: false,
  /** @param {Uint8Array} buffer */
  write(buffer) {
    write(stream, decoder.decode(buffer, { stream: true }));
    return buffer.length;
  },
});

/** @param {string} indexURL */
async function boot(indexURL) {
  const { loadPyodide } = /** @type {typeof import("pyodide")} */ (
    await import(`${indexURL}pyodide.mjs`)
  );
  const pyodide = await loadPyodide({ indexURL });
  pyodide.setStdout(writer("out"));
  pyodide.setStderr(writer("err"));
  return pyodide;
}

/**
 * The traceback from the student's own file on, without Pyodide's frames.
 * @param {string} trace
 */
function ownTrace(trace) {
  const lines = trace.trimEnd().split("\n");
  const start = lines.findIndex((line) => line.includes('File "main.py"'));
  if (start === -1) return lines.slice(-1);
  return [lines[0] ?? "", ...lines.slice(start)];
}

/** @param {string[]} lines */
function lineOf(lines) {
  const frames = lines.filter((line) => line.includes('File "main.py"'));
  const match = /line (\d+)/.exec(frames.at(-1) ?? "");
  return match ? Number(match[1]) : null;
}

// Hands over a turtle's drawing as JSON text, or None when no turtle ran.
const DRAWING = `import json, sys
_turtle = sys.modules.get("turtle")
_drawing = getattr(_turtle, "_drawing", None)
json.dumps(_drawing()) if _drawing else None`;

/**
 * @param {{
 *   id: string;
 *   code: string;
 *   stdin: string[];
 *   indexURL: string;
 *   modules?: Record<string, string>;
 * }} message
 */
async function run(message) {
  current = message.id;
  booting ??= boot(message.indexURL);
  /** @type {Pyodide} */
  let pyodide;
  try {
    pyodide = await booting;
  } catch (error) {
    booting = null;
    postMessage({
      type: "failed",
      id: message.id,
      message: String(error),
    });
    return;
  }
  const input = [...message.stdin];
  pyodide.setStdin({
    stdin: () => {
      const line = input.shift();
      if (line === undefined) return undefined;
      write("in", `${line}\n`);
      return `${line}\n`;
    },
    isatty: false,
  });
  // Lesson modules, such as turtle, sit where a program's own imports are
  // looked for first, so they stand in for the standard library's.
  for (const [name, source] of Object.entries(message.modules ?? {}))
    pyodide.FS.writeFile(`/home/pyodide/${name}`, source);
  pyodide.runPython(
    `import sys\nfor _name in ${JSON.stringify(Object.keys(message.modules ?? {}).map((name) => name.replace(/\.py$/, "")))}:\n    sys.modules.pop(_name, None)`,
  );
  postMessage({ type: "started", id: message.id });
  const globals = pyodide.globals.get("dict")();
  globals.set("__name__", "__main__");
  // Python holds back what a program prints when it is not writing to a
  // terminal; flushing at the end keeps it from showing in the next run.
  const settle = () => {
    pyodide.runPython("import sys\nsys.stdout.flush()\nsys.stderr.flush()");
    flush();
    const drawing = pyodide.runPython(DRAWING);
    if (typeof drawing === "string")
      postMessage({
        type: "drawing",
        id: message.id,
        drawing: JSON.parse(drawing),
      });
  };
  try {
    pyodide.runPython(message.code, { globals, filename: "main.py" });
    settle();
    postMessage({ type: "done", id: message.id, error: null });
  } catch (error) {
    settle();
    const python = /** @type {{ type?: string; message?: string }} */ (error);
    const trace = ownTrace(python.message ?? String(error));
    postMessage({
      type: "done",
      id: message.id,
      error: {
        name: python.type ?? "Error",
        message: trace.at(-1) ?? "",
        line: lineOf(trace),
        trace: trace.join("\n"),
      },
    });
  } finally {
    globals.destroy();
    current = null;
  }
}

addEventListener("message", (event) => {
  if (event.data?.type === "run") void run(event.data);
});
