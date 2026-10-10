import type { ProjectFile } from "@faridalms/domain/project";

import { entryOf, fileKind, fileNamed } from "@faridalms/domain/project";

/** Where a line of a played page came from in the project's own files. */
export interface PageSource {
  file: string;
  line: number;
}

/** A stretch of the played page that holds a whole file put in place of a tag. */
interface Placed {
  file: string;
  /** The played page's line the file's first line is on. */
  from: number;
  to: number;
  /** How many more lines the page has for it than the tag took. */
  added: number;
}

export interface ProjectPage {
  /** The file the page was made from. */
  entry: string;
  html: string;
  /** The file and line a line of the played page was written on. */
  sourceAt: (line: number) => PageSource;
}

// A stylesheet link, or a script that names its file and holds no code.
const TAG = /<link\b[^>]*>|<script\b([^>]*)>\s*<\/script\s*>/gi;
const ATTRIBUTE = (name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
const SOURCED = /\b(src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^"')\s]+))\s*\)/gi;

const attribute = (tag: string, name: string) => {
  const found = ATTRIBUTE(name).exec(tag);
  return found ? (found[1] ?? found[2] ?? found[3] ?? "") : null;
};

const newlines = (text: string) => text.split("\n").length - 1;

const drawingUrl = (code: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`;

/** The project's drawing a reference names, as an address a page can show with no server. */
function drawingAt(files: readonly ProjectFile[], reference: string) {
  const file = fileNamed(files, reference);
  return file && fileKind(file.name) === "svg" ? drawingUrl(file.code) : null;
}

const withDrawings = (css: string, files: readonly ProjectFile[]) =>
  css.replace(
    CSS_URL,
    (whole, double?: string, single?: string, bare?: string) => {
      const url = drawingAt(files, double ?? single ?? bare ?? "");
      return url ? `url("${url}")` : whole;
    },
  );

/**
 * One of a project's pages as a browser can play it with no server behind
 * it: the styles and scripts it links to are put in their tags' places and
 * its drawings become addresses that hold the drawing. Links to the
 * project's other pages are left as written; the page that plays it opens
 * them. Each file keeps its own lines, so an error can still be shown on
 * the line the student wrote.
 */
export function projectPage(
  files: readonly ProjectFile[],
  page?: string | null,
): ProjectPage | null {
  const entry = (page ? fileNamed(files, page) : null)?.name ?? entryOf(files);
  const source = entry ? fileNamed(files, entry) : null;
  if (!entry || !source) return null;

  const placed: Placed[] = [];
  let added = 0;
  // Drawings first: an address has no line breaks, so no line moves.
  const pictured = source.code.replace(
    SOURCED,
    (whole, name: string, double?: string, single?: string) => {
      const url = drawingAt(files, double ?? single ?? "");
      return url ? `${name}="${url}"` : whole;
    },
  );
  const html = pictured.replace(
    TAG,
    (tag, scriptAttributes: string | undefined, offset: number) => {
      const isScript = scriptAttributes !== undefined;
      const reference = isScript
        ? attribute(tag, "src")
        : /\bstylesheet\b/i.test(attribute(tag, "rel") ?? "")
          ? attribute(tag, "href")
          : null;
      const file = reference === null ? null : fileNamed(files, reference);
      if (!file || fileKind(file.name) !== (isScript ? "js" : "css"))
        return tag;
      // A closing tag inside the file would end its tag early.
      const kept = isScript
        ? scriptAttributes.replace(ATTRIBUTE("src"), "").trim()
        : "";
      const put = isScript
        ? `<script${kept && ` ${kept}`}>${file.code.replace(/<\/script/gi, "<\\/script")}</script>`
        : `<style>${withDrawings(file.code, files).replace(/<\/style/gi, "<\\/style")}</style>`;
      const from = 1 + newlines(pictured.slice(0, offset)) + added;
      const more = newlines(put) - newlines(tag);
      placed.push({
        file: file.name,
        from,
        to: from + newlines(put),
        added: more,
      });
      added += more;
      return put;
    },
  );

  return {
    entry,
    html,
    sourceAt: (line) => {
      const within = placed.find(
        (item) => line >= item.from && line <= item.to,
      );
      if (within) return { file: within.file, line: line - within.from + 1 };
      const before = placed
        .filter((item) => item.to < line)
        .reduce((sum, item) => sum + item.added, 0);
      return { file: entry, line: line - before };
    },
  };
}

/** Whether a link a page was asked to follow stays in the project, and to which page. */
export function linkedPage(
  files: readonly ProjectFile[],
  href: string,
): string | null {
  const file = fileNamed(files, href);
  return file && fileKind(file.name) === "html" ? file.name : null;
}

/** A project's page as the preview takes it; an empty one for a project with no page. */
export function playedPage(
  files: readonly ProjectFile[],
  page?: string | null,
): { html: string; sourceAt?: (line: number) => PageSource } {
  const made = projectPage(files, page);
  return made ? { html: made.html, sourceAt: made.sourceAt } : { html: "" };
}
