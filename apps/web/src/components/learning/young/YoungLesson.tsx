import type { ContentNode } from "@faridalms/domain/content";
import type { CheckView, StudentBlock } from "@faridalms/domain/learning";

import { contentPlainText, textDirection } from "@faridalms/domain/content";
import { lessonSteps } from "@faridalms/domain/lesson-steps";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { useHydrated } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Play,
  RotateCcw,
  Star,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { ContentView } from "~/components/content/ContentView";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import type { CheckDriver, CheckStudentBlock } from "../Checks";

import { CheckBlockView, isCheckBlock, isSettled } from "../Checks";
import { Media } from "../LessonMedia";
import { ReadAloud, sayAloud, stopSounds } from "../ReadAloud";
import { Burst } from "./motion";
import { playSound, setSoundsOn, soundsOn } from "./sounds";
import { FoundContext, YoungChoice } from "./YoungChoice";
import { YoungCounting } from "./YoungCounting";
import { YoungMemory } from "./YoungMemory";
import { YoungMatching, YoungOrdering, YoungSorting } from "./YoungPlace";
import { YoungSpelling } from "./YoungSpelling";
import { YoungSpoken } from "./YoungSpoken";
import { YoungTracing } from "./YoungTracing";

const fileUrl = (fileId: string) => `/files/${fileId}`;

type Content = Extract<StudentBlock, { type: "content" }>;

const nodeText = (block: Content, node: ContentNode) =>
  contentPlainText({ root: { ...block.content.root, children: [node] } });

/** The first thing on a screen with a recording, or failing that, its question. */
function openingVoice(step: StudentBlock[]) {
  for (const block of step) {
    if (block.type === "content")
      for (const node of block.content.root.children ?? [])
        if (node.$?.narration)
          return { text: nodeText(block, node), narration: node.$.narration };
    if (isCheckBlock(block))
      return { text: block.prompt, narration: block.narration ?? null };
  }
  return null;
}

function YoungContent({ block }: { block: Content }) {
  return (
    <ContentView
      document={block.content}
      fileUrl={fileUrl}
      className="fe-young"
      renderBlock={(node, drawn) => {
        const text = nodeText(block, node);
        return (
          <div
            dir={textDirection(text) ?? undefined}
            className="flex items-start gap-3"
          >
            <span className="flex w-14 shrink-0 justify-center">
              <ReadAloud
                text={text}
                narration={node.$?.narration ?? null}
                size="card"
              />
            </span>
            <div className="min-w-0 flex-1">{drawn}</div>
          </div>
        );
      }}
    />
  );
}

/** A question's words, big, with the speaker that reads them. */
function Prompt({ block }: { block: CheckStudentBlock }) {
  return (
    <div
      dir={textDirection(block.prompt) ?? undefined}
      className="flex items-center justify-center gap-3"
    >
      <ReadAloud text={block.prompt} narration={block.narration} size="large" />
      <h2 className="text-center text-3xl leading-tight font-bold text-balance sm:text-4xl">
        <span dir="auto" className="young-words">
          {block.prompt}
        </span>
      </h2>
    </div>
  );
}

function StepBlock({
  block,
  view,
  driver,
}: {
  block: StudentBlock;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  if (block.type === "content") return <YoungContent block={block} />;
  if (block.type === "media") return <Media block={block} />;
  if (!isCheckBlock(block)) return null;
  const answer =
    block.type === "choice" ? (
      <YoungChoice block={block} view={view} driver={driver} />
    ) : block.type === "matching" && block.memory ? (
      <YoungMemory block={block} view={view} driver={driver} />
    ) : block.type === "matching" ? (
      <YoungMatching block={block} view={view} driver={driver} />
    ) : block.type === "sorting" ? (
      <YoungSorting block={block} view={view} driver={driver} />
    ) : block.type === "ordering" ? (
      <YoungOrdering block={block} view={view} driver={driver} />
    ) : block.type === "counting" ? (
      <YoungCounting block={block} view={view} driver={driver} />
    ) : block.type === "tracing" ? (
      <YoungTracing block={block} view={view} driver={driver} />
    ) : block.type === "spelling" ? (
      <YoungSpelling block={block} view={view} driver={driver} />
    ) : block.type === "written" && block.recordSeconds ? (
      <YoungSpoken block={block} view={view} driver={driver} />
    ) : null;
  if (!answer)
    return <CheckBlockView block={block} view={view} driver={driver} />;
  // A question is laid out in its own language's direction, whatever the page's.
  return (
    <section
      dir={textDirection(block.prompt) ?? undefined}
      className="grid gap-6"
    >
      <Prompt block={block} />
      {answer}
    </section>
  );
}

/** How far through the lesson a child is, as a track of screens, without numbers. */
function Track({ at, total }: { at: number; total: number }) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-2.5">
      <span className="sr-only">
        {m.lrnYoungStep({
          number: formatNumber(at + 1),
          total: formatNumber(total),
        })}
      </span>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          aria-hidden
          className={cn(
            "shrink-0 rounded-full transition-colors",
            index === at
              ? "size-5 bg-primary ring-4 ring-primary/25"
              : "size-3.5",
            index < at && "bg-primary",
            index > at && "bg-muted-foreground/25",
          )}
        />
      ))}
    </div>
  );
}

const round = "size-14 rounded-full";

/** How long a child sits without touching anything before the screen is said again. */
const PROMPT_AGAIN_MS = 7000;
/** Touches this soon after a screen changes are a finger still down from the last one. */
const HOLDOVER_MS = 400;

/**
 * A lesson for young children, one screen at a time over the whole window:
 * a big start button (whose tap also lets the page play sound), each screen
 * read aloud as it opens, answers by tapping, and a big arrow on once every
 * question on the screen is settled. The end says so and points onward.
 */
export function YoungLesson({
  title,
  blocks,
  checks,
  driver,
  position,
  onReach,
  onClose,
  onFinish,
  retry,
  next,
  badge,
}: {
  title: string;
  blocks: StudentBlock[];
  checks: Record<string, CheckView>;
  driver: CheckDriver;
  position?: string | null;
  onReach?: (blockId: string) => void;
  onClose: () => void;
  /** Called on reaching the end, for a lesson the child finishes by saying so. */
  onFinish?: () => void;
  retry?: { pending: boolean; onRetry: () => void } | null;
  next?: { label: string; onNext: () => void } | null;
  /** Shown beside the progress, as a teacher's preview is labelled. */
  badge?: string;
}) {
  const steps = useMemo(() => lessonSteps(blocks), [blocks]);
  const hydrated = useHydrated();
  const [at, setAt] = useState<number | "start" | "end">("start");
  const [sounds, setSounds] = useState(soundsOn);
  const page = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDialogElement>(null);
  const finished = useRef(false);
  // No screen has opened yet, so nothing is a holdover from one.
  const opened = useRef(Number.NEGATIVE_INFINITY);
  const [found, setFound] = useState<ReadonlySet<string>>(new Set());
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // The page under the lesson stays still while it covers the window.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
      stopSounds();
    };
  }, []);

  const step = typeof at === "number" ? (steps[at] ?? []) : [];
  const stepId = step[0]?.id;
  // Only a new screen reads itself out; answering on it does not.
  const onOpen = useEffectEvent((id: string) => {
    opened.current = performance.now();
    page.current?.scrollTo({ top: 0 });
    page.current?.focus({ preventScroll: true });
    onReach?.(id.split(":")[0] ?? id);
    const opening = openingVoice(step);
    if (opening) sayAloud(opening.text, opening.narration);
  });
  useEffect(() => {
    if (stepId) onOpen(stepId);
  }, [stepId]);

  // A child who has not touched anything for a while hears the screen once more.
  const promptAgain = useEffectEvent(() => {
    if (done) return;
    const opening = openingVoice(step);
    if (opening) sayAloud(opening.text, opening.narration);
  });
  useEffect(() => {
    const dialog = stage.current;
    if (!stepId || !dialog) return undefined;
    const timer = setTimeout(promptAgain, PROMPT_AGAIN_MS);
    const touched = () => clearTimeout(timer);
    dialog.addEventListener("pointerdown", touched);
    dialog.addEventListener("keydown", touched);
    return () => {
      clearTimeout(timer);
      dialog.removeEventListener("pointerdown", touched);
      dialog.removeEventListener("keydown", touched);
    };
  }, [stepId]);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  useEffect(() => {
    if (at !== "end" || finished.current) return;
    finished.current = true;
    playSound("done");
    onFinish?.();
  }, [at, onFinish]);

  const questions = step.filter(isCheckBlock);
  // A choice whose answer was shown waits for the child to tap it.
  const done = questions.every((block) => {
    const view = checks[block.id];
    return (
      isSettled(block, view) &&
      (block.type !== "choice" ||
        block.multiple ||
        view?.correct ||
        found.has(block.id))
    );
  });
  // A child coming back starts at the first question still open.
  const firstOpen = steps.findIndex((blocksOf) =>
    blocksOf.some(
      (block) => isCheckBlock(block) && !isSettled(block, checks[block.id]),
    ),
  );
  const resumeAt =
    firstOpen >= 0
      ? firstOpen
      : position
        ? Math.max(
            0,
            steps.findIndex((blocksOf) =>
              blocksOf.some((block) => block.id === position),
            ),
          )
        : 0;

  const forward = () =>
    setAt((current) =>
      typeof current !== "number"
        ? current
        : current + 1 >= steps.length
          ? "end"
          : current + 1,
    );
  const back = () =>
    setAt((current) =>
      typeof current === "number" && current > 0 ? current - 1 : current,
    );

  return (
    <FoundContext.Provider
      value={{
        found,
        find: (blockId) =>
          setFound((current) => new Set([...current, blockId])),
      }}
    >
      <dialog
        ref={stage}
        open
        aria-label={title}
        className="fixed inset-0 z-50 m-0 flex size-full max-h-none max-w-none touch-manipulation flex-col bg-background p-0 text-foreground"
      >
        <header className="flex items-center gap-3 px-3 py-3 sm:px-6">
          {/* Leaving takes a second tap, so a stray one does not end the lesson. */}
          <Button
            type="button"
            variant={leaving ? "secondary" : "ghost"}
            size={leaving ? "default" : "icon"}
            className={cn(round, leaving && "w-auto px-5 text-base")}
            aria-label={leaving ? undefined : m.lrnYoungClose()}
            onClick={() => {
              if (leaving) return onClose();
              setLeaving(true);
              clearTimeout(leaveTimer.current);
              leaveTimer.current = setTimeout(() => setLeaving(false), 3000);
            }}
          >
            <X aria-hidden className="size-6" />
            {leaving ? m.lrnYoungLeave() : null}
          </Button>
          {typeof at === "number" ? (
            <Track at={at} total={steps.length} />
          ) : (
            <span className="flex-1" />
          )}
          {badge ? (
            <span className="shrink-0 rounded-full bg-info/10 px-3 py-1 text-sm font-medium text-info">
              {badge}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={round}
            aria-pressed={!sounds}
            aria-label={sounds ? m.lrnYoungSoundsOff() : m.lrnYoungSoundsOn()}
            onClick={() => {
              setSoundsOn(!sounds);
              setSounds(!sounds);
            }}
          >
            {sounds ? (
              <Volume2 aria-hidden className="size-6" />
            ) : (
              <VolumeX aria-hidden className="size-6" />
            )}
          </Button>
        </header>

        <div
          ref={page}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto outline-none"
          onClickCapture={(event) => {
            if (performance.now() - opened.current < HOLDOVER_MS) {
              event.stopPropagation();
              event.preventDefault();
            }
          }}
        >
          {at === "start" ? (
            <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-8 px-6 py-10 text-center">
              <h1
                dir="auto"
                className="text-3xl leading-tight font-bold text-balance sm:text-4xl"
              >
                {title}
              </h1>
              <Button
                type="button"
                className="size-28 rounded-full shadow-lg"
                aria-label={m.lrnYoungStart()}
                // A tap before the page comes alive would do nothing at all.
                disabled={!hydrated}
                onClick={() => setAt(steps.length > 0 ? resumeAt : "end")}
              >
                <Play
                  aria-hidden
                  className="size-12 translate-x-0.5 fill-current rtl:-scale-x-100"
                />
              </Button>
            </div>
          ) : at === "end" ? (
            <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-8 px-6 py-10 text-center">
              <span className="relative grid size-32 place-items-center rounded-full bg-success/15 text-success">
                <Star aria-hidden className="size-16 fill-current" />
                <Burst />
              </span>
              <h1 className="text-3xl leading-tight font-bold sm:text-4xl">
                {m.lrnYoungDone()}
              </h1>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {retry ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 rounded-full px-6 text-lg"
                    disabled={retry.pending}
                    onClick={() => {
                      retry.onRetry();
                      finished.current = false;
                      setAt("start");
                    }}
                  >
                    <RotateCcw aria-hidden className="size-5" />
                    {m.lrnYoungAgain()}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className="h-14 rounded-full px-8 text-lg"
                  onClick={next ? next.onNext : onClose}
                >
                  {next ? next.label : m.lrnYoungAllLessons()}
                  <ArrowRight aria-hidden className="size-5 rtl:-scale-x-100" />
                </Button>
              </div>
            </div>
          ) : (
            <div
              key={at}
              className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-4 sm:px-6 sm:py-6"
            >
              {step.map((block) => (
                <StepBlock
                  key={block.id}
                  block={block}
                  view={checks[block.id]}
                  driver={driver}
                />
              ))}
            </div>
          )}
        </div>

        {typeof at === "number" ? (
          // Wrists rest on the bottom edge, so the arrows sit well above it:
          // at the sides on wide screens, in a raised row on narrow ones.
          <nav
            aria-label={m.lrnLessonNav()}
            className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 pt-3 pb-8 sm:pb-16 lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-1/2 lg:max-w-none lg:-translate-y-1/2 lg:px-8 lg:pb-0"
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(
                "size-20 rounded-full lg:pointer-events-auto",
                at === 0 && "invisible",
              )}
              aria-label={m.lrnYoungPreviousStep()}
              onClick={back}
            >
              <ArrowLeft aria-hidden className="size-8 rtl:-scale-x-100" />
            </Button>
            <Button
              type="button"
              size="icon"
              className={cn(
                "size-26 rounded-full shadow-md lg:pointer-events-auto",
                done && "motion-safe:animate-[pulse_1.6s_ease-in-out_2]",
              )}
              aria-label={m.lrnYoungNextStep()}
              disabled={!done}
              onClick={forward}
            >
              <ArrowRight aria-hidden className="size-10 rtl:-scale-x-100" />
            </Button>
          </nav>
        ) : null}
      </dialog>
    </FoundContext.Provider>
  );
}
