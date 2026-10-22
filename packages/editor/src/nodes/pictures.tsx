import type { SetPicture } from "@faridalms/domain/content";
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

import { MAX_GALLERY_PICTURES } from "@faridalms/domain/content";
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { DecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $getDocument, $getNodeByKey } from "lexical";
import { ArrowLeft, ArrowRight, ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";

import { useEditorEnvironment } from "../context";
import { StoredImage } from "../files";
import { ownKeys, useSelectOnClick } from "./select";

export type SerializedPicturesNode = Spread<
  { pictures: SetPicture[] },
  SerializedDecoratorBlockNode
>;

const blockClass = {
  base: "relative my-3",
  focus:
    "[&>*]:rounded-lg [&>*]:outline-2 [&>*]:outline-offset-2 [&>*]:outline-ring",
};

const fieldClass =
  "w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
const iconClass =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 [&_svg]:size-3.5";

/** A block's pictures as stored, changed at once from its own fields. */
function usePictures(nodeKey: NodeKey) {
  const [editor] = useLexicalComposerContext();
  return (change: (pictures: SetPicture[]) => SetPicture[]) =>
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if ($isGalleryNode(node) || $isCompareNode(node))
          node.setPictures(change(node.getPictures()));
      },
      { discrete: true },
    );
}

/**
 * Uploads chosen pictures one after another, so they land in the order
 * chosen, counting those still on their way.
 */
function useUpload(onStored: (fileId: string) => void) {
  const { media } = useEditorEnvironment();
  const [uploading, setUploading] = useState(0);
  const [failed, setFailed] = useState(false);
  const upload = (files: File[]) => {
    if (!media) return;
    setFailed(false);
    setUploading((count) => count + files.length);
    void files.reduce<Promise<void>>(
      (previous, file) =>
        previous.then(async () => {
          try {
            const stored = await media.upload(file, "image");
            onStored(stored.fileId);
          } catch {
            setFailed(true);
          } finally {
            setUploading((count) => count - 1);
          }
        }),
      Promise.resolve(),
    );
  };
  return { upload, uploading, failed, accept: media?.accept.image.join(",") };
}

function PictureFields({
  picture,
  onChange,
}: {
  picture: SetPicture;
  onChange: (patch: Partial<SetPicture>) => void;
}) {
  const { strings } = useEditorEnvironment();
  return (
    <>
      <input
        aria-label={strings.imageAlt}
        placeholder={strings.imageAlt}
        value={picture.alt}
        maxLength={500}
        dir="auto"
        onChange={(event) => onChange({ alt: event.target.value })}
        className={fieldClass}
      />
      <input
        aria-label={strings.imageCaption}
        placeholder={strings.imageCaption}
        value={picture.caption ?? ""}
        maxLength={300}
        dir="auto"
        onChange={(event) => onChange({ caption: event.target.value })}
        className={fieldClass}
      />
    </>
  );
}

function GalleryBlock({
  nodeKey,
  format,
  pictures,
}: {
  nodeKey: NodeKey;
  format: ElementFormatType;
  pictures: SetPicture[];
}) {
  const { strings, media } = useEditorEnvironment();
  const editable = useLexicalEditable();
  const selected = useSelectOnClick(nodeKey);
  const change = usePictures(nodeKey);
  const input = useRef<HTMLInputElement>(null);
  const { upload, uploading, failed, accept } = useUpload((fileId) =>
    change((current) =>
      current.length < MAX_GALLERY_PICTURES
        ? [...current, { fileId, alt: "", caption: "" }]
        : current,
    ),
  );
  const move = (index: number, by: number) =>
    change((current) => {
      const next = [...current];
      const [picture] = next.splice(index, 1);
      if (picture) next.splice(index + by, 0, picture);
      return next;
    });
  const room = pictures.length + uploading < MAX_GALLERY_PICTURES;
  return (
    <BlockWithAlignableContents
      className={blockClass}
      format={format}
      nodeKey={nodeKey}
    >
      <div ref={ownKeys} className="fe-gallery-edit">
        {pictures.length > 0 ? (
          <ul className="fe-gallery">
            {pictures.map((picture, index) => (
              <li key={picture.fileId} className="grid content-start gap-1">
                <StoredImage
                  src={media?.url(picture.fileId)}
                  alt={picture.alt}
                  draggable={false}
                  loading="lazy"
                  removed={strings.fileRemoved}
                  className="fe-gallery-picture"
                />
                {editable && selected ? (
                  <>
                    <PictureFields
                      picture={picture}
                      onChange={(patch) =>
                        change((current) =>
                          current.map((item, at) =>
                            at === index ? { ...item, ...patch } : item,
                          ),
                        )
                      }
                    />
                    <div className="flex justify-center gap-0.5">
                      <button
                        type="button"
                        aria-label={strings.pictureEarlier}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        className={iconClass}
                      >
                        <ArrowLeft aria-hidden className="rtl:rotate-180" />
                      </button>
                      <button
                        type="button"
                        aria-label={strings.pictureLater}
                        disabled={index === pictures.length - 1}
                        onClick={() => move(index, 1)}
                        className={iconClass}
                      >
                        <ArrowRight aria-hidden className="rtl:rotate-180" />
                      </button>
                      <button
                        type="button"
                        aria-label={strings.pictureRemove}
                        onClick={() =>
                          change((current) =>
                            current.filter((_, at) => at !== index),
                          )
                        }
                        className={iconClass}
                      >
                        <X aria-hidden />
                      </button>
                    </div>
                  </>
                ) : picture.caption ? (
                  <p className="text-center text-xs text-muted-foreground">
                    {picture.caption}
                  </p>
                ) : editable && !picture.alt.trim() ? (
                  <p className="text-center text-xs text-warning-foreground dark:text-warning">
                    {strings.pictureAltMissing}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {editable && media && (selected || pictures.length === 0) && room ? (
          <div className="fe-picture-add">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
            >
              <ImagePlus aria-hidden />
              {uploading > 0
                ? strings.galleryUploading(uploading)
                : strings.galleryAdd}
            </button>
            {failed ? (
              <p role="alert" className="text-xs text-destructive">
                {strings.uploadFailed}
              </p>
            ) : null}
            <input
              ref={input}
              type="file"
              accept={accept}
              multiple
              hidden
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                upload(files);
              }}
            />
          </div>
        ) : null}
      </div>
    </BlockWithAlignableContents>
  );
}

function CompareSlot({
  picture,
  label,
  editable,
  onPicture,
  onChange,
  onRemove,
}: {
  picture: SetPicture | undefined;
  label: string;
  editable: boolean;
  onPicture: (fileId: string) => void;
  onChange: (patch: Partial<SetPicture>) => void;
  onRemove: () => void;
}) {
  const { strings, media } = useEditorEnvironment();
  const input = useRef<HTMLInputElement>(null);
  const { upload, uploading, failed, accept } = useUpload(onPicture);
  return (
    <div className="grid content-start gap-1">
      <span className="text-xs font-medium text-muted-foreground">
        {picture?.caption || label}
      </span>
      {picture ? (
        <>
          <StoredImage
            src={media?.url(picture.fileId)}
            alt={picture.alt}
            draggable={false}
            loading="lazy"
            removed={strings.fileRemoved}
            className="block h-auto w-full rounded-lg bg-muted"
          />
          {editable ? (
            <>
              <PictureFields picture={picture} onChange={onChange} />
              <button
                type="button"
                onClick={onRemove}
                className="justify-self-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {strings.pictureRemove}
              </button>
            </>
          ) : null}
        </>
      ) : !editable ? null : (
        <div className="fe-picture-add fe-compare-empty">
          <button
            type="button"
            disabled={!media || uploading > 0}
            onClick={() => input.current?.click()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
          >
            <ImagePlus aria-hidden />
            {uploading > 0
              ? strings.galleryUploading(1)
              : strings.compareChoose}
          </button>
          {failed ? (
            <p role="alert" className="text-xs text-destructive">
              {strings.uploadFailed}
            </p>
          ) : null}
          <input
            ref={input}
            type="file"
            accept={accept}
            hidden
            onChange={(event) => {
              const files = [...(event.target.files ?? [])].slice(0, 1);
              event.target.value = "";
              upload(files);
            }}
          />
        </div>
      )}
    </div>
  );
}

function CompareBlock({
  nodeKey,
  format,
  pictures,
}: {
  nodeKey: NodeKey;
  format: ElementFormatType;
  pictures: SetPicture[];
}) {
  const { strings } = useEditorEnvironment();
  const editable = useLexicalEditable();
  useSelectOnClick(nodeKey);
  const change = usePictures(nodeKey);
  // The two sides keep their places: an empty before stays first.
  const sides = [pictures[0], pictures[1]];
  const set = (index: number, picture: SetPicture | undefined) =>
    change((current) => {
      const next = [current[0], current[1]];
      next[index] = picture;
      return next.filter((item): item is SetPicture => Boolean(item));
    });
  return (
    <BlockWithAlignableContents
      className={blockClass}
      format={format}
      nodeKey={nodeKey}
    >
      <div ref={ownKeys} className="fe-compare-edit">
        {[strings.compareBefore, strings.compareAfter].map((label, index) => (
          <CompareSlot
            key={label}
            picture={sides[index]}
            label={label}
            editable={editable}
            onPicture={(fileId) => set(index, { fileId, alt: "", caption: "" })}
            onChange={(patch) => {
              const side = sides[index];
              if (side) set(index, { ...side, ...patch });
            }}
            onRemove={() => set(index, undefined)}
          />
        ))}
      </div>
    </BlockWithAlignableContents>
  );
}

abstract class PicturesNode extends DecoratorBlockNode {
  __pictures: SetPicture[];

  constructor(
    pictures: SetPicture[] = [],
    format?: ElementFormatType,
    key?: NodeKey,
  ) {
    super(format, key);
    this.__pictures = pictures;
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedPicturesNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__pictures = json.pictures;
    return node;
  }

  exportJSON(): SerializedPicturesNode {
    return { ...super.exportJSON(), pictures: this.getLatest().__pictures };
  }

  exportDOM(): DOMExportOutput {
    return { element: $getDocument().createElement("figure") };
  }

  getTextContent(): string {
    return this.getLatest()
      .__pictures.map((picture) => picture.caption || picture.alt)
      .filter(Boolean)
      .join("\n");
  }

  getPictures(): SetPicture[] {
    return this.getLatest().__pictures;
  }

  setPictures(pictures: SetPicture[]): this {
    const writable = this.getWritable();
    writable.__pictures = pictures;
    return writable;
  }
}

/** Pictures side by side, each opening large for its reader. */
export class GalleryNode extends PicturesNode {
  $config() {
    return this.config("gallery", {});
  }

  static clone(node: GalleryNode): GalleryNode {
    return new GalleryNode(node.__pictures, node.__format, node.__key);
  }

  static importJSON(json: SerializedPicturesNode): GalleryNode {
    return new GalleryNode().updateFromJSON(json);
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return (
      <GalleryBlock
        nodeKey={this.getKey()}
        format={this.__format}
        pictures={this.__pictures}
      />
    );
  }
}

/** Two pictures of one thing, before and after, its reader slides between. */
export class CompareNode extends PicturesNode {
  $config() {
    return this.config("compare", {});
  }

  static clone(node: CompareNode): CompareNode {
    return new CompareNode(node.__pictures, node.__format, node.__key);
  }

  static importJSON(json: SerializedPicturesNode): CompareNode {
    return new CompareNode().updateFromJSON(json);
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return (
      <CompareBlock
        nodeKey={this.getKey()}
        format={this.__format}
        pictures={this.__pictures}
      />
    );
  }
}

export function $createGalleryNode(): GalleryNode {
  return new GalleryNode();
}

export function $createCompareNode(): CompareNode {
  return new CompareNode();
}

export function $isGalleryNode(
  node: LexicalNode | null | undefined,
): node is GalleryNode {
  return node instanceof GalleryNode;
}

export function $isCompareNode(
  node: LexicalNode | null | undefined,
): node is CompareNode {
  return node instanceof CompareNode;
}
