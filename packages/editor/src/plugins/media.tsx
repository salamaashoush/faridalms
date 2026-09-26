import type { LexicalNode, NodeKey } from "lexical";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $isParagraphNode,
  COMMAND_PRIORITY_LOW,
  createCommand,
} from "lexical";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { UploadedFile } from "../context";

import { $anchorFor } from "../blocks";
import { useEditorEnvironment } from "../context";
import { $createFileNode, $createImageNode, $createMediaNode } from "../nodes";

export type MediaKind = "image" | "file" | "media";

export const INSERT_MEDIA_COMMAND = createCommand<MediaKind>(
  "FARIDA_INSERT_MEDIA",
);

function $insertUploaded(
  anchorKey: NodeKey | null,
  kind: MediaKind,
  file: UploadedFile,
): NodeKey {
  const node: LexicalNode =
    kind === "image"
      ? $createImageNode(file.fileId)
      : kind === "media"
        ? $createMediaNode(file.fileId, file.mime)
        : $createFileNode(file.fileId, file.name, file.mime, file.bytes);
  const anchor = anchorKey ? $getNodeByKey(anchorKey) : null;
  if (!anchor || !anchor.isAttached()) $getRoot().append(node);
  else if ($isParagraphNode(anchor) && anchor.getTextContentSize() === 0)
    anchor.insertBefore(node);
  else anchor.insertAfter(node);
  if (!node.getNextSibling()) node.insertAfter($createParagraphNode());
  return node.getKey();
}

export function MediaPlugin({
  onStatus,
}: {
  onStatus: (status: "idle" | "uploading" | "failed") => void;
}) {
  const [editor] = useLexicalComposerContext();
  const { media } = useEditorEnvironment();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<MediaKind>("image");
  const anchor = useRef<NodeKey | null>(null);

  const upload = async (files: File[], target: MediaKind) => {
    if (!media || files.length === 0) return;
    onStatus("uploading");
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const type: MediaKind =
          target !== "file" && media.accept[target].includes(file.type)
            ? target
            : "file";
        return { type, uploaded: await media.upload(file, type) };
      }),
    );
    editor.update(() => {
      for (const result of results) {
        if (result.status === "rejected") continue;
        const { type, uploaded } = result.value;
        anchor.current = $insertUploaded(anchor.current, type, uploaded);
      }
    });
    onStatus(
      results.some((result) => result.status === "rejected")
        ? "failed"
        : "idle",
    );
  };
  const uploadDropped = useEffectEvent((files: File[]) => {
    if (!media) return;
    const kindOf = (file: File): MediaKind =>
      media.accept.image.includes(file.type)
        ? "image"
        : media.accept.media.includes(file.type)
          ? "media"
          : "file";
    const group = (wanted: MediaKind) =>
      files.filter((file) => kindOf(file) === wanted);
    void upload(group("image"), "image")
      .then(() => upload(group("media"), "media"))
      .then(() => upload(group("file"), "file"));
  });

  useEffect(() => {
    if (!media) return undefined;
    return editor.registerCommand(
      INSERT_MEDIA_COMMAND,
      (next) => {
        anchor.current = $anchorFor("image")?.getKey() ?? null;
        setKind(next);
        queueMicrotask(() => input.current?.click());
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, media]);

  useEffect(() => {
    if (!media) return undefined;
    return editor.registerCommand(
      DRAG_DROP_PASTE,
      (files) => {
        anchor.current = $anchorFor("image")?.getKey() ?? null;
        uploadDropped(files);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, media]);

  if (!media) return null;
  return (
    <input
      ref={input}
      type="file"
      multiple
      hidden
      tabIndex={-1}
      aria-hidden
      accept={media.accept[kind].join(",")}
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        void upload(files, kind);
      }}
    />
  );
}
