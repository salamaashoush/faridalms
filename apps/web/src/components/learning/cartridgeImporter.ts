import type {
  Cartridge,
  CartridgeItem,
  CartridgeRule,
  CartridgeSubmission,
} from "@faridalms/domain/cartridge-read";
import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { LessonBlock, LessonCompletion } from "@faridalms/domain/learning";
import type { UploadedFile } from "@faridalms/editor";

import { MAX_BANK_TAG } from "@faridalms/domain/bank";
import { cartridgeFile, packagePath } from "@faridalms/domain/cartridge-read";
import { embedSource, parseEmbedUrl } from "@faridalms/domain/embed";
import { imageSize, mediaTypeFor } from "@faridalms/domain/file";
import {
  contentOfLesson,
  holdsQuestions,
  questionNode,
} from "@faridalms/domain/lesson-content";
import { qti12Items, questionOfQti12 } from "@faridalms/domain/qti12";
import { contentOfHtml, STORED_FILE } from "@faridalms/editor/html-import";
import { xmlOf } from "@faridalms/editor/packages";

/**
 * Brings a Common Cartridge's course in as modules of lessons: each page or
 * discussion a lesson read as the editor reads a paste, each quiz a lesson
 * of questions, each link, file or outside tool a lesson that points to it.
 * An assignment becomes a draft assignment in each class chosen, its brief
 * read the same way. The files they show are stored with the school first.
 * A lesson this app exported comes back whole from the copy kept beside it.
 * Canvas's module rules come too: what finishes each lesson, which modules
 * run in order, and which must be finished first.
 */

const decoder = new TextDecoder();

export interface ImportCounts {
  lessons: number;
  /** Assignments brought in, each once however many classes it went to. */
  assignments: number;
  /** Questions read only roughly, or kept as words, for a teacher to check. */
  check: number;
  /** Items that could not be brought in at all. */
  failed: number;
}

interface Importer {
  files: ReadonlyMap<string, Uint8Array>;
  /** Stores a file of the package with the school. */
  upload: (file: File) => Promise<UploadedFile>;
  /** The outside tools of this school, which a kept lesson's links may name. */
  toolIds: ReadonlySet<string>;
}

/** Stores each package file once, whoever links it. */
function storer(importer: Importer) {
  const stored = new Map<string, Promise<UploadedFile | null>>();
  return (path: string): Promise<UploadedFile | null> => {
    let found = stored.get(path);
    if (!found) {
      const bytes = importer.files.get(path);
      const name = path.split("/").at(-1) ?? "file";
      found = bytes
        ? importer
            .upload(
              new File([new Uint8Array(bytes)], name, {
                type: mediaTypeFor(name) ?? "application/octet-stream",
              }),
            )
            .catch(() => null)
        : Promise.resolve(null);
      stored.set(path, found);
    }
    return found;
  };
}

type Store = ReturnType<typeof storer>;

/**
 * HTML from the package with the files it links stored first: a picture,
 * file or recording then reads as the editor's own block of it.
 */
async function storedHtml(
  html: string,
  base: string,
  importer: Pick<Importer, "files">,
  store: Store,
): Promise<ContentDocument> {
  const page = new DOMParser().parseFromString(html, "text/html");
  const paths = new Set(importer.files.keys());
  const linked = async (element: Element, attribute: string) => {
    const path = cartridgeFile(
      paths,
      base,
      element.getAttribute(attribute) ?? "",
    );
    return path ? store(path) : null;
  };
  for (const image of Array.from(page.querySelectorAll("img"))) {
    const stored = await linked(image, "src");
    if (stored) image.setAttribute("src", `${STORED_FILE}${stored.fileId}`);
    else image.remove();
  }
  for (const player of Array.from(page.querySelectorAll("video, audio"))) {
    const source = player.getAttribute("src")
      ? player
      : player.querySelector("source");
    const stored = source ? await linked(source, "src") : null;
    if (!stored) continue;
    player.setAttribute("src", `${STORED_FILE}${stored.fileId}`);
    player.setAttribute("data-mime", stored.mime);
  }
  for (const link of Array.from(page.querySelectorAll("a[href]"))) {
    const stored = await linked(link, "href");
    if (!stored) continue;
    link.setAttribute("href", `${STORED_FILE}${stored.fileId}`);
    link.setAttribute("data-name", stored.name);
    link.setAttribute("data-mime", stored.mime);
    link.setAttribute("data-bytes", String(stored.bytes));
  }
  // A page's own heading repeats the lesson's title.
  page.querySelector("body > h1:first-child")?.remove();
  return contentOfHtml(page.body.innerHTML);
}

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** A link as a lesson shows it: the video or page itself where it can be embedded. */
function linkContent(title: string, url: string, words = ""): ContentDocument {
  const embed = parseEmbedUrl(url);
  return contentOfHtml(
    embed
      ? `<iframe src="${escape(embedSource(embed))}"></iframe>`
      : `${words ? `<p>${escape(words)}</p>` : ""}<p><a href="${escape(url)}">${escape(title || url)}</a></p>`,
  );
}

/** A lesson this app exported, from the copy kept beside its page. */
async function keptLesson(
  path: string,
  importer: Importer,
  store: Store,
): Promise<{ content: ContentDocument; language: "ar" | "en" | null } | null> {
  const bytes = importer.files.get(path);
  if (!bytes) return null;
  const kept = JSON.parse(decoder.decode(bytes)) as {
    content?: ContentDocument;
    language?: "ar" | "en" | null;
    files?: Record<string, string>;
  };
  if (!kept.content) return null;
  let text = JSON.stringify(kept.content);
  for (const [fileId, href] of Object.entries(kept.files ?? {})) {
    const stored = await store(packagePath(path, `../../${href}`));
    if (stored) text = text.replaceAll(fileId, stored.fileId);
  }
  const content = JSON.parse(text) as ContentDocument;
  // A link to an outside tool this school has not registered cannot launch.
  const known = (nodes: ContentNode[] | undefined): ContentNode[] =>
    (nodes ?? []).flatMap((node) =>
      node.type === "lti" && !importer.toolIds.has(node.lti?.toolId ?? "")
        ? []
        : [
            {
              ...node,
              ...(node.children ? { children: known(node.children) } : {}),
            },
          ],
    );
  return {
    content: {
      root: { ...content.root, children: known(content.root.children) },
    },
    language: kept.language ?? null,
  };
}

/**
 * The questions of a QTI 1.2 file, quiz or bank, each with its pictures
 * stored, and how many came in only roughly or not at all.
 */
async function questionsIn(
  path: string,
  importer: Pick<Importer, "files">,
  store: Store,
): Promise<{ blocks: LessonBlock[]; check: number } | null> {
  const document = xmlOf(importer.files.get(path));
  if (!document) return null;
  const paths = new Set(importer.files.keys());
  const blocks: LessonBlock[] = [];
  let check = 0;
  for (const item of qti12Items(document)) {
    const pictures = new Map<
      string,
      { fileId: string; width: number; height: number } | null
    >();
    for (const image of Array.from(item.getElementsByTagName("*"))) {
      const sources = [
        image.getAttribute("uri"),
        ...Array.from(
          new DOMParser()
            .parseFromString(
              image.localName === "mattext" ? image.textContent : "",
              "text/html",
            )
            .querySelectorAll("img"),
        ).map((each) => each.getAttribute("src")),
      ];
      for (const src of sources) {
        if (!src || pictures.has(src)) continue;
        const where = cartridgeFile(paths, path, src);
        const bytes = where ? importer.files.get(where) : undefined;
        const size = bytes ? imageSize(bytes) : null;
        const stored = where && size ? await store(where) : null;
        pictures.set(
          src,
          stored && size ? { fileId: stored.fileId, ...size } : null,
        );
      }
    }
    const read = questionOfQti12(item, {
      picture: (src) => pictures.get(src) ?? null,
    });
    if (!read) {
      check += 1;
      continue;
    }
    if (read.note) check += 1;
    blocks.push(read.block);
  }
  return { blocks, check };
}

/** A quiz's questions as a lesson asks them. */
async function quizContent(
  path: string,
  importer: Importer,
  store: Store,
): Promise<{ content: ContentDocument; check: number } | null> {
  const read = await questionsIn(path, importer, store);
  const content = read
    ? contentOfLesson({ version: 2, blocks: read.blocks })
    : null;
  return read && content ? { content, check: read.check } : null;
}

/**
 * Keeps a cartridge's question banks in the teacher's question bank, each
 * question tagged with its bank's name so the bank can be found again.
 */
export async function importBanks(
  cartridge: Cartridge,
  importer: {
    files: ReadonlyMap<string, Uint8Array>;
    upload: (file: File) => Promise<UploadedFile>;
    keep: (question: {
      content: ContentDocument;
      tags: string[];
    }) => Promise<unknown>;
  },
): Promise<{ kept: number; check: number }> {
  const store = storer({ ...importer, toolIds: new Set() });
  let kept = 0;
  let check = 0;
  for (const bank of cartridge.banks) {
    const read = await questionsIn(bank.path, importer, store);
    if (!read) {
      check += 1;
      continue;
    }
    check += read.check;
    const tag = bank.title.trim().slice(0, MAX_BANK_TAG);
    for (const block of read.blocks) {
      const node = questionNode(block);
      if (!node) {
        check += 1;
        continue;
      }
      try {
        await importer.keep({
          content: {
            root: {
              type: "root",
              version: 1,
              children: [node],
              direction: null,
              format: "",
              indent: 0,
            },
          },
          tags: tag ? [tag] : [],
        });
        kept += 1;
      } catch {
        check += 1;
      }
    }
  }
  return { kept, check };
}

/** One item of the course as the content of its lesson. */
async function lessonOf(
  item: CartridgeItem,
  importer: Importer,
  store: Store,
): Promise<{
  content: ContentDocument;
  language?: "ar" | "en" | null;
  check: number;
  whole?: boolean;
} | null> {
  switch (item.kind) {
    case "page": {
      const html = decoder.decode(importer.files.get(item.path));
      const page = new DOMParser().parseFromString(html, "text/html");
      const keptAt = page
        .querySelector('meta[name="farida-lesson"]')
        ?.getAttribute("content");
      const kept = keptAt
        ? await keptLesson(packagePath(item.path, keptAt), importer, store)
        : null;
      if (kept) return { ...kept, check: 0, whole: true };
      return {
        content: await storedHtml(html, item.path, importer, store),
        check: 0,
      };
    }
    case "discussion":
      return {
        content: await storedHtml(item.html, item.base, importer, store),
        check: 0,
      };
    case "quiz":
      return quizContent(item.path, importer, store);
    case "link":
      return { content: linkContent(item.title, item.url), check: 0 };
    case "tool":
      return {
        content: linkContent(item.title, item.url, item.description),
        check: 1,
      };
    case "assignment":
      return null;
    case "file": {
      const stored = await store(item.path);
      if (!stored) return null;
      return {
        content: contentOfHtml(
          `<p><a href="${STORED_FILE}${stored.fileId}" data-name="${escape(stored.name)}" data-mime="${escape(stored.mime)}" data-bytes="${stored.bytes}">${escape(stored.name)}</a></p>`,
        ),
        check: 0,
      };
    }
  }
  return null;
}

/**
 * What finishes a lesson brought in, from the rule its course set: one
 * asking nothing is finished by opening it, unless its student is to say
 * so, and a minimum score whose points are unknown asks for every answer.
 */
function completionOf(
  rule: CartridgeRule | undefined,
  content: ContentDocument,
): { completion: LessonCompletion; passScore: number | null } {
  if (rule?.rule === "mark") return { completion: "mark", passScore: null };
  if (!holdsQuestions(content)) return { completion: "view", passScore: null };
  if (rule?.rule === "score" && rule.percent !== null)
    return { completion: "score", passScore: rule.percent };
  if (rule?.rule === "submit" || rule?.rule === "score")
    return { completion: "quiz", passScore: null };
  return { completion: "view", passScore: null };
}

/**
 * Brings the modules chosen in, one lesson an item, each module made for
 * the classes chosen and left as a draft for its teacher to look over, and
 * each assignment a draft in every one of those classes. A module holding
 * only assignments makes none of its own.
 */
export async function importCartridge(
  cartridge: Cartridge,
  chosen: readonly number[],
  importer: Omit<Importer, "upload"> & {
    classIds: readonly string[];
    uploadTo: (host: {
      type: "module" | "class";
      id: string;
    }) => (file: File) => Promise<UploadedFile>;
    saveModule: (module: {
      title: string;
      sequential: boolean;
      prerequisiteId: string;
    }) => Promise<string>;
    saveLesson: (lesson: {
      moduleId: string;
      title: string;
      content: ContentDocument;
      language: "ar" | "en" | null;
      completion: LessonCompletion;
      passScore: number | null;
    }) => Promise<unknown>;
    saveAssignment: (assignment: {
      classId: string;
      title: string;
      brief: ContentDocument;
      points: number | null;
      dueAt: string;
      submission: CartridgeSubmission;
    }) => Promise<unknown>;
    onProgress: (done: number, total: number) => void;
  },
): Promise<{ modules: { id: string; title: string }[]; counts: ImportCounts }> {
  const modules: { id: string; title: string }[] = [];
  const counts: ImportCounts = {
    lessons: 0,
    assignments: 0,
    check: 0,
    failed: 0,
  };
  const total = chosen.reduce(
    (sum, index) => sum + (cartridge.modules[index]?.items.length ?? 0),
    0,
  );
  // Each class keeps its own copy of a brief's files, as its own work does.
  const classStores = new Map(
    importer.classIds.map((classId) => [
      classId,
      storer({
        ...importer,
        upload: importer.uploadTo({ type: "class", id: classId }),
      }),
    ]),
  );
  const made = new Map<number, string>();
  let done = 0;
  for (const index of chosen) {
    const module = cartridge.modules[index];
    if (!module) continue;
    let opened: { id: string; store: Store; importer: Importer } | null = null;
    const open = async () => {
      if (opened) return opened;
      // Of the modules to finish first, the latest is the one to wait on.
      const before = (module.prerequisites ?? [])
        .flatMap((place) => made.get(place) ?? [])
        .at(-1);
      const id = await importer.saveModule({
        title: module.title,
        sequential: module.sequential ?? false,
        prerequisiteId: before ?? "",
      });
      made.set(index, id);
      modules.push({ id, title: module.title });
      const scoped: Importer = {
        ...importer,
        upload: importer.uploadTo({ type: "module", id }),
      };
      opened = { id, store: storer(scoped), importer: scoped };
      return opened;
    };
    // What this app exported after a whole lesson, its questions and its
    // tool links, is already in the lesson.
    let whole = false;
    for (const item of module.items) {
      done += 1;
      importer.onProgress(done, total);
      if (whole && (item.kind === "quiz" || item.kind === "tool")) continue;
      try {
        if (item.kind === "assignment") {
          // A date already past belongs to the course it came from.
          const dueAt =
            item.dueAt && Date.parse(item.dueAt) > Date.now() ? item.dueAt : "";
          for (const [classId, classStore] of classStores)
            await importer.saveAssignment({
              classId,
              title: item.title.slice(0, 200) || module.title,
              brief: await storedHtml(
                item.html,
                item.base,
                importer,
                classStore,
              ),
              points: item.points,
              dueAt,
              submission: item.submission,
            });
          counts.assignments += 1;
          continue;
        }
        const into = await open();
        const lesson = await lessonOf(item, into.importer, into.store);
        if (!lesson) {
          counts.failed += 1;
          continue;
        }
        whole = lesson.whole ?? false;
        await importer.saveLesson({
          moduleId: into.id,
          title: item.title.slice(0, 200) || module.title,
          content: lesson.content,
          language: lesson.language ?? null,
          ...completionOf(item.completion, lesson.content),
        });
        counts.lessons += 1;
        counts.check += lesson.check;
      } catch {
        counts.failed += 1;
      }
    }
  }
  return { modules, counts };
}
