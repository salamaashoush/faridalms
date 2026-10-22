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

import { parseChapters, parseDescriptions } from "@faridalms/domain/chapters";
import {
  embedPage,
  embedProviderNames,
  parseEmbedUrl,
} from "@faridalms/domain/embed";
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { DecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { mergeRegister } from "@lexical/utils";
import {
  $getDocument,
  $getNodeByKey,
  COMMAND_PRIORITY_LOW,
  createCommand,
} from "lexical";
import { ExternalLink } from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import type { RecordingTab } from "../captions";
import type { FramedSource, PlayerClock } from "../player";

import { FramedChaptersSheet, RecordingSheet } from "../captions";
import { useEditorEnvironment } from "../context";
import { StoredImage } from "../files";
import { blockAlignClass, diagramImageClass, imageSizeClass } from "../format";
import { EmbedFrame, MediaPlayer, MediaTranscript } from "../media-view";
import { $createQuestionNode, $isQuestionNode } from "./question";
import { ownKeys, useSelectOnClick } from "./select";

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

// A field in the block shows the node's value, so the change is made at
// once: a later one would redraw the field behind the caret as it types.
function useNodeUpdate<T extends LexicalNode>(
  nodeKey: NodeKey,
  guard: (node: LexicalNode | null) => node is T,
) {
  const [editor] = useLexicalComposerContext();
  return (change: (node: T) => void) =>
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if (guard(node)) change(node);
      },
      { discrete: true },
    );
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
      ref={ownKeys}
      aria-label={strings.imageCaption}
      placeholder={strings.imageCaption}
      value={value}
      maxLength={1000}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1.5 w-full bg-transparent text-center text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60"
    />
  );
}

/** Where the editor finds each recording block's player, so its bar can ask the time. */
const players = new WeakMap<LexicalEditor, Map<NodeKey, PlayerClock>>();

/** Keeps a block's player where the bar finds it, or forgets it. */
function usePlayerOf(nodeKey: NodeKey) {
  const [editor] = useLexicalComposerContext();
  const playing = useRef<PlayerClock | null>(null);
  const follow = useCallback(
    (player: PlayerClock | null) => {
      playing.current = player;
      const known = players.get(editor) ?? new Map<NodeKey, PlayerClock>();
      players.set(editor, known);
      if (player) known.set(nodeKey, player);
      else known.delete(nodeKey);
    },
    [editor, nodeKey],
  );
  return { playing, follow };
}

/**
 * Asks a question where a video stands: it goes after the video and any it
 * asks earlier, so the document reads in the order the video plays.
 */
function $askAt(nodeKey: NodeKey, at: number) {
  const node = $getNodeByKey(nodeKey);
  let after = node?.getTopLevelElement() ?? node;
  if (!after) return;
  for (
    let next = after.getNextSibling();
    $isQuestionNode(next) &&
    (next.getSettings().videoAt ?? Number.POSITIVE_INFINITY) <= at;
    next = next.getNextSibling()
  )
    after = next;
  const question = $createQuestionNode("choice");
  question.setSettings({ videoAt: at });
  after.insertAfter(question);
  question.getFirstChild()?.selectStart();
}

/** The player of a recording block in this editor, once it is drawn. */
export function playerOf(
  editor: LexicalEditor,
  key: NodeKey,
): PlayerClock | null {
  return players.get(editor)?.get(key) ?? null;
}

/** Opens a recording's sheet on one of its tabs: captions, chapters or transcript. */
export const OPEN_RECORDING_COMMAND = createCommand<{
  key: NodeKey;
  tab: RecordingTab;
}>("FARIDA_OPEN_RECORDING");

/** Asks a question at the moment the recording's player stands at. */
export const ASK_AT_MOMENT_COMMAND = createCommand<NodeKey>(
  "FARIDA_ASK_AT_MOMENT",
);

/**
 * A video or a sound clip in the text. Editing it happens in the editor's
 * floating bar and in its sheet; the block itself shows only the player and
 * its caption, as students see it.
 */
function MediaBlock({
  nodeKey,
  format,
  fileId,
  mime,
  captionsFileId,
  captionsLang,
  transcript,
  chapters,
  descriptions,
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
  chapters: string;
  descriptions: string;
  caption: string;
  size: ImageSize;
}) {
  const { strings, media, locale } = useEditorEnvironment();
  const [editor] = useLexicalComposerContext();
  const { playing, follow: following } = usePlayerOf(nodeKey);
  const askHere = useEffectEvent(() => {
    const at = Math.floor(playing.current?.currentTime ?? 0);
    playing.current?.pause();
    editor.update(() => $askAt(nodeKey, at));
  });
  const [sheet, setSheet] = useState<RecordingTab | null>(null);
  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          OPEN_RECORDING_COMMAND,
          (asked) => {
            if (asked.key !== nodeKey) return false;
            setSheet(asked.tab);
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          ASK_AT_MOMENT_COMMAND,
          (key) => {
            if (key !== nodeKey) return false;
            askHere();
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor, nodeKey],
  );
  const editable = useLexicalEditable();
  const update = useNodeUpdate(nodeKey, $isMediaNode);
  useSelectOnClick(nodeKey);
  const video = mime.startsWith("video/");
  return (
    <BlockWithAlignableContents
      className={blockClass}
      format={format}
      nodeKey={nodeKey}
    >
      <figure
        ref={ownKeys}
        className={`grid gap-1.5 ${imageSizeClass[size]} ${blockAlignClass(format)}`}
      >
        <MediaPlayer
          src={media?.url(fileId)}
          captions={captionsFileId ? media?.url(captionsFileId) : undefined}
          video={video}
          captionsLang={captionsLang}
          locale={locale}
          strings={editable ? undefined : strings}
          captionsLabel={strings.captions}
          element={following}
          chapters={parseChapters(chapters)}
          descriptions={parseDescriptions(descriptions)}
        />
        {editable ? (
          <>
            <CaptionInput
              value={caption}
              onChange={(value) => update((node) => node.setCaption(value))}
            />
            <RecordingSheet
              open={sheet !== null}
              onOpenChange={(open) => {
                if (!open) setSheet(null);
              }}
              tab={sheet ?? "captions"}
              onTabChange={setSheet}
              fileId={fileId}
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
              chapters={chapters}
              onChapters={(text) => update((node) => node.setChapters(text))}
              descriptions={descriptions}
              onDescriptions={(text) =>
                update((node) => node.setDescriptions(text))
              }
              transcript={transcript}
              onTranscript={(text) =>
                update((node) => node.setTranscript(text))
              }
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
  chapters,
  descriptions,
}: {
  nodeKey: NodeKey;
  format: ElementFormatType;
  provider: EmbedProvider;
  embedId: string;
  caption: string;
  size: ImageSize;
  chapters: string;
  descriptions: string;
}) {
  const { strings, locale } = useEditorEnvironment();
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const update = useNodeUpdate(nodeKey, $isEmbedNode);
  useSelectOnClick(nodeKey);
  const name = embedProviderNames[provider];
  const { playing, follow } = usePlayerOf(nodeKey);
  const [writing, setWriting] = useState<RecordingTab | null>(null);
  const askHere = useEffectEvent(() => {
    const at = Math.floor(playing.current?.currentTime ?? 0);
    playing.current?.pause();
    editor.update(() => $askAt(nodeKey, at));
  });
  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          OPEN_RECORDING_COMMAND,
          (asked) => {
            if (asked.key !== nodeKey) return false;
            setWriting(asked.tab);
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          ASK_AT_MOMENT_COMMAND,
          (key) => {
            if (key !== nodeKey) return false;
            askHere();
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor, nodeKey],
  );
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
          locale={locale}
          chapters={parseChapters(chapters)}
          descriptions={parseDescriptions(descriptions)}
          descriptionsLabel={editable ? undefined : strings.descriptions}
          element={follow}
        />
        {editable && framed(provider) ? (
          <FramedChaptersSheet
            open={writing !== null}
            onOpenChange={(open) => {
              if (!open) setWriting(null);
            }}
            tab={writing ?? "chapters"}
            onTabChange={setWriting}
            source={{ provider, id: embedId }}
            chapters={chapters}
            onChapters={(text) => update((node) => node.setChapters(text))}
            descriptions={descriptions}
            onDescriptions={(text) =>
              update((node) => node.setDescriptions(text))
            }
          />
        ) : null}
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
    chapters?: string;
    descriptions?: string;
    caption: string;
    size?: ImageSize;
    /** Students may seek only as far as they have watched. */
    noSkipping?: boolean;
  },
  SerializedDecoratorBlockNode
>;

export class MediaNode extends DecoratorBlockNode {
  __fileId: string;
  __mime: string;
  __captionsFileId: string;
  __captionsLang = "";
  __transcript = "";
  __chapters = "";
  __descriptions = "";
  __noSkipping = false;
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
    copy.__chapters = node.__chapters;
    copy.__descriptions = node.__descriptions;
    copy.__noSkipping = node.__noSkipping;
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
    node.__chapters = json.chapters ?? "";
    node.__descriptions = json.descriptions ?? "";
    node.__noSkipping = json.noSkipping ?? false;
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
      ...(node.__chapters ? { chapters: node.__chapters } : {}),
      ...(node.__descriptions.trim()
        ? { descriptions: node.__descriptions }
        : {}),
      caption: node.__caption,
      size: node.__size,
      ...(node.__noSkipping ? { noSkipping: true } : {}),
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

  setChapters(chapters: string): this {
    const writable = this.getWritable();
    writable.__chapters = chapters;
    return writable;
  }

  setDescriptions(descriptions: string): this {
    const writable = this.getWritable();
    writable.__descriptions = descriptions;
    return writable;
  }

  /** What the editor's bar says about the recording, and offers to change. */
  getRecording(): {
    video: boolean;
    captions: boolean;
    chapters: boolean;
    descriptions: boolean;
    transcript: boolean;
    noSkipping: boolean;
  } {
    const node = this.getLatest();
    return {
      video: node.__mime.startsWith("video/"),
      captions: node.__captionsFileId !== "",
      chapters: node.__chapters.trim() !== "",
      descriptions: node.__descriptions.trim() !== "",
      transcript: node.__transcript.trim() !== "",
      noSkipping: node.__noSkipping,
    };
  }

  setNoSkipping(noSkipping: boolean): this {
    const writable = this.getWritable();
    writable.__noSkipping = noSkipping;
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
        chapters={this.__chapters}
        descriptions={this.__descriptions}
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
    chapters?: string;
    descriptions?: string;
    noSkipping?: boolean;
  },
  SerializedDecoratorBlockNode
>;

/** Services whose videos the school's player plays and follows. */
const framed = (
  provider: EmbedProvider,
): provider is FramedSource["provider"] =>
  provider === "youtube" || provider === "vimeo";

export class EmbedNode extends DecoratorBlockNode {
  __provider: EmbedProvider;
  __embedId: string;
  __caption: string;
  __size: ImageSize;
  /** A YouTube or Vimeo video's chapters, as an upload's are written. */
  __chapters = "";
  __descriptions = "";
  __noSkipping = false;

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

  afterCloneFrom(previous: this): void {
    super.afterCloneFrom(previous);
    this.__chapters = previous.__chapters;
    this.__descriptions = previous.__descriptions;
    this.__noSkipping = previous.__noSkipping;
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
    node.__chapters = json.chapters ?? "";
    node.__descriptions = json.descriptions ?? "";
    node.__noSkipping = json.noSkipping ?? false;
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
      ...(node.__chapters.trim() ? { chapters: node.__chapters } : {}),
      ...(node.__descriptions.trim()
        ? { descriptions: node.__descriptions }
        : {}),
      ...(node.__noSkipping ? { noSkipping: true } : {}),
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

  /** What the bar offers of a YouTube or Vimeo video; null for anything else. */
  getRecording(): {
    video: boolean;
    captions: boolean;
    chapters: boolean;
    descriptions: boolean;
    transcript: boolean;
    noSkipping: boolean;
  } | null {
    const node = this.getLatest();
    if (!framed(node.__provider)) return null;
    return {
      video: true,
      captions: false,
      chapters: node.__chapters.trim() !== "",
      descriptions: node.__descriptions.trim() !== "",
      transcript: false,
      noSkipping: node.__noSkipping,
    };
  }

  setChapters(chapters: string): this {
    const writable = this.getWritable();
    writable.__chapters = chapters;
    return writable;
  }

  setDescriptions(descriptions: string): this {
    const writable = this.getWritable();
    writable.__descriptions = descriptions;
    return writable;
  }

  setNoSkipping(noSkipping: boolean): this {
    const writable = this.getWritable();
    writable.__noSkipping = noSkipping;
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
        chapters={this.__chapters}
        descriptions={this.__descriptions}
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
