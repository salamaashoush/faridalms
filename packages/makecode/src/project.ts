/** A file of a project, as any project's files are kept: a name and what it holds. */
export interface CodeFile {
  name: string;
  code: string;
}

/**
 * The kinds of file a device project is made of, beside Python: its
 * blocks, the TypeScript they come to, what the project is and needs, and
 * its notes.
 */
export const deviceFileKinds = ["blocks", "ts", "json", "md"] as const;

/** The file that says what a device project is: its name and what it is built on. */
export const CONFIG = "pxt.json";

// The editor also keeps files of its own beside a project's, such as every
// change ever made to it, which grows without end. Those are let go: a
// project is the files a student would name.
const KEPT = new RegExp(
  `^[A-Za-z0-9][A-Za-z0-9_-]{0,31}\\.(${[...deviceFileKinds, "py"].join("|")})$`,
);

const FIRST = [CONFIG, "main.blocks", "main.ts", "main.py", "README.md"];
const place = (name: string) => {
  const at = FIRST.indexOf(name);
  return at === -1 ? FIRST.length : at;
};

/**
 * A project as the editor hands it over, as the files Farida keeps: what
 * the project is first, then its program, then whatever else, by name, so
 * the same project always comes to the same files.
 */
export function filesOf(text: Readonly<Record<string, unknown>>): CodeFile[] {
  return Object.entries(text)
    .flatMap(([name, code]) =>
      KEPT.test(name) && typeof code === "string" ? [{ name, code }] : [],
    )
    .toSorted(
      (a, b) => place(a.name) - place(b.name) || a.name.localeCompare(b.name),
    );
}

/** Kept files as the editor takes a project: each file's text under its name. */
export function textOf(files: readonly CodeFile[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [file.name, file.code]));
}

/** Whether a set of files is a device project. */
export const isDeviceProject = (files: readonly CodeFile[]) =>
  files.some((file) => file.name === CONFIG);

/** The editors a project can open in, as the editor names them. */
export const PROJECT_EDITORS = ["blocksprj", "tsprj", "pyprj"] as const;
export type ProjectEditor = (typeof PROJECT_EDITORS)[number];

interface Config {
  name?: unknown;
  preferredEditor?: unknown;
}

function configOf(files: readonly CodeFile[]): Config {
  const config = files.find((file) => file.name === CONFIG);
  if (!config) return {};
  try {
    const parsed: unknown = JSON.parse(config.code);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The editor a project opens in: the one it was last worked in, which a
 * teacher's starter sets for every student, and blocks for one that says
 * nothing.
 */
export function editorOf(files: readonly CodeFile[]): ProjectEditor {
  const preferred = configOf(files).preferredEditor;
  return PROJECT_EDITORS.find((editor) => editor === preferred) ?? "blocksprj";
}

/**
 * The program of a project as text a person reads: its Python where it is
 * written in Python, and otherwise the TypeScript its blocks come to.
 */
export function programOf(files: readonly CodeFile[]): CodeFile | null {
  const named = (name: string) =>
    files.find((file) => file.name === name) ?? null;
  return (
    (editorOf(files) === "pyprj" ? named("main.py") : null) ?? named("main.ts")
  );
}

/**
 * The project a student starts from when their teacher gave none: the
 * editor's own new project for the micro:bit, with "on start" and
 * "forever" waiting for blocks.
 */
export function blankProject(): CodeFile[] {
  return [
    {
      name: CONFIG,
      code: JSON.stringify(
        {
          name: "Untitled",
          dependencies: { core: "*", radio: "*", microphone: "*" },
          description: "",
          files: ["main.blocks", "main.ts", "README.md"],
          additionalFilePaths: [],
        },
        null,
        4,
      ),
    },
    {
      name: "main.blocks",
      code: [
        '<xml xmlns="http://www.w3.org/1999/xhtml">',
        '  <block type="pxt-on-start"></block>',
        '  <block type="device_forever"></block>',
        "</xml>",
      ].join("\n"),
    },
    { name: "main.ts", code: "\n" },
    { name: "README.md", code: "" },
  ];
}
