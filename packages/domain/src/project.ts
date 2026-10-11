import {
  blankProject,
  deviceFileKinds,
  isDeviceProject,
  locked,
  lockOf,
  programOf,
} from "@faridalms/makecode/project";
import * as v from "valibot";

export { locked, lockOf, PROJECT_LOCKS } from "@faridalms/makecode/project";
export type { ProjectLock } from "@faridalms/makecode/project";

/**
 * A project's file: a page, its styles, a script, a drawing, a Python
 * file, or one of the files a device project is made of.
 */
export const projectFileKinds = [
  "html",
  "css",
  "js",
  "svg",
  "py",
  ...deviceFileKinds,
] as const;
export type ProjectFileKind = (typeof projectFileKinds)[number];

export const MAX_PROJECT_FILES = 12;
/**
 * The most a project's files may weigh together as stored. An answer is
 * kept in a row that holds 64 KiB, and the rest is the row's own wrapping.
 */
export const MAX_PROJECT_BYTES = 60_000;

// Plain letters, so a name reads the same typed in a link as in the list.
const FILE_NAME = new RegExp(
  `^[A-Za-z0-9][A-Za-z0-9_-]{0,31}\\.(${projectFileKinds.join("|")})$`,
);

/**
 * What a project is made in: a web page, a Python program, or a program
 * for the micro:bit, built in its own editor.
 */
export const projectLanguages = ["web", "python", "microbit"] as const;
export type ProjectLanguage = (typeof projectLanguages)[number];

export const projectFileSchema = v.object({
  name: v.pipe(v.string(), v.regex(FILE_NAME, "learning.project_file")),
  code: v.pipe(v.string(), v.maxLength(MAX_PROJECT_BYTES)),
});
export type ProjectFile = v.InferOutput<typeof projectFileSchema>;

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** What a project's files weigh as they are stored. */
export function projectBytes(files: readonly ProjectFile[]): number {
  return new TextEncoder().encode(JSON.stringify(files)).length;
}

/** The kind of file a name says it is, or null for a name no file may have. */
export function fileKind(name: string): ProjectFileKind | null {
  const kind = FILE_NAME.exec(name)?.[1];
  return (kind as ProjectFileKind | undefined) ?? null;
}

/**
 * Why a name cannot join a project's files, or null when it can: it must be
 * a plain name ending in a kind we know, and no other file's, whatever the
 * case, since a link finds a file on some servers either way.
 */
export function fileNameIssue(
  name: string,
  others: readonly string[],
): "learning.project_file" | "learning.project_file_taken" | null {
  if (!fileKind(name)) return "learning.project_file";
  return others.some((other) => sameName(other, name))
    ? "learning.project_file_taken"
    : null;
}

const distinct = (files: readonly ProjectFile[]) =>
  new Set(files.map((file) => file.name.toLowerCase())).size === files.length;

/** The files a question gives every student to start from; none starts from an empty page. */
export const starterFilesSchema = v.pipe(
  v.array(projectFileSchema),
  v.maxLength(MAX_PROJECT_FILES),
  v.check((files) => distinct(files), "learning.project_file_taken"),
  v.check(
    (files) => projectBytes(files) <= MAX_PROJECT_BYTES,
    "learning.project_too_large",
  ),
);

/**
 * What a set of files is: a web project when it has a page to open, a
 * device project when it says what device it is for, and otherwise a
 * Python one.
 */
export function languageOf(files: readonly ProjectFile[]): ProjectLanguage {
  if (files.some((file) => fileKind(file.name) === "html")) return "web";
  return isDeviceProject(files) ? "microbit" : "python";
}

/** The file a Python project runs: `main.py`, or else its first Python file. */
export function mainOf(files: readonly ProjectFile[]): ProjectFile | null {
  const programs = files.filter((file) => fileKind(file.name) === "py");
  return (
    programs.find((file) => sameName(file.name, "main.py")) ??
    programs[0] ??
    null
  );
}

/**
 * The file a project is read by where it has no page to draw: a Python
 * project's main program, or a micro:bit project's program as text.
 */
export function programFile(files: readonly ProjectFile[]): ProjectFile | null {
  const language = languageOf(files);
  if (language === "python") return mainOf(files);
  return language === "microbit" ? programOf(files) : null;
}

/**
 * A project as a student keeps or hands it in: at least a page to open, a
 * program to run, or what a device project is.
 */
export const projectFilesSchema = v.pipe(
  v.array(projectFileSchema),
  v.minLength(1),
  v.maxLength(MAX_PROJECT_FILES),
  v.check((files) => distinct(files), "learning.project_file_taken"),
  v.check(
    (files) =>
      isDeviceProject(files) ||
      files.some((file) => {
        const kind = fileKind(file.name);
        return kind === "html" || kind === "py";
      }),
    "learning.project_page",
  ),
  v.check(
    (files) => projectBytes(files) <= MAX_PROJECT_BYTES,
    "learning.project_too_large",
  ),
);

/** The page a project opens on: `index.html`, or else its first page. */
export function entryOf(files: readonly ProjectFile[]): string | null {
  const pages = files.filter((file) => fileKind(file.name) === "html");
  return (
    (
      pages.find((file) => sameName(file.name, "index.html")) ??
      pages[0] ??
      null
    )?.name ?? null
  );
}

/** The file a link or a tag names, whatever the case and with or without `./`. */
export function fileNamed(
  files: readonly ProjectFile[],
  reference: string,
): ProjectFile | null {
  const name = reference
    .trim()
    .replace(/^\.\//, "")
    .replace(/[?#].*$/, "");
  return files.find((file) => sameName(file.name, name)) ?? null;
}

export function sameFiles(
  a: readonly ProjectFile[],
  b: readonly ProjectFile[],
): boolean {
  return (
    a.length === b.length &&
    a.every((file, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        file.name === other.name &&
        file.code === other.code
      );
    })
  );
}

/**
 * The project a student starts from when their teacher gave none: a page
 * in the lesson's language with its styles and script already linked, so
 * the first thing a student types shows.
 */
export function emptyProject(language: string, rtl: boolean): ProjectFile[] {
  return [
    {
      name: "index.html",
      code: [
        "<!doctype html>",
        `<html lang="${language}"${rtl ? ' dir="rtl"' : ""}>`,
        "    <head>",
        '        <meta charset="utf-8">',
        "        <title></title>",
        '        <link rel="stylesheet" href="style.css">',
        "    </head>",
        "    <body>",
        "",
        '        <script src="script.js"></script>',
        "    </body>",
        "</html>",
        "",
      ].join("\n"),
    },
    { name: "style.css", code: "" },
    { name: "script.js", code: "" },
  ];
}

/**
 * The project a p5.js sketch starts from: a page that loads the library
 * the files host serves and a sketch that already draws, so a student's
 * first change shows at once. It holds no words, so it suits any language.
 */
export function sketchProject(): ProjectFile[] {
  return [
    {
      name: "index.html",
      code: [
        "<!doctype html>",
        "<html>",
        "    <head>",
        '        <meta charset="utf-8">',
        "        <title></title>",
        '        <link rel="stylesheet" href="style.css">',
        "    </head>",
        "    <body>",
        '        <script src="p5.js"></script>',
        '        <script src="sketch.js"></script>',
        "    </body>",
        "</html>",
        "",
      ].join("\n"),
    },
    { name: "style.css", code: "body {\n    margin: 0;\n}\n" },
    {
      name: "sketch.js",
      code: [
        "function setup() {",
        "    createCanvas(400, 400);",
        "}",
        "",
        "function draw() {",
        "    background(220);",
        "    circle(mouseX, mouseY, 40);",
        "}",
        "",
      ].join("\n"),
    },
  ];
}

/**
 * The project a Python question starts from when its teacher gave none:
 * one file to write the program in.
 */
export function emptyPythonProject(): ProjectFile[] {
  return [{ name: "main.py", code: "" }];
}

/**
 * The project a question of a language starts from when its teacher gave
 * none: an empty page in the lesson's language, one Python file, or the
 * micro:bit editor's own new project.
 */
export function blankOf(
  language: ProjectLanguage,
  locale: string,
  rtl: boolean,
): ProjectFile[] {
  if (language === "python") return emptyPythonProject();
  return language === "microbit" ? blankProject() : emptyProject(locale, rtl);
}

/**
 * A student's files held to the one language their teacher's starter is
 * held to, where it is held to one. The editor keeps a student to it; this
 * is for files that reach the server some other way.
 */
export function heldAs(
  starter: readonly ProjectFile[],
  files: ProjectFile[],
): ProjectFile[] {
  const lock = lockOf(starter);
  return lock ? locked(files, lock) : files;
}

/**
 * The project a Python question is first given: a program that already
 * draws, with the shape it draws in a file of its own, so a student meets
 * a project of more than one file. It holds no words.
 */
export function pythonProject(): ProjectFile[] {
  return [
    {
      name: "main.py",
      code: [
        "import turtle",
        "from shapes import square",
        "",
        "pen = turtle.Turtle()",
        "square(pen, 100)",
        "",
      ].join("\n"),
    },
    {
      name: "shapes.py",
      code: [
        "def square(pen, side):",
        "    for _ in range(4):",
        "        pen.forward(side)",
        "        pen.left(90)",
        "",
      ].join("\n"),
    },
  ];
}
