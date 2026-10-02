import { Check, RotateCcw, Undo2, X } from "lucide-react";
import { useRef, useState } from "react";

import { useEditorEnvironment } from "../context";

/** A place on the picture: left, top, width and height across a unit square. */
export type Region = [number, number, number, number];

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

/**
 * Where a teacher marks what children should find in a picture: a box
 * dragged over each thing, numbered in the order it was marked. Children
 * never see the boxes; they tap the picture and each box they hit is found.
 */
export function RegionPad({
  src,
  alt,
  regions: initial,
  onDone,
  onClose,
}: {
  src: string;
  alt: string;
  regions: readonly Region[];
  onDone: (regions: Region[]) => void;
  onClose: () => void;
}) {
  const { strings } = useEditorEnvironment();
  const [regions, setRegions] = useState<Region[]>([...initial]);
  const [from, setFrom] = useState<[number, number] | null>(null);
  const [to, setTo] = useState<[number, number] | null>(null);
  const pad = useRef<SVGSVGElement>(null);

  const at = (event: React.PointerEvent): [number, number] => {
    const box = pad.current?.getBoundingClientRect();
    if (!box) return [0, 0];
    return [
      clamp((event.clientX - box.left) / box.width),
      clamp((event.clientY - box.top) / box.height),
    ];
  };
  const drawing = from && to ? boxOf(from, to) : null;

  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-2">
        <div className="grid flex-1 gap-0.5">
          <p className="text-sm leading-5 font-medium">
            {strings.questionMarkPlaces}
          </p>
          <p className="text-xs leading-4 text-muted-foreground">
            {strings.questionMarkPlacesHint}
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
          className="absolute inset-0 size-full touch-none"
          onPointerDown={(event) => {
            if (!event.isPrimary) return;
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
              setRegions([...regions, drawing]);
            setFrom(null);
            setTo(null);
          }}
          onPointerCancel={() => {
            setFrom(null);
            setTo(null);
          }}
        >
          {[...regions, ...(drawing ? [drawing] : [])].map((region, index) => (
            <rect
              key={index}
              x={region[0]}
              y={region[1]}
              width={region[2]}
              height={region[3]}
              rx={0.02}
              fill="currentColor"
              fillOpacity={0.15}
              stroke="currentColor"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              className={index < regions.length ? "text-primary" : "text-info"}
            />
          ))}
        </svg>
        {regions.map((region, index) => (
          <span
            key={index}
            aria-hidden
            className="pointer-events-none absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow"
            style={{ left: `${region[0] * 100}%`, top: `${region[1] * 100}%` }}
          >
            {index + 1}
          </span>
        ))}
      </div>
      <p className="text-xs leading-4 text-muted-foreground">
        {strings.questionPlacesMarked(regions.length)}
      </p>
      <div className="-ms-2.5 flex flex-wrap items-center gap-1">
        <button
          type="button"
          className={button}
          disabled={regions.length === 0}
          onClick={() => setRegions(regions.slice(0, -1))}
        >
          <Undo2 aria-hidden />
          {strings.questionPlaceUndo}
        </button>
        <button
          type="button"
          className={button}
          disabled={regions.length === 0}
          onClick={() => setRegions([])}
        >
          <RotateCcw aria-hidden />
          {strings.questionTraceClear}
        </button>
        <button
          type="button"
          className={`${button} ms-auto bg-primary text-primary-foreground hover:bg-primary/90`}
          onClick={() => onDone(regions)}
        >
          <Check aria-hidden />
          {strings.questionDone}
        </button>
      </div>
    </div>
  );
}
