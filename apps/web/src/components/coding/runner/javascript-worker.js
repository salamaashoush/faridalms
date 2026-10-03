// @ts-check
// Runs a student's JavaScript, one program at a time, each loaded as a
// module of its own. console.log and prompt() write to and read from the
// page around it, the way a terminal would, since a worker has neither a
// console to show nor a dialog.

const FLUSH_MS = 50;
const FLUSH_CHARS = 4096;

/** @type {string | null} */
let current = null;
let pending = "";
let pendingStream = "out";
let flushedAt = 0;
/** @type {string[]} */
let input = [];

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

/**
 * A value as a console shows it: text as it is, everything else in the
 * shape a reader would type it.
 * @param {unknown} value
 * @param {number} depth
 * @returns {string}
 */
function shown(value, depth = 0) {
  if (typeof value === "string")
    return depth === 0 ? value : JSON.stringify(value);
  if (typeof value === "function")
    return `[Function ${value.name || "anonymous"}]`;
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return value.toString();
  if (value === null || typeof value !== "object") return String(value);
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (depth > 2) return Array.isArray(value) ? "[Array]" : "[Object]";
  if (Array.isArray(value))
    return `[ ${value.map((item) => shown(item, depth + 1)).join(", ")} ]`;
  if (value instanceof Map)
    return `Map(${value.size}) { ${[...value]
      .map(
        ([key, item]) =>
          `${shown(key, depth + 1)} => ${shown(item, depth + 1)}`,
      )
      .join(", ")} }`;
  if (value instanceof Set)
    return `Set(${value.size}) { ${[...value].map((item) => shown(item, depth + 1)).join(", ")} }`;
  const entries = Object.entries(value).map(
    ([key, item]) => `${key}: ${shown(item, depth + 1)}`,
  );
  return entries.length ? `{ ${entries.join(", ")} }` : "{}";
}

/** @param {string} stream */
const logger =
  (stream) =>
  /** @param {unknown[]} values */
  (...values) =>
    write(stream, `${values.map((value) => shown(value)).join(" ")}\n`);

const page = /** @type {Record<string, unknown>} */ (globalThis);
page.console = {
  ...console,
  log: logger("out"),
  info: logger("out"),
  debug: logger("out"),
  warn: logger("err"),
  error: logger("err"),
};
/** @param {unknown} question */
page.prompt = (question) => {
  if (question !== undefined) write("out", `${shown(question)} `);
  const line = input.shift();
  if (line === undefined) return null;
  write("in", `${line}\n`);
  return line;
};

/**
 * The line a program's own error happened on, from where the browser says
 * it was thrown in the program's module, which the run's id names.
 * @param {unknown} error
 * @param {string} id
 */
function lineOf(error, id) {
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  const frame = stack
    .split("\n")
    .find((line) => line.includes(encodeURIComponent(id)));
  const match = /:(\d+):\d+\)?$/.exec(frame?.trim() ?? "");
  return match ? Number(match[1]) : null;
}

/** @param {{ id: string; code: string; stdin: string[] }} message */
async function run(message) {
  current = message.id;
  input = [...message.stdin];
  postMessage({ type: "started", id: message.id });
  try {
    // The run's id keeps each address new: a module already loaded from
    // the same address would not run again.
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(
        `${message.code}\n// ${message.id}`,
      )}`
    );
    // Lets promises the program settled print before it is called done.
    await new Promise((settled) => setTimeout(settled, 0));
    flush();
    postMessage({ type: "done", id: message.id, error: null });
  } catch (error) {
    flush();
    const name = error instanceof Error ? error.name : "Error";
    const text = error instanceof Error ? error.message : shown(error);
    postMessage({
      type: "done",
      id: message.id,
      error: {
        name,
        message: `${name}: ${text}`,
        line: lineOf(error, message.id),
        trace: `${name}: ${text}`,
      },
    });
  } finally {
    current = null;
  }
}

addEventListener("message", (event) => {
  if (event.data?.type === "run") void run(event.data);
});
