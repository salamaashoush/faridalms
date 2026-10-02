import type { CheckView, StudentBlock } from "@faridalms/domain/learning";

import { StoredImage } from "@faridalms/editor/files";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { useMutation } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { CheckDriver } from "../Checks";

import { sayAloud } from "../ReadAloud";
import { hop, shake } from "./motion";
import { playSound } from "./sounds";
import { outcomeWords, YoungOutcome } from "./YoungChoice";

type Spelling = Extract<StudentBlock, { type: "spelling" }>;

const tile =
  "grid min-h-20 min-w-20 touch-manipulation place-items-center rounded-2xl border-2 bg-card px-4 text-4xl font-bold shadow-sm outline-none select-none focus-visible:ring-4 focus-visible:ring-ring/50";

/**
 * Building a word from tiles: each tap puts a tile in the next empty place
 * and a tap on a placed tile takes it back. Once every place is filled the
 * word is checked; right tiles stay and the rest return. Underneath, the
 * built word is drawn as one run, so Arabic letters join as they would be
 * written rather than standing apart.
 */
export function YoungSpelling({
  block,
  view,
  driver,
}: {
  block: Spelling;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const settled = Boolean(view && (view.correct || view.revealed));
  const [placed, setPlaced] = useState<(string | null)[]>(() =>
    Array.from({ length: block.places }, () => null),
  );
  const [sent, setSent] = useState<(string | null)[]>([]);
  const [seenTries, setSeenTries] = useState(view?.tries ?? 0);
  const row = useRef<HTMLDivElement>(null);
  const respond = useMutation({
    mutationFn: (tiles: string[]) =>
      driver.respond(block.id, { type: "spelling", tiles }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const reveal = useMutation({
    mutationFn: () => driver.reveal(block.id),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const textOf = (id: string | null) =>
    block.pile.find((item) => item.id === id)?.text ?? "";
  const tries = view?.tries ?? 0;

  // A new mark keeps the tiles it found in their places and returns the rest.
  if (tries !== seenTries) {
    setSeenTries(tries);
    if (view && !view.correct && !view.revealed)
      setPlaced(
        sent.map((id, index) =>
          view.parts[`slot-${index + 1}`] === true ? id : null,
        ),
      );
  }

  const shown: string[] = view?.revealed
    ? Array.from(
        { length: block.places },
        (_, index) => view.partKey?.[`slot-${index + 1}`] ?? "",
      )
    : view?.correct && view.response?.type === "spelling"
      ? view.response.tiles
      : placed.map(textOf);
  const word = shown.join("");
  const praise = m.lrnYoungBuilt({ word });

  const answered = useEffectEvent(() => {
    if (!view) return;
    if (view.correct) {
      playSound("right");
      hop(row.current);
    } else if (!view.revealed) {
      playSound("wrong");
      shake(row.current);
    }
    sayAloud(outcomeWords(view, praise, false), null);
  });
  useEffect(() => {
    if (tries > 0) answered();
  }, [tries]);

  const put = (id: string) => {
    if (settled || respond.isPending) return;
    const free = placed.indexOf(null);
    if (free < 0) return;
    playSound("tap");
    const next = placed.map((item, index) => (index === free ? id : item));
    setPlaced(next);
    if (next.every((item) => item !== null)) {
      setSent(next);
      respond.mutate(next.map(textOf));
    }
  };
  const takeBack = (index: number) => {
    if (settled || respond.isPending) return;
    const kept = view?.parts[`slot-${index + 1}`] === true && sent[index];
    if (kept) return;
    playSound("tap");
    setPlaced(placed.map((item, at) => (at === index ? null : item)));
  };

  return (
    <div className="grid justify-items-center gap-6">
      {block.picture ? (
        <StoredImage
          src={`/files/${block.picture.fileId}`}
          alt={block.picture.alt}
          removed={m.fileRemoved()}
          draggable={false}
          className="h-36 w-auto max-w-full rounded-2xl object-contain sm:h-44"
        />
      ) : null}
      <div ref={row} className="flex flex-wrap justify-center gap-3">
        {shown.map((text, index) => {
          const right =
            settled ||
            (view?.parts[`slot-${index + 1}`] === true &&
              sent[index] !== null &&
              sent[index] === placed[index]);
          return (
            <button
              key={`place-${index}`}
              type="button"
              aria-label={
                text
                  ? m.lrnYoungTakeBack({ tile: text })
                  : m.lrnYoungPlace({ number: formatNumber(index + 1) })
              }
              onClick={() => takeBack(index)}
              className={cn(
                tile,
                !text && "border-dashed bg-transparent shadow-none",
                right && text && "border-success bg-success/10",
              )}
            >
              <span dir="auto" className="young-words">
                {text}
              </span>
            </button>
          );
        })}
      </div>
      {word ? (
        <p dir="auto" className="young-words text-5xl leading-tight font-bold">
          {word}
        </p>
      ) : null}
      {settled ? null : (
        <div className="flex flex-wrap justify-center gap-3 rounded-3xl bg-muted/50 p-4">
          {block.pile
            .filter((item) => !placed.includes(item.id))
            .map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => put(item.id)}
                className={cn(tile, "hover:border-primary/50")}
              >
                <span dir="auto" className="young-words">
                  {item.text}
                </span>
              </button>
            ))}
        </div>
      )}
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
