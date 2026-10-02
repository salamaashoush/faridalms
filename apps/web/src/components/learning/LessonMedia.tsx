import type { LessonBlock } from "@faridalms/domain/learning";

import { StoredImage } from "@faridalms/editor/files";

import * as m from "~/i18n/messages";

const fileUrl = (fileId: string) => `/files/${fileId}`;

/** A lesson's picture, sound, video or file, with its caption and transcript. */
export function Media({
  block,
}: {
  block: Extract<LessonBlock, { type: "media" }>;
}) {
  const src = fileUrl(block.fileId);
  const captions = block.captionsFileId ? fileUrl(block.captionsFileId) : null;
  return (
    <figure className="grid gap-2">
      {block.mediaType.startsWith("video/") ? (
        <video
          controls
          preload="metadata"
          crossOrigin="anonymous"
          className="w-full rounded-lg"
        >
          <source src={src} type={block.mediaType} />
          <track
            kind="captions"
            src={captions ?? undefined}
            srcLang={block.captionsLang}
            default={Boolean(captions)}
          />
        </video>
      ) : block.mediaType.startsWith("audio/") ? (
        <audio
          controls
          preload="metadata"
          crossOrigin="anonymous"
          className="w-full"
        >
          <source src={src} type={block.mediaType} />
          <track
            kind="captions"
            src={captions ?? undefined}
            srcLang={block.captionsLang}
            default={Boolean(captions)}
          />
        </audio>
      ) : block.mediaType.startsWith("image/") ? (
        <StoredImage
          src={src}
          alt={block.caption}
          removed={m.fileRemoved()}
          className="rounded-lg"
        />
      ) : (
        <a
          href={src}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <bdi>{block.name}</bdi>
        </a>
      )}
      {block.caption ? (
        <figcaption
          dir="auto"
          className="text-[13px] leading-[18px] text-muted-foreground"
        >
          {block.caption}
        </figcaption>
      ) : null}
      {block.transcript ? (
        <details className="rounded-lg border px-4 py-2 text-sm leading-6">
          <summary className="cursor-pointer py-1 font-medium">
            {m.lrnTranscript()}
          </summary>
          <p dir="auto" className="pt-2 pb-1 whitespace-pre-wrap">
            {block.transcript}
          </p>
        </details>
      ) : null}
    </figure>
  );
}
