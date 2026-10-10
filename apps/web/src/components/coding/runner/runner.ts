import { consoleSource } from "@faridalms/domain/console";
import { version as pyodideVersion } from "pyodide/package.json";

import frameSource from "./frame.js?raw";
import javascriptSource from "./javascript-worker.js?raw";
import pythonSource from "./python-worker.js?raw";
import turtleSource from "./turtle.py?raw";

export type RunLanguage = "python" | "javascript";
export type RunStream = "out" | "err" | "in";

export interface RunError {
  name: string;
  /** The error's last line, as Python or the browser states it. */
  message: string;
  /** The line of the program it happened on, when it says. */
  line: number | null;
  trace: string;
}

/** What a turtle drew, as the turtle module recorded it. */
export interface Drawing {
  screen: { width: number; height: number; bg: string; title: string };
  commands: DrawCommand[];
}

export type DrawCommand =
  | {
      op: "turtle";
      id: number;
      x: number;
      y: number;
      heading: number;
      visible: boolean;
      shape: string;
      speed: number;
    }
  | {
      op: "line";
      id: number;
      from: [number, number];
      to: [number, number];
      color: string;
      width: number;
      speed: number;
    }
  | { op: "move"; id: number; to: [number, number]; speed: number }
  | { op: "turn"; id: number; heading: number; speed: number }
  | { op: "dot"; at: [number, number]; size: number; color: string }
  | {
      op: "stamp";
      at: [number, number];
      heading: number;
      color: string;
      outline: string;
      shape: string;
    }
  | {
      op: "text";
      at: [number, number];
      text: string;
      align: string;
      font: (string | number)[];
      color: string;
    }
  | { op: "fill"; points: [number, number][]; color: string }
  | { op: "bg"; color: string }
  | { op: "clear"; id: number }
  | { op: "instant" };

export type RunEnd =
  | { status: "done"; error: RunError | null }
  | { status: "stopped"; reason: "timeout" | "asked" | "output" }
  | { status: "failed" };

/** How long a program may run before it is stopped as stuck in a loop. */
export const RUN_SECONDS = 10;
/** How long Python may take to load before the run is given up. */
const LOAD_SECONDS = 90;
/** Past this much output a program is stopped, so a page stays usable. */
export const MAX_OUTPUT_CHARS = 100_000;

export const runLanguage = (language: string | null | undefined) =>
  language === "python" || language === "py"
    ? "python"
    : language === "javascript" || language === "js"
      ? "javascript"
      : null;

interface Active {
  id: string;
  onOutput: (stream: RunStream, text: string) => void;
  onDrawing?: (drawing: Drawing) => void;
  onStarted: () => void;
  finish: (end: RunEnd) => void;
  written: number;
  timer: ReturnType<typeof setTimeout> | null;
}

let frame: HTMLIFrameElement | null = null;
let ready: Promise<HTMLIFrameElement> | null = null;
let markReady: (() => void) | null = null;
let active: Active | null = null;

function closeFrame() {
  frame?.remove();
  frame = null;
  ready = null;
  markReady = null;
}

function end(result: RunEnd) {
  const run = active;
  if (!run) return;
  if (run.timer) clearTimeout(run.timer);
  active = null;
  run.finish(result);
}

/** Stops the program running now, taking its frame down with it. */
function halt(reason: "timeout" | "asked" | "output") {
  if (!active) return;
  closeFrame();
  end({ status: "stopped", reason });
}

function onMessage(event: MessageEvent) {
  if (!frame || event.source !== frame.contentWindow) return;
  const data = event.data as {
    type?: string;
    id?: string;
    stream?: RunStream;
    text?: string;
    error?: RunError | null;
    drawing?: Drawing;
  };
  if (data.type === "ready") {
    markReady?.();
    return;
  }
  const run = active;
  if (!run || (data.id !== undefined && data.id !== run.id)) return;
  if (data.type === "started") {
    if (run.timer) clearTimeout(run.timer);
    run.onStarted();
    run.timer = setTimeout(() => halt("timeout"), RUN_SECONDS * 1000);
  } else if (data.type === "output" && data.text) {
    run.written += data.text.length;
    run.onOutput(data.stream ?? "out", data.text);
    if (run.written > MAX_OUTPUT_CHARS) halt("output");
  } else if (data.type === "drawing" && data.drawing) {
    run.onDrawing?.(data.drawing);
  } else if (data.type === "done") {
    end({ status: "done", error: data.error ?? null });
  } else if (data.type === "failed") {
    closeFrame();
    end({ status: "failed" });
  }
}

function openFrame(): Promise<HTMLIFrameElement> {
  ready ??= new Promise((resolve) => {
    window.removeEventListener("message", onMessage);
    window.addEventListener("message", onMessage);
    const element = document.createElement("iframe");
    // Scripts only: without allow-same-origin the frame's origin is opaque,
    // so nothing a program does can read or act as the signed-in person.
    element.setAttribute("sandbox", "allow-scripts");
    element.setAttribute("aria-hidden", "true");
    element.tabIndex = -1;
    element.style.display = "none";
    element.srcdoc = `<!doctype html><meta charset="utf-8"><script>${frameSource.replaceAll("</script", "<\\/script")}</script>`;
    markReady = () => resolve(element);
    element.addEventListener(
      "load",
      () =>
        element.contentWindow?.postMessage(
          {
            type: "init",
            sources: {
              python: pythonSource,
              javascript: consoleSource + javascriptSource,
            },
          },
          "*",
        ),
      { once: true },
    );
    frame = element;
    document.body.append(element);
  });
  return ready;
}

/**
 * Runs a program away from the page and reports what it prints. Only one
 * program runs at a time: starting another stops the one before.
 */
export function runCode(
  request: {
    language: RunLanguage;
    code: string;
    stdin: string[];
    /** More Python files the program may import, by file name. */
    modules?: Record<string, string>;
  },
  handlers: {
    onOutput: (stream: RunStream, text: string) => void;
    onStarted: () => void;
    onDrawing?: (drawing: Drawing) => void;
  },
): { done: Promise<RunEnd>; stop: () => void } {
  halt("asked");
  const id = crypto.randomUUID();
  const done = new Promise<RunEnd>((finish) => {
    active = { id, ...handlers, finish, written: 0, timer: null };
  });
  void openFrame().then((element) => {
    if (active?.id !== id) return;
    active.timer = setTimeout(() => {
      closeFrame();
      end({ status: "failed" });
    }, LOAD_SECONDS * 1000);
    element.contentWindow?.postMessage(
      {
        type: "run",
        id,
        language: request.language,
        code: request.code,
        stdin: request.stdin,
        indexURL: `${window.location.origin}/pyodide/${pyodideVersion}/`,
        // Our turtle is the one a program gets, whatever a file is named.
        modules:
          request.language === "python"
            ? { ...request.modules, "turtle.py": turtleSource }
            : {},
      },
      "*",
    );
  });
  return {
    done,
    stop: () => {
      if (active?.id === id) halt("asked");
    },
  };
}
