import type { ImageSize } from "@faridalms/domain/content";
import type { EmbedProvider } from "@faridalms/domain/embed";
import type { SerializedDecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode";
import type {
  DOMConversionMap,
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

import {
  embedPage,
  embedProviderNames,
  parseEmbedUrl,
} from "@faridalms/domain/embed";
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { DecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $getDocument, $getNodeByKey, createCommand } from "lexical";
import { Captions, ExternalLink, ScrollText } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CaptionsEditor } from "../captions";
import { useEditorEnvironment } from "../context";
import { StoredImage } from "../files";
import { blockAlignClass, diagramImageClass, imageSizeClass } from "../format";
import { EmbedFrame, MediaPlayer, MediaTranscript } from "../media-view";
import { useSelectOnClick } from "./select";

// The outline goes round the block's own box, which may be narrower than
// the column, not round the full-width row that holds it.
const blockClass = {
  base: "relative my-3",
  focus:
    "[&>*]:rounded-lg [&>*]:outline-2 [&>*]:outline-offset-2 [&>*]:outline-ring",
};

export const EDIT_DIAGRAM_COMMAND = createCommand<NodeKey | null>(
  "FARIDA_EDIT_DIAGRAM",
);

function useNodeUpdate<T extends LexicalNode>(
  nodeKey: NodeKey,
  guard: (node: LexicalNode | null) => node is T,
) {
  const [editor] = useLexicalComposerContext();
  return (change: (node: T) => void) =>
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (guard(node)) change(node);
    });
}

function CaptionInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { strings } = useEditorEnvironment();
  return (
    <input
      aria-label={strings.imageCaption}
      placeholder={strings.imageCaption}
      value={value}
      maxLength={1000}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1.5 w-full bg-transparent text-center text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60"
    />
  );
}

function MediaBlock({
  nodeKey,
  format,
  fileId,
  mime,
  captionsFileId,
  captionsLang,
  transcript,
  caption,
  size,
}: {
  nodeKey: NodeKey;
  format: ElementFormatType;
  fileId: string;
  mime: string;
  captionsFileId: string;
  captionsLang: string;
  transcript: string;
  caption: string;
  size: ImageSize;
}) {
  const { strings, media, locale } = useEditorEnvironment();
  const [writing, setWriting] = useState(false);
  const transcriptInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (writing) transcriptInput.current?.focus();
  }, [writing]);
  const editable = useLexicalEditable();
  const update = useNodeUpdate(nodeKey, $isMediaNode);
  useSelectOnClick(nodeKey);
  const [captioning, setCaptioning] = useState(false);
  const video = mime.startsWith("video/");
  return (
    <BlockWithAlignableContents
      className={blockClass}
      format={format}
      nodeKey={nodeKey}
    >
      <figure
        className={`grid gap-1.5 ${imageSizeClass[size]} ${blockAlignClass(format)}`}
      >
        <MediaPlayer
          src={media?.url(fileId)}
          captions={captionsFileId ? media?.url(captionsFileId) : undefined}
          video={video}
          captionsLang={captionsLang}
          locale={locale}
          captionsLabel={strings.captions}
        />
        {editable ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              {/* Audio is followed as well through a transcript as through captions. */}
              {!captionsFileId && !video && transcript ? (
                <span />
              ) : (
                <span
                  className={
                    captionsFileId
                      ? undefined
                      : "text-warning-foreground dark:text-warning"
                  }
                >
                  {captionsFileId
                    ? strings.captionsAdded
                    : video
                      ? strings.captionsMissing
                      : strings.transcriptMissing}
                </span>
              )}
              <button
                type="button"
                disabled={!media}
                onClick={() => setCaptioning(true)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-medium text-foreground hover:bg-accent disabled:opacity-50"
              >
                <Captions className="size-3.5" aria-hidden />
                {captionsFileId ? strings.captionsReplace : strings.captionsAdd}
              </button>
              {transcript || writing ? null : (
                <button
                  type="button"
                  onClick={() => setWriting(true)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-medium text-foreground hover:bg-accent"
                >
                  <ScrollText className="size-3.5" aria-hidden />
                  {strings.transcriptAdd}
                </button>
              )}
              <CaptionsEditor
                open={captioning}
                onOpenChange={setCaptioning}
                src={media?.url(fileId)}
                video={video}
                captionsSrc={
                  captionsFileId ? media?.url(captionsFileId) : undefined
                }
                language={captionsLang}
                onSave={async (file, language) => {
                  if (!media) return;
                  const uploaded = await media.upload(file, "captions");
                  update((node) =>
                    node.setCaptions(uploaded.fileId).setCaptionsLang(language),
                  );
                }}
              />
            </div>
            {transcript || writing ? (
              <label className="grid gap-1 text-xs text-muted-foreground">
                {strings.transcript}
                <textarea
                  ref={transcriptInput}
                  dir="auto"
                  value={transcript}
                  maxLength={20000}
                  placeholder={strings.transcriptHint}
                  onChange={(event) => {
                    const value = event.target.value;
                    update((node) => node.setTranscript(value));
                  }}
                  onBlur={() => setWriting(false)}
                  className="field-sizing-content max-h-80 min-h-16 w-full resize-none rounded-md border bg-transparent px-2.5 py-2 text-sm text-foreground outline-none focus-visible:border-ring"
                />
              </label>
            ) : null}
            <CaptionInput
              value={caption}
              onChange={(value) => update((node) => node.setCaption(value))}
            />
          </>
        ) : (
          <>
            {caption ? (
              <figcaption className="text-center text-sm text-muted-foreground">
                {caption}
              </figcaption>
            ) : null}
            <MediaTranscript text={transcript} label={strings.transcript} />
          </>
        )}
      </figure>
    </BlockWithAlignableContents>
  );
}

function EmbedBlock({
  nodeKey,
  format,
  provider,
  embedId,
  caption,
  size,
}: {
  nodeKey: NodeKey;
  format: ElementFormatType;
  provider: EmbedProvider;
  embedId: string;
  caption: string;
  size: ImageSize;
}) {
  const { strings } = useEditorEnvironment();
  const editable = useLexicalEditable();
  const update = useNodeUpdate(nodeKey, $isEmbedNode);
  useSelectOnClick(nodeKey);
  const name = embedProviderNames[provider];
  return (
    <BlockWithAlignableContents
      className={blockClass}
      format={format}
      nodeKey={nodeKey}
    >
      <figure
        className={`grid gap-1.5 ${imageSizeClass[size]} ${blockAlignClass(format)}`}
      >
        <EmbedFrame
          provider={provider}
          embedId={embedId}
          loadLabel={strings.embedLoad(name)}
          privacy={strings.embedPrivacy(name)}
        />
        <div className="flex items-center justify-between gap-2">
          {editable ? (
            <CaptionInput
              value={caption}
              onChange={(value) => update((node) => node.setCaption(value))}
            />
          ) : caption ? (
            <figcaption className="text-sm text-muted-foreground">
              {caption}
            </figcaption>
          ) : (
            <span />
          )}
          <a
            href={embedPage({ provider, embedId })}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            {strings.embedOpen(name)}
          </a>
        </div>
      </figure>
    </BlockWithAlignableContents>
  );
}

function DiagramBlock({
  nodeKey,
  format,
  fileId,
  caption,
  size,
}: {
  nodeKey: NodeKey;
  format: ElementFormatType;
  fileId: string;
  caption: string;
  size: ImageSize;
}) {
  const { strings, media } = useEditorEnvironment();
  const editable = useLexicalEditable();
  const update = useNodeUpdate(nodeKey, $isDiagramNode);
  useSelectOnClick(nodeKey);
  return (
    <BlockWithAlignableContents
      className={blockClass}
      format={format}
      nodeKey={nodeKey}
    >
      <figure className={`${imageSizeClass[size]} ${blockAlignClass(format)}`}>
        <StoredImage
          src={media?.url(fileId)}
          alt={caption || strings.diagram}
          draggable={false}
          removed={strings.fileRemoved}
          className={`${diagramImageClass} rounded-lg`}
        />
        {editable ? (
          <CaptionInput
            value={caption}
            onChange={(value) => update((node) => node.setCaption(value))}
          />
        ) : caption ? (
          <figcaption className="mt-1.5 text-center text-sm text-muted-foreground">
            {caption}
          </figcaption>
        ) : null}
      </figure>
    </BlockWithAlignableContents>
  );
}

export type SerializedMediaNode = Spread<
  {
    fileId: string;
    mime: string;
    captionsFileId?: string;
    captionsLang?: string;
    transcript?: string;
    caption: string;
    size?: ImageSize;
  },
  SerializedDecoratorBlockNode
>;

export class MediaNode extends DecoratorBlockNode {
  __fileId: string;
  __mime: string;
  __captionsFileId: string;
  __captionsLang = "";
  __transcript = "";
  __caption: string;
  __size: ImageSize;

  constructor(
    fileId = "",
    mime = "video/mp4",
    captionsFileId = "",
    caption = "",
    size: ImageSize = "full",
    format?: ElementFormatType,
    key?: NodeKey,
  ) {
    super(format, key);
    this.__fileId = fileId;
    this.__mime = mime;
    this.__captionsFileId = captionsFileId;
    this.__caption = caption;
    this.__size = size;
  }

  $config() {
    return this.config("media", { extends: DecoratorBlockNode });
  }

  static clone(node: MediaNode): MediaNode {
    const copy = new MediaNode(
      node.__fileId,
      node.__mime,
      node.__captionsFileId,
      node.__caption,
      node.__size,
      node.__format,
      node.__key,
    );
    copy.__captionsLang = node.__captionsLang;
    copy.__transcript = node.__transcript;
    return copy;
  }

  static importJSON(json: SerializedMediaNode): MediaNode {
    return new MediaNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedMediaNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__fileId = json.fileId;
    node.__mime = json.mime;
    node.__captionsFileId = json.captionsFileId ?? "";
    node.__captionsLang = json.captionsLang ?? "";
    node.__transcript = json.transcript ?? "";
    node.__caption = json.caption;
    node.__size = json.size ?? "full";
    return node;
  }

  exportJSON(): SerializedMediaNode {
    const node = this.getLatest();
    return {
      ...super.exportJSON(),
      fileId: node.__fileId,
      mime: node.__mime,
      ...(node.__captionsFileId
        ? { captionsFileId: node.__captionsFileId }
        : {}),
      ...(node.__captionsLang ? { captionsLang: node.__captionsLang } : {}),
      ...(node.__transcript ? { transcript: node.__transcript } : {}),
      caption: node.__caption,
      size: node.__size,
    };
  }

  exportDOM(): DOMExportOutput {
    const element = $getDocument().createElement("p");
    element.textContent = this.getLatest().__caption;
    return { element };
  }

  getTextContent(): string {
    return this.getLatest().__caption;
  }

  setCaption(caption: string): this {
    const writable = this.getWritable();
    writable.__caption = caption;
    return writable;
  }

  setCaptions(fileId: string): this {
    const writable = this.getWritable();
    writable.__captionsFileId = fileId;
    return writable;
  }

  setCaptionsLang(language: string): this {
    const writable = this.getWritable();
    writable.__captionsLang = language;
    return writable;
  }

  setTranscript(transcript: string): this {
    const writable = this.getWritable();
    writable.__transcript = transcript;
    return writable;
  }

  getSize(): ImageSize {
    return this.getLatest().__size;
  }

  setSize(size: ImageSize): this {
    const writable = this.getWritable();
    writable.__size = size;
    return writable;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return (
      <MediaBlock
        nodeKey={this.getKey()}
        format={this.__format}
        fileId={this.__fileId}
        mime={this.__mime}
        captionsFileId={this.__captionsFileId}
        captionsLang={this.__captionsLang}
        transcript={this.__transcript}
        caption={this.__caption}
        size={this.__size}
      />
    );
  }
}

export type SerializedEmbedNode = Spread<
  {
    provider: EmbedProvider;
    embedId: string;
    caption: string;
    size?: ImageSize;
  },
  SerializedDecoratorBlockNode
>;

export class EmbedNode extends DecoratorBlockNode {
  __provider: EmbedProvider;
  __embedId: string;
  __caption: string;
  __size: ImageSize;

  constructor(
    provider: EmbedProvider = "youtube",
    embedId = "",
    caption = "",
    size: ImageSize = "full",
    format?: ElementFormatType,
    key?: NodeKey,
  ) {
    super(format, key);
    this.__provider = provider;
    this.__embedId = embedId;
    this.__caption = caption;
    this.__size = size;
  }

  $config() {
    return this.config("embed", { extends: DecoratorBlockNode });
  }

  static clone(node: EmbedNode): EmbedNode {
    return new EmbedNode(
      node.__provider,
      node.__embedId,
      node.__caption,
      node.__size,
      node.__format,
      node.__key,
    );
  }

  static importDOM(): DOMConversionMap | null {
    return {
      iframe: () => ({
        conversion: (element: HTMLElement) => {
          const embed = parseEmbedUrl(element.getAttribute("src") ?? "");
          return {
            node: embed ? new EmbedNode(embed.provider, embed.embedId) : null,
          };
        },
        priority: 1,
      }),
    };
  }

  static importJSON(json: SerializedEmbedNode): EmbedNode {
    return new EmbedNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedEmbedNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__provider = json.provider;
    node.__embedId = json.embedId;
    node.__caption = json.caption;
    node.__size = json.size ?? "full";
    return node;
  }

  exportJSON(): SerializedEmbedNode {
    const node = this.getLatest();
    return {
      ...super.exportJSON(),
      provider: node.__provider,
      embedId: node.__embedId,
      caption: node.__caption,
      size: node.__size,
    };
  }

  exportDOM(): DOMExportOutput {
    const node = this.getLatest();
    const element = $getDocument().createElement("a");
    element.href = embedPage({
      provider: node.__provider,
      embedId: node.__embedId,
    });
    element.textContent = node.__caption || embedProviderNames[node.__provider];
    return { element };
  }

  getTextContent(): string {
    return this.getLatest().__caption;
  }

  setCaption(caption: string): this {
    const writable = this.getWritable();
    writable.__caption = caption;
    return writable;
  }

  getSize(): ImageSize {
    return this.getLatest().__size;
  }

  setSize(size: ImageSize): this {
    const writable = this.getWritable();
    writable.__size = size;
    return writable;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return (
      <EmbedBlock
        nodeKey={this.getKey()}
        format={this.__format}
        provider={this.__provider}
        embedId={this.__embedId}
        caption={this.__caption}
        size={this.__size}
      />
    );
  }
}

export type SerializedDiagramNode = Spread<
  { fileId: string; sceneFileId: string; caption: string; size: ImageSize },
  SerializedDecoratorBlockNode
>;

export class DiagramNode extends DecoratorBlockNode {
  __fileId: string;
  __sceneFileId: string;
  __caption: string;
  __size: ImageSize;

  constructor(
    fileId = "",
    sceneFileId = "",
    caption = "",
    size: ImageSize = "large",
    format?: ElementFormatType,
    key?: NodeKey,
  ) {
    super(format, key);
    this.__fileId = fileId;
    this.__sceneFileId = sceneFileId;
    this.__caption = caption;
    this.__size = size;
  }

  $config() {
    return this.config("diagram", { extends: DecoratorBlockNode });
  }

  static clone(node: DiagramNode): DiagramNode {
    return new DiagramNode(
      node.__fileId,
      node.__sceneFileId,
      node.__caption,
      node.__size,
      node.__format,
      node.__key,
    );
  }

  static importJSON(json: SerializedDiagramNode): DiagramNode {
    return new DiagramNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedDiagramNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__fileId = json.fileId;
    node.__sceneFileId = json.sceneFileId;
    node.__caption = json.caption;
    node.__size = json.size;
    return node;
  }

  exportJSON(): SerializedDiagramNode {
    const node = this.getLatest();
    return {
      ...super.exportJSON(),
      fileId: node.__fileId,
      sceneFileId: node.__sceneFileId,
      caption: node.__caption,
      size: node.__size,
    };
  }

  exportDOM(): DOMExportOutput {
    const element = $getDocument().createElement("p");
    element.textContent = this.getLatest().__caption;
    return { element };
  }

  getTextContent(): string {
    return this.getLatest().__caption;
  }

  getSceneFileId(): string {
    return this.getLatest().__sceneFileId;
  }

  setCaption(caption: string): this {
    const writable = this.getWritable();
    writable.__caption = caption;
    return writable;
  }

  getSize(): ImageSize {
    return this.getLatest().__size;
  }

  setSize(size: ImageSize): this {
    const writable = this.getWritable();
    writable.__size = size;
    return writable;
  }

  setFiles(fileId: string, sceneFileId: string): this {
    const writable = this.getWritable();
    writable.__fileId = fileId;
    writable.__sceneFileId = sceneFileId;
    return writable;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return (
      <DiagramBlock
        nodeKey={this.getKey()}
        format={this.__format}
        fileId={this.__fileId}
        caption={this.__caption}
        size={this.__size}
      />
    );
  }
}

export function $createMediaNode(fileId: string, mime: string): MediaNode {
  return new MediaNode(fileId, mime);
}

export function $createEmbedNode(
  provider: EmbedProvider,
  embedId: string,
): EmbedNode {
  return new EmbedNode(provider, embedId);
}

export function $createDiagramNode(
  fileId: string,
  sceneFileId: string,
): DiagramNode {
  return new DiagramNode(fileId, sceneFileId, "", "full");
}

export function $isMediaNode(
  node: LexicalNode | null | undefined,
): node is MediaNode {
  return node instanceof MediaNode;
}

export function $isEmbedNode(
  node: LexicalNode | null | undefined,
): node is EmbedNode {
  return node instanceof EmbedNode;
}

export function $isDiagramNode(
  node: LexicalNode | null | undefined,
): node is DiagramNode {
  return node instanceof DiagramNode;
}
