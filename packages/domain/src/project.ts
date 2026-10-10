import * as v from "valibot";

/** A project's file: a page, its styles, a script, or a drawing. */
export const projectFileKinds = ["html", "css", "js", "svg"] as const;
export type ProjectFileKind = (typeof projectFileKinds)[number];

export const MAX_PROJECT_FILES = 12;
/**
 * The most a project's files may weigh together as stored. An answer is
 * kept in a row that holds 64 KiB, and the rest is the row's own wrapping.
 */
export const MAX_PROJECT_BYTES = 60_000;

// Plain letters, so a name reads the same typed in a link as in the list.
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}\.(html|css|js|svg)$/;

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

/** A project as a student keeps or hands it in: at least a page to open. */
export const projectFilesSchema = v.pipe(
  v.array(projectFileSchema),
  v.minLength(1),
  v.maxLength(MAX_PROJECT_FILES),
  v.check((files) => distinct(files), "learning.project_file_taken"),
  v.check(
    (files) => files.some((file) => fileKind(file.name) === "html"),
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
