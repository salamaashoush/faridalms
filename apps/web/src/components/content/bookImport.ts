import type { ContentDocument, ContentNode } from "@faridalms/domain/content";

import { unzipSync } from "fflate";

import { shrunkImage } from "~/utils/images";

/**
 * A picture book in an EPUB file, such as StoryWeaver, Book Dash and African
 * Storybook give out under Creative Commons, as one lesson: each picture
 * starts a screen and the words after it belong to it, so the young player
 * shows a page at a time and reads it aloud. The book's own credits are kept
 * as its last screen, which its licence asks for.
 */

// More than this is not a picture book; it also bounds what one file uploads.
const MOST_PAGES = 60;
const TEXT_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "figcaption",
  "td",
]);

type Token =
  | { kind: "image"; path: string; alt: string }
  | { kind: "text"; text: string };

interface Page {
  image: { path: string; alt: string } | null;
  texts: string[];
}

export class BookError extends Error {}

const decoder = new TextDecoder();

/** A path inside the book, from a file's own path and a link in it. */
function resolve(from: string, href: string): string {
  const base = from.split("/").slice(0, -1);
  for (const part of decodeURIComponent(href.split("#")[0] ?? "").split("/")) {
    if (part === "..") base.pop();
    else if (part && part !== ".") base.push(part);
  }
  return base.join("/");
}

function parse(text: string, type: DOMParserSupportedType): Document {
  const document = new DOMParser().parseFromString(text, type);
  if (document.querySelector("parsererror"))
    return new DOMParser().parseFromString(text, "text/html");
  return document;
}

/** What a page of the book shows, in reading order. */
function tokensOf(document: Document, path: string): Token[] {
  const tokens: Token[] = [];
  const walker = document.createTreeWalker(
    document.querySelector("body") ?? document.documentElement,
    NodeFilter.SHOW_ELEMENT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node as Element;
    const tag = element.localName.toLowerCase();
    if (tag === "img" || tag === "image") {
      const href =
        element.getAttribute("src") ??
        element.getAttribute("href") ??
        element.getAttribute("xlink:href") ??
        element.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      if (href)
        tokens.push({
          kind: "image",
          path: resolve(path, href),
          alt: element.getAttribute("alt")?.trim() ?? "",
        });
    } else if (TEXT_TAGS.has(tag)) {
      const text = element.textContent.replace(/\s+/g, " ").trim();
      if (text) tokens.push({ kind: "text", text });
    }
  }
  return tokens;
}

function paragraph(text: string, tag?: "h1"): ContentNode {
  return {
    type: tag ? "heading" : "paragraph",
    ...(tag ? { tag } : {}),
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    textFormat: 0,
    textStyle: "",
    children: [
      {
        type: "text",
        version: 1,
        format: 0,
        detail: 0,
        mode: "normal",
        style: "",
        text,
      },
    ],
  };
}

export interface ImportedBook {
  title: string;
  content: ContentDocument;
}

/**
 * Reads the book and stores its pictures through `store`, which returns
 * each one's file id; `onProgress` hears how many of its pictures are in.
 */
export async function importPictureBook(
  file: File,
  store: (picture: File) => Promise<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportedBook> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new BookError("book.unreadable");
  }
  const read = (path: string) => {
    const bytes = files[path];
    return bytes ? decoder.decode(bytes) : null;
  };
  const container = read("META-INF/container.xml");
  const opfPath = container
    ? parse(container, "application/xml")
        .querySelector("rootfile")
        ?.getAttribute("full-path")
    : null;
  const opfText = opfPath ? read(opfPath) : null;
  if (!opfPath || !opfText) throw new BookError("book.unreadable");
  const opf = parse(opfText, "application/xml");
  const title =
    opf.getElementsByTagNameNS("*", "title")[0]?.textContent.trim() ?? "";
  const manifest = new Map(
    [...opf.getElementsByTagNameNS("*", "item")].map((item) => [
      item.getAttribute("id") ?? "",
      {
        path: resolve(opfPath, item.getAttribute("href") ?? ""),
        type: item.getAttribute("media-type") ?? "",
      },
    ]),
  );
  const tokens = [...opf.getElementsByTagNameNS("*", "itemref")].flatMap(
    (ref) => {
      const item = manifest.get(ref.getAttribute("idref") ?? "");
      const text = item ? read(item.path) : null;
      if (!item || !text || !/html/.test(item.type)) return [];
      return tokensOf(parse(text, "application/xhtml+xml"), item.path);
    },
  );

  const pages: Page[] = [];
  for (const token of tokens) {
    if (token.kind === "image")
      pages.push({ image: { path: token.path, alt: token.alt }, texts: [] });
    else if (token.text !== title || pages.length > 0) {
      const page = pages.at(-1);
      if (page) page.texts.push(token.text);
      else pages.push({ image: null, texts: [token.text] });
    }
  }
  if (pages.length === 0) throw new BookError("book.empty");
  if (pages.length > MOST_PAGES) throw new BookError("book.too_long");

  const pictures = pages.filter((page) => page.image && files[page.image.path]);
  let done = 0;
  onProgress?.(done, pictures.length);
  const stored = new Map<string, string>();
  // One at a time: a class's tablets share the school's connection.
  await pictures.reduce(async (before, page) => {
    await before;
    const image = page.image;
    const bytes = image ? files[image.path] : undefined;
    if (!image || !bytes || stored.has(image.path)) return;
    const name = image.path.split("/").at(-1) ?? "page.jpg";
    stored.set(
      image.path,
      await store(await shrunkImage(new Blob([new Uint8Array(bytes)]), name)),
    );
    done += 1;
    onProgress?.(done, pictures.length);
  }, Promise.resolve());

  const children: ContentNode[] = title ? [paragraph(title, "h1")] : [];
  pages.forEach((page, index) => {
    if (index > 0 || title)
      children.push({ type: "horizontalrule", version: 1 });
    const fileId = page.image ? stored.get(page.image.path) : undefined;
    if (page.image && fileId)
      children.push({
        type: "image",
        version: 1,
        format: "",
        fileId,
        alt: page.image.alt,
        caption: "",
        size: "full",
      });
    for (const text of page.texts) children.push(paragraph(text));
  });
  return {
    title,
    content: {
      root: {
        type: "root",
        version: 1,
        children,
        direction: null,
        format: "",
        indent: 0,
      },
    },
  };
}
