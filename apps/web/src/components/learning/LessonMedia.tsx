import type { LessonBlock } from "@faridalms/domain/learning";
import type { MediaWatch } from "@faridalms/editor/player";

import { StoredImage } from "@faridalms/editor/files";
import { MediaPlayer } from "@faridalms/editor/media-view";

import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

const fileUrl = (fileId: string) => `/files/${fileId}`;

/** A lesson's picture, sound, video or file, with its caption and transcript. */
export function Media({
  block,
  watch,
}: {
  block: Extract<LessonBlock, { type: "media" }>;
  watch?: ((fileId: string) => MediaWatch | undefined) | undefined;
}) {
  const src = fileUrl(block.fileId);
  const captions = block.captionsFileId ? fileUrl(block.captionsFileId) : null;
  return (
    <figure className="grid gap-2">
      {block.mediaType.startsWith("video/") ||
      block.mediaType.startsWith("audio/") ? (
        <MediaPlayer
          src={src}
          captions={captions ?? undefined}
          captionsLang={block.captionsLang}
          video={block.mediaType.startsWith("video/")}
          locale={getLocale()}
          captionsLabel={m.editorCaptions()}
          watch={watch?.(block.fileId)}
          strings={{
            transcript: m.lrnTranscript(),
            transcriptSearch: m.editorTranscriptSearch(),
            transcriptNoMatch: m.editorTranscriptNoMatch(),
            chapters: m.editorChapters(),
            descriptions: m.editorDescriptions(),
          }}
        />
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
