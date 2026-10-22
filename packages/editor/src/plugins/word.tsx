import type { LexicalEditor } from "lexical";

import { nameFor } from "@faridalms/domain/file";
import { $generateNodesFromDOM } from "@lexical/html";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getSelection,
  $insertNodes,
  $isDecoratorNode,
  $isElementNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
} from "lexical";
import { FileText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useEditorEnvironment } from "../context";
import { STORED_PICTURE } from "../nodes/media";
import { updateFromOutside } from "../outside";
import { editorInSlot } from "../slots";

export const IMPORT_WORD_COMMAND =
  createCommand<undefined>("FARIDA_IMPORT_WORD");

const DOCX =
  ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Where the notes of a Word document stand in the HTML it is read into. */
const NOTE = /^#word-(?:foot|end)note-\d+$/;

/**
 * A Word document's footnotes and endnotes, which come as numbered links to
 * a list at its end, become notes in the line they belong to, as the
 * editor's own footnotes are; the list goes.
 */
export function notesInPlace(page: Document) {
  for (const link of page.querySelectorAll("sup > a[href]")) {
    const target = link.getAttribute("href") ?? "";
    const note = NOTE.test(target)
      ? page.getElementById(target.slice(1))
      : null;
    const mark = link.parentElement;
    if (!note || !mark) continue;
    for (const back of note.querySelectorAll('a[href^="#word-"]'))
      back.remove();
    mark.dataset.feFootnote = note.textContent
      .replaceAll(/\s+/g, " ")
      .trim()
      .slice(0, 2000);
    link.remove();
  }
  for (const item of page.querySelectorAll(
    'li[id^="word-footnote-"], li[id^="word-endnote-"]',
  ))
    item.remove();
  // What is left of the notes' list, and of the comments' list Word documents
  // end with, holds nothing.
  for (const list of page.querySelectorAll("body > ol, body > dl"))
    if (list.children.length === 0) list.remove();
}

/** Puts what a Word document read as HTML says where the caret is. */
export function $placeWord(editor: LexicalEditor, html: string) {
  const page = new DOMParser().parseFromString(html, "text/html");
  notesInPlace(page);
  // A picture stands in its own block; Word holds it in a paragraph, which
  // keeps the words around it.
  const nodes = $generateNodesFromDOM(editor, page).flatMap((node) => {
    if (!$isElementNode(node) || node.isInline()) return [node];
    const blocks = node
      .getChildren()
      .filter((child) => $isDecoratorNode(child) && !child.isInline());
    for (const block of blocks) block.remove();
    return node.getTextContent().trim() || blocks.length === 0
      ? [node, ...blocks]
      : blocks;
  });
  if (!$getSelection()) $getRoot().selectEnd();
  $insertNodes(nodes);
}

type Reading =
  | { name: string; failed: false; skipped: number; done: boolean }
  | { name: string; failed: true };

/**
 * Brings a Word document into the one being written, where the caret is:
 * its headings, lists, tables, links, pictures and footnotes. Its pictures
 * are stored with the school as it is read; ones a browser cannot show, as
 * Word's own drawings, are left out and counted.
 */
export function WordImportPlugin() {
  const [editor] = useLexicalComposerContext();
  const { media, strings } = useEditorEnvironment();
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<ReturnType<typeof $getSelection>>(null);
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    if (!media) return undefined;
    return editor.registerCommand(
      IMPORT_WORD_COMMAND,
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
    setReading({ name: file.name, failed: false, skipped: 0, done: false });
    let skipped = 0;
    try {
      const { default: mammoth } = await import("mammoth");
      const { value } = await mammoth.convertToHtml(
        { arrayBuffer: await file.arrayBuffer() },
        {
          idPrefix: "word-",
          externalFileAccess: false,
          convertImage: mammoth.images.imgElement(async (image) => {
            const name = nameFor("picture", image.contentType);
            if (!name || !media.accept.image.includes(image.contentType)) {
              skipped += 1;
              return { src: "" };
            }
            try {
              const stored = await media.upload(
                new File([await image.readAsArrayBuffer()], name, {
                  type: image.contentType,
                }),
                "image",
              );
              return { src: `${STORED_PICTURE}${stored.fileId}` };
            } catch {
              skipped += 1;
              return { src: "" };
            }
          }),
        },
      );
      // A new document's editor starts again when it is first saved; the
      // words go into the editor showing the document by then.
      const showing = editorInSlot(slot) ?? editor;
      updateFromOutside(showing, () => {
        const at = showing === editor ? caret.current : null;
        $setSelection(at ? at.clone() : null);
        $placeWord(showing, value);
      });
      setReading({ name: file.name, failed: false, skipped, done: true });
    } catch {
      setReading({ name: file.name, failed: true });
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
        accept={DOCX}
        onChange={(event) => {
          const [file] = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (file) void read(file);
        }}
      />
      {reading ? (
        <div className="px-1 pb-4">
          <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
            <FileText
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
            <div className="grid min-w-0 flex-1 gap-1">
              <span className="truncate text-sm font-medium">
                <bdi>{reading.name}</bdi>
              </span>
              {reading.failed ? (
                <span role="alert" className="text-xs text-destructive">
                  {strings.wordFailed}
                </span>
              ) : reading.done ? (
                <output className="text-xs text-muted-foreground">
                  {reading.skipped > 0
                    ? strings.wordPicturesSkipped(reading.skipped)
                    : strings.wordDone}
                </output>
              ) : (
                <>
                  <output className="text-xs text-muted-foreground">
                    {strings.wordReading}
                  </output>
                  <progress
                    aria-label={strings.wordReading}
                    className="block h-1 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
                  />
                </>
              )}
            </div>
            {reading.failed || reading.done ? (
              <button
                type="button"
                aria-label={strings.narrationClose}
                onClick={() => setReading(null)}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-10 [&_svg]:size-4"
              >
                <X aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
