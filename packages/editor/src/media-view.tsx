import type { EmbedProvider } from "@faridalms/domain/embed";

import {
  embedAspect,
  embedProviderNames,
  embedSource,
} from "@faridalms/domain/embed";
import { Play } from "lucide-react";
import { useState } from "react";

export function MediaPlayer({
  src,
  captions,
  video,
  locale,
  captionsLabel,
}: {
  src: string | undefined;
  captions: string | undefined;
  video: boolean;
  locale: string;
  captionsLabel: string;
}) {
  if (!src) return null;
  return video ? (
    <video
      controls
      preload="metadata"
      src={src}
      className="block aspect-video w-full rounded-lg bg-black"
    >
      <track
        kind="captions"
        src={captions}
        srcLang={locale}
        label={captionsLabel}
        default={Boolean(captions)}
      />
    </video>
  ) : (
    <audio controls preload="metadata" src={src} className="block w-full">
      <track
        kind="captions"
        src={captions}
        srcLang={locale}
        label={captionsLabel}
        default={Boolean(captions)}
      />
    </audio>
  );
}

export function EmbedFrame({
  provider,
  embedId,
  loadLabel,
  privacy,
}: {
  provider: EmbedProvider;
  embedId: string;
  loadLabel: string;
  privacy: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const name = embedProviderNames[provider];
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
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground text-background shadow-md">
            <Play className="size-5 translate-x-px" aria-hidden />
          </span>
          <span className="text-sm font-medium">{loadLabel}</span>
          <span className="max-w-sm text-xs text-muted-foreground">
            {privacy}
          </span>
        </button>
      )}
    </div>
  );
}
