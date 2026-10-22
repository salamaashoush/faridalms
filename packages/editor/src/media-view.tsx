import type { Chapter } from "@faridalms/domain/chapters";
import type { EmbedProvider } from "@faridalms/domain/embed";
import type { Ref } from "react";

import {
  embedAspect,
  embedProviderNames,
  embedSource,
} from "@faridalms/domain/embed";
import { Play } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  MediaWatch,
  PlayerCaptions,
  PlayerClock,
  TranscriptStrings,
} from "./player";

import {
  AudioBar,
  FramedVideo,
  PlayerFrame,
  StartMark,
  VideoSurface,
} from "./player";

export function MediaPlayer({
  src,
  captions,
  captionsLang,
  video,
  locale,
  captionsLabel,
  element,
  watch,
  strings,
  chapters,
}: {
  src: string | undefined;
  captions: string | undefined;
  /** The captions' language, when it is not the page's. */
  captionsLang?: string | undefined;
  video: boolean;
  /** The page's language, which the player's labels follow. */
  locale: string;
  captionsLabel: string;
  element?: Ref<HTMLVideoElement & HTMLAudioElement>;
  /** Counts what a student plays, where watching a lesson's recordings counts. */
  watch?: MediaWatch | undefined;
  /** With captions, a transcript a student can follow, search and jump from. */
  strings?: TranscriptStrings | undefined;
  /** A video's chapters, on its timeline and in a list to play from. */
  chapters?: readonly Chapter[] | undefined;
}) {
  if (!src) return null;
  const track = captions
    ? { src: captions, lang: captionsLang || locale, label: captionsLabel }
    : null;
  return video ? (
    <StreamingVideo
      src={src}
      captions={track}
      locale={locale}
      element={element}
      watch={watch}
      strings={strings}
      chapters={chapters}
    />
  ) : (
    <AudioBar
      src={src}
      captions={track}
      locale={locale}
      element={element}
      watch={watch}
      strings={strings}
    />
  );
}

/** A school's own upload, which may have adaptive streams beside it. */
const UPLOAD = /^\/files\/[0-9a-f-]{36}$/;

interface Stream {
  master: string;
  poster: string;
  thumbnails: string | null;
}

/**
 * A video that plays its adaptive streams once the media service has made
 * them, and the upload as it is until then. Which one is settled before
 * anything plays, so a playing video never switches.
 */
function StreamingVideo({
  src,
  captions,
  locale,
  element,
  watch,
  strings,
  chapters,
}: {
  src: string;
  captions: PlayerCaptions | null;
  locale: string;
  element?: Ref<HTMLVideoElement>;
  watch?: MediaWatch | undefined;
  strings?: TranscriptStrings | undefined;
  chapters?: readonly Chapter[] | undefined;
}) {
  const [source, setSource] = useState<
    { stream: Stream } | { upload: string } | null
  >(UPLOAD.test(src) ? null : { upload: src });

  useEffect(() => {
    let cancelled = false;
    if (UPLOAD.test(src))
      fetch(`${src}/stream`)
        .then((response) => (response.ok ? response.json() : null))
        .then(
          (
            found: {
              master?: string | null;
              poster?: string;
              thumbnails?: string;
            } | null,
          ) => {
            if (cancelled) return;
            setSource(
              found?.master && found.poster
                ? {
                    stream: {
                      master: found.master,
                      poster: found.poster,
                      thumbnails: found.thumbnails ?? null,
                    },
                  }
                : { upload: src },
            );
          },
        )
        .catch(() => {
          if (!cancelled) setSource({ upload: src });
        });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!source) return <PlayerFrame />;
  const stream = "stream" in source ? source.stream : null;
  return (
    <VideoSurface
      src={"upload" in source ? source.upload : null}
      stream={stream?.master ?? null}
      poster={stream?.poster ?? null}
      thumbnails={stream?.thumbnails ?? null}
      captions={captions}
      locale={locale}
      element={element}
      watch={watch}
      strings={strings}
      chapters={chapters}
    />
  );
}

/** What a recording says, for readers who cannot hear it, folded away. */
export function MediaTranscript({
  text,
  label,
}: {
  text: string | undefined;
  label: string;
}) {
  if (!text) return null;
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      <p dir="auto" className="mt-1.5 whitespace-pre-line text-foreground">
        {text}
      </p>
    </details>
  );
}

/**
 * Another service's page in the document, loaded only once the reader
 * chooses to, since loading it tells that service they are here. A YouTube
 * or Vimeo video then plays through the school's own player.
 */
export function EmbedFrame({
  provider,
  embedId,
  loadLabel,
  privacy,
  locale,
  watch,
  chapters,
  chaptersLabel,
  element,
}: {
  provider: EmbedProvider;
  embedId: string;
  loadLabel: string;
  privacy: string;
  locale: string;
  watch?: MediaWatch | undefined;
  chapters?: readonly Chapter[] | undefined;
  chaptersLabel?: string | undefined;
  element?: ((clock: PlayerClock | null) => void) | undefined;
}) {
  const [loaded, setLoaded] = useState(false);
  const name = embedProviderNames[provider];
  if (loaded && (provider === "youtube" || provider === "vimeo"))
    return (
      <FramedVideo
        source={{ provider, id: embedId }}
        locale={locale}
        watch={watch}
        chapters={chapters}
        label={chaptersLabel}
        element={element}
      />
    );
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border bg-muted/40"
      style={{ aspectRatio: embedAspect(provider) }}
    >
      {loaded ? (
        <iframe
          src={embedSource({ provider, embedId })}
          title={name}
          loading="lazy"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setLoaded(true)}
          className="group absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg p-4 text-center outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <StartMark>
            <Play className="translate-x-px fill-current" aria-hidden />
          </StartMark>
          <span className="text-sm font-medium">{loadLabel}</span>
          <span className="max-w-sm text-[13px] leading-[18px] text-muted-foreground">
            {privacy}
          </span>
        </button>
      )}
    </div>
  );
}
