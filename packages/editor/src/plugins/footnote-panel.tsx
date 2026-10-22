import type { FootnoteSource, SourceKind } from "@faridalms/domain/citations";
import type { NodeKey } from "lexical";

import {
  CITATION_STYLES,
  formatSource,
  SOURCE_KINDS,
} from "@faridalms/domain/citations";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, SKIP_DOM_SELECTION_TAG } from "lexical";
import { Check, Trash2 } from "lucide-react";
import { useCallback, useId, useState } from "react";

import type { FootnoteNode } from "../nodes/footnote";

import { useEditorEnvironment } from "../context";
import { $isFootnoteNode } from "../nodes/footnote";
import { ToolButton } from "../ui";

const fieldClass =
  "h-8 min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 max-md:h-10";

const blankSource = (): FootnoteSource => ({
  kind: "book",
  style: "apa",
  authors: "",
  title: "",
  container: "",
  date: "",
  volume: "",
  issue: "",
  pages: "",
  url: "",
});

/**
 * A footnote's words, and the source it cites when it cites one: written
 * in its fields and set in APA, MLA or Chicago as it is typed, so a
 * student's reference reads as their course asks.
 */
export function FootnotePanel({
  nodeKey,
  note: initialNote,
  source: initialSource,
  onClose,
  onRemove,
}: {
  nodeKey: NodeKey;
  note: string;
  source: FootnoteSource | null;
  onClose: () => void;
  onRemove: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings, locale } = useEditorEnvironment();
  const id = useId();
  const [note, setNote] = useState(initialNote);
  const [source, setSource] = useState(initialSource);
  // The panel opens to write the footnote, as adding one is for: once the
  // click that chose the footnote has settled the text's own focus, and by
  // the same callback each time, so typing in a source's fields keeps it.
  const focusOnce = useCallback((element: HTMLTextAreaElement | null) => {
    if (element) requestAnimationFrame(() => element.focus());
  }, []);
  // The text keeps its caret where it was while the words are written here.
  const write = (change: (node: FootnoteNode) => void) =>
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if ($isFootnoteNode(node)) change(node);
      },
      { tag: SKIP_DOM_SELECTION_TAG },
    );
  const cite = (patch: Partial<FootnoteSource> | null) => {
    const next =
      patch === null ? null : { ...(source ?? blankSource()), ...patch };
    setSource(next);
    write((node) => node.setSource(next));
  };
  const field = (
    name:
      | "authors"
      | "title"
      | "container"
      | "date"
      | "volume"
      | "issue"
      | "pages"
      | "url",
    label: string,
    placeholder?: string,
    wide = false,
  ) => (
    <label className={wide ? "grid gap-1 sm:col-span-2" : "grid gap-1"}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={name === "url" ? "url" : "text"}
        dir={name === "url" || name === "date" ? "ltr" : "auto"}
        value={source?.[name] ?? ""}
        placeholder={placeholder}
        maxLength={name === "url" ? 500 : name === "date" ? 10 : 300}
        onChange={(event) => cite({ [name]: event.target.value })}
        className={fieldClass}
      />
    </label>
  );
  const containerLabel: Record<SourceKind, string> = {
    book: strings.citePublisher,
    article: strings.citeJournal,
    web: strings.citeSite,
  };
  const preview = source ? formatSource(source, locale) : [];
  return (
    <div className="grid w-full gap-3">
      <label className="grid gap-1" htmlFor={`${id}-note`}>
        <span className="text-xs font-medium text-muted-foreground">
          {strings.footnote}
        </span>
        <textarea
          id={`${id}-note`}
          dir="auto"
          rows={2}
          ref={focusOnce}
          value={note}
          maxLength={2000}
          placeholder={strings.footnoteHint}
          onChange={(event) => {
            setNote(event.target.value);
            const value = event.target.value;
            write((node) => node.setNote(value));
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          className="min-h-16 rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={source !== null}
          onChange={() => cite(source ? null : {})}
          className="size-4 accent-primary"
        />
        {strings.citeSource}
      </label>
      {source ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {strings.citeKind}
            </span>
            <select
              value={source.kind}
              onChange={(event) =>
                cite({ kind: event.target.value as SourceKind })
              }
              className={fieldClass}
            >
              {SOURCE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {strings.citeKinds[kind]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {strings.citeStyle}
            </span>
            <select
              value={source.style}
              onChange={(event) =>
                cite({
                  style: event.target.value as FootnoteSource["style"],
                })
              }
              className={fieldClass}
            >
              {CITATION_STYLES.map((style) => (
                <option key={style} value={style}>
                  {strings.citeStyles[style]}
                </option>
              ))}
            </select>
          </label>
          {field("authors", strings.citeAuthors, strings.citeAuthorsHint, true)}
          {field("title", strings.citeTitle, undefined, true)}
          {field("container", containerLabel[source.kind], undefined, true)}
          {field("date", strings.citeDate, "2024 · 2024-03-05")}
          {field("pages", strings.citePages)}
          {source.kind === "article" ? (
            <>
              {field("volume", strings.citeVolume)}
              {field("issue", strings.citeIssue)}
            </>
          ) : null}
          {field("url", strings.citeUrl, "https://", true)}
          {preview.length > 0 ? (
            <p
              dir="auto"
              className="rounded-md bg-muted/60 px-2 py-1.5 text-xs leading-5 sm:col-span-2"
            >
              {preview.map((run, index) =>
                run.italic ? (
                  <i key={index}>{run.text}</i>
                ) : (
                  <span key={index}>{run.text}</span>
                ),
              )}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end gap-1">
        <ToolButton label={strings.footnoteRemove} onClick={onRemove}>
          <Trash2 aria-hidden />
        </ToolButton>
        <ToolButton label={strings.questionDone} onClick={onClose}>
          <Check aria-hidden />
        </ToolButton>
      </div>
    </div>
  );
}
