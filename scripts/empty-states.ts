import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Words that say a list, a section or a value has nothing in it. Longer
 * sentences that merely start this way are hints, not empty states.
 */
const EMPTY_WORDING = /^(No|Nothing|Nobody|None|Not (\w+ )?yet)\b/u;
const LONGEST_EMPTY = 100;

/** One hand-drawn empty state the design system already draws. */
export interface AdHocEmptyState {
  file: string;
  line: number;
  text: string;
}

// An element whose only child is a message, a choice of two messages, or
// literal text: the shape every hand-drawn empty state in the apps had.
const ELEMENT =
  /<(p|span|div|li)\b[^>]*?className="([^"]*)"[^>]*>\s*(?:\{([^{}]*)\}|([^<>{}]+?))\s*<\/\1>/gu;
const MESSAGES_ONLY = /^(?:[^?:]+\?\s*)?m\.\w+\(\)(?:\s*:\s*m\.\w+\(\))?$/u;
const MESSAGE_CALL = /\bm\.(\w+)\(/gu;
// Text standing in for something that is not there sits in one branch of
// a condition, or is what a component returns instead of its content.
const IN_A_BRANCH = /(?:[?:]|&&|\?\?|return)\s*\(?\s*$/u;

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function saysEmpty(text: string): boolean {
  return text.length <= LONGEST_EMPTY && EMPTY_WORDING.test(text);
}

/**
 * Finds muted text that says a thing is empty, or a dashed box around a
 * line of text, drawn by hand rather than through `EmptyState`,
 * `FilteredEmptyState`, `RecordEmpty` or `Value absent`.
 */
export function findAdHocEmptyStates(
  file: string,
  source: string,
  messages: Readonly<Record<string, string>>,
): AdHocEmptyState[] {
  const found: AdHocEmptyState[] = [];
  for (const match of source.matchAll(ELEMENT)) {
    const [, tag, className = "", expression, literal] = match;
    const muted = className.split(/\s+/u).includes("text-muted-foreground");
    const dashed = tag === "p" && className.includes("border-dashed");
    if (!muted && !dashed) continue;
    const before = source.slice(Math.max(0, match.index - 40), match.index);
    if (!IN_A_BRANCH.test(before)) continue;
    let texts: string[];
    if (expression !== undefined) {
      if (!MESSAGES_ONLY.test(expression.trim())) continue;
      texts = [...expression.matchAll(MESSAGE_CALL)].map(
        ([, key = ""]) => messages[key] ?? "",
      );
    } else {
      texts = [literal?.trim().replaceAll(/\s+/gu, " ") ?? ""];
    }
    const empty = texts.find(saysEmpty);
    if (empty === undefined && !dashed) continue;
    found.push({
      file,
      line: lineAt(source, match.index),
      text: empty ?? texts.join(" | "),
    });
  }
  return found;
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".spec.tsx")
      ? [path]
      : [];
  });
}

/** Every hand-drawn empty state in the portal and the console. */
export function scanApps(root: string): AdHocEmptyState[] {
  const messages = JSON.parse(
    readFileSync(join(root, "messages/en.json"), "utf8"),
  ) as Record<string, string>;
  return ["apps/web/src", "apps/ops/src"].flatMap((dir) =>
    sources(join(root, dir)).flatMap((path) =>
      findAdHocEmptyStates(
        relative(root, path),
        readFileSync(path, "utf8"),
        messages,
      ),
    ),
  );
}
