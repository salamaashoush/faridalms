import type { CheckView, StudentBlock } from "@faridalms/domain/learning";

import { textDirection } from "@faridalms/domain/content";
import { StoredImage } from "@faridalms/editor/files";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { useMutation } from "@tanstack/react-query";
import { Check, Eye } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { CheckDriver } from "../Checks";

import { sayAloud } from "../ReadAloud";
import { hop, shake } from "./motion";
import { playSound } from "./sounds";
import { outcomeWords, YoungOutcome } from "./YoungChoice";

type Counting = Extract<StudentBlock, { type: "counting" }>;

/** A number between 0 and 1 from a seed, the same each time for the same seed. */
function seeded(seed: string) {
  let state = 0;
  for (const char of seed)
    state = (Math.imul(state, 31) + char.charCodeAt(0)) | 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 2246822507) + 0x9e3779b9) | 0;
    return ((state >>> 0) % 100000) / 100000;
  };
}

/**
 * Places for things scattered over a picture: cells of a loose grid, a few
 * left empty, each nudged off its centre, so nothing overlaps and the layout
 * stays the same every time the question is shown.
 */
function scatter(count: number, seed: string) {
  const random = seeded(seed);
  const columns = Math.ceil(Math.sqrt(count * 1.6));
  const rows = Math.ceil(count / columns) + 1;
  const cells = Array.from({ length: columns * rows }, (_, index) => index);
  for (let index = cells.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [cells[index], cells[other]] = [cells[other] ?? 0, cells[index] ?? 0];
  }
  return cells.slice(0, count).map((cell) => ({
    x: ((cell % columns) + 0.25 + random() * 0.5) / columns,
    y: (Math.floor(cell / columns) + 0.25 + random() * 0.5) / rows,
    size: 1 / Math.max(columns, rows),
  }));
}

/** One thing to count: the teacher's picture, or a round counter. */
function Thing({ block }: { block: Counting }) {
  return block.picture ? (
    <StoredImage
      src={`/files/${block.picture.fileId}`}
      alt=""
      removed={m.fileRemoved()}
      draggable={false}
      className="size-full object-contain"
    />
  ) : (
    <span aria-hidden className="block size-[70%] rounded-full bg-primary" />
  );
}

/** Says a number aloud in the question's language, as a child counts along. */
const sayNumber = (count: number, prompt: string) =>
  sayAloud(
    new Intl.NumberFormat(textDirection(prompt) === "rtl" ? "ar" : "en").format(
      count,
    ),
    null,
  );

/** Ten frames: rows of five cells, as many frames as the count needs. */
function Frames({
  total,
  filled,
  render,
}: {
  total: number;
  filled: number;
  render: (index: number) => React.ReactNode;
}) {
  const frames = Math.max(1, Math.ceil(total / 10));
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {Array.from({ length: frames }, (_, frame) => (
        <div
          key={frame}
          className="grid grid-cols-5 gap-1.5 rounded-2xl border-4 border-foreground/70 bg-card p-1.5"
        >
          {Array.from({ length: 10 }, (_cell, cell) => {
            const index = frame * 10 + cell;
            return (
              <div
                key={cell}
                className={cn(
                  "grid size-14 place-items-center rounded-lg border-2 border-dashed border-foreground/25 sm:size-16",
                  index < filled && "border-solid border-transparent",
                )}
              >
                {index < filled ? render(index) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Counting as young children do it. Asked how many, they tap each thing as
 * they count it, hearing its number, then tap the number they reached; a
 * glimpse setting hides the things after a few seconds, for seeing a small
 * number at once (Development Matters: "quickly revealing and hiding").
 * Asked to make a number, they fill ten frames one tap at a time and check.
 */
export function YoungCounting({
  block,
  view,
  driver,
}: {
  block: Counting;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const [counted, setCounted] = useState<number[]>([]);
  const [tried, setTried] = useState<number[]>([]);
  const [made, setMade] = useState(
    view?.response?.type === "counting" ? view.response.value : 0,
  );
  const [hidden, setHidden] = useState(false);
  const [chosen, setChosen] = useState<number | null>(
    view?.response?.type === "counting" ? view.response.value : null,
  );
  const tiles = useRef(new Map<number, HTMLElement>());
  const board = useRef<HTMLDivElement>(null);
  const respond = useMutation({
    mutationFn: (value: number) =>
      driver.respond(block.id, { type: "counting", value }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const reveal = useMutation({
    mutationFn: () => driver.reveal(block.id),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const settled = Boolean(view && (view.correct || view.revealed));
  const tries = view?.tries ?? 0;
  const places = useMemo(
    () => scatter(block.count, block.id),
    [block.count, block.id],
  );
  const praise =
    block.mode === "make"
      ? m.lrnYoungMade({ count: formatNumber(block.count) })
      : m.lrnYoungCounted({ count: formatNumber(block.count) });

  // A glimpse: the things show for a few seconds, then hide behind a cover.
  useEffect(() => {
    if (!block.flashSeconds || hidden) return undefined;
    const timer = setTimeout(() => setHidden(true), block.flashSeconds * 1000);
    return () => clearTimeout(timer);
  }, [block.flashSeconds, hidden]);

  const answered = useEffectEvent(() => {
    if (!view) return;
    if (view.correct) {
      playSound("right");
      hop(chosen === null ? board.current : tiles.current.get(chosen));
    } else {
      playSound("wrong");
      shake(
        block.mode === "make"
          ? board.current
          : chosen === null
            ? null
            : tiles.current.get(chosen),
      );
      if (block.mode === "count" && !view.revealed && view.tries >= 3)
        reveal.mutate();
    }
    sayAloud(outcomeWords(view, praise, false), null);
  });
  useEffect(() => {
    if (tries > 0) answered();
  }, [tries]);

  const highest = block.count > 10 ? 20 : 10;
  const rightValue = view?.key ? Number(view.key[0]) : null;

  const countOne = (index: number) => {
    if (counted.includes(index) || settled) return;
    const next = [...counted, index];
    setCounted(next);
    playSound("tap");
    sayNumber(next.length, block.prompt);
  };

  return (
    <div className="grid gap-6">
      {block.mode === "count" ? (
        <>
          <div ref={board} className="relative">
            {block.layout === "frame" ? (
              <Frames
                total={block.count}
                filled={block.count}
                render={(index) => (
                  <CountButton
                    index={index}
                    counted={counted}
                    onCount={countOne}
                    block={block}
                    className="size-full"
                  />
                )}
              />
            ) : block.layout === "line" ? (
              <div className="flex flex-wrap justify-center gap-3">
                {Array.from({ length: block.count }, (_, index) => (
                  <CountButton
                    key={index}
                    index={index}
                    counted={counted}
                    onCount={countOne}
                    block={block}
                    className="size-20 sm:size-24"
                  />
                ))}
              </div>
            ) : (
              <div className="relative mx-auto aspect-[2/1] w-full max-w-2xl rounded-3xl bg-muted/40">
                {places.map((place, index) => (
                  <CountButton
                    key={index}
                    index={index}
                    counted={counted}
                    onCount={countOne}
                    block={block}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2"
                    style={{
                      insetInlineStart: `${place.x * 100}%`,
                      top: `${place.y * 100}%`,
                      width: `min(6rem, ${place.size * 85}%)`,
                      aspectRatio: "1",
                    }}
                  />
                ))}
              </div>
            )}
            {hidden && !settled ? (
              <div className="absolute inset-0 grid place-items-center rounded-3xl bg-muted">
                <Button
                  type="button"
                  variant="outline"
                  className="h-16 rounded-full px-8 text-xl"
                  onClick={() => setHidden(false)}
                >
                  <Eye aria-hidden className="size-6" />
                  {m.lrnYoungLookAgain()}
                </Button>
              </div>
            ) : null}
          </div>
          <fieldset
            className={cn(
              "grid gap-3",
              highest > 10 ? "grid-cols-5 sm:grid-cols-10" : "grid-cols-5",
            )}
          >
            <legend className="sr-only">{block.prompt}</legend>
            {Array.from({ length: highest }, (_, index) => index + 1).map(
              (value) => {
                const right =
                  settled &&
                  (rightValue ?? (view?.correct ? chosen : null)) === value;
                const out =
                  tried.includes(value) &&
                  !right &&
                  !(respond.isPending && chosen === value);
                return (
                  <button
                    key={value}
                    ref={(element) => {
                      if (element) tiles.current.set(value, element);
                      else tiles.current.delete(value);
                    }}
                    type="button"
                    aria-disabled={out || settled || undefined}
                    onClick={() => {
                      if (out || settled || respond.isPending) return;
                      playSound("tap");
                      setChosen(value);
                      setTried((current) => [...current, value]);
                      respond.mutate(value);
                    }}
                    className={cn(
                      "grid min-h-20 touch-manipulation place-items-center rounded-2xl border-2 bg-card text-4xl font-bold tabular-nums shadow-sm outline-none select-none focus-visible:ring-4 focus-visible:ring-ring/50",
                      !out && !settled && "hover:border-primary/50",
                      out && "opacity-30",
                      right && "border-success bg-success/10 text-success",
                      settled && !right && "opacity-40",
                    )}
                  >
                    {formatNumber(value)}
                  </button>
                );
              },
            )}
          </fieldset>
        </>
      ) : (
        <div ref={board} className="grid justify-items-center gap-6">
          <Frames
            total={Math.max(block.count, made)}
            filled={made}
            render={(index) => (
              <button
                type="button"
                aria-label={m.lrnYoungTakeOut()}
                disabled={settled}
                onClick={() => {
                  setMade((current) => Math.max(0, current - 1));
                  playSound("tap");
                }}
                className="grid size-full place-items-center rounded-lg outline-none focus-visible:ring-4 focus-visible:ring-ring/50"
              >
                <span className="grid size-full place-items-center p-1">
                  <Thing block={block} />
                </span>
                <span className="sr-only">{formatNumber(index + 1)}</span>
              </button>
            )}
          />
          {settled ? null : (
            <div className="flex flex-wrap items-center justify-center gap-6">
              <button
                type="button"
                aria-label={m.lrnYoungPutOneIn()}
                disabled={made >= 20 || respond.isPending}
                onClick={() => {
                  const next = made + 1;
                  setMade(next);
                  playSound("tap");
                  sayNumber(next, block.prompt);
                }}
                className="grid size-28 touch-manipulation place-items-center rounded-3xl border-2 border-dashed bg-card p-3 shadow-sm outline-none focus-visible:ring-4 focus-visible:ring-ring/50"
              >
                <Thing block={block} />
              </button>
              <Button
                type="button"
                className="h-16 rounded-full px-10 text-xl"
                disabled={made === 0 || respond.isPending}
                onClick={() => {
                  setChosen(null);
                  respond.mutate(made);
                }}
              >
                <Check aria-hidden className="size-6" />
                {m.lrnYoungCheck()}
              </Button>
            </div>
          )}
        </div>
      )}
      <output aria-live="polite">
        <YoungOutcome view={view} praise={praise} />
      </output>
    </div>
  );
}

/** One thing to count, tapped as the child counts it and numbered once counted. */
function CountButton({
  index,
  counted,
  onCount,
  block,
  className,
  style,
}: {
  index: number;
  counted: number[];
  onCount: (index: number) => void;
  block: Counting;
  className?: string;
  style?: React.CSSProperties;
}) {
  const at = counted.indexOf(index);
  return (
    <button
      type="button"
      aria-label={
        at >= 0
          ? m.lrnYoungCountedThing({ number: formatNumber(at + 1) })
          : m.lrnYoungCountThing()
      }
      onClick={() => onCount(index)}
      style={style}
      className={cn(
        "relative grid touch-manipulation place-items-center rounded-2xl p-1 outline-none select-none focus-visible:ring-4 focus-visible:ring-ring/50",
        at >= 0 && "bg-primary/10",
        className,
      )}
    >
      <Thing block={block} />
      {at >= 0 ? (
        <span
          aria-hidden
          className="absolute -end-1 -top-1 grid size-8 place-items-center rounded-full bg-primary text-base font-bold text-primary-foreground tabular-nums shadow"
        >
          {formatNumber(at + 1)}
        </span>
      ) : null}
    </button>
  );
}
