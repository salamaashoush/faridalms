import type { CommonsFile, PictureCredit } from "@faridalms/domain/commons";
import type { LexicalNode, NodeKey } from "lexical";

import {
  commonsFile,
  commonsInfoUrl,
  commonsPicture,
} from "@faridalms/domain/commons";
import { attachable, maxBytesFor, mediaTypeFor } from "@faridalms/domain/file";
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
import { RotateCcw, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { LibraryChoice, UploadedFile } from "../context";
import type { EditorStrings } from "../strings";
import type { TakeTrim } from "../video-recorder";

import { $anchorFor } from "../blocks";
import { useEditorEnvironment } from "../context";
import { fileMeta } from "../files";
import { $createFileNode, $createImageNode, $createMediaNode } from "../nodes";
import { editorInSlot } from "../slots";
import { VideoRecorder } from "../video-recorder";

export type MediaKind = "image" | "file" | "media";

export const INSERT_MEDIA_COMMAND = createCommand<MediaKind>(
  "FARIDA_INSERT_MEDIA",
);

/** Brings in a picture from Wikimedia Commons or Wikipedia by its link, with its credit. */
export const INSERT_COMMONS_COMMAND = createCommand<{
  link: string;
  anchor: NodeKey | null;
}>("FARIDA_INSERT_COMMONS");

/** Opens the studio to record a video, which lands where the caret is. */
export const RECORD_VIDEO_COMMAND = createCommand<undefined>(
  "FARIDA_RECORD_VIDEO",
);

/** What a picture from an open collection or the school's library brings with it. */
interface Described {
  alt: string;
  credit?: PictureCredit | undefined;
}

function $insertUploaded(
  anchorKey: NodeKey | null,
  kind: MediaKind,
  file: UploadedFile,
  described?: Described,
): NodeKey {
  const node: LexicalNode =
    kind === "image"
      ? $createImageNode(file.fileId, described?.alt).setCredit(
          described?.credit ?? null,
        )
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

interface Upload {
  id: string;
  file: File;
  kind: MediaKind;
  progress: number;
  error: string | null;
  controller: AbortController;
  /** The part of a recording to keep, when its maker cut its ends off. */
  trim?: TakeTrim | undefined;
  described?: Described | undefined;
}

/** The reason a refused upload shows, from the server's code or the file itself. */
function refusal(code: string, strings: EditorStrings): string {
  switch (code) {
    case "file.too_large":
      return strings.uploadTooLarge;
    case "file.wrong_type":
      return strings.uploadWrongType;
    case "file.empty":
      return strings.uploadEmpty;
    case "file.infected":
      return strings.uploadInfected;
    case "file.content_mismatch":
      return strings.uploadMismatch;
    case "file.scan_unavailable":
      return strings.uploadUnchecked;
    case "file.quota_school":
      return strings.uploadNoRoom("school");
    case "file.quota_class":
      return strings.uploadNoRoom("class");
    case "file.quota_module":
      return strings.uploadNoRoom("module");
    case "file.quota_person":
      return strings.uploadNoRoom("person");
    default:
      return strings.uploadFailed;
  }
}

function precheck(file: File): string | null {
  if (file.size === 0) return "file.empty";
  // What an editor takes in becomes its document's media.
  if (
    file.size >
    maxBytesFor("document_media", mediaTypeFor(file.name) ?? file.type)
  )
    return "file.too_large";
  if (!attachable(file.name)) return "file.wrong_type";
  return null;
}

/**
 * Pictures, sound, video and files dropped, pasted or chosen. Each shows
 * its progress below the text while it uploads and lands where it was put
 * once stored; one that fails says why and can be tried again or removed.
 */
export function MediaPlugin({
  onBusyChange,
}: {
  /** Whether files are still uploading, so publishing can wait for them. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const { media, strings, locale } = useEditorEnvironment();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<MediaKind>("image");
  const anchor = useRef<NodeKey | null>(null);
  const slot = useRef<string | undefined>(undefined);
  useEffect(() => {
    slot.current = editor.getRootElement()?.id;
  });
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [recording, setRecording] = useState(false);
  // Asked once the studio opens: only a school with a media service cuts.
  const [trims, setTrims] = useState(false);
  useEffect(() => {
    if (!recording || !media?.canTrim) return undefined;
    let asked = true;
    media.canTrim().then(
      (can) => {
        if (asked) setTrims(can);
      },
      () => undefined,
    );
    return () => {
      asked = false;
    };
  }, [recording, media]);

  const patch = (id: string, change: Partial<Upload>) =>
    setUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );

  const run = async (item: Upload) => {
    if (!media) return;
    const early = precheck(item.file);
    if (early) {
      patch(item.id, { error: refusal(early, strings) });
      return;
    }
    try {
      const uploaded = await media.upload(item.file, item.kind, {
        signal: item.controller.signal,
        onProgress: (progress) => patch(item.id, { progress }),
        ...(item.trim ? { trim: item.trim } : {}),
      });
      // A new document's editor starts again when it is first saved; the file
      // goes into the editor showing the document by then.
      const showing = editorInSlot(slot.current) ?? editor;
      showing.update(() => {
        anchor.current = $insertUploaded(
          showing === editor ? anchor.current : null,
          item.kind,
          uploaded,
          item.described,
        );
      });
      setUploads((current) => current.filter((row) => row.id !== item.id));
    } catch (error) {
      if (item.controller.signal.aborted) return;
      patch(item.id, {
        error: refusal(error instanceof Error ? error.message : "", strings),
      });
    }
  };

  const start = (
    files: File[],
    kindOf: (file: File) => MediaKind,
    trim?: TakeTrim,
    described?: Described,
  ) => {
    const added = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      kind: kindOf(file),
      trim,
      described,
      progress: 0,
      error: null,
      controller: new AbortController(),
    }));
    setUploads((current) => [...current, ...added]);
    void added.reduce(
      (previous, item) => previous.then(() => run(item)),
      Promise.resolve(),
    );
  };

  const kindFor = (target: MediaKind) => (file: File) => {
    if (!media) return "file" as MediaKind;
    if (media.accept.image.includes(file.type) && target !== "file")
      return "image";
    if (media.accept.media.includes(file.type) && target !== "file")
      return "media";
    return "file";
  };

  const uploadDropped = useEffectEvent((files: File[]) =>
    start(files, kindFor("image")),
  );

  // A picture from Commons is copied into the school, as any other is, so a
  // lesson never depends on the collection; its credit comes with it.
  const bringCommons = useEffectEvent(async (link: CommonsFile) => {
    const name = link.title.replace(/^File:/u, "");
    try {
      const answer: unknown = await (
        await fetch(commonsInfoUrl(link, locale))
      ).json();
      const found = commonsPicture(answer, locale);
      if (!found) throw new Error("commons.missing");
      const response = await fetch(found.image);
      if (!response.ok) throw new Error("commons.missing");
      const blob = await response.blob();
      const extension =
        blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1];
      start(
        [
          new File(
            [blob],
            `${name.replace(/\.\w+$/u, "")}.${extension ?? "jpg"}`,
            {
              type: blob.type,
            },
          ),
        ],
        () => "image",
        undefined,
        { alt: found.alt, credit: found.credit },
      );
    } catch {
      setUploads((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          file: new File([], name),
          kind: "image",
          progress: 0,
          error: strings.commonsFailed,
          controller: new AbortController(),
        },
      ]);
    }
  });

  const busy = uploads.some((item) => !item.error);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    if (!busy) return undefined;
    const leave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [busy]);

  // Chosen from the library, files land where the block was asked for, in
  // the order chosen, as uploads do.
  const placeChosen = useEffectEvent(
    (target: MediaKind, chosen: LibraryChoice[]) => {
      const showing = editorInSlot(slot.current) ?? editor;
      showing.update(() => {
        for (const item of chosen)
          anchor.current = $insertUploaded(
            showing === editor ? anchor.current : null,
            target,
            item,
            target === "image"
              ? { alt: item.alt, credit: item.credit }
              : undefined,
          );
      });
    },
  );

  useEffect(() => {
    if (!media) return undefined;
    return editor.registerCommand(
      INSERT_MEDIA_COMMAND,
      (next) => {
        anchor.current = $anchorFor("image")?.getKey() ?? null;
        setKind(next);
        const library = media.library;
        if (!library) {
          queueMicrotask(() => input.current?.click());
          return true;
        }
        library
          .choose(next, {
            multiple: true,
            upload: () => input.current?.click(),
          })
          .then(
            (chosen) => {
              if (chosen?.length) placeChosen(next, chosen);
            },
            () => undefined,
          );
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, media]);

  useEffect(() => {
    if (!media) return undefined;
    return editor.registerCommand(
      INSERT_COMMONS_COMMAND,
      ({ link, anchor: at }) => {
        const file = commonsFile(link);
        if (!file) return false;
        anchor.current = at;
        void bringCommons(file);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, media]);

  useEffect(() => {
    if (!media) return undefined;
    return editor.registerCommand(
      RECORD_VIDEO_COMMAND,
      () => {
        anchor.current = $anchorFor("image")?.getKey() ?? null;
        setRecording(true);
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
  const button =
    "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium hover:bg-accent [&_svg]:size-4";
  return (
    <>
      <VideoRecorder
        open={recording}
        onOpenChange={setRecording}
        strings={strings.videoRecorder}
        locale={locale}
        trim={trims}
        onKeep={(file, _seconds, cut) => start([file], () => "media", cut)}
      />
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
          start(files, kindFor(kind));
        }}
      />
      {uploads.length > 0 ? (
        <ul className="grid gap-2 px-1 pb-4" aria-label={strings.uploading}>
          {uploads.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2"
            >
              <div className="grid min-w-0 flex-1 gap-1">
                <span className="flex items-baseline gap-2 text-sm">
                  <span className="truncate font-medium">
                    <bdi>{item.file.name}</bdi>
                  </span>
                  {/* A picture never fetched has nothing to measure. */}
                  {item.file.size > 0 || !item.error ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fileMeta(
                        {
                          name: item.file.name,
                          mime: item.file.type,
                          bytes: item.file.size,
                        },
                        locale,
                      )}
                    </span>
                  ) : null}
                </span>
                {item.error ? (
                  <span role="alert" className="text-xs text-destructive">
                    {item.error}
                  </span>
                ) : (
                  <progress
                    aria-label={`${strings.uploading} ${item.file.name}`}
                    max={100}
                    value={Math.round(item.progress * 100)}
                    className="block h-1 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
                  />
                )}
              </div>
              {item.error ? (
                <>
                  {precheck(item.file) ? null : (
                    <button
                      type="button"
                      className={button}
                      onClick={() => {
                        const retried = {
                          ...item,
                          error: null,
                          progress: 0,
                          controller: new AbortController(),
                        };
                        setUploads((current) =>
                          current.map((row) =>
                            row.id === item.id ? retried : row,
                          ),
                        );
                        void run(retried);
                      }}
                    >
                      <RotateCcw aria-hidden />
                      {strings.retryUpload}
                    </button>
                  )}
                  <button
                    type="button"
                    className={button}
                    onClick={() =>
                      setUploads((current) =>
                        current.filter((row) => row.id !== item.id),
                      )
                    }
                  >
                    {strings.removeUpload}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  aria-label={`${strings.cancelUpload}: ${item.file.name}`}
                  className={button}
                  onClick={() => {
                    item.controller.abort();
                    setUploads((current) =>
                      current.filter((row) => row.id !== item.id),
                    );
                  }}
                >
                  <X aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
