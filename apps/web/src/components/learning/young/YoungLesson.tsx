import type { ContentNode } from "@faridalms/domain/content";
import type { CheckView, StudentBlock } from "@faridalms/domain/learning";

import { contentPlainText, textDirection } from "@faridalms/domain/content";
import { lessonSteps } from "@faridalms/domain/lesson-steps";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
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

import type { CheckDriver } from "../Checks";

import { CheckBlockView, isCheckBlock, isSettled } from "../Checks";
import { Media } from "../LessonMedia";
import { ReadAloud, sayAloud, stopSounds } from "../ReadAloud";
import { Burst } from "./motion";
import { playSound, setSoundsOn, soundsOn } from "./sounds";
import { YoungChoice } from "./YoungChoice";

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
            <span className="flex w-11 shrink-0 justify-center pt-1">
              <ReadAloud text={text} narration={node.$?.narration ?? null} />
            </span>
            <div className="min-w-0 flex-1">{drawn}</div>
          </div>
        );
      }}
    />
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
  if (block.type === "choice")
    return (
      <section className="grid gap-6">
        <div
          dir={textDirection(block.prompt) ?? undefined}
          className="flex items-center justify-center gap-3"
        >
          <ReadAloud text={block.prompt} narration={block.narration} />
          <h2 dir="auto" className="text-2xl leading-9 font-bold sm:text-3xl">
            {block.prompt}
          </h2>
        </div>
        <YoungChoice block={block} view={view} driver={driver} />
      </section>
    );
  if (isCheckBlock(block))
    return <CheckBlockView block={block} view={view} driver={driver} />;
  return null;
}

/** How far through the lesson a child is, as a track of screens, without numbers. */
function Track({ at, total }: { at: number; total: number }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
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
            "h-3 min-w-1 flex-1 rounded-full transition-colors",
            index <= at ? "bg-primary" : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

const round = "size-14 rounded-full";

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
  const [at, setAt] = useState<number | "start" | "end">("start");
  const [sounds, setSounds] = useState(soundsOn);
  const page = useRef<HTMLDivElement>(null);
  const finished = useRef(false);

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
    page.current?.scrollTo({ top: 0 });
    page.current?.focus({ preventScroll: true });
    onReach?.(id.split(":")[0] ?? id);
    const opening = openingVoice(step);
    if (opening) sayAloud(opening.text, opening.narration);
  });
  useEffect(() => {
    if (stepId) onOpen(stepId);
  }, [stepId]);

  useEffect(() => {
    if (at !== "end" || finished.current) return;
    finished.current = true;
    playSound("done");
    onFinish?.();
  }, [at, onFinish]);

  const questions = step.filter(isCheckBlock);
  const done = questions.every((block) => isSettled(block, checks[block.id]));
  const resumeAt = position
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
    <dialog
      open
      aria-label={title}
      className="fixed inset-0 z-50 m-0 flex size-full max-h-none max-w-none flex-col bg-background p-0 text-foreground"
    >
      <header className="flex items-center gap-3 px-3 py-3 sm:px-6">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={round}
          aria-label={m.lrnYoungClose()}
          onClick={onClose}
        >
          <X aria-hidden className="size-6" />
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
            className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-6 sm:px-6 sm:py-10"
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
        <footer className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(round, at === 0 && "invisible")}
            aria-label={m.lrnYoungPreviousStep()}
            onClick={back}
          >
            <ArrowLeft aria-hidden className="size-6 rtl:-scale-x-100" />
          </Button>
          <Button
            type="button"
            size="icon"
            className={cn(
              "size-19 rounded-full shadow-md",
              done && "motion-safe:animate-[pulse_1.6s_ease-in-out_2]",
            )}
            aria-label={m.lrnYoungNextStep()}
            disabled={!done}
            onClick={forward}
          >
            <ArrowRight aria-hidden className="size-8 rtl:-scale-x-100" />
          </Button>
        </footer>
      ) : null}
    </dialog>
  );
}
