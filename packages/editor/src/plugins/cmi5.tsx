import type { Cmi5Package } from "@faridalms/domain/cmi5";

import { cmi5Of } from "@faridalms/domain/cmi5";
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
import { PackageOpen, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useEditorEnvironment } from "../context";
import { updateFromOutside } from "../outside";
import { unpackZip, xmlOf } from "../packages";
import { editorInSlot } from "../slots";

export const IMPORT_CMI5_COMMAND =
  createCommand<undefined>("FARIDA_IMPORT_CMI5");

/**
 * A cmi5 package's course, read from the cmi5.xml at its root, with each
 * unit inside the package found there; null when it is not a package or a
 * unit it names is missing from it.
 */
export function readCmi5Package(
  name: string,
  bytes: Uint8Array,
  language: string,
): Cmi5Package | null {
  const files = unpackZip(name, bytes);
  const structure = xmlOf(files.get("cmi5.xml"));
  if (!structure) return null;
  const course = cmi5Of(
    structure.documentElement,
    crypto.randomUUID(),
    language,
  );
  if (!course) return null;
  const inside = course.aus.every(
    (au) =>
      /^https:\/\//i.test(au.url) ||
      files.has(decodeURIComponent(au.url.split(/[?#]/)[0] ?? "")),
  );
  return inside ? course : null;
}

type Reading =
  | { name: string; state: "reading" }
  | { name: string; state: "failed" | "unread" }
  | { name: string; state: "done"; units: number };

/**
 * Brings in a course package in the cmi5 profile where the caret is: its
 * zip stored with the school, and its course read from it, so readers can
 * launch its units.
 */
export function Cmi5ImportPlugin() {
  const [editor] = useLexicalComposerContext();
  const { media, strings, locale } = useEditorEnvironment();
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<ReturnType<typeof $getSelection>>(null);
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    if (!media) return undefined;
    return editor.registerCommand(
      IMPORT_CMI5_COMMAND,
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
      const course = readCmi5Package(
        file.name,
        new Uint8Array(await file.arrayBuffer()),
        locale,
      );
      if (!course) {
        setReading({ name: file.name, state: "unread" });
        return;
      }
      const stored = await media.upload(file, "file");
      const showing = editorInSlot(slot) ?? editor;
      updateFromOutside(showing, () => {
        const at = showing === editor ? caret.current : null;
        $setSelection(at ? at.clone() : null);
        if (!$getSelection()) $getRoot().selectEnd();
        $insertNodes([
          $parseSerializedNode({
            type: "cmi5",
            version: 1,
            fileId: stored.fileId,
            cmi5: course,
          }),
        ]);
      });
      setReading({ name: file.name, state: "done", units: course.aus.length });
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
        accept=".zip,application/zip"
        onChange={(event) => {
          const [file] = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (file) void read(file);
        }}
      />
      {reading ? (
        <div className="px-1 pb-4">
          <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
            <PackageOpen
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
            <div className="grid min-w-0 flex-1 gap-1">
              <span className="truncate text-sm font-medium">
                <bdi>{reading.name}</bdi>
              </span>
              {reading.state === "failed" || reading.state === "unread" ? (
                <span role="alert" className="text-xs text-destructive">
                  {reading.state === "failed"
                    ? strings.cmi5Failed
                    : strings.cmi5NotPackage}
                </span>
              ) : reading.state === "done" ? (
                <output className="text-xs text-muted-foreground">
                  {strings.cmi5Units(reading.units)}
                </output>
              ) : (
                <output className="text-xs text-muted-foreground">
                  {strings.cmi5Reading}
                </output>
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
