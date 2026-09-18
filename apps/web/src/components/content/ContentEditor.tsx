import type { ContentDocument } from "@faridalms/domain/content";

import {
  contentDocumentSchema,
  contentPlainText,
} from "@faridalms/domain/content";
import { isSafeContentUrl } from "@faridalms/domain/rich-text";
import { CodeExtension } from "@lexical/code";
import { HorizontalRuleExtension } from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { LinkExtension } from "@lexical/link";
import { CheckListExtension, ListExtension } from "@lexical/list";
import { registerMarkdownShortcuts } from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { RichTextExtension } from "@lexical/rich-text";
import { TableExtension } from "@lexical/table";
import { configExtension, defineExtension } from "lexical";
import { useEffect, useState } from "react";
import * as v from "valibot";

import * as m from "~/i18n/messages";

import { ContentToolbar } from "./ContentToolbar";
import { contentMarkdownTransformers } from "./markdown";

const theme = {
  paragraph: "mb-3 last:mb-0",
  quote: "my-4 border-s-4 border-primary/40 ps-4 italic text-muted-foreground",
  heading: {
    h1: "text-3xl font-bold my-5",
    h2: "text-2xl font-semibold my-4",
    h3: "text-xl font-semibold my-3",
    h4: "text-lg font-semibold my-3",
    h5: "font-semibold my-2",
    h6: "font-semibold my-2",
  },
  text: {
    bold: "font-bold",
    italic: "italic",
    underline: "underline",
    strikethrough: "line-through",
    underlineStrikethrough: "underline line-through",
    code: "rounded bg-muted px-1 font-mono text-sm",
    subscript: "align-sub text-xs",
    superscript: "align-super text-xs",
  },
  link: "text-primary underline underline-offset-4",
  code: "block whitespace-pre-wrap rounded-lg bg-muted p-4 font-mono text-sm my-4",
  list: {
    ul: "list-disc ps-6 my-3",
    ol: "list-decimal ps-6 my-3",
    listitem: "my-1",
    nested: { listitem: "list-none" },
    listitemChecked:
      "list-none before:inline-block before:size-3 before:rounded-sm before:border before:bg-primary before:me-2",
    listitemUnchecked:
      "list-none before:inline-block before:size-3 before:rounded-sm before:border before:me-2",
  },
  table: "border-collapse w-full my-4 table-fixed",
  tableScrollableWrapper: "max-w-full overflow-x-auto",
  tableCell: "border border-border p-3 min-w-20 align-top",
  tableCellHeader: "bg-muted font-semibold",
  tableSelection: "bg-primary/10",
  tableCellSelected: "bg-primary/20",
  hr: "my-6 border-border",
};
export function ContentEditor({
  id,
  label,
  value,
  onChange,
  onValidityChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: ContentDocument;
  onChange: (value: ContentDocument) => void;
  onValidityChange: (valid: boolean) => void;
  disabled?: boolean;
}) {
  const [extension] = useState(() =>
    defineExtension({
      name: "faridalms/content",
      namespace: "faridalms-content",
      theme,
      $initialEditorState: JSON.stringify(value),
      dependencies: [
        RichTextExtension,
        HistoryExtension,
        ListExtension,
        CheckListExtension,
        configExtension(LinkExtension, { validateUrl: isSafeContentUrl }),
        TableExtension,
        CodeExtension,
        HorizontalRuleExtension,
      ],
    }),
  );
  return (
    <LexicalExtensionComposer extension={extension} contentEditable={null}>
      <EditorSurface
        id={id}
        label={label}
        onChange={onChange}
        onValidityChange={onValidityChange}
        disabled={disabled}
      />
    </LexicalExtensionComposer>
  );
}
function EditorSurface({
  id,
  label,
  onChange,
  onValidityChange,
  disabled,
}: Omit<Parameters<typeof ContentEditor>[0], "value">) {
  const [editor] = useLexicalComposerContext();
  const [invalid, setInvalid] = useState(false);
  const [count, setCount] = useState(() => {
    const result = v.safeParse(
      contentDocumentSchema,
      editor.getEditorState().toJSON(),
    );
    return result.success ? contentPlainText(result.output).length : 0;
  });
  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);
  useEffect(
    () => registerMarkdownShortcuts(editor, contentMarkdownTransformers),
    [editor],
  );
  useEffect(
    () =>
      editor.registerUpdateListener(
        ({ editorState, dirtyElements, dirtyLeaves }) => {
          if (!dirtyElements.size && !dirtyLeaves.size) return;
          const result = v.safeParse(
            contentDocumentSchema,
            editorState.toJSON(),
          );
          setInvalid(!result.success);
          onValidityChange(result.success);
          if (result.success) {
            setCount(contentPlainText(result.output).length);
            onChange(result.output);
          }
        },
      ),
    [editor, onChange, onValidityChange],
  );
  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring/20">
      <ContentToolbar disabled={disabled} />
      <div className="relative">
        <ContentEditable
          id={id}
          aria-label={label}
          aria-multiline="true"
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className="min-h-80 px-5 py-6 text-base leading-7 break-words outline-none sm:px-8"
          aria-placeholder={m.contentPlaceholder()}
          placeholder={
            <div className="pointer-events-none absolute start-5 top-6 text-muted-foreground sm:start-8">
              {m.contentPlaceholder()}
            </div>
          }
        />
      </div>
      <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
        <span>{m.contentMarkdownHint()}</span>
        <span>{m.contentCharacters({ count })}</span>
      </div>
      {invalid ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="border-t p-4 text-sm text-destructive"
        >
          {m.contentInvalid()}
        </p>
      ) : null}
    </div>
  );
}
