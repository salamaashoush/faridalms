import type { RefObject } from "react";

export interface StudioFrameProps {
  frame: RefObject<HTMLIFrameElement | null>;
  source: string;
  title: string;
}

/**
 * The studio's frame. The files host serves it on another site from the
 * school's, so keeping its origin gives it the storage and workers it needs
 * and nothing of ours; it may run scripts, sounds and dialogs, but never
 * navigate the page around it.
 */
export function StudioFrame({ frame, source, title }: StudioFrameProps) {
  return (
    <iframe
      ref={frame}
      src={source}
      title={title}
      allow="autoplay; camera; microphone; fullscreen"
      sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
      className="size-full border-0"
    />
  );
}
