import "./prism";
import type { ContentDocument } from "@faridalms/domain/content";
import type { Provider } from "@lexical/yjs";
import type { Doc } from "yjs";

import {
  contentDocumentSchema,
  contentPlainText,
} from "@faridalms/domain/content";
import { $isCodeNode, getCodeLanguageOptions } from "@lexical/code";
import { CodePrismExtension } from "@lexical/code-prism";
import { HistoryExtension } from "@lexical/history";
import { registerMarkdownShortcuts } from "@lexical/markdown";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { $getNodeByKey, defineExtension } from "lexical";
import { useEffect, useMemo, useState } from "react";
import * as v from "valibot";

import type { EditorMedia } from "./context";
import type { EditorStrings } from "./strings";

import { $currentBlock } from "./blocks";
import { EditorEnvironmentProvider, useEditorEnvironment } from "./context";
import { ShortcutsExtension } from "./extensions";
import { editorFrame } from "./frame";
import { contentExtensions } from "./headless";
import { markdownTransformers } from "./markdown";
import { BlockHandlePlugin } from "./plugins/BlockHandle";
import { DiagramPlugin } from "./plugins/diagram";
import { DirectionPlugin } from "./plugins/Direction";
import { EmbedPlugin } from "./plugins/embed";
import { MediaPlugin } from "./plugins/media";
import { PlaceholderPlugin } from "./plugins/Placeholder";
import { SelectionToolbarPlugin } from "./plugins/SelectionToolbar";
import { SlashMenuPlugin } from "./plugins/SlashMenu";
import { TablePlugin } from "./plugins/Table";
import { ToolbarPlugin } from "./plugins/Toolbar";
import { editorTheme } from "./theme";

/**
 * Live editing: the document's shared state comes from the provider, which
 * the host builds for a room it holds a ticket for. The server fills a new
 * room from stored content, so the editor never seeds it.
 */
export interface EditorCollaboration {
  id: string;
  providerFactory: (id: string, docs: Map<string, Doc>) => Provider;
  username: string;
  color: string;
}

export interface EditorProps {
  id: string;
  label: string;
  value: ContentDocument;
  onChange: (value: ContentDocument) => void;
  onValidityChange?: (valid: boolean) => void;
  strings: EditorStrings;
  variant?: "document" | "field";
  toolbar?: boolean;
  disabled?: boolean;
  media?: EditorMedia;
  placeholder?: string;
  initialFocus?: boolean;
  locale?: string;
  describedBy?: string;
  collaboration?: EditorCollaboration;
}

export default function Editor({
  strings,
  media,
  locale,
  value,
  collaboration,
  ...props
}: EditorProps) {
  // Live editing keeps its own undo history in the shared document, so the
  // local one stays out, and the content comes from the room rather than here.
  const [extension] = useState(() =>
    defineExtension({
      name: "faridalms/editor",
      namespace: "faridalms-content",
      theme: editorTheme,
      $initialEditorState: collaboration ? null : JSON.stringify(value),
      dependencies: [
        ...contentExtensions,
        ...(collaboration ? [] : [HistoryExtension]),
        CodePrismExtension,
        ShortcutsExtension,
      ],
    }),
  );
  const environment = useMemo(
    () => ({
      strings,
      media,
      locale:
        locale ??
        (typeof document === "undefined"
          ? "en"
          : document.documentElement.lang || "en"),
    }),
    [strings, media, locale],
  );
  const composer = (
    <LexicalExtensionComposer extension={extension} contentEditable={null}>
      <Surface {...props} />
      {collaboration ? (
        <CollaborationPlugin
          id={collaboration.id}
          providerFactory={collaboration.providerFactory}
          shouldBootstrap={false}
          username={collaboration.username}
          cursorColor={collaboration.color}
        />
      ) : null}
    </LexicalExtensionComposer>
  );
  return (
    <EditorEnvironmentProvider value={environment}>
      {collaboration ? (
        <LexicalCollaboration>{composer}</LexicalCollaboration>
      ) : (
        composer
      )}
    </EditorEnvironmentProvider>
  );
}

function Surface({
  id,
  label,
  onChange,
  onValidityChange,
  variant = "field",
  toolbar = true,
  disabled = false,
  placeholder,
  initialFocus,
  describedBy,
}: Omit<EditorProps, "value" | "media" | "locale" | "strings">) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [upload, setUpload] = useState<"idle" | "uploading" | "failed">("idle");
  const [count, setCount] = useState(() =>
    editor.getEditorState().read(() => {
      const result = v.safeParse(
        contentDocumentSchema,
        editor.getEditorState().toJSON(),
      );
      return result.success ? contentPlainText(result.output).length : 0;
    }),
  );

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (initialFocus) editor.focus();
  }, [editor, initialFocus]);

  useEffect(
    () => registerMarkdownShortcuts(editor, markdownTransformers),
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
          onValidityChange?.(result.success);
          if (!result.success) return;
          setCount(contentPlainText(result.output).length);
          onChange(result.output);
        },
      ),
    [editor, onChange, onValidityChange],
  );

  const document = variant === "document";
  const errorId = `${id}-error`;
  const described = [describedBy, invalid ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={editorFrame.surface(document, invalid)}>
      {toolbar && !disabled ? (
        <div className={editorFrame.toolbar(document)}>
          <ToolbarPlugin disabled={disabled} />
        </div>
      ) : null}
      <div ref={setAnchor} className={editorFrame.content(document)}>
        <ContentEditable
          id={id}
          aria-label={label}
          aria-multiline="true"
          aria-invalid={invalid}
          aria-describedby={described || undefined}
          className={editorFrame.editable(document)}
        />
        <BlockHandlePlugin anchor={anchor} />
        <CodeLanguagePlugin anchor={anchor} />
        <TablePlugin anchor={anchor} />
      </div>
      <DirectionPlugin />
      <PlaceholderPlugin empty={placeholder ?? strings.emptyPlaceholder} />
      <SlashMenuPlugin />
      <SelectionToolbarPlugin />
      <MediaPlugin onStatus={setUpload} />
      <EmbedPlugin />
      <DiagramPlugin />
      {!document || upload !== "idle" ? (
        <div className={editorFrame.footer(document)}>
          <span
            aria-live="polite"
            className={upload === "failed" ? "text-destructive" : undefined}
          >
            {upload === "uploading"
              ? strings.uploading
              : upload === "failed"
                ? strings.uploadFailed
                : strings.placeholder}
          </span>
          {!document ? <span>{strings.characters(count)}</span> : null}
        </div>
      ) : null}
      {invalid ? (
        <p
          id={errorId}
          role="alert"
          className="px-4 py-2 text-sm text-destructive"
        >
          {strings.invalid}
        </p>
      ) : null}
    </div>
  );
}

function CodeLanguagePlugin({ anchor }: { anchor: HTMLElement | null }) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [code, setCode] = useState<{
    key: string;
    language: string;
    top: number;
    left: number;
  } | null>(null);
  const options = useMemo(() => getCodeLanguageOptions(), []);

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        const found = editorState.read(() => {
          const block = $currentBlock();
          return $isCodeNode(block)
            ? { key: block.getKey(), language: block.getLanguage() ?? "" }
            : null;
        });
        const element = found ? editor.getElementByKey(found.key) : null;
        if (!found || !element || !anchor) {
          setCode(null);
          return;
        }
        const box = anchor.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        setCode({
          ...found,
          top: Math.round(rect.top - box.top + anchor.scrollTop + 6),
          left: Math.round(rect.right - box.left - 6),
        });
      }),
    [editor, anchor],
  );

  if (!code || !editor.isEditable()) return null;
  return (
    <select
      aria-label={strings.codeLanguage}
      value={code.language}
      onChange={(event) => {
        const language = event.target.value;
        editor.update(() => {
          const node = $getNodeByKey(code.key);
          if ($isCodeNode(node)) node.setLanguage(language || null);
        });
      }}
      style={{ top: code.top, left: code.left, transform: "translateX(-100%)" }}
      className="absolute z-10 h-7 rounded-md border bg-background/90 px-1.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <option value="">{strings.plainText}</option>
      {options.map(([value, name]) => (
        <option key={value} value={value}>
          {name}
        </option>
      ))}
    </select>
  );
}
