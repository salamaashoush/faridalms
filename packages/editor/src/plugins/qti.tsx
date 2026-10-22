import type {
  ReadQuestion,
  StoredQtiPicture,
} from "@faridalms/domain/qti-read";
import type { SerializedLexicalNode } from "lexical";

import { packagePath } from "@faridalms/domain/cartridge-read";
import { imageSize, mediaTypeFor } from "@faridalms/domain/file";
import { questionNode } from "@faridalms/domain/lesson-content";
import {
  qtiItemPictures,
  qtiManifestOf,
  qtiName,
  qtiTestItems,
  questionOfQti,
} from "@faridalms/domain/qti-read";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getSelection,
  $insertNodes,
  $parseSerializedNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
} from "lexical";
import { ListChecks, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { EditorMedia } from "../context";

import { useEditorEnvironment } from "../context";
import { updateFromOutside } from "../outside";
import { unpackZip, xmlOf } from "../packages";
import { editorInSlot } from "../slots";

export const IMPORT_QTI_COMMAND = createCommand<undefined>("FARIDA_IMPORT_QTI");

const QTI = ".zip,.xml,application/zip,application/xml,text/xml";

/** The items a package holds, in the order its tests ask them, else as listed. */
function itemPaths(files: Map<string, Uint8Array>): string[] {
  const manifestPath = [...files.keys()]
    .filter((path) => path.split("/").at(-1) === "imsmanifest.xml")
    .toSorted((a, b) => a.length - b.length)[0];
  const manifest = manifestPath ? xmlOf(files.get(manifestPath)) : null;
  if (!manifestPath || !manifest)
    return [...files.keys()].filter((path) => path.endsWith(".xml"));
  const listed = qtiManifestOf(manifest);
  const ordered: string[] = [];
  for (const test of listed.tests) {
    const testPath = packagePath(manifestPath, test.href);
    const document = xmlOf(files.get(testPath));
    if (!document) continue;
    for (const href of qtiTestItems(document.documentElement))
      ordered.push(packagePath(testPath, href));
  }
  for (const item of listed.items)
    ordered.push(packagePath(manifestPath, item.href));
  return [...new Set(ordered)];
}

export interface QtiReading {
  questions: ReadQuestion[];
  /** Items that could not be read at all. */
  unread: number;
}

/**
 * Reads a QTI package or item: each item's pictures stored with the school
 * first, then each item read into the question it asks.
 */
export async function readQtiFile(
  file: File,
  media: Pick<EditorMedia, "upload" | "accept">,
): Promise<QtiReading> {
  const files = unpackZip(file.name, new Uint8Array(await file.arrayBuffer()));
  const questions: ReadQuestion[] = [];
  let unread = 0;
  const stored = new Map<string, StoredQtiPicture | null>();
  for (const path of itemPaths(files)) {
    const document = xmlOf(files.get(path));
    const item = document?.documentElement;
    if (!item || qtiName(item) !== "assessmentItem") {
      if (
        item &&
        qtiName(item) !== "assessmentTest" &&
        qtiName(item) !== "manifest"
      )
        unread += 1;
      continue;
    }
    const pictures = new Map<string, StoredQtiPicture | null>();
    for (const src of qtiItemPictures(item)) {
      const where = packagePath(path, src);
      if (!stored.has(where)) {
        const bytes = files.get(where);
        const size = bytes ? imageSize(bytes) : null;
        const type = mediaTypeFor(where);
        let kept: StoredQtiPicture | null = null;
        if (bytes && size && type && media.accept.image.includes(type))
          try {
            const uploaded = await media.upload(
              new File(
                [new Uint8Array(bytes)],
                where.split("/").at(-1) ?? "picture",
                { type },
              ),
              "image",
            );
            kept = { fileId: uploaded.fileId, ...size };
          } catch {
            kept = null;
          }
        stored.set(where, kept);
      }
      pictures.set(src, stored.get(where) ?? null);
    }
    const question = questionOfQti(item, {
      picture: (src) => pictures.get(src) ?? null,
    });
    if (question) questions.push(question);
    else unread += 1;
  }
  return { questions, unread };
}

type Reading =
  | { name: string; state: "reading" }
  | { name: string; state: "failed" }
  | { name: string; state: "done"; count: number; check: number };

/**
 * Brings in the questions of a QTI package or item, as Canvas, TAO and
 * other assessment systems export them, where the caret is. A question
 * read only roughly, or kept only as words, is counted for the teacher to
 * check.
 */
export function QtiImportPlugin() {
  const [editor] = useLexicalComposerContext();
  const { media, strings } = useEditorEnvironment();
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<ReturnType<typeof $getSelection>>(null);
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    if (!media) return undefined;
    return editor.registerCommand(
      IMPORT_QTI_COMMAND,
      () => {
        caret.current = $getSelection()?.clone() ?? null;
        queueMicrotask(() => input.current?.click());
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, media]);

  if (!media) return null;

  const read = async (file: File) => {
    const slot = editor.getRootElement()?.id;
    setReading({ name: file.name, state: "reading" });
    try {
      const { questions, unread } = await readQtiFile(file, media);
      const nodes = questions.flatMap(({ block }) => {
        const node = questionNode(block);
        return node ? [node] : [];
      });
      const showing = editorInSlot(slot) ?? editor;
      if (nodes.length > 0)
        updateFromOutside(showing, () => {
          const at = showing === editor ? caret.current : null;
          $setSelection(at ? at.clone() : null);
          if (!$getSelection()) $getRoot().selectEnd();
          $insertNodes(
            nodes.map((node) =>
              $parseSerializedNode(node as unknown as SerializedLexicalNode),
            ),
          );
        });
      setReading({
        name: file.name,
        state: "done",
        count: nodes.length,
        check: unread + questions.filter((question) => question.note).length,
      });
    } catch {
      setReading({ name: file.name, state: "failed" });
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        tabIndex={-1}
        aria-hidden
        accept={QTI}
        onChange={(event) => {
          const [file] = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (file) void read(file);
        }}
      />
      {reading ? (
        <div className="px-1 pb-4">
          <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
            <ListChecks
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
            <div className="grid min-w-0 flex-1 gap-1">
              <span className="truncate text-sm font-medium">
                <bdi>{reading.name}</bdi>
              </span>
              {reading.state === "failed" ? (
                <span role="alert" className="text-xs text-destructive">
                  {strings.qtiFailed}
                </span>
              ) : reading.state === "done" ? (
                <output className="text-xs text-muted-foreground">
                  {reading.count === 0
                    ? strings.qtiNone
                    : reading.check > 0
                      ? `${strings.qtiDone(reading.count)} ${strings.qtiToCheck(reading.check)}`
                      : strings.qtiDone(reading.count)}
                </output>
              ) : (
                <>
                  <output className="text-xs text-muted-foreground">
                    {strings.qtiReading}
                  </output>
                  <progress
                    aria-label={strings.qtiReading}
                    className="block h-1 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
                  />
                </>
              )}
            </div>
            {reading.state === "reading" ? null : (
              <button
                type="button"
                aria-label={strings.narrationClose}
                onClick={() => setReading(null)}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-10 [&_svg]:size-4"
              >
                <X aria-hidden />
              </button>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
