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
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { getMessageFromError } from "~/utils/error";

import type { CheckDriver } from "../Checks";

import { ReadAloud } from "../ReadAloud";
import { hop, shake } from "./motion";
import { playSound } from "./sounds";

type Choice = Extract<StudentBlock, { type: "choice" }>;

const partName = (part: StudentPart) => part.text || part.picture?.alt || "";

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
        <span dir="auto" className="text-2xl leading-9 font-semibold">
          {part.text}
        </span>
      ) : null}
    </span>
  );
}

/**
 * What a young child is told after a try, in words a grown-up can read to
 * them: right, not yet, or the answer; then the teacher's hint, feedback or
 * explanation, each with a speaker.
 */
export function YoungOutcome({ view }: { view: CheckView | undefined }) {
  if (!view || (view.tries === 0 && !view.revealed)) return null;
  const said = view.correct
    ? view.tries > 1
      ? m.lrnYoungKeptTrying()
      : m.lrnYoungRight()
    : view.revealed
      ? m.lrnYoungShown()
      : m.lrnYoungNotYet();
  const notes = [
    ...view.feedback,
    ...(view.hint && !view.correct ? [view.hint] : []),
    ...(view.explanation ? [view.explanation] : []),
  ];
  return (
    <div className="grid justify-items-center gap-3 text-center">
      <p
        className={cn(
          "inline-flex items-center gap-2 text-xl leading-8 font-semibold",
          view.correct ? "text-success" : "text-muted-foreground",
        )}
      >
        {view.correct ? (
          <CircleCheck aria-hidden className="size-6" />
        ) : view.revealed ? null : (
          <Lightbulb aria-hidden className="size-6" />
        )}
        {said}
      </p>
      {notes.map((note) => (
        <p
          key={note}
          className="flex max-w-xl items-start gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-start text-lg leading-7"
        >
          <ReadAloud text={note} size="small" />
          <span dir="auto" className="min-w-0 flex-1 self-center">
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
 * A wrong card shakes, greys out and stays out of play, so the child keeps
 * choosing among fewer; several right answers are chosen, then checked.
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
  const settled = Boolean(view && (view.correct || view.revealed));
  const seen = useRef(view?.tries ?? 0);

  // Each new try is answered with a sound and a movement on what was chosen.
  useEffect(() => {
    if (!view || view.tries === seen.current) return;
    seen.current = view.tries;
    const touched = chosen.map((id) => cards.current.get(id));
    if (view.correct) {
      playSound("right");
      touched.forEach(hop);
      return;
    }
    playSound("wrong");
    touched.forEach(shake);
  }, [view, chosen]);

  const rightIds = view?.key ?? (view?.correct ? chosen : []);
  const pictured = block.options.some((option) => option.picture);
  const answer = (optionId: string) => {
    if (settled || respond.isPending) return;
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
        <p className="text-center text-lg leading-7 text-muted-foreground">
          {m.lrnChooseAll()}
        </p>
      ) : null}
      <fieldset
        className={cn("grid gap-4", columns(block.options.length, pictured))}
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
          return (
            <div key={option.id} className="relative">
              <button
                ref={(element) => {
                  if (element) cards.current.set(option.id, element);
                  else cards.current.delete(option.id);
                }}
                type="button"
                aria-pressed={block.multiple ? on : undefined}
                aria-disabled={out || settled || undefined}
                onClick={() => {
                  if (!out) answer(option.id);
                }}
                onContextMenu={(event) => event.preventDefault()}
                className={cn(
                  "flex min-h-19 w-full items-center justify-center rounded-2xl border-2 bg-card p-4 shadow-sm transition-[opacity,border-color,background-color] outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-4 focus-visible:ring-ring/50",
                  pictured && "min-h-40",
                  option.narration && "pt-12",
                  !settled &&
                    !out &&
                    "hover:border-primary/50 active:scale-[0.98] motion-reduce:active:scale-100",
                  on && !settled && "border-primary bg-primary/5",
                  out && "opacity-35",
                  right && "border-success bg-success/10",
                  wrongPick && "border-destructive/50 opacity-60",
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
                    "pointer-events-none absolute -end-2 -top-2 grid size-9 place-items-center rounded-full text-white shadow",
                    right ? "bg-success" : "bg-muted-foreground",
                  )}
                >
                  {right ? (
                    <Check className="size-5" />
                  ) : (
                    <X className="size-5" />
                  )}
                </span>
              ) : null}
              {option.narration ? (
                <ReadAloud
                  text={partName(option)}
                  narration={option.narration}
                  size="small"
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
            className="h-14 rounded-full px-8 text-lg"
            disabled={picked.length === 0 || respond.isPending}
            onClick={() => {
              setChosen(picked);
              respond.mutate(picked);
            }}
          >
            <Check aria-hidden className="size-5" />
            {m.lrnYoungCheck()}
          </Button>
        </div>
      ) : null}
      <output aria-live="polite">
        <YoungOutcome view={view} />
      </output>
    </div>
  );
}
