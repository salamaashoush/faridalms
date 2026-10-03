import type { LexicalNode } from "lexical";

import { $getState, $setState, createState } from "lexical";

export type CodeRun = "run" | "predict";

/**
 * Whether students can run a code block, and whether they first answer the
 * question above it with what they expect it to do.
 */
export const codeRunState = createState("run", {
  parse: (value): CodeRun | "" =>
    value === "run" || value === "predict" ? value : "",
});

export function $codeRunOf(node: LexicalNode): CodeRun | null {
  return $getState(node, codeRunState) || null;
}

export function $setCodeRun(node: LexicalNode, run: CodeRun | null) {
  $setState(node, codeRunState, run ?? "");
}

/** Languages a student's browser can run. */
export const runnableLanguage = (language: string | null | undefined) =>
  language === "python" ||
  language === "py" ||
  language === "javascript" ||
  language === "js";
