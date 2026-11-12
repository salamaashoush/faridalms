// @ts-check
// Runs inside the code runner's sandboxed frame. The frame has an opaque
// origin, so a program can reach none of Farida's cookies, storage or pages;
// each language runs in a worker of its own so a page never freezes.

/** @type {string | null} */
let parentOrigin = null;
/** @type {Record<string, string>} */
let sources = {};
/** @type {Map<string, Worker>} */
const workers = new Map();

/** @param {unknown} message */
function tell(message) {
  if (parentOrigin) window.parent.postMessage(message, parentOrigin);
}

/** @param {string} language */
function workerFor(language) {
  const existing = workers.get(language);
  if (existing) return existing;
  const source = sources[language];
  if (!source) return null;
  // A data address rather than a blob one: Chrome refuses a module worker
  // from a blob made in an opaque origin, and Pyodide needs a module worker.
  const worker = new Worker(
    `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`,
    { type: "module" },
  );
  worker.addEventListener("message", (event) => tell(event.data));
  worker.addEventListener("error", (event) => {
    event.preventDefault();
    tell({ type: "failed", message: event.message || "worker" });
    workers.delete(language);
  });
  workers.set(language, worker);
  return worker;
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const message = event.data;
  if (message?.type === "init") {
    parentOrigin = event.origin;
    sources = message.sources;
    tell({ type: "ready" });
    return;
  }
  if (event.origin !== parentOrigin) return;
  if (message?.type === "run") {
    const worker = workerFor(message.language);
    if (!worker) {
      tell({ type: "failed", id: message.id, message: "language" });
      return;
    }
    worker.postMessage(message, []);
  }
});
