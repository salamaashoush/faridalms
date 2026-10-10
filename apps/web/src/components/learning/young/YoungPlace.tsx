import type {
  CheckView,
  LessonResponse,
  StudentBlock,
  StudentPart,
} from "@faridalms/domain/learning";
import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { useMutation } from "@tanstack/react-query";
import { Check, Eye, Undo2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { CheckDriver } from "../Checks";

import { ReadAloud, sayAloud } from "../ReadAloud";
import { useCardDrag } from "./drag";
import { hop, shake } from "./motion";
import { playSound } from "./sounds";
import { outcomeWords, YoungOutcome, YoungPart } from "./YoungChoice";

type Matching = Extract<StudentBlock, { type: "matching" }>;
type Sorting = Extract<StudentBlock, { type: "sorting" }>;
type Ordering = Extract<StudentBlock, { type: "ordering" }>;

/** Where each card sits, by card id: the id of its place, or none while in the pile. */
type Placement = Record<string, string>;

const BANK = "bank";
const partName = (part: StudentPart) => part.text || part.picture?.alt || "";

/**
 * A child placing cards, by tapping a card and then its place, or by
 * dragging it there (WCAG 2.5.7 asks for the first; young children manage
 * both, NN/g found). Once every card has a place the answer is checked: the
 * right ones stay, shining, and the rest come back to the pile to try again.
 */
function usePlacing({
  block,
  view,
  driver,
  pieces,
  answerOf,
  complete,
  responseOf,
  solution,
  placementOf,
  capacity,
  praise,
}: {
  block: { id: string };
  view: CheckView | undefined;
  driver: CheckDriver;
  pieces: StudentPart[];
  /** The part a try marked for this card: the card itself, or its place. */
  answerOf: (pieceId: string, spotId: string) => string;
  complete: (placement: Placement) => boolean;
  responseOf: (placement: Placement) => LessonResponse;
  /** Where everything belongs, once the answer is out. */
  solution: () => Placement;
  /** Where a try put everything, read back from its answer. */
  placementOf: (response: LessonResponse) => Placement;
  /** How many cards a place takes, when it takes only so many. */
  capacity: (spotId: string) => number;
  /** What a child is told who gets it all right, naming what they did. */
  praise: string;
}) {
  const [placement, setPlacement] = useState<Placement>({});
  const [held, setHeld] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [seenTries, setSeenTries] = useState(view?.tries ?? 0);
  const cards = useRef(new Map<string, HTMLElement>());
  // What the latest try sent, which its marks are read against.
  const [sent, setSent] = useState<Placement>({});
  const respond = useMutation({
    mutationFn: (response: LessonResponse) =>
      driver.respond(block.id, response),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const reveal = useMutation({
    mutationFn: () => driver.reveal(block.id),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const settled = Boolean(view && (view.correct || view.revealed));

  // A new mark keeps the cards it found right and sends the others back.
  const tries = view?.tries ?? 0;
  if (tries !== seenTries) {
    setSeenTries(tries);
    if (view && !view.correct && !view.revealed)
      setPlacement(
        Object.fromEntries(
          Object.entries(sent).filter(
            ([pieceId, spotId]) =>
              view.parts[answerOf(pieceId, spotId)] === true,
          ),
        ),
      );
  }

  // Only a new try is answered with sound and movement.
  const answered = useEffectEvent(() => {
    if (view?.correct) {
      playSound("right");
      for (const element of cards.current.values()) hop(element);
    } else if (!view?.revealed) {
      playSound("wrong");
      for (const [pieceId, spotId] of Object.entries(sent))
        if (view?.parts[answerOf(pieceId, spotId)] === false)
          shake(cards.current.get(pieceId));
    }
    if (view) sayAloud(outcomeWords(view, praise, false), null);
  });
  useEffect(() => {
    if (tries > 0) answered();
  }, [tries]);

  // A settled question shows how it ended, even after the screen was left.
  const shown =
    view?.revealed && !view.correct
      ? solution()
      : view?.correct && view.response
        ? placementOf(view.response)
        : placement;
  const markOf = (pieceId: string): "right" | null => {
    const spotId = shown[pieceId];
    if (!spotId || !view) return null;
    if (settled) return "right";
    return view.parts[answerOf(pieceId, spotId)] === true &&
      sent[pieceId] === spotId
      ? "right"
      : null;
  };
  const locked = (pieceId: string) =>
    settled || respond.isPending || markOf(pieceId) === "right";

  const put = (pieceId: string, spotId: string) => {
    const next = { ...placement };
    if (spotId === BANK) delete next[pieceId];
    else {
      const there = Object.keys(next).filter((id) => next[id] === spotId);
      // A place that is full gives its card back to the pile.
      if (there.length >= capacity(spotId) && there[0] && there[0] !== pieceId)
        delete next[there[0]];
      next[pieceId] = spotId;
    }
    setPlacement(next);
    setHeld(null);
    const piece = pieces.find((part) => part.id === pieceId);
    setSaid(piece ? m.lrnYoungPlaced({ item: partName(piece) }) : "");
    if (spotId !== BANK && complete(next)) {
      setSent(next);
      respond.mutate(responseOf(next));
    }
  };

  const tapPiece = (pieceId: string) => {
    if (locked(pieceId)) return;
    const spotId = placement[pieceId];
    // Tapping a placed card while holding another puts the held one there.
    if (held && held !== pieceId && spotId) return put(held, spotId);
    if (held === pieceId) {
      setHeld(null);
      setSaid("");
      return;
    }
    playSound("tap");
    setHeld(pieceId);
    const piece = pieces.find((part) => part.id === pieceId);
    setSaid(piece ? m.lrnYoungPicked({ item: partName(piece) }) : "");
  };

  const tapSpot = (spotId: string) => {
    if (held) put(held, spotId);
  };

  return {
    placement: shown,
    held,
    said,
    settled,
    pending: respond.isPending,
    cards,
    markOf,
    locked,
    put,
    tapPiece,
    tapSpot,
    canShow: !settled && tries >= 2,
    show: () => reveal.mutate(),
    showing: reveal.isPending,
    praise,
  };
}

type Placing = ReturnType<typeof usePlacing>;

/**
 * A card a child can pick up: by a tap, or by dragging it to a place; a
 * short press is a tap.
 */
function Piece({
  part,
  placing,
  small = false,
  compact = false,
}: {
  part: StudentPart;
  placing: Placing;
  small?: boolean;
  /**
   * A card put away in a group, drawn smaller than one still to place, or
   * one in a hand of cards, smaller on a phone alone.
   */
  compact?: boolean | "phone";
}) {
  const held = placing.held === part.id;
  const mark = placing.markOf(part.id);
  const locked = placing.locked(part.id);
  const drag = useCardDrag({
    locked,
    pile: BANK,
    onDrop: (place) => placing.put(part.id, place),
    card: () => placing.cards.current.get(part.id),
  });
  return (
    <span className="relative inline-flex">
      <button
        ref={(element) => {
          if (element) placing.cards.current.set(part.id, element);
          else placing.cards.current.delete(part.id);
        }}
        type="button"
        aria-pressed={held}
        aria-disabled={locked || undefined}
        onContextMenu={(event) => event.preventDefault()}
        {...drag.handlers}
        onClick={() => {
          // A drag that ended is not also a tap.
          if (drag.wasDragged()) return;
          placing.tapPiece(part.id);
        }}
        className={cn(
          "relative flex touch-none items-center justify-center rounded-2xl border-2 bg-card p-3 shadow-sm transition-[transform,box-shadow,border-color] outline-none select-none [-webkit-touch-callout:none] before:absolute before:-inset-1.5 before:content-[''] focus-visible:ring-4 focus-visible:ring-ring/50",
          compact === true
            ? "min-h-14 min-w-20 p-2"
            : compact === "phone"
              ? "min-h-14 min-w-20 p-2 sm:min-h-26 sm:min-w-32 sm:p-3"
              : small
                ? "min-h-20 min-w-24"
                : "min-h-26 min-w-32",
          part.picture &&
            (compact === true
              ? "w-24"
              : compact === "phone"
                ? "w-24 sm:w-40"
                : small
                  ? "w-28"
                  : "w-36 sm:w-40"),
          part.narration && "pt-16",
          held &&
            "-translate-y-1 border-primary shadow-lg ring-4 ring-primary/30 motion-reduce:translate-y-0",
          mark === "right" && "border-success bg-success/10",
          !locked && !held && "hover:border-primary/50",
          placing.pending && "opacity-70",
        )}
      >
        <YoungPart part={part} compact={compact} />
      </button>
      {part.narration ? (
        <ReadAloud
          text={partName(part)}
          narration={part.narration}
          size="card"
          className="absolute start-1 top-1"
        />
      ) : null}
      {mark === "right" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -end-2 -top-2 grid size-8 place-items-center rounded-full bg-success text-white shadow"
        >
          <Check className="size-4" />
        </span>
      ) : null}
    </span>
  );
}

/** An empty place a held card can be put in. */
function Spot({
  id,
  label,
  placing,
  className,
  children,
}: {
  id: string;
  label: string;
  placing: Placing;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      data-spot={id}
      aria-label={label}
      onClick={() => placing.tapSpot(id)}
      className={cn(
        "relative grid place-items-center rounded-2xl border-2 border-dashed text-muted-foreground transition-colors outline-none before:absolute before:-inset-1.5 before:content-[''] focus-visible:ring-4 focus-visible:ring-ring/50 data-over:border-primary data-over:bg-primary/10",
        placing.held
          ? "border-primary bg-primary/10"
          : "border-muted-foreground/30",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** The cards still to place, and a way to put a picked-up card back among them. */
function Pile({
  pieces,
  placing,
  small,
  foot = false,
}: {
  pieces: StudentPart[];
  placing: Placing;
  small?: boolean;
  /**
   * Kept at the foot of the screen, as a hand of cards, while the places
   * scroll above it: a pile below the places was out of sight on a phone.
   */
  foot?: boolean;
}) {
  const left = pieces.filter((piece) => !placing.placement[piece.id]);
  const back = placing.held && placing.placement[placing.held];
  if (left.length === 0 && !back) return null;
  return (
    <div
      data-spot={BANK}
      className={cn(
        "flex min-h-24 flex-wrap items-center justify-center gap-3 rounded-3xl p-4",
        // The same tint either way, but solid at the foot, where the
        // places scroll behind it.
        foot
          ? "sticky bottom-0 z-10 max-h-[42dvh] overflow-x-hidden overflow-y-auto bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] shadow-[0_-8px_16px_-8px_rgb(0_0_0/0.25)] sm:max-h-[60dvh]"
          : "bg-muted/50",
      )}
    >
      {left.map((piece) => (
        <Piece
          key={piece.id}
          part={piece}
          placing={placing}
          small={small}
          compact={foot ? "phone" : false}
        />
      ))}
      {back ? (
        <Button
          type="button"
          variant="outline"
          className="h-14 rounded-full px-5 text-base"
          onClick={() => placing.tapSpot(BANK)}
        >
          <Undo2 aria-hidden className="size-5" />
          {m.lrnYoungPutBack()}
        </Button>
      ) : null}
    </div>
  );
}

/** What follows every placing board: what was said, help once stuck, and the outcome. */
function Footer({
  placing,
  view,
}: {
  placing: Placing;
  view: CheckView | undefined;
}) {
  return (
    <>
      <p aria-live="polite" className="sr-only">
        {placing.said}
      </p>
      {placing.canShow ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            className="h-14 rounded-full px-6 text-lg"
            disabled={placing.showing}
            onClick={placing.show}
          >
            <Eye aria-hidden className="size-5" />
            {m.lrnYoungShowMe()}
          </Button>
        </div>
      ) : null}
      <output aria-live="polite">
        <YoungOutcome view={view} praise={placing.praise} />
      </output>
    </>
  );
}

/** Matching as children do it: each card is taken to the one it goes with. */
export function YoungMatching({
  block,
  view,
  driver,
}: {
  block: Matching;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const placing = usePlacing({
    block,
    view,
    driver,
    pieces: block.choices,
    // A pair is marked by its prompt, which is the place a card goes to.
    answerOf: (_choiceId, promptId) => promptId,
    complete: (placement) =>
      block.prompts.every((prompt) =>
        Object.values(placement).includes(prompt.id),
      ),
    responseOf: (placement) => ({
      type: "matching",
      pairs: Object.fromEntries(
        Object.entries(placement).map(([choiceId, promptId]) => [
          promptId,
          choiceId,
        ]),
      ),
    }),
    solution: () =>
      Object.fromEntries(
        block.prompts.flatMap((prompt) => {
          const name = view?.partKey?.[prompt.id];
          const choice = block.choices.find(
            (option) => partName(option) === name,
          );
          return choice ? [[choice.id, prompt.id]] : [];
        }),
      ),
    placementOf: (response) =>
      response.type === "matching"
        ? Object.fromEntries(
            Object.entries(response.pairs).map(([promptId, choiceId]) => [
              choiceId,
              promptId,
            ]),
          )
        : {},
    capacity: () => 1,
    praise: m.lrnYoungMatched(),
  });
  const placedAt = (promptId: string) =>
    block.choices.find((choice) => placing.placement[choice.id] === promptId);
  return (
    <div className="grid gap-6">
      <ul className="grid gap-4">
        {block.prompts.map((prompt) => {
          const placed = placedAt(prompt.id);
          return (
            <li
              key={prompt.id}
              className="grid grid-cols-2 items-center gap-3 sm:gap-6"
            >
              <span
                className={cn(
                  "relative flex min-h-26 items-center justify-center rounded-2xl bg-muted/50 p-3",
                  prompt.narration && "pt-16",
                )}
              >
                <YoungPart part={prompt} />
                {prompt.narration ? (
                  <ReadAloud
                    text={partName(prompt)}
                    narration={prompt.narration}
                    size="card"
                    className="absolute start-1 top-1"
                  />
                ) : null}
              </span>
              {placed ? (
                <span data-spot={prompt.id} className="flex justify-center">
                  <Piece part={placed} placing={placing} />
                </span>
              ) : (
                <Spot
                  id={prompt.id}
                  label={m.lrnYoungPutWith({ item: partName(prompt) })}
                  placing={placing}
                  className="min-h-26 self-stretch"
                />
              )}
            </li>
          );
        })}
      </ul>
      <Pile pieces={block.choices} placing={placing} foot />
      <Footer placing={placing} view={view} />
    </div>
  );
}

/** Sorting as children do it: each card is put in its group's box. */
export function YoungSorting({
  block,
  view,
  driver,
}: {
  block: Sorting;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const placing = usePlacing({
    block,
    view,
    driver,
    pieces: block.items,
    answerOf: (itemId) => itemId,
    complete: (placement) =>
      block.items.every((item) => placement[item.id] !== undefined),
    responseOf: (placement) => ({ type: "sorting", groups: placement }),
    solution: () =>
      Object.fromEntries(
        block.items.flatMap((item) => {
          const name = view?.partKey?.[item.id];
          const group = block.groups.find((one) => one.name === name);
          return group ? [[item.id, group.id]] : [];
        }),
      ),
    placementOf: (response) =>
      response.type === "sorting" ? response.groups : {},
    capacity: () => Number.POSITIVE_INFINITY,
    praise: m.lrnYoungSorted(),
  });
  return (
    <div className="grid gap-6">
      <Pile pieces={block.items} placing={placing} small />
      {/* The groups stay in reach at the foot of the screen while the cards
          scroll above them: a card dragged to a group out of sight had to
          wait at the screen's edge for the screen to scroll. */}
      <div
        className={cn(
          "sticky bottom-0 z-10 grid max-h-[45dvh] gap-4 overflow-x-hidden overflow-y-auto rounded-t-3xl bg-background/95 pt-2 pb-1 backdrop-blur-sm",
          block.groups.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
          block.groups.length > 1 && "grid-cols-2",
        )}
      >
        {block.groups.map((group) => {
          const inside = block.items.filter(
            (item) => placing.placement[item.id] === group.id,
          );
          return (
            <section
              key={group.id}
              data-spot={group.id}
              aria-label={group.name}
              className="grid content-start gap-3 rounded-3xl border-2 bg-card p-3"
            >
              <h3 className="flex items-center justify-center gap-2 text-xl leading-8 font-bold">
                {group.narration ? (
                  <ReadAloud
                    text={group.name}
                    narration={group.narration}
                    size="small"
                  />
                ) : null}
                <span dir="auto">{group.name}</span>
              </h3>
              {inside.length ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {inside.map((item) => (
                    <Piece
                      key={item.id}
                      part={item}
                      placing={placing}
                      small
                      compact
                    />
                  ))}
                </div>
              ) : null}
              {placing.settled ? null : (
                <Spot
                  id={group.id}
                  label={m.lrnYoungPutIn({ group: group.name })}
                  placing={placing}
                  className={inside.length ? "min-h-14" : "min-h-26"}
                />
              )}
            </section>
          );
        })}
      </div>
      <Footer placing={placing} view={view} />
    </div>
  );
}

/** Ordering as children do it: cards go one by one into numbered places. */
export function YoungOrdering({
  block,
  view,
  driver,
}: {
  block: Ordering;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const slots = block.items.map((_, index) => `slot-${index}`);
  const placing = usePlacing({
    block,
    view,
    driver,
    pieces: block.items,
    answerOf: (itemId) => itemId,
    complete: (placement) =>
      slots.every((slot) => Object.values(placement).includes(slot)),
    responseOf: (placement) => ({
      type: "ordering",
      order: slots.map(
        (slot) =>
          Object.keys(placement).find((itemId) => placement[itemId] === slot) ??
          "",
      ),
    }),
    solution: () =>
      Object.fromEntries(
        block.items.map((item) => [
          item.id,
          `slot-${Number(view?.partKey?.[item.id] ?? 1) - 1}`,
        ]),
      ),
    placementOf: (response) =>
      response.type === "ordering"
        ? Object.fromEntries(
            response.order.map((itemId, index) => [itemId, `slot-${index}`]),
          )
        : {},
    capacity: () => 1,
    praise: m.lrnYoungOrdered(),
  });
  return (
    <div className="grid gap-6">
      <ol className="flex flex-wrap items-start justify-center gap-3">
        {slots.map((slot, index) => {
          const placed = block.items.find(
            (item) => placing.placement[item.id] === slot,
          );
          const number = formatNumber(index + 1);
          return (
            <li key={slot} className="grid justify-items-center gap-2">
              <span
                aria-hidden
                className="grid size-9 place-items-center rounded-full bg-muted text-lg font-bold tabular-nums"
              >
                {number}
              </span>
              {placed ? (
                <span data-spot={slot}>
                  <Piece part={placed} placing={placing} />
                </span>
              ) : (
                <Spot
                  id={slot}
                  label={m.lrnYoungPlace({ number })}
                  placing={placing}
                  className="min-h-26 w-36 sm:w-40"
                />
              )}
            </li>
          );
        })}
      </ol>
      <Pile pieces={block.items} placing={placing} foot />
      <Footer placing={placing} view={view} />
    </div>
  );
}
