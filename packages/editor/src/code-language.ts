/**
 * The names code blocks' languages go by, and the spellings they are stored
 * under. Lexical keeps the same names beside Prism; these stay here so a
 * reader draws a block's label without loading Prism, and code-language.spec
 * fails if the two drift apart.
 */
export const CODE_LANGUAGE_NAMES: Record<string, string> = {
  c: "C",
  clike: "C-like",
  cpp: "C++",
  css: "CSS",
  go: "Go",
  html: "HTML",
  java: "Java",
  js: "JavaScript",
  markdown: "Markdown",
  objc: "Objective-C",
  plain: "Plain Text",
  powershell: "PowerShell",
  py: "Python",
  rust: "Rust",
  sql: "SQL",
  swift: "Swift",
  typescript: "TypeScript",
  xml: "XML",
};

const ALIASES: Record<string, string> = {
  golang: "go",
  javascript: "js",
  md: "markdown",
  plaintext: "plain",
  python: "py",
  text: "plain",
  ts: "typescript",
};

/** A block's language by name, or null for plain text or none. */
export function codeLanguageName(
  language: string | null | undefined,
): string | null {
  if (!language) return null;
  const key = Object.hasOwn(ALIASES, language) ? ALIASES[language] : language;
  if (!key || key === "plain") return null;
  return Object.hasOwn(CODE_LANGUAGE_NAMES, key)
    ? (CODE_LANGUAGE_NAMES[key] ?? null)
    : language;
}

/** The line numbers beside a block of code, one a line. */
export function codeGutter(source: string): string {
  const lines = source.split("\n").length;
  return Array.from({ length: lines }, (_, index) => index + 1).join("\n");
}
