import type { SetPicture } from "@faridalms/domain/content";
import type { CSSProperties } from "react";

import { useState } from "react";

import type { FileStrings } from "./files";

import { PictureView, StoredImage } from "./files";

export interface PicturesViewStrings {
  compareBefore: string;
  compareAfter: string;
  compareSlider: string;
}

/** A gallery's pictures in a grid, each opening large with its caption. */
export function GalleryView({
  pictures,
  url,
  strings,
  locale,
}: {
  pictures: SetPicture[];
  url: (fileId: string) => string | undefined;
  strings: FileStrings;
  locale: string;
}) {
  const shown = pictures.flatMap((picture) => {
    const src = url(picture.fileId);
    return src ? [{ ...picture, src }] : [];
  });
  if (shown.length === 0) return null;
  return (
    <ul className="fe-gallery">
      {shown.map((picture) => (
        <li key={picture.fileId}>
          <PictureView
            src={picture.src}
            alt={picture.alt}
            caption={picture.caption ?? ""}
            className=""
            strings={strings}
            locale={locale}
            cover
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Two pictures of one thing laid over each other, the reader sliding the
 * line between them with a range control, which keyboards and screen
 * readers move as well as a finger. It reads left to right in either
 * language, as the pictures do. On paper they stand side by side.
 */
export function CompareView({
  pictures,
  url,
  printed,
  strings,
}: {
  pictures: SetPicture[];
  url: (fileId: string) => string | undefined;
  printed: boolean;
  strings: PicturesViewStrings & FileStrings;
}) {
  const [split, setSplit] = useState(50);
  const [before, after] = pictures;
  const beforeSrc = before ? url(before.fileId) : undefined;
  const afterSrc = after ? url(after.fileId) : undefined;
  const labels = [
    before?.caption || strings.compareBefore,
    after?.caption || strings.compareAfter,
  ];
  if (!before || !after || !beforeSrc || !afterSrc || printed) {
    const sides = [
      before && beforeSrc
        ? { ...before, src: beforeSrc, label: labels[0] }
        : null,
      after && afterSrc ? { ...after, src: afterSrc, label: labels[1] } : null,
    ].filter((side) => side !== null);
    if (sides.length === 0) return null;
    return (
      <div className="fe-compare-printed">
        {sides.map((side) => (
          <figure key={side.fileId}>
            <StoredImage
              src={side.src}
              alt={side.alt}
              loading="lazy"
              removed={strings.fileRemoved}
              className="block h-auto w-full rounded-lg bg-muted"
            />
            <figcaption className="mt-1.5 text-center text-sm text-muted-foreground">
              {side.label}
            </figcaption>
          </figure>
        ))}
      </div>
    );
  }
  return (
    <figure
      className="fe-compare"
      dir="ltr"
      style={{ "--split": `${split}%` } as CSSProperties}
    >
      <StoredImage
        src={afterSrc}
        alt={after.alt}
        loading="lazy"
        removed={strings.fileRemoved}
        className="fe-compare-after"
      />
      <div className="fe-compare-before">
        <StoredImage
          src={beforeSrc}
          alt={before.alt}
          loading="lazy"
          removed={strings.fileRemoved}
          className="fe-compare-picture"
        />
      </div>
      <span aria-hidden className="fe-compare-line" />
      <span className="fe-compare-label" data-side="before" dir="auto">
        {labels[0]}
      </span>
      <span className="fe-compare-label" data-side="after" dir="auto">
        {labels[1]}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        aria-label={strings.compareSlider}
        aria-valuetext={`${labels[0]} ${split}%`}
        onChange={(event) => setSplit(Number(event.target.value))}
        className="fe-compare-range"
      />
    </figure>
  );
}
