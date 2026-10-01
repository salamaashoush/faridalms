import type { AiEvidence } from "@faridalms/domain/content";
import type { SerializedDecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode";
import type {
  DOMExportOutput,
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  Spread,
} from "lexical";
import type { JSX } from "react";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { DecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $getDocument, $getNodeByKey } from "lexical";
import { ChevronDown, Paperclip, Sparkles, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import type { FileStrings } from "../files";
import type { EditorStrings } from "../strings";

import { useEditorEnvironment } from "../context";
import { FileCard } from "../files";
import { useSelectOnClick } from "./select";

export type AiUseViewStrings = FileStrings &
  Pick<
    EditorStrings,
    | "aiUse"
    | "aiUseTool"
    | "aiUseDate"
    | "aiUsePrompt"
    | "aiUseHow"
    | "aiUseEvidence"
  >;

export interface AiUseFields {
  tool: string;
  date: string;
  prompt: string;
  use: string;
  evidence: AiEvidence[];
}

const field =
  "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring";

function formatDay(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * How an acknowledgement reads: the tool and date, what was asked and how
 * the answer was used, and the evidence kept. Shared by the editor's
 * read-only state and the document reader.
 */
export function AiUseView({
  fields,
  strings,
  locale,
  url,
}: {
  fields: AiUseFields;
  strings: AiUseViewStrings;
  locale: string;
  url: (fileId: string) => string | undefined;
}) {
  const facts = [
    { label: strings.aiUsePrompt, value: fields.prompt },
    { label: strings.aiUseHow, value: fields.use },
  ].filter((fact) => fact.value);
  // A citation reads as one line in the work and opens to what was asked,
  // how the answer was used, and the evidence kept.
  return (
    <details className="fe-ai-use group my-3 rounded-lg border bg-muted/30">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden">
        <Sparkles
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span className="font-medium">{strings.aiUse}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {fields.tool ? <bdi>{fields.tool}</bdi> : null}
          {fields.tool && fields.date ? " · " : null}
          {fields.date ? <bdi>{formatDay(fields.date, locale)}</bdi> : null}
        </span>
        {fields.evidence.length ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Paperclip className="size-3.5" aria-hidden />
            <span aria-label={strings.aiUseEvidence}>
              {fields.evidence.length.toLocaleString(locale)}
            </span>
          </span>
        ) : null}
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="grid gap-3 px-3 pt-1 pb-3">
        {facts.length ? (
          <dl className="grid gap-3 text-sm">
            {facts.map((fact) => (
              <div key={fact.label} className="grid gap-0.5">
                <dt className="text-[13px] leading-[18px] text-muted-foreground">
                  {fact.label}
                </dt>
                <dd dir="auto" className="whitespace-pre-wrap">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {fields.evidence.length ? (
          <div className="grid gap-2">
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {strings.aiUseEvidence}
            </p>
            {fields.evidence.map((file) => (
              <FileCard
                key={file.fileId}
                file={file}
                url={url(file.fileId)}
                strings={strings}
                locale={locale}
              />
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function AiUseBlock({
  nodeKey,
  fields,
}: {
  nodeKey: NodeKey;
  fields: AiUseFields;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings, media, locale } = useEditorEnvironment();
  const editable = useLexicalEditable();
  const selected = useSelectOnClick(nodeKey);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [failed, setFailed] = useState(false);
  const url = (fileId: string) => media?.url(fileId);
  const update = (change: (node: AiUseNode) => void) =>
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isAiUseNode(node)) change(node);
    });
  if (!editable)
    return (
      <AiUseView fields={fields} strings={strings} locale={locale} url={url} />
    );
  const store = async (file: File) => {
    if (!media) return;
    try {
      const stored = await media.upload(file, "file");
      update((node) =>
        node.setEvidence([
          ...node.getFields().evidence,
          {
            fileId: stored.fileId,
            name: stored.name,
            mime: stored.mime,
            bytes: stored.bytes,
          },
        ]),
      );
    } catch {
      setFailed(true);
    } finally {
      setUploading((count) => count - 1);
    }
  };
  // One at a time, so the evidence keeps the order the student chose.
  const attach = (files: File[]) => {
    setFailed(false);
    setUploading((count) => count + files.length);
    return files.reduce<Promise<void>>(
      (previous, file) => previous.then(() => store(file)),
      Promise.resolve(),
    );
  };
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`fe-ai-use @container my-4 grid gap-3 rounded-lg border bg-muted/30 p-4 ${selected ? "outline-2 outline-offset-2 outline-ring" : ""}`}
    >
      <div className="grid gap-0.5">
        <p
          id={`${id}-title`}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <Sparkles className="size-4 text-muted-foreground" aria-hidden />
          {strings.aiUse}
        </p>
        <p className="text-xs text-muted-foreground">{strings.aiUseHint}</p>
      </div>
      <div className="grid gap-3 @md:grid-cols-[minmax(0,1fr)_12rem]">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {strings.aiUseTool}
          <input
            dir="auto"
            maxLength={200}
            value={fields.tool}
            placeholder={strings.aiUseToolPlaceholder}
            onChange={(event) => {
              const value = event.target.value;
              update((node) => node.setField("tool", value));
            }}
            className={field}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {strings.aiUseDate}
          <input
            type="date"
            value={fields.date}
            onChange={(event) => {
              const value = event.target.value;
              update((node) => node.setField("date", value));
            }}
            className={field}
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        {strings.aiUsePrompt}
        <textarea
          dir="auto"
          maxLength={4000}
          value={fields.prompt}
          onChange={(event) => {
            const value = event.target.value;
            update((node) => node.setField("prompt", value));
          }}
          className={`${field} field-sizing-content min-h-14 resize-none`}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        {strings.aiUseHow}
        <textarea
          dir="auto"
          maxLength={4000}
          value={fields.use}
          placeholder={strings.aiUseHowPlaceholder}
          onChange={(event) => {
            const value = event.target.value;
            update((node) => node.setField("use", value));
          }}
          className={`${field} field-sizing-content min-h-14 resize-none`}
        />
      </label>
      <div className="grid gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {strings.aiUseEvidence}
        </p>
        {fields.evidence.map((file) => (
          <FileCard
            key={file.fileId}
            file={file}
            url={url(file.fileId)}
            strings={strings}
            locale={locale}
            editing
            actions={
              <button
                type="button"
                aria-label={strings.aiUseRemove(file.name)}
                onClick={() =>
                  update((node) =>
                    node.setEvidence(
                      node
                        .getFields()
                        .evidence.filter((item) => item.fileId !== file.fileId),
                    ),
                  )
                }
                className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent [&_svg]:size-4"
              >
                <X aria-hidden />
              </button>
            }
          />
        ))}
        {media ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={uploading > 0}
              onClick={() => input.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50 [&_svg]:size-4"
            >
              <Paperclip aria-hidden />
              {strings.aiUseAttach}
            </button>
            {failed ? (
              <span role="alert" className="text-xs text-destructive">
                {strings.uploadFailed}
              </span>
            ) : null}
            <input
              ref={input}
              type="file"
              multiple
              hidden
              tabIndex={-1}
              aria-hidden
              accept={[...media.accept.image, ...media.accept.file].join(",")}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void attach(files);
              }}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export type SerializedAiUseNode = Spread<
  {
    aiTool?: string;
    aiDate?: string;
    aiPrompt?: string;
    aiUse?: string;
    aiEvidence?: AiEvidence[];
  },
  SerializedDecoratorBlockNode
>;

/**
 * Where a student acknowledges using an AI tool, as exam boards ask: which
 * tool and when, what they asked and how they used the answer, with the
 * prompts and output kept as evidence. It sits in the work, so it is frozen
 * and kept with what was handed in.
 */
export class AiUseNode extends DecoratorBlockNode {
  __tool = "";
  __date = "";
  __prompt = "";
  __use = "";
  __evidence: AiEvidence[] = [];

  $config() {
    return this.config("ai-use", { extends: DecoratorBlockNode });
  }

  static clone(node: AiUseNode): AiUseNode {
    const copy = new AiUseNode(node.__format, node.__key);
    copy.__tool = node.__tool;
    copy.__date = node.__date;
    copy.__prompt = node.__prompt;
    copy.__use = node.__use;
    copy.__evidence = node.__evidence;
    return copy;
  }

  static importJSON(json: SerializedAiUseNode): AiUseNode {
    return new AiUseNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedAiUseNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__tool = json.aiTool ?? "";
    node.__date = json.aiDate ?? "";
    node.__prompt = json.aiPrompt ?? "";
    node.__use = json.aiUse ?? "";
    node.__evidence = json.aiEvidence ?? [];
    return node;
  }

  exportJSON(): SerializedAiUseNode {
    const node = this.getLatest();
    return {
      ...super.exportJSON(),
      ...(node.__tool ? { aiTool: node.__tool } : {}),
      ...(node.__date ? { aiDate: node.__date } : {}),
      ...(node.__prompt ? { aiPrompt: node.__prompt } : {}),
      ...(node.__use ? { aiUse: node.__use } : {}),
      ...(node.__evidence.length ? { aiEvidence: node.__evidence } : {}),
    };
  }

  exportDOM(): DOMExportOutput {
    const element = $getDocument().createElement("p");
    element.textContent = [this.__tool, this.__use].filter(Boolean).join(": ");
    return { element };
  }

  getFields(): AiUseFields {
    const node = this.getLatest();
    return {
      tool: node.__tool,
      date: node.__date,
      prompt: node.__prompt,
      use: node.__use,
      evidence: node.__evidence,
    };
  }

  setField(key: "tool" | "date" | "prompt" | "use", value: string): this {
    const writable = this.getWritable();
    if (key === "tool") writable.__tool = value;
    else if (key === "date") writable.__date = value;
    else if (key === "prompt") writable.__prompt = value;
    else writable.__use = value;
    return writable;
  }

  setEvidence(evidence: AiEvidence[]): this {
    const writable = this.getWritable();
    writable.__evidence = evidence;
    return writable;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return <AiUseBlock nodeKey={this.getKey()} fields={this.getFields()} />;
  }
}

export function $createAiUseNode(format?: ElementFormatType): AiUseNode {
  return new AiUseNode(format);
}

export function $isAiUseNode(
  node: LexicalNode | null | undefined,
): node is AiUseNode {
  return node instanceof AiUseNode;
}
