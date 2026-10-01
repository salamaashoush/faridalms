import type { FileDisplay, ImageSize } from "@faridalms/domain/content";
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

import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { DecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  $getDocument,
  $getNodeByKey,
  COMMAND_PRIORITY_LOW,
  createCommand,
} from "lexical";
import { useEffect, useState } from "react";

import { useEditorEnvironment } from "../context";
import { FileCard, FileViewer } from "../files";
import { blockAlignClass, imageSizeClass } from "../format";
import { useSelectOnClick } from "./select";

// The outline goes round the block's own box, which may be narrower than
// the column, not round the full-width row that holds it.
const blockClass = {
  base: "relative my-3",
  focus:
    "[&>*]:rounded-lg [&>*]:outline-2 [&>*]:outline-offset-2 [&>*]:outline-ring",
};

export type SerializedImageNode = Spread<
  { fileId: string; alt: string; caption: string; size: ImageSize },
  SerializedDecoratorBlockNode
>;

export type SerializedFileNode = Spread<
  {
    fileId: string;
    name: string;
    mime: string;
    bytes: number;
    caption?: string;
    display?: FileDisplay;
  },
  SerializedDecoratorBlockNode
>;

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

function ImageBlock({
  nodeKey,
  format,
  fileId,
  alt,
  caption,
  size,
}: {
  nodeKey: NodeKey;
  format: ElementFormatType;
  fileId: string;
  alt: string;
  caption: string;
  size: ImageSize;
}) {
  const { strings, media } = useEditorEnvironment();
  const editable = useLexicalEditable();
  const selected = useSelectOnClick(nodeKey);
  const update = useNodeUpdate(nodeKey, $isImageNode);
  return (
    <BlockWithAlignableContents
      className={blockClass}
      format={format}
      nodeKey={nodeKey}
    >
      <figure className={`${imageSizeClass[size]} ${blockAlignClass(format)}`}>
        <img
          src={media?.url(fileId)}
          alt={alt}
          draggable={false}
          loading="lazy"
          className="block h-auto w-full rounded-lg bg-muted"
        />
        {editable ? (
          <div className="mt-1.5 grid gap-1">
            <input
              aria-label={strings.imageCaption}
              placeholder={strings.imageCaption}
              value={caption}
              maxLength={1000}
              onChange={(event) => {
                const value = event.target.value;
                update((node) => node.setCaption(value));
              }}
              className="w-full bg-transparent text-center text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60"
            />
            {selected ? (
              <input
                aria-label={strings.imageAlt}
                placeholder={strings.imageAlt}
                value={alt}
                maxLength={500}
                onChange={(event) => {
                  const value = event.target.value;
                  update((node) => node.setAlt(value));
                }}
                className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            ) : null}
          </div>
        ) : caption ? (
          <figcaption className="mt-1.5 text-center text-sm text-muted-foreground">
            {caption}
          </figcaption>
        ) : null}
      </figure>
    </BlockWithAlignableContents>
  );
}

/** Asks a file block to open its viewer, from the floating bar. */
export const OPEN_FILE_COMMAND = createCommand<NodeKey>("FARIDA_OPEN_FILE");

function FileBlock({
  nodeKey,
  format,
  fileId,
  name,
  mime,
  bytes,
  caption,
  display,
}: {
  nodeKey: NodeKey;
  format: ElementFormatType;
  fileId: string;
  name: string;
  mime: string;
  bytes: number;
  caption: string;
  display: FileDisplay;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings, media, locale } = useEditorEnvironment();
  const editable = useLexicalEditable();
  const selected = useSelectOnClick(nodeKey);
  const update = useNodeUpdate(nodeKey, $isFileNode);
  const [viewing, setViewing] = useState(false);
  useEffect(
    () =>
      editor.registerCommand(
        OPEN_FILE_COMMAND,
        (key) => {
          if (key !== nodeKey) return false;
          setViewing(true);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, nodeKey],
  );
  const url = media?.url(fileId);
  const file = { name, mime, bytes };
  return (
    <BlockWithAlignableContents
      className={blockClass}
      format={format}
      nodeKey={nodeKey}
    >
      <div onDoubleClick={() => setViewing(true)}>
        <FileCard
          file={file}
          url={url}
          display={display}
          caption={caption}
          strings={strings}
          locale={locale}
          editing={editable}
          captionField={
            editable && (selected || caption) ? (
              <input
                aria-label={strings.fileCaption}
                placeholder={strings.fileCaption}
                value={caption}
                maxLength={1000}
                dir="auto"
                onChange={(event) => {
                  const value = event.target.value;
                  update((node) => node.setCaption(value));
                }}
                className="block w-full border-t bg-transparent px-3 py-2 text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60"
              />
            ) : undefined
          }
        />
      </div>
      {url && editable ? (
        <FileViewer
          file={file}
          url={url}
          open={viewing}
          onOpenChange={setViewing}
          strings={strings}
          locale={locale}
        />
      ) : null}
    </BlockWithAlignableContents>
  );
}

export class ImageNode extends DecoratorBlockNode {
  __fileId: string;
  __alt: string;
  __caption: string;
  __size: ImageSize;

  constructor(
    fileId = "",
    alt = "",
    caption = "",
    size: ImageSize = "large",
    format?: ElementFormatType,
    key?: NodeKey,
  ) {
    super(format, key);
    this.__fileId = fileId;
    this.__alt = alt;
    this.__caption = caption;
    this.__size = size;
  }

  $config() {
    return this.config("image", { extends: DecoratorBlockNode });
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__fileId,
      node.__alt,
      node.__caption,
      node.__size,
      node.__format,
      node.__key,
    );
  }

  static importJSON(json: SerializedImageNode): ImageNode {
    return new ImageNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedImageNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__fileId = json.fileId;
    node.__alt = json.alt;
    node.__caption = json.caption;
    node.__size = json.size;
    return node;
  }

  exportJSON(): SerializedImageNode {
    const node = this.getLatest();
    return {
      ...super.exportJSON(),
      fileId: node.__fileId,
      alt: node.__alt,
      caption: node.__caption,
      size: node.__size,
    };
  }

  exportDOM(): DOMExportOutput {
    const element = $getDocument().createElement("figure");
    const caption = $getDocument().createElement("figcaption");
    caption.textContent = this.getLatest().__caption;
    element.append(caption);
    return { element };
  }

  getTextContent(): string {
    return this.getLatest().__caption;
  }

  setAlt(alt: string): this {
    const writable = this.getWritable();
    writable.__alt = alt;
    return writable;
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
      <ImageBlock
        nodeKey={this.getKey()}
        format={this.__format}
        fileId={this.__fileId}
        alt={this.__alt}
        caption={this.__caption}
        size={this.__size}
      />
    );
  }
}

export class FileNode extends DecoratorBlockNode {
  __fileId: string;
  __name: string;
  __mime: string;
  __bytes: number;
  __caption: string;
  __display: FileDisplay;

  constructor(
    fileId = "",
    name = "",
    mime = "",
    bytes = 0,
    caption = "",
    display: FileDisplay = "card",
    format?: ElementFormatType,
    key?: NodeKey,
  ) {
    super(format, key);
    this.__fileId = fileId;
    this.__name = name;
    this.__mime = mime;
    this.__bytes = bytes;
    this.__caption = caption;
    this.__display = display;
  }

  $config() {
    return this.config("file", { extends: DecoratorBlockNode });
  }

  static clone(node: FileNode): FileNode {
    return new FileNode(
      node.__fileId,
      node.__name,
      node.__mime,
      node.__bytes,
      node.__caption,
      node.__display,
      node.__format,
      node.__key,
    );
  }

  static importJSON(json: SerializedFileNode): FileNode {
    return new FileNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedFileNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__fileId = json.fileId;
    node.__name = json.name;
    node.__mime = json.mime;
    node.__bytes = json.bytes;
    node.__caption = json.caption ?? "";
    node.__display = json.display ?? "card";
    return node;
  }

  exportJSON(): SerializedFileNode {
    const node = this.getLatest();
    return {
      ...super.exportJSON(),
      fileId: node.__fileId,
      name: node.__name,
      mime: node.__mime,
      bytes: node.__bytes,
      ...(node.__caption ? { caption: node.__caption } : {}),
      ...(node.__display === "card" ? {} : { display: node.__display }),
    };
  }

  exportDOM(): DOMExportOutput {
    const element = $getDocument().createElement("p");
    element.textContent = this.getLatest().__name;
    return { element };
  }

  getTextContent(): string {
    return this.getLatest().__name;
  }

  getFile() {
    const node = this.getLatest();
    return {
      fileId: node.__fileId,
      name: node.__name,
      mime: node.__mime,
      bytes: node.__bytes,
      display: node.__display,
    };
  }

  setCaption(caption: string) {
    this.getWritable().__caption = caption;
  }

  setDisplay(display: FileDisplay) {
    this.getWritable().__display = display;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return (
      <FileBlock
        nodeKey={this.getKey()}
        format={this.__format}
        fileId={this.__fileId}
        name={this.__name}
        mime={this.__mime}
        bytes={this.__bytes}
        caption={this.__caption}
        display={this.__display}
      />
    );
  }
}

export function $createImageNode(
  fileId: string,
  alt = "",
  size: ImageSize = "full",
): ImageNode {
  return new ImageNode(fileId, alt, "", size);
}

export function $createFileNode(
  fileId: string,
  name: string,
  mime: string,
  bytes: number,
): FileNode {
  return new FileNode(fileId, name, mime, bytes);
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}

export function $isFileNode(
  node: LexicalNode | null | undefined,
): node is FileNode {
  return node instanceof FileNode;
}
