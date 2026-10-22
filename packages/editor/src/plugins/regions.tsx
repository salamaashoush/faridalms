import {
  MAX_HOTSPOTS,
  MAX_PLACE_NAME,
  MAX_PLACES,
} from "@faridalms/domain/learning";
import { Check, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { useRef, useState } from "react";

import type { PicturePlace } from "../nodes/question";

import { useEditorEnvironment } from "../context";

/** A place on the picture: left, top, width and height across a unit square. */
export type Region = [number, number, number, number];

interface Place {
  box: Region;
  name: string;
  correct: boolean;
}

// A place smaller than this is a slip of the mouse, not something to find.
const SMALLEST = 0.03;

const button =
  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 max-md:h-10 [&_svg]:size-4";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const boxOf = (a: [number, number], b: [number, number]): Region => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.abs(a[0] - b[0]),
  Math.abs(a[1] - b[1]),
];

const badge = (correct: boolean) =>
  `grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold shadow ${
    correct
      ? "bg-primary text-primary-foreground"
      : "bg-muted-foreground text-background"
  }`;

/**
 * Where a teacher marks the places in a picture: a box dragged over each
 * thing children should find and over a few things they should not, each
 * named. Children never see the boxes; they tap the picture, or choose a
 * place by its name from the keyboard or a screen reader, which is why the
 * other places are there. For a picture to label, every place is one to
 * label and its name is the label.
 */
export function RegionPad({
  src,
  alt,
  places: initial,
  labels = false,
  onDone,
  onClose,
}: {
  src: string;
  alt: string;
  places: readonly PicturePlace[];
  labels?: boolean;
  onDone: (places: PicturePlace[]) => void;
  onClose: () => void;
}) {
  const { strings } = useEditorEnvironment();
  const [places, setPlaces] = useState<Place[]>(() =>
    initial.map(
      ({ box: [left = 0, top = 0, width = 0, height = 0], ...rest }) => ({
        ...rest,
        box: [left, top, width, height],
      }),
    ),
  );
  const [from, setFrom] = useState<[number, number] | null>(null);
  const [to, setTo] = useState<[number, number] | null>(null);
  const pad = useRef<SVGSVGElement>(null);
  const finds = places.filter((place) => place.correct).length;
  const full = places.length >= MAX_PLACES;

  const at = (event: React.PointerEvent): [number, number] => {
    const box = pad.current?.getBoundingClientRect();
    if (!box) return [0, 0];
    return [
      clamp((event.clientX - box.left) / box.width),
      clamp((event.clientY - box.top) / box.height),
    ];
  };
  const drawing = from && to ? boxOf(from, to) : null;
  const change = (index: number, patch: Partial<Place>) =>
    setPlaces(
      places.map((place, each) =>
        each === index ? { ...place, ...patch } : place,
      ),
    );
  const escape = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onClose();
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-2">
        <div className="grid flex-1 gap-0.5">
          <p className="text-sm leading-5 font-medium">
            {labels ? strings.questionMarkLabels : strings.questionMarkPlaces}
          </p>
          <p className="text-xs leading-4 text-muted-foreground">
            {labels
              ? strings.questionMarkLabelsHint
              : strings.questionMarkPlacesHint}
          </p>
        </div>
        <button
          type="button"
          aria-label={strings.narrationClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-10"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg border bg-background">
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="block max-h-64 w-auto max-w-full"
        />
        <svg
          ref={pad}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          aria-hidden
          className={`absolute inset-0 size-full touch-none ${full ? "cursor-not-allowed" : "cursor-crosshair"}`}
          onPointerDown={(event) => {
            if (!event.isPrimary || full) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const point = at(event);
            setFrom(point);
            setTo(point);
          }}
          onPointerMove={(event) => {
            if (from) setTo(at(event));
          }}
          onPointerUp={() => {
            if (drawing && drawing[2] >= SMALLEST && drawing[3] >= SMALLEST)
              setPlaces([
                ...places,
                {
                  box: drawing,
                  name: "",
                  correct: labels || finds < MAX_HOTSPOTS,
                },
              ]);
            setFrom(null);
            setTo(null);
          }}
          onPointerCancel={() => {
            setFrom(null);
            setTo(null);
          }}
        >
          {[
            ...places,
            ...(drawing ? [{ box: drawing, name: "", correct: true }] : []),
          ].map((place, index) => (
            <rect
              key={index}
              x={place.box[0]}
              y={place.box[1]}
              width={place.box[2]}
              height={place.box[3]}
              rx={0.02}
              fill="currentColor"
              fillOpacity={place.correct ? 0.15 : 0.08}
              stroke="currentColor"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              className={
                index >= places.length
                  ? "text-info"
                  : place.correct
                    ? "text-primary"
                    : "text-muted-foreground"
              }
            />
          ))}
        </svg>
        {places.map((place, index) => (
          <span
            key={index}
            aria-hidden
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 ${badge(place.correct)}`}
            style={{
              left: `${place.box[0] * 100}%`,
              top: `${place.box[1] * 100}%`,
            }}
          >
            {index + 1}
          </span>
        ))}
      </div>
      {places.length > 0 ? (
        <ol className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto">
          {places.map((place, index) => (
            <li key={index} className="flex min-w-0 items-center gap-2">
              <span aria-hidden className={badge(place.correct)}>
                {index + 1}
              </span>
              <input
                type="text"
                dir="auto"
                value={place.name}
                maxLength={MAX_PLACE_NAME}
                aria-label={
                  labels
                    ? strings.questionLabelName(index + 1)
                    : strings.questionPlaceName(index + 1)
                }
                placeholder={
                  labels
                    ? strings.questionLabelNameHint
                    : strings.questionPlaceNameHint
                }
                onChange={(event) =>
                  change(index, { name: event.target.value })
                }
                onKeyDown={escape}
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 max-md:h-10"
              />
              {labels ? null : (
                <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={place.correct}
                    disabled={!place.correct && finds >= MAX_HOTSPOTS}
                    onChange={() => change(index, { correct: !place.correct })}
                    onKeyDown={escape}
                    className="size-4 accent-primary"
                  />
                  {strings.questionPlaceToFind}
                </label>
              )}
              <button
                type="button"
                aria-label={strings.questionPlaceRemove(index + 1)}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-10 [&_svg]:size-4"
                onClick={() =>
                  setPlaces(places.filter((_, each) => each !== index))
                }
              >
                <Trash2 aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      <p className="text-xs leading-4 text-muted-foreground">
        {labels
          ? strings.questionLabelsCount(places.length)
          : strings.questionPlacesCount(finds, places.length - finds)}
      </p>
      <div className="-ms-2.5 flex flex-wrap items-center gap-1">
        <button
          type="button"
          className={button}
          disabled={places.length === 0}
          onClick={() => setPlaces(places.slice(0, -1))}
        >
          <Undo2 aria-hidden />
          {strings.questionPlaceUndo}
        </button>
        <button
          type="button"
          className={button}
          disabled={places.length === 0}
          onClick={() => setPlaces([])}
        >
          <RotateCcw aria-hidden />
          {strings.questionTraceClear}
        </button>
        <button
          type="button"
          className={`${button} ms-auto bg-primary text-primary-foreground hover:bg-primary/90`}
          onClick={() =>
            onDone(
              places.map((place) => ({
                box: [...place.box],
                name: place.name.trim(),
                correct: place.correct,
              })),
            )
          }
        >
          <Check aria-hidden />
          {strings.questionDone}
        </button>
      </div>
    </div>
  );
}
