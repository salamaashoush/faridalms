import type {
  CheckView,
  StudentBlock,
  StudentPart,
} from "@faridalms/domain/learning";

import { StoredImage } from "@faridalms/editor/files";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { useMutation } from "@tanstack/react-query";
import { Check, CircleCheck, Lightbulb, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { getMessageFromError } from "~/utils/error";

import type { CheckDriver } from "../Checks";

import { ReadAloud, sayAloud } from "../ReadAloud";
import { hop, shake } from "./motion";
import { playSound } from "./sounds";

type Choice = Extract<StudentBlock, { type: "choice" }>;

const partName = (part: StudentPart) => part.text || part.picture?.alt || "";

/**
 * Questions whose answer was shown and that the child has since tapped, so
 * the screen may move on: being shown an answer is not the same as finding it.
 */
export const FoundContext = createContext<{
  found: ReadonlySet<string>;
  find: (blockId: string) => void;
}>({ found: new Set(), find: () => {} });

/** A part as a young child meets it: a big picture, its words beneath. */
export function YoungPart({ part }: { part: StudentPart }) {
  return (
    <span className="flex w-full flex-col items-center justify-center gap-2 text-center">
      {part.picture ? (
        <StoredImage
          src={`/files/${part.picture.fileId}`}
          alt={part.text ? "" : part.picture.alt}
          removed={m.fileRemoved()}
          draggable={false}
          className="h-28 w-full rounded-xl object-contain sm:h-36"
        />
      ) : null}
      {part.text ? (
        <span
          className={cn(
            "font-semibold",
            part.picture ? "text-2xl leading-9" : "text-4xl leading-tight",
          )}
        >
          <span dir="auto" className="young-words" data-read-along>
            {part.text}
          </span>
        </span>
      ) : null}
    </span>
  );
}

/** What a young child is told after a try, as the words said aloud. */
export function outcomeWords(
  view: CheckView,
  praise: string,
  taps: boolean,
): string {
  if (view.correct) return view.tries > 1 ? m.lrnYoungKeptTrying() : praise;
  if (view.revealed) return taps ? m.lrnYoungTapIt() : m.lrnYoungShown();
  return view.tries > 1 && view.hint
    ? `${m.lrnYoungNotYet()} ${view.hint}`
    : m.lrnYoungNotYet();
}

/**
 * What a young child is told after a try, in words a grown-up can read to
 * them as well: right, not yet, or the answer; then the teacher's hint,
 * feedback or explanation, each with a speaker.
 */
export function YoungOutcome({
  view,
  praise = m.lrnYoungRight(),
  taps = false,
}: {
  view: CheckView | undefined;
  praise?: string;
  /** The child taps the answer once it is shown. */
  taps?: boolean;
}) {
  if (!view || (view.tries === 0 && !view.revealed)) return null;
  const said = view.correct
    ? view.tries > 1
      ? m.lrnYoungKeptTrying()
      : praise
    : view.revealed
      ? taps
        ? m.lrnYoungTapIt()
        : m.lrnYoungShown()
      : m.lrnYoungNotYet();
  // The hint comes with the second miss, as the question is said again.
  const notes = [
    ...view.feedback,
    ...(view.hint && !view.correct && view.tries > 1 ? [view.hint] : []),
    ...(view.explanation ? [view.explanation] : []),
  ];
  return (
    <div className="grid justify-items-center gap-3 text-center">
      <p
        className={cn(
          "inline-flex items-center gap-2 text-2xl leading-9 font-semibold",
          view.correct ? "text-success" : "text-muted-foreground",
        )}
      >
        {view.correct ? (
          <CircleCheck aria-hidden className="size-7" />
        ) : view.revealed ? null : (
          <Lightbulb aria-hidden className="size-7" />
        )}
        <span dir="auto" className="young-words">
          {said}
        </span>
      </p>
      {notes.map((note) => (
        <p
          key={note}
          className="flex max-w-xl items-start gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-start text-xl leading-8"
        >
          <ReadAloud text={note} size="card" />
          <span dir="auto" className="young-words min-w-0 flex-1 self-center">
            {note}
          </span>
        </p>
      ))}
    </div>
  );
}

const columns = (count: number, pictured: boolean) =>
  !pictured
    ? "grid-cols-1 sm:grid-cols-2"
    : count <= 2
      ? "grid-cols-2"
      : count === 4
        ? "grid-cols-2 sm:grid-cols-4"
        : "grid-cols-2 sm:grid-cols-3";

/**
 * A choice as young children make it: big cards, and a tap answers at once.
 * Misses climb Sesame Workshop's ladder: the first greys the card out, the
 * second says the question's hint, and after that the right card lights up
 * for the child to tap. Several right answers are chosen, then checked.
 */
export function YoungChoice({
  block,
  view,
  driver,
}: {
  block: Choice;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const cards = useRef(new Map<string, HTMLElement>());
  const { found, find } = useContext(FoundContext);
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>(
    view?.response?.type === "choice" ? view.response.optionIds : [],
  );
  const respond = useMutation({
    mutationFn: (optionIds: string[]) =>
      driver.respond(block.id, { type: "choice", optionIds }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const reveal = useMutation({
    mutationFn: () => driver.reveal(block.id),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const settled = Boolean(view && (view.correct || view.revealed));
  const tries = view?.tries ?? 0;
  const chosenPart = block.options.find((option) => option.id === chosen[0]);
  const praise =
    !block.multiple && chosenPart && partName(chosenPart)
      ? m.lrnYoungFound({ item: partName(chosenPart) })
      : m.lrnYoungRight();
  const showing = Boolean(view?.revealed && !view.correct && !block.multiple);

  // Each new try is answered with a sound, a movement and words said aloud.
  const answered = useEffectEvent(() => {
    if (!view) return;
    const touched = chosen.map((id) => cards.current.get(id));
    if (view.correct) {
      playSound("right");
      touched.forEach(hop);
    } else {
      playSound("wrong");
      touched.forEach(shake);
      // A third miss shows the answer, for the child to tap.
      if (!block.multiple && !view.revealed && view.tries >= 3) reveal.mutate();
    }
    sayAloud(outcomeWords(view, praise, showing), null);
  });
  useEffect(() => {
    if (tries > 0) answered();
  }, [tries]);
  useEffect(() => {
    if (showing) sayAloud(m.lrnYoungTapIt(), null);
  }, [showing]);

  const rightIds = view?.key ?? (view?.correct ? chosen : []);
  const pictured = block.options.some((option) => option.picture);
  const answer = (optionId: string) => {
    if (showing && rightIds.includes(optionId)) {
      playSound("right");
      hop(cards.current.get(optionId));
      find(block.id);
      return;
    }
    if (settled || respond.isPending) return;
    playSound("tap");
    if (block.multiple) {
      setPicked((current) =>
        current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      );
      return;
    }
    setChosen([optionId]);
    setSubmitted((current) => [...current, optionId]);
    respond.mutate([optionId]);
  };

  return (
    <div className="grid gap-6">
      {block.multiple ? (
        <p className="text-center text-xl leading-8 text-muted-foreground">
          {m.lrnChooseAll()}
        </p>
      ) : null}
      <fieldset
        className={cn("grid gap-8", columns(block.options.length, pictured))}
      >
        <legend className="sr-only">{block.prompt}</legend>
        {block.options.map((option) => {
          const right = settled && rightIds.includes(option.id);
          // A card tried and found wrong stays out of play; one still being
          // marked is not out yet.
          const out =
            !block.multiple &&
            submitted.includes(option.id) &&
            !right &&
            !(respond.isPending && chosen.includes(option.id));
          const wrongPick =
            settled && !right && chosen.includes(option.id) && !view?.correct;
          const on = block.multiple
            ? (settled ? chosen : picked).includes(option.id)
            : chosen.includes(option.id) && !out;
          const beckons = showing && right && !found.has(block.id);
          return (
            <div key={option.id} className="relative">
              <button
                ref={(element) => {
                  if (element) cards.current.set(option.id, element);
                  else cards.current.delete(option.id);
                }}
                type="button"
                aria-pressed={block.multiple ? on : undefined}
                aria-disabled={(out || settled) && !beckons ? true : undefined}
                onClick={() => {
                  if (!out) answer(option.id);
                }}
                onContextMenu={(event) => event.preventDefault()}
                className={cn(
                  "flex min-h-26 w-full touch-manipulation items-center justify-center rounded-3xl border-2 bg-card p-4 shadow-sm transition-[opacity,border-color,background-color] outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-4 focus-visible:ring-ring/50",
                  pictured && "min-h-44",
                  option.narration && "pt-16",
                  !settled &&
                    !out &&
                    "hover:border-primary/50 active:scale-[0.98] motion-reduce:active:scale-100",
                  on && !settled && "border-primary bg-primary/5",
                  out && "opacity-35",
                  right && "border-success bg-success/10",
                  beckons && "ring-8 ring-success/30",
                  wrongPick && "border-muted-foreground/40 opacity-60",
                  settled && !right && !wrongPick && !out && "opacity-50",
                )}
              >
                <YoungPart part={option} />
                <span className="sr-only">
                  {right ? m.lrnRight() : out ? m.lrnNotQuite() : ""}
                </span>
              </button>
              {right || out ? (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute -end-2 -top-2 grid size-10 place-items-center rounded-full text-white shadow",
                    right ? "bg-success" : "bg-muted-foreground",
                  )}
                >
                  {right ? (
                    <Check className="size-6" />
                  ) : (
                    <X className="size-6" />
                  )}
                </span>
              ) : null}
              {option.narration ? (
                <ReadAloud
                  text={partName(option)}
                  narration={option.narration}
                  size="card"
                  className="absolute start-2 top-2"
                />
              ) : null}
            </div>
          );
        })}
      </fieldset>
      {block.multiple && !settled ? (
        <div className="flex justify-center">
          <Button
            type="button"
            size="lg"
            className="h-16 rounded-full px-10 text-xl"
            disabled={picked.length === 0 || respond.isPending}
            onClick={() => {
              setChosen(picked);
              respond.mutate(picked);
            }}
          >
            <Check aria-hidden className="size-6" />
            {m.lrnYoungCheck()}
          </Button>
        </div>
      ) : null}
      <output aria-live="polite">
        <YoungOutcome view={view} praise={praise} taps={showing} />
      </output>
    </div>
  );
}
