import type { PictureLabel } from "@faridalms/domain/content";
import type { PointerEvent, ReactNode } from "react";

import { MAX_PICTURE_LABELS } from "@faridalms/domain/content";
import { Plus, X } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import { createBlockId } from "./format";

export interface LabelEditorStrings {
  imageLabels: string;
  imageAddLabel: string;
  imageLabelTitle: string;
  imageLabelText: string;
  imageLabelMove: (number: number) => string;
  imageLabelRemove: (number: number) => string;
}

export interface LabelViewStrings {
  pictureLabel: (number: number) => string;
  pictureLabelClose: string;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 1000) / 1000;

/** How far an arrow key moves a label: a step, or a stride with Shift. */
function nudge(event: globalThis.KeyboardEvent, label: PictureLabel) {
  const step = event.shiftKey ? 0.05 : 0.01;
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const move = moves[event.key];
  return move
    ? { x: round(clamp(label.x + move[0])), y: round(clamp(label.y + move[1])) }
    : null;
}

/**
 * Numbered places on a picture as its teacher sets them: each dragged into
 * place, or moved by the arrow keys, which a picture's own left and right
 * keep whatever the page's direction. A new label starts in the middle.
 */
export function LabelsEditor({
  picture,
  labels,
  onChange,
  strings,
}: {
  picture: ReactNode;
  labels: PictureLabel[];
  onChange: (labels: PictureLabel[]) => void;
  strings: LabelEditorStrings;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const place = (event: PointerEvent) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box?.width || !box.height) return null;
    return {
      x: round(clamp((event.clientX - box.left) / box.width)),
      y: round(clamp((event.clientY - box.top) / box.height)),
    };
  };
  const change = (index: number, patch: Partial<PictureLabel>) =>
    onChange(
      labels.map((label, at) =>
        at === index ? { ...label, ...patch } : label,
      ),
    );
  // A picture block keeps its keys from the editor before React hears them,
  // so the arrows are heard on the frame itself.
  const onKey = useEffectEvent((event: globalThis.KeyboardEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const index = Number(target.dataset.label);
    const label = labels[index];
    if (!label) return;
    const at = nudge(event, label);
    if (!at) return;
    event.preventDefault();
    change(index, at);
  });
  useEffect(() => {
    const element = frame.current;
    if (!element) return undefined;
    const listener = (event: globalThis.KeyboardEvent) => onKey(event);
    element.addEventListener("keydown", listener);
    return () => element.removeEventListener("keydown", listener);
  }, []);
  return (
    <>
      <div ref={frame} className="fe-labelled">
        {picture}
        {labels.map((label, index) => {
          const shown =
            dragging?.index === index ? { ...label, ...dragging } : label;
          return (
            <button
              key={label.id}
              type="button"
              className="fe-label-marker"
              data-label={index}
              data-moving={dragging?.index === index ? "" : undefined}
              style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%` }}
              aria-label={strings.imageLabelMove(index + 1)}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging({ index, x: label.x, y: label.y });
              }}
              onPointerMove={(event) => {
                if (dragging?.index !== index) return;
                const at = place(event);
                if (at) setDragging({ index, ...at });
              }}
              onPointerUp={(event) => {
                if (dragging?.index !== index) return;
                const at = place(event);
                setDragging(null);
                if (at) change(index, at);
              }}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
      <div className="fe-label-fields">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {strings.imageLabels}
          </span>
          {labels.length < MAX_PICTURE_LABELS ? (
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
              onClick={() =>
                onChange([
                  ...labels,
                  { id: createBlockId(), x: 0.5, y: 0.5, title: "", text: "" },
                ])
              }
            >
              <Plus aria-hidden />
              {strings.imageAddLabel}
            </button>
          ) : null}
        </div>
        {labels.map((label, index) => (
          <div key={label.id} className="flex items-start gap-2">
            <span aria-hidden className="fe-label-number">
              {index + 1}
            </span>
            <div className="grid min-w-0 flex-1 gap-1">
              <input
                aria-label={`${strings.imageLabelTitle} ${index + 1}`}
                placeholder={strings.imageLabelTitle}
                value={label.title}
                maxLength={80}
                dir="auto"
                onChange={(event) =>
                  change(index, { title: event.target.value })
                }
                className="w-full rounded-md border bg-background px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <textarea
                aria-label={`${strings.imageLabelText} ${index + 1}`}
                placeholder={strings.imageLabelText}
                value={label.text}
                maxLength={500}
                rows={2}
                dir="auto"
                onChange={(event) =>
                  change(index, { text: event.target.value })
                }
                className="w-full resize-y rounded-md border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
            <button
              type="button"
              aria-label={strings.imageLabelRemove(index + 1)}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
              onClick={() => onChange(labels.filter((_, at) => at !== index))}
            >
              <X aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * A picture with numbered places its reader opens one at a time, as an
 * image-hotspot graphic does: each number is a button naming its place,
 * and what it shows opens below the picture, where a phone has room for
 * it. On paper every place is listed.
 */
export function LabelledPicture({
  picture,
  labels,
  printed,
  strings,
}: {
  picture: ReactNode;
  labels: PictureLabel[];
  printed: boolean;
  strings: LabelViewStrings;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const id = useId();
  const shown = open === null ? null : labels[open];
  const name = (label: PictureLabel, index: number) =>
    label.title || strings.pictureLabel(index + 1);
  return (
    <div className="fe-labelled-picture">
      <div className="fe-labelled">
        {picture}
        {labels.map((label, index) => (
          <button
            key={label.id}
            type="button"
            className="fe-label-marker"
            style={{ left: `${label.x * 100}%`, top: `${label.y * 100}%` }}
            aria-label={`${index + 1}. ${name(label, index)}`}
            aria-expanded={printed ? undefined : open === index}
            aria-controls={printed ? undefined : `${id}-label`}
            data-open={open === index ? "" : undefined}
            onClick={() => setOpen(open === index ? null : index)}
          >
            {index + 1}
          </button>
        ))}
      </div>
      {printed ? (
        <ol className="fe-label-list">
          {labels.map((label, index) => (
            <li key={label.id} dir="auto">
              <strong>{name(label, index)}</strong>
              {label.text ? ` ${label.text}` : null}
            </li>
          ))}
        </ol>
      ) : (
        <div id={`${id}-label`} aria-live="polite">
          {shown && open !== null ? (
            <div className="fe-label-card">
              <span aria-hidden className="fe-label-number">
                {open + 1}
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5" dir="auto">
                <strong>{name(shown, open)}</strong>
                {shown.text ? <p>{shown.text}</p> : null}
              </div>
              <button
                type="button"
                aria-label={strings.pictureLabelClose}
                className="fe-label-close"
                onClick={() => setOpen(null)}
              >
                <X aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
