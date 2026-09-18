import type { RichTextDocument } from "@faridalms/domain/rich-text";

import { richTextDocumentSchema } from "@faridalms/domain/rich-text";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Undo2,
  Redo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import * as v from "valibot";

import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";

export function RichTextComposer({
  id,
  label,
  value,
  onChange,
  onValidityChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: RichTextDocument;
  onChange: (document: RichTextDocument) => void;
  onValidityChange: (valid: boolean) => void;
  disabled?: boolean;
}) {
  const [invalid, setInvalid] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
      }),
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-40 p-4 outline-none",
        dir: "auto",
      },
    },
    onUpdate: ({ editor: current }) => {
      const result = v.safeParse(richTextDocumentSchema, current.getJSON());
      setInvalid(!result.success);
      onValidityChange(result.success);
      if (result.success) onChange(result.output);
    },
  });
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold"),
      italic: current?.isActive("italic"),
      strike: current?.isActive("strike"),
      list: current?.isActive("bulletList"),
      ordered: current?.isActive("orderedList"),
      quote: current?.isActive("blockquote"),
      undo: current?.can().undo(),
      redo: current?.can().redo(),
    }),
  });
  const controls = [
    {
      icon: Bold,
      label: m.markdownBold(),
      active: state?.bold,
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      icon: Italic,
      label: m.markdownItalic(),
      active: state?.italic,
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      icon: Strikethrough,
      label: m.markdownStrike(),
      active: state?.strike,
      run: () => editor?.chain().focus().toggleStrike().run(),
    },
    {
      icon: List,
      label: m.markdownList(),
      active: state?.list,
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      icon: ListOrdered,
      label: m.markdownOrderedList(),
      active: state?.ordered,
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      icon: Quote,
      label: m.markdownQuote(),
      active: state?.quote,
      run: () => editor?.chain().focus().toggleBlockquote().run(),
    },
  ];
  return (
    <div className="overflow-hidden rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring/30">
      <fieldset
        aria-label={m.newsletterFormatting()}
        className="flex flex-wrap gap-1 border-b bg-muted/40 p-2"
      >
        {controls.map((control) => (
          <Button
            key={control.label}
            type="button"
            size="icon-sm"
            variant={control.active ? "secondary" : "ghost"}
            aria-label={control.label}
            aria-pressed={Boolean(control.active)}
            disabled={!editor || disabled}
            onClick={control.run}
          >
            <control.icon aria-hidden />
          </Button>
        ))}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={m.newsletterUndo()}
          disabled={disabled || !state?.undo}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={m.newsletterRedo()}
          disabled={disabled || !state?.redo}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 aria-hidden />
        </Button>
      </fieldset>
      <EditorContent editor={editor} />
      {invalid ? (
        <p role="alert" className="p-3 text-sm text-destructive">
          {m.newsletterInvalidText()}
        </p>
      ) : null}
    </div>
  );
}
