import type { CheckView, StudentBlock } from "@faridalms/domain/learning";

import { placesToFind, regionHit } from "@faridalms/domain/learning";
import { StoredImage } from "@faridalms/editor/files";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { useMutation } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import type { CheckDriver } from "~/components/questions/Checks";

import { sayAloud } from "~/components/questions/ReadAloud";
import * as m from "~/i18n/messages";
import { getTextDirection } from "~/i18n/runtime";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { shake } from "./motion";
import { playSound } from "./sounds";
import { outcomeWords, YoungOutcome } from "./YoungChoice";

type Hotspot = Extract<StudentBlock, { type: "hotspot" }>;
type Point = [number, number];
type Place = Hotspot["places"][number];

const centreOf = ({ box: [left, top, width, height] }: Place): Point => [
  left + width / 2,
  top + height / 2,
];

/**
 * The places in the order a reader meets them: row by row from the top,
 * then along the row in the page's direction, so the list never gives away
 * the order in which the teacher marked the ones to find.
 */
function inReadingOrder(places: readonly Place[], rtl: boolean): Place[] {
  const row = (place: Place) => Math.round(centreOf(place)[1] * 5);
  return places.toSorted((a, b) => {
    const rows = row(a) - row(b);
    if (rows !== 0) return rows;
    const across = centreOf(a)[0] - centreOf(b)[0];
    return rtl ? -across : across;
  });
}

export interface YoungHotspotProps {
  block: Hotspot;
  view: CheckView | undefined;
  driver: CheckDriver;
}

/**
 * Finding things in a picture. A tap on a place marks it found at once and
 * asks nothing of the server; only a tap on nothing, or the last find, is
 * sent, so a child who finds everything without a miss is right first time.
 * After two misses "Show me" rings what is left. From a keyboard or screen
 * reader a child chooses among the named places instead, which counts as a
 * tap in the middle of the place chosen.
 */
export function YoungHotspot({ block, view, driver }: YoungHotspotProps) {
  const regions = placesToFind(block.places);
  const listed = inReadingOrder(block.places, getTextDirection() === "rtl");
  const settled = Boolean(view && (view.correct || view.revealed));
  const [finds, setFinds] = useState<Point[]>(() =>
    view?.response?.type === "hotspot"
      ? view.response.taps.filter((tap) =>
          regions.some((region) => regionHit(region, tap)),
        )
      : [],
  );
  const [miss, setMiss] = useState<Point | null>(null);
  const picture = useRef<HTMLDivElement>(null);
  const respond = useMutation({
    meta: { settlesAtOnce: true },
    mutationFn: (taps: Point[]) =>
      driver.respond(block.id, { type: "hotspot", taps }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const reveal = useMutation({
    mutationFn: () => driver.reveal(block.id),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const found = regions.map((region) =>
    finds.some((tap) => regionHit(region, tap)),
  );
  const count = found.filter(Boolean).length;
  const praise = m.lrnYoungFoundAll();
  const tries = view?.tries ?? 0;

  const answered = useEffectEvent(() => {
    if (!view) return;
    if (view.correct) playSound("right");
    else if (!view.revealed) {
      playSound("wrong");
      shake(picture.current);
    }
    sayAloud(outcomeWords(view, praise, false), null);
  });
  useEffect(() => {
    if (tries > 0) answered();
  }, [tries]);

  const tap = (point: Point) => {
    if (settled || respond.isPending) return;
    const hit = regions.findIndex(
      (region, index) => !found[index] && regionHit(region, point),
    );
    if (hit < 0) {
      if (regions.some((region) => regionHit(region, point))) return;
      setMiss(point);
      respond.mutate([...finds, point]);
      return;
    }
    playSound("tap");
    const next = [...finds, point];
    setFinds(next);
    if (next.length >= regions.length) respond.mutate(next);
  };

  const shown = view?.revealed ? regions : [];
  return (
    <div className="grid justify-items-center gap-5">
      <div
        ref={picture}
        className="relative w-fit max-w-full overflow-hidden rounded-2xl border-2 shadow-sm"
      >
        {block.picture ? (
          <StoredImage
            src={`/files/${block.picture.fileId}`}
            alt={block.picture.alt}
            removed={m.fileRemoved()}
            draggable={false}
            className="block max-h-[55dvh] w-auto max-w-full select-none"
          />
        ) : null}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          disabled={settled}
          className="absolute inset-0 size-full cursor-crosshair touch-manipulation outline-none"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            tap([
              Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
              Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
            ]);
          }}
        />
        <fieldset
          aria-label={m.lrnYoungFindHere()}
          className="m-0 border-0 p-0"
        >
          {listed.map((place, index) => {
            const done = finds.some((point) => regionHit(place.box, point));
            const [left, top, width, height] = place.box;
            return (
              // Pointers pass through to the picture, so these never show
              // a mouse where the places are; only the keyboard lands here.
              <button
                key={place.box.join()}
                type="button"
                aria-label={
                  place.name ||
                  m.lrnYoungPlace({ number: formatNumber(index + 1) })
                }
                aria-disabled={settled || done}
                className="pointer-events-none absolute rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-offset-2"
                style={{
                  left: `${left * 100}%`,
                  top: `${top * 100}%`,
                  width: `${width * 100}%`,
                  height: `${height * 100}%`,
                }}
                onClick={() => {
                  if (!settled && !done) tap(centreOf(place));
                }}
              />
            );
          })}
        </fieldset>
        {finds.map(([x, y], index) => (
          <span
            key={`find-${index}`}
            aria-hidden
            className="pointer-events-none absolute size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-[6px] border-success bg-success/15 shadow motion-safe:animate-in motion-safe:zoom-in-50"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          />
        ))}
        {miss && !settled ? (
          <span
            key={`miss-${miss[0]}-${miss[1]}`}
            aria-hidden
            className="pointer-events-none absolute size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-muted-foreground/60"
            style={{ left: `${miss[0] * 100}%`, top: `${miss[1] * 100}%` }}
          />
        ) : null}
        {shown.map(([left, top, width, height], index) =>
          found[index] ? null : (
            <span
              key={`shown-${index}`}
              aria-hidden
              className="pointer-events-none absolute rounded-xl border-[5px] border-warning motion-safe:animate-pulse"
              style={{
                left: `${left * 100}%`,
                top: `${top * 100}%`,
                width: `${width * 100}%`,
                height: `${height * 100}%`,
              }}
            />
          ),
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {m.lrnYoungFoundCount({
          found: formatNumber(view?.correct ? regions.length : count),
          total: formatNumber(regions.length),
        })}
      </p>
      <div aria-hidden className="flex gap-2">
        {found.map((done, index) => (
          <span
            key={index}
            className={cn(
              "size-5 rounded-full border-2",
              done || view?.correct
                ? "border-success bg-success"
                : "border-muted-foreground/40",
            )}
          />
        ))}
      </div>
      {!settled && tries >= 2 ? (
        <Button
          type="button"
          variant="outline"
          className="h-14 rounded-full px-6 text-lg"
          disabled={reveal.isPending}
          onClick={() => reveal.mutate()}
        >
          <Eye aria-hidden className="size-5" />
          {m.lrnYoungShowMe()}
        </Button>
      ) : null}
      <output aria-live="polite">
        <YoungOutcome view={view} praise={praise} />
      </output>
    </div>
  );
}
