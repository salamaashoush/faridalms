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

import { parseChapters } from "@faridalms/domain/chapters";
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
import {
  Captions,
  ExternalLink,
  FastForward,
  ListOrdered,
  Lock,
  MessageCircleQuestion,
  Plus,
  ScrollText,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CaptionsEditor } from "../captions";
import { useEditorEnvironment } from "../context";
import { StoredImage } from "../files";
import {
  blockAlignClass,
  diagramImageClass,
  imageSizeClass,
  mediaClock,
} from "../format";
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

function MediaBlock({
  nodeKey,
  format,
  fileId,
  mime,
  captionsFileId,
  captionsLang,
  transcript,
  chapters,
  noSkipping,
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
  noSkipping: boolean;
  caption: string;
  size: ImageSize;
}) {
  const { strings, media, locale, questions } = useEditorEnvironment();
  const [editor] = useLexicalComposerContext();
  const [writing, setWriting] = useState(false);
  const transcriptInput = useRef<HTMLTextAreaElement>(null);
  const playing = useRef<HTMLVideoElement | null>(null);
  const [second, setSecond] = useState(0);
  const following = useCallback(
    (element: (HTMLVideoElement & HTMLAudioElement) | null) => {
      playing.current = element;
      if (!element) return undefined;
      const tick = () => setSecond(Math.floor(element.currentTime));
      element.addEventListener("timeupdate", tick);
      element.addEventListener("seeked", tick);
      return () => {
        element.removeEventListener("timeupdate", tick);
        element.removeEventListener("seeked", tick);
      };
    },
    [],
  );
  // A question the video stops for goes after the video and any it asks
  // earlier, so the document reads in the order the video plays.
  const askHere = () => {
    const at = Math.floor(playing.current?.currentTime ?? second);
    playing.current?.pause();
    editor.update(() => {
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
    });
  };
  useEffect(() => {
    if (writing) transcriptInput.current?.focus();
  }, [writing]);
  const [chaptering, setChaptering] = useState(false);
  const chaptersInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (chaptering) chaptersInput.current?.focus();
  }, [chaptering]);
  const chapterList = parseChapters(chapters);
  const skipped = chapters
    .split("\n")
    .filter((line) => line.trim() && parseChapters(line).length === 0).length;
  // A chapter added from the video goes where its time puts it, with its
  // name left to write.
  const addChapter = () => {
    const at = Math.floor(playing.current?.currentTime ?? second);
    const lines = chapters ? chapters.split("\n") : [];
    const later = lines.findIndex(
      (line) => (parseChapters(line)[0]?.at ?? -1) > at,
    );
    const place = later === -1 ? lines.length : later;
    const line = `${mediaClock(at)} `;
    const next = [...lines.slice(0, place), line, ...lines.slice(place)];
    update((node) => node.setChapters(next.join("\n")));
    const caret =
      next.slice(0, place).reduce((sum, item) => sum + item.length + 1, 0) +
      line.length;
    requestAnimationFrame(() => {
      chaptersInput.current?.focus();
      chaptersInput.current?.setSelectionRange(caret, caret);
    });
  };
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
        ref={ownKeys}
        className={`grid gap-1.5 ${imageSizeClass[size]} ${blockAlignClass(format)}`}
      >
        <MediaPlayer
          src={media?.url(fileId)}
          captions={captionsFileId ? media?.url(captionsFileId) : undefined}
          video={video}
          captionsLang={captionsLang}
          locale={locale}
          strings={strings}
          captionsLabel={strings.captions}
          element={following}
          chapters={chapterList}
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
                className={mediaAction}
              >
                <Captions className="size-3.5" aria-hidden />
                {captionsFileId ? strings.captionsReplace : strings.captionsAdd}
              </button>
              {transcript || writing ? null : (
                <button
                  type="button"
                  onClick={() => setWriting(true)}
                  className={mediaAction}
                >
                  <ScrollText className="size-3.5" aria-hidden />
                  {strings.transcriptAdd}
                </button>
              )}
              {questions ? (
                <button
                  type="button"
                  aria-pressed={noSkipping}
                  onClick={() =>
                    update((node) => node.setNoSkipping(!noSkipping))
                  }
                  className={mediaAction}
                >
                  {noSkipping ? (
                    <Lock className="size-3.5" aria-hidden />
                  ) : (
                    <FastForward className="size-3.5" aria-hidden />
                  )}
                  {strings.mediaNoSkipping}
                </button>
              ) : null}
              {video && !chapters && !chaptering ? (
                <button
                  type="button"
                  onClick={() => setChaptering(true)}
                  className={mediaAction}
                >
                  <ListOrdered className="size-3.5" aria-hidden />
                  {strings.chaptersAdd}
                </button>
              ) : null}
              {video && questions ? (
                <button type="button" onClick={askHere} className={mediaAction}>
                  <MessageCircleQuestion className="size-3.5" aria-hidden />
                  {strings.questionAskAt(mediaClock(second))}
                </button>
              ) : null}
              <CaptionsEditor
                open={captioning}
                onOpenChange={setCaptioning}
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
              />
            </div>
            {video && (chapters || chaptering) ? (
              <div className="grid gap-1 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor={`${nodeKey}-chapters`}>
                    {strings.chapters}
                  </label>
                  <button
                    type="button"
                    // Keeps the chapters open while one is added.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={addChapter}
                    className={mediaAction}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    {strings.chapterAddAt(mediaClock(second))}
                  </button>
                </div>
                <textarea
                  id={`${nodeKey}-chapters`}
                  ref={chaptersInput}
                  dir="auto"
                  value={chapters}
                  maxLength={4000}
                  placeholder={strings.chaptersHint}
                  aria-describedby={`${nodeKey}-chapters-help`}
                  onChange={(event) => {
                    const value = event.target.value;
                    update((node) => node.setChapters(value));
                  }}
                  onBlur={() => setChaptering(false)}
                  className="field-sizing-content max-h-80 min-h-16 w-full resize-none rounded-md border bg-transparent px-2.5 py-2 text-sm text-foreground outline-none focus-visible:border-ring"
                />
                <p id={`${nodeKey}-chapters-help`}>
                  {skipped > 0 ? (
                    <span className="text-warning-foreground dark:text-warning">
                      {strings.chaptersSkipped(skipped)}
                    </span>
                  ) : (
                    strings.chaptersHelp
                  )}
                </p>
              </div>
            ) : null}
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

const mediaAction =
  "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-pressed:border-primary/40 aria-pressed:bg-primary/10 max-md:h-10";

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
    chapters?: string;
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
        noSkipping={this.__noSkipping}
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
