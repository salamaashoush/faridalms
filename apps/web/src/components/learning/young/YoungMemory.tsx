import type {
  CheckView,
  StudentBlock,
  StudentPart,
} from "@faridalms/domain/learning";

import { cn } from "@faridalms/ui/cn";
import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { getMessageFromError } from "~/utils/error";

import type { CheckDriver } from "../Checks";

import { playRecording, sayAloud } from "../ReadAloud";
import { hop, shake } from "./motion";
import { playSound } from "./sounds";
import { YoungOutcome, YoungPart } from "./YoungChoice";

type Matching = Extract<StudentBlock, { type: "matching" }>;

interface Card {
  key: string;
  pairId: string;
  part: StudentPart;
}

const partName = (part: StudentPart) => part.text || part.picture?.alt || "";

/** The cards laid out in an order that stays the same for the question. */
function dealt(block: Matching): Card[] {
  const asked = new Set(block.prompts.map((prompt) => prompt.id));
  const cards = [
    ...block.prompts.map((part) => ({
      key: `p:${part.id}`,
      pairId: part.id,
      part,
    })),
    // An extra answer has no pair to find, so it stays out of the game.
    ...block.choices
      .filter((part) => asked.has(part.id))
      .map((part) => ({ key: `a:${part.id}`, pairId: part.id, part })),
  ];
  let state = 0;
  for (const char of block.id)
    state = (Math.imul(state, 31) + char.charCodeAt(0)) | 0;
  for (let index = cards.length - 1; index > 0; index--) {
    state = (Math.imul(state ^ (state >>> 15), 2246822507) + 0x9e3779b9) | 0;
    const other = (state >>> 0) % (index + 1);
    [cards[index], cards[other]] = [cards[other] as Card, cards[index] as Card];
  }
  return cards;
}

/**
 * Matching played as memory pairs, as practice: the cards lie face down and
 * the child turns two at a time; a pair stays face up, two that differ turn
 * back after a moment. Finding every pair answers the question.
 */
export function YoungMemory({
  block,
  view,
  driver,
}: {
  block: Matching;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const cards = useMemo(() => dealt(block), [block]);
  const settled = Boolean(view && (view.correct || view.revealed));
  const [found, setFound] = useState<string[]>([]);
  const [open, setOpen] = useState<string[]>([]);
  const elements = useRef(new Map<string, HTMLElement>());
  const respond = useMutation({
    mutationFn: () =>
      driver.respond(block.id, {
        type: "matching",
        pairs: Object.fromEntries(
          block.prompts.map((prompt) => [prompt.id, prompt.id]),
        ),
      }),
    onSuccess: () => {
      playSound("right");
      sayAloud(m.lrnYoungAllPairs(), null);
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });

  const turn = (card: Card) => {
    if (settled || open.length === 2 || open.includes(card.key)) return;
    if (found.includes(card.pairId)) return;
    playSound("tap");
    if (card.part.narration) playRecording(card.part.narration);
    else sayAloud(partName(card.part), null);
    const next = [...open, card.key];
    setOpen(next);
    if (next.length < 2) return;
    const [first, second] = next.map((key) =>
      cards.find((item) => item.key === key),
    );
    if (first && second && first.pairId === second.pairId) {
      const paired = [...found, first.pairId];
      setFound(paired);
      setOpen([]);
      playSound("right");
      hop(elements.current.get(first.key));
      hop(elements.current.get(second.key));
      if (paired.length === block.prompts.length) respond.mutate();
      return;
    }
    // Two that differ stay up long enough to remember, then turn back.
    setTimeout(() => {
      playSound("wrong");
      next.forEach((key) => shake(elements.current.get(key)));
      setOpen([]);
    }, 1200);
  };

  const columns =
    cards.length <= 4
      ? "grid-cols-2"
      : cards.length <= 6
        ? "grid-cols-3"
        : "grid-cols-3 sm:grid-cols-4";

  return (
    <div className="grid gap-6">
      <div className={cn("mx-auto grid w-full max-w-xl gap-3", columns)}>
        {cards.map((card) => {
          const up =
            settled || found.includes(card.pairId) || open.includes(card.key);
          const paired = settled || found.includes(card.pairId);
          return (
            <button
              key={card.key}
              ref={(element) => {
                if (element) elements.current.set(card.key, element);
                else elements.current.delete(card.key);
              }}
              type="button"
              aria-label={up ? partName(card.part) : m.lrnYoungTurnCard()}
              aria-pressed={up}
              onClick={() => turn(card)}
              className={cn(
                "relative grid aspect-square min-h-26 touch-manipulation place-items-center rounded-2xl border-2 p-2 shadow-sm outline-none select-none focus-visible:ring-4 focus-visible:ring-ring/50",
                up ? "bg-card" : "border-primary/40 bg-primary/15",
                paired && "border-success bg-success/10",
              )}
            >
              {up ? (
                <YoungPart part={card.part} />
              ) : (
                <span
                  aria-hidden
                  className="text-4xl font-bold text-primary/60"
                >
                  ?
                </span>
              )}
              {paired ? (
                <span
                  aria-hidden
                  className="absolute -end-2 -top-2 grid size-8 place-items-center rounded-full bg-success text-white shadow"
                >
                  <Check className="size-4" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <output aria-live="polite">
        <YoungOutcome view={view} praise={m.lrnYoungAllPairs()} />
      </output>
    </div>
  );
}
