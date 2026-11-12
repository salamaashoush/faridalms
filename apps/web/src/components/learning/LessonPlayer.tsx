import type {
  VowelMarks,
  CheckView,
  FeedbackShown,
  LessonCompletion,
  LessonResponse,
  ProgramRun,
  StoredTry,
  StudentBlock,
  Watched,
} from "@faridalms/domain/learning";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { MediaWatch, VideoControl } from "@faridalms/editor/player";

import { allWithoutVowelMarks } from "@faridalms/domain/arabic";
import { contentPlainText, textDirection } from "@faridalms/domain/content";
import {
  checkBlocks,
  checkStates,
  describeCheck,
  gateScore,
  isAuto,
  markResponse,
  viewCredit,
  watchables,
  studentBlocks,
  videoStops,
  watchedEnough,
} from "@faridalms/domain/learning";
import { lessonOfContent } from "@faridalms/domain/lesson-content";
import { translatedLesson } from "@faridalms/domain/lesson-translation";
import { otherLocale } from "@faridalms/domain/translations";
import { mediaClock } from "@faridalms/editor/format";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Progress } from "@faridalms/ui/progress";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { Page } from "@faridalms/ui/system/page";
import { Segmented } from "@faridalms/ui/system/panel";
import { RecordHeader, RecordSection } from "@faridalms/ui/system/record-page";
import { Tabs, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Clock,
  Eye,
  Hourglass,
  Lock,
  Pencil,
  Play,
  Radio,
  RotateCcw,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import type { OwnCode, OwnProjects } from "~/components/code/own-code";
import type {
  CheckDriver,
  CheckStudentBlock,
} from "~/components/questions/Checks";

import { OwnCodeContext, OwnProjectsContext } from "~/components/code/own-code";
import { ContentView, WholeDocument } from "~/components/content/ContentView";
import { LOCALE_LABEL } from "~/components/content/languages";
import { Media } from "~/components/learning/LessonMedia";
import { paperBlock } from "~/components/print/paper-blocks";
import { usePrint } from "~/components/print/usePrint";
import { CheckLanguage } from "~/components/questions/checkLanguage";
import {
  CheckBlockView,
  isCheckBlock,
  isSettled,
} from "~/components/questions/Checks";
import {
  ReadAloud,
  ReaderContext,
  YoungContext,
} from "~/components/questions/ReadAloud";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import {
  lessonEditorQuery,
  lessonQuery,
  pacingQuery,
  pollResultsQuery,
} from "~/queries/learning";
import {
  readLessonIn,
  completeLesson,
  answerReview,
  keepOwnCode,
  keepOwnProject,
  recordRun,
  respondToCheck,
  askHint,
  retryLesson,
  seeResults,
  revealCheck,
  saveReadingPosition,
  saveWatch,
} from "~/server/learning";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { usePacingChannel } from "./pacingChannel";
import { youngLessons } from "./slots";
import { YoungLesson } from "./young/YoungLesson";

type Played = Awaited<
  ReturnType<NonNullable<ReturnType<typeof lessonQuery>["queryFn"]>>
>;

const fileUrl = (fileId: string) => `/files/${fileId}`;

const RULE_HINT: Record<LessonCompletion, (() => string) | null> = {
  view: null,
  mark: m.lrnRuleMark,
  quiz: m.lrnRuleQuiz,
  score: null,
  reflection: m.lrnRuleReflection,
  watch: m.lrnRuleWatch,
};

const ruleText = (completion: LessonCompletion, passScore: number | null) =>
  completion === "score"
    ? m.lrnRuleScore({ score: formatNumber(passScore ?? 100) })
    : RULE_HINT[completion]?.();

type GateWaits = "questions" | "media" | "both";

/** Where a student stands at a gate: done out of what it counts, or their score against its goal. */
type GateStanding =
  | { kind: "count"; waits: GateWaits | "some"; done: number; total: number }
  | { kind: "score"; score: number; goal: number; short: boolean };

const gateOpen = (standing: GateStanding) =>
  standing.kind === "count"
    ? standing.done >= standing.total
    : standing.score >= standing.goal;

const TEACHER_MARKED = new Set<StudentBlock["type"]>([
  "written",
  "scratch",
  "project",
]);

/** Whether a question counts toward a gate's score: worth points, and marked as it is answered. */
const scoresAtGate = (block: CheckStudentBlock, view: CheckView | undefined) =>
  block.points > 0 &&
  block.type !== "poll" &&
  !TEACHER_MARKED.has(block.type) &&
  view?.timing === null;

const GATE_LOCKED: Record<GateWaits, () => string> = {
  questions: m.lrnGateLocked,
  media: m.lrnGateLockedWatch,
  both: m.lrnGateLockedBoth,
};

const GATE_PROGRESS: Record<
  GateWaits,
  (inputs: { count: string; total: string }) => string
> = {
  questions: m.lrnGateProgress,
  media: m.lrnGateProgressWatch,
  both: m.lrnGateProgressBoth,
};

interface GateProps {
  standing: GateStanding;
  retry?: { pending: boolean; onRetry: () => void } | undefined;
  onContinue: () => void;
}

function Gate({ standing, retry, onContinue }: GateProps) {
  if (gateOpen(standing))
    return (
      <div className="flex justify-center">
        <Button type="button" className="max-md:h-10" onClick={onContinue}>
          {m.lrnContinue()}
          <ArrowDown aria-hidden />
        </Button>
      </div>
    );
  const frame =
    "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-dashed px-5 py-4 text-sm leading-5 text-muted-foreground";
  if (standing.kind === "score" && standing.short)
    return (
      <div className={cn(frame, "gap-y-3")}>
        <Lock aria-hidden className="size-4" />
        <span className="text-center">
          {m.lrnGateShort({
            score: formatNumber(standing.score),
            goal: formatNumber(standing.goal),
          })}
        </span>
        {retry ? (
          <RetryButton pending={retry.pending} onRetry={retry.onRetry} />
        ) : null}
      </div>
    );
  return (
    <div className={frame}>
      <Lock aria-hidden className="size-4" />
      {standing.kind === "score" ? (
        <>
          <span>
            {m.lrnGateLockedScore({ score: formatNumber(standing.goal) })}
          </span>
          <span className="tabular-nums">
            {m.lrnGateScoreSoFar({ score: formatNumber(standing.score) })}
          </span>
        </>
      ) : (
        <>
          <span>
            {standing.waits === "some"
              ? m.lrnGateLockedSome({ count: formatNumber(standing.total) })
              : GATE_LOCKED[standing.waits]()}
          </span>
          <span className="tabular-nums">
            {GATE_PROGRESS[
              standing.waits === "some" ? "questions" : standing.waits
            ]({
              count: formatNumber(standing.done),
              total: formatNumber(standing.total),
            })}
          </span>
        </>
      )}
    </div>
  );
}

interface LessonBodyProps {
  blocks: StudentBlock[];
  checks: Record<string, CheckView>;
  driver: CheckDriver;
  position?: string | null;
  onReach?: (blockId: string) => void;
  watch?: (fileId: string) => MediaWatch | undefined;
  watches?: Record<string, Watched>;
  /** The part a teacher leading the lesson live has opened to the class. */
  paced?: { step: number } | null;
  /** The language the lesson teaches in, where its teacher set one. */
  language?: ContentLocale | null;
  /** Another go at the lesson, for a student short of a gate's score. */
  retry?: { pending: boolean; onRetry: () => void };
}

/**
 * A lesson's blocks as its student meets them, stopping at each continue gate
 * until the questions above it are settled, the recordings above it
 * watched, and the student moves on.
 */
function LessonBody({
  blocks,
  checks,
  driver,
  position,
  onReach,
  watch,
  watches = {},
  paced = null,
  language,
  retry,
}: LessonBodyProps) {
  const young = useContext(YoungContext);
  const stops = useMemo(() => videoStops(blocks), [blocks]);
  const stopOf = useMemo(() => {
    const found = new Map<string, { fileId: string; at: number }>();
    for (const [fileId, list] of stops)
      for (const stop of list) found.set(stop.blockId, { fileId, at: stop.at });
    return found;
  }, [stops]);
  const [stopped, setStopped] = useState<ReadonlySet<string>>(new Set());
  // Questions a student opened before the video reached them, as anyone who
  // cannot hear or stream the video must be able to.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const players = useRef(new Map<string, VideoControl>());
  const answered = (blockId: string) => {
    const block = blocks.find((item) => item.id === blockId);
    return Boolean(
      block && isCheckBlock(block) && isSettled(block, checks[block.id]),
    );
  };
  // A video's questions come in as it plays: each opens when the video
  // stops for it, and the video plays on once it is answered.
  const watching = (fileId: string): MediaWatch | undefined => {
    const base = watch?.(fileId);
    const list = stops.get(fileId);
    if (!base || !list) return base;
    return {
      ...base,
      stops: list.map((stop) => ({
        at: stop.at,
        done: answered(stop.blockId),
      })),
      onQuestion: (at) => {
        const asked = list.filter((stop) => stop.at === at);
        flushSync(() =>
          setStopped(
            (current) =>
              new Set([...current, ...asked.map((stop) => stop.blockId)]),
          ),
        );
        const first = asked.find((stop) => !answered(stop.blockId)) ?? asked[0];
        if (!first) return;
        const target = document.getElementById(`block-${first.blockId}`);
        target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      },
      bind: (control) => players.current.set(fileId, control),
    };
  };
  /** Where the part of a video a stop asks about begins: the stop before it, or the start. */
  const segmentStart = (fileId: string, at: number) =>
    (stops.get(fileId) ?? [])
      .map((stop) => stop.at)
      .filter((time) => time < at)
      .at(-1) ?? 0;
  // Code that waits for a prediction runs once the question above it has a
  // try, right or not: seeing a wrong guess run is the point of predicting.
  const predictedAbove = (index: number) => {
    const question = blocks.slice(0, index).findLast(isCheckBlock);
    const view = question ? checks[question.id] : undefined;
    return !question || Boolean(view && (view.tries > 0 || view.revealed));
  };
  // What a gate waits for: everything above it, only the nearest question
  // or video above it, or nothing but the student's word.
  const waitedFor = (index: number) => {
    const gate = blocks[index];
    const requires = gate?.type === "gate" ? gate.requires : "above";
    const above = blocks.slice(0, index);
    if (requires === "none") return { questions: [], media: [] };
    if (requires === "last")
      for (const block of above.toReversed()) {
        if (isCheckBlock(block)) return { questions: [block], media: [] };
        const video = watchables([block]).at(-1);
        if (video) return { questions: [], media: [video] };
      }
    return { questions: above.filter(isCheckBlock), media: watchables(above) };
  };
  const finished = (block: CheckStudentBlock) =>
    isSettled(block, checks[block.id]);
  const settledAbove = (index: number): GateStanding => {
    const gate = blocks[index];
    const asked = blocks.slice(0, index).filter(isCheckBlock);
    if (gate?.type === "gate" && gate.requires === "some") {
      const total = gate.goal ?? 1;
      const done = asked.filter(finished).length;
      return {
        kind: "count",
        waits: "some",
        done: Math.min(done, total),
        total,
      };
    }
    if (gate?.type === "gate" && gate.requires === "score") {
      const counted = asked.filter((block) =>
        scoresAtGate(block, checks[block.id]),
      );
      const score =
        gateScore(
          counted.map((block) => ({
            points: block.points,
            credit: viewCredit(checks[block.id]),
          })),
        ) ?? 0;
      const goal = gate.goal ?? 100;
      return {
        kind: "score",
        score,
        goal,
        short: score < goal && counted.every(finished),
      };
    }
    const { questions, media } = waitedFor(index);
    const waits: GateWaits =
      questions.length === 0
        ? "media"
        : media.length === 0
          ? "questions"
          : "both";
    return {
      kind: "count",
      waits,
      total: questions.length + media.length,
      done:
        questions.filter(finished).length +
        media.filter((file) => watchedEnough(watches[file])).length,
    };
  };
  const reached = position
    ? blocks.findIndex((block) => block.id === position)
    : -1;
  const [passed, setPassed] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        blocks.flatMap((block, index) => {
          if (block.type !== "gate") return [];
          const standing = settledAbove(index);
          // A gate over questions opens when they are settled, even after a
          // fresh attempt; one over reading alone stays open once read past.
          return (
            standing.kind === "count" && standing.total === 0
              ? index < reached
              : gateOpen(standing)
          )
            ? [block.id]
            : [];
        }),
      ),
  );
  const gateNumber = useMemo(() => {
    const numbers = new Map<string, number>();
    for (const block of blocks)
      if (block.type === "gate") numbers.set(block.id, numbers.size);
    return numbers;
  }, [blocks]);
  // The parts a teacher has led the class into stay open once the lesson
  // is no longer led.
  const [ledTo, setLedTo] = useState(paced?.step ?? 0);
  if (paced && paced.step > ledTo) setLedTo(paced.step);
  useEffect(() => {
    if (ledTo === 0) return;
    const gate = blocks.findIndex(
      (block) => gateNumber.get(block.id) === ledTo - 1,
    );
    const next = gate === -1 ? undefined : blocks[gate + 1];
    if (next)
      document
        .getElementById(`block-${next.id}`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [ledTo, blocks, gateNumber]);
  const [resumed, setResumed] = useState(false);
  const shown: { block: StudentBlock; index: number }[] = [];
  for (const [index, block] of blocks.entries()) {
    if (block.type === "gate") {
      const number = gateNumber.get(block.id) ?? 0;
      const closed = paced
        ? number >= paced.step
        : !passed.has(block.id) && number >= ledTo;
      if (closed) {
        shown.push({ block, index });
        break;
      }
      continue;
    }
    shown.push({ block, index });
  }
  // A lesson led live goes where the teacher takes it.
  const resumeAt =
    !paced &&
    !resumed &&
    reached > 0 &&
    shown.some(({ index }) => index === reached)
      ? blocks[reached]?.id
      : undefined;

  return (
    <WholeDocument parts={blocks} lang={language}>
      <CheckLanguage.Provider value={language ?? null}>
        {resumeAt ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-5 py-3">
            <p className="text-sm leading-5 text-muted-foreground">
              {m.lrnResumeHint()}
            </p>
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              onClick={() => {
                setResumed(true);
                const target = document.getElementById(`block-${resumeAt}`);
                target?.scrollIntoView({ block: "start" });
                target?.focus({ preventScroll: true });
              }}
            >
              {m.lrnResume()}
              <ArrowDown aria-hidden />
            </Button>
          </div>
        ) : null}
        {shown.map(({ block, index }) => {
          let body;
          if (block.type === "gate" && paced) {
            body = (
              <p className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed px-5 py-4 text-sm leading-5 text-muted-foreground">
                <Radio aria-hidden className="size-4" />
                {m.lrnPacedWaits()}
              </p>
            );
          } else if (block.type === "gate") {
            body = (
              <Gate
                standing={settledAbove(index)}
                retry={retry}
                onContinue={() => {
                  // The blocks after the gate must exist before focus can move to them.
                  flushSync(() =>
                    setPassed((current) => new Set([...current, block.id])),
                  );
                  const next = blocks[index + 1];
                  if (next) {
                    document.getElementById(`block-${next.id}`)?.focus();
                    onReach?.(next.id);
                  }
                }}
              />
            );
          } else if (block.type === "content")
            body = (
              <ContentView
                document={block.content}
                fileUrl={fileUrl}
                watch={watching}
                predicted={predictedAbove(index)}
                renderBlock={(node, drawn) => {
                  const narration = node.$?.narration ?? null;
                  if (!young && !narration) return drawn;
                  const text = contentPlainText({
                    root: { ...block.content.root, children: [node] },
                  });
                  // For young children every block keeps a speaker's room at
                  // its start, so their text lines up whether one shows or not.
                  return young ? (
                    <div
                      dir={textDirection(text) ?? undefined}
                      className="flex items-start gap-3"
                    >
                      <span className="flex w-11 shrink-0 justify-center">
                        <ReadAloud text={text} narration={narration} />
                      </span>
                      <div className="min-w-0 flex-1">{drawn}</div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">{drawn}</div>
                      <ReadAloud
                        text={text}
                        narration={narration}
                        voice={false}
                        size="small"
                        className="mt-1"
                      />
                    </div>
                  );
                }}
              />
            );
          else if (block.type === "media")
            body = <Media block={block} watch={watching} />;
          else if (isCheckBlock(block)) {
            const stop = stopOf.get(block.id);
            const view = checks[block.id];
            const settledHere = isSettled(block, view);
            const missed = Boolean(view && view.tries > 0 && !settledHere);
            body =
              stop &&
              !settledHere &&
              !stopped.has(block.id) &&
              !opened.has(block.id) ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-4 py-2 text-sm leading-5 text-muted-foreground">
                  <Clock aria-hidden className="size-4 shrink-0" />
                  <p className="min-w-0 flex-1">
                    {m.lrnVideoQuestionAhead({
                      time: mediaClock(stop.at),
                    })}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-me-2 max-md:h-10"
                    onClick={() => {
                      flushSync(() =>
                        setOpened((current) => new Set([...current, block.id])),
                      );
                      document.getElementById(`block-${block.id}`)?.focus();
                    }}
                  >
                    {m.lrnVideoAnswerNow()}
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3">
                  <CheckBlockView
                    block={block}
                    view={checks[block.id]}
                    driver={driver}
                  />
                  {stop && settledHere && stopped.has(block.id) ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-self-start max-md:h-10"
                      onClick={() => players.current.get(stop.fileId)?.play()}
                    >
                      <Play aria-hidden />
                      {m.lrnVideoContinue()}
                    </Button>
                  ) : null}
                  {/* After a wrong try, the part of the video the question asks about plays again. */}
                  {stop && missed && stopped.has(block.id) ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-self-start max-md:h-10"
                      onClick={() =>
                        players.current
                          .get(stop.fileId)
                          ?.playFrom(segmentStart(stop.fileId, stop.at))
                      }
                    >
                      <RotateCcw aria-hidden />
                      {m.lrnVideoRewatch({
                        time: mediaClock(segmentStart(stop.fileId, stop.at)),
                      })}
                    </Button>
                  ) : null}
                </div>
              );
          }
          return (
            <section
              key={block.id}
              id={`block-${block.id}`}
              // A gate is passed by choosing to continue, never by scrolling to it.
              data-block={block.type === "gate" ? undefined : block.id}
              tabIndex={-1}
              className="scroll-mt-24 outline-none"
            >
              {body}
            </section>
          );
        })}
      </CheckLanguage.Provider>
    </WholeDocument>
  );
}

/**
 * Reports what a student plays of each of a lesson's recordings, and where
 * to pick each up; `onFinished` runs once if that finishes the lesson.
 */
function useWatching(
  lessonId: string,
  watches: Record<string, { positionSeconds: number; reachedSeconds: number }>,
  onWatched: (
    watched: Awaited<ReturnType<typeof saveWatch>>["watched"],
  ) => void,
  onFinished: () => void,
) {
  const finished = useRef(false);
  return (fileId: string): MediaWatch => ({
    startAt: watches[fileId]?.positionSeconds ?? 0,
    reachedAt: watches[fileId]?.reachedSeconds ?? 0,
    onHeldBack: () => toast(m.lrnNoSkipping(), { id: `skip-${fileId}` }),
    report: (report) => {
      // A lost report only means those seconds count when played again.
      void saveWatch({ data: { lessonId, video: fileId, ...report } })
        .then((result) => {
          onWatched(result.watched);
          if (result.completed && !finished.current) {
            finished.current = true;
            onFinished();
          }
        })
        .catch(() => undefined);
    },
  });
}

/** Saves the furthest block a student has scrolled to, a moment after they stop. */
function useReadingPosition(
  lessonId: string,
  blocks: StudentBlock[],
  saved: string | null,
) {
  const furthest = useRef(
    saved ? blocks.findIndex((block) => block.id === saved) : -1,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reach = (blockId: string) => {
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index <= furthest.current) return;
    furthest.current = index;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // A lost position only means the lesson opens at the top next time.
      void saveReadingPosition({ data: { lessonId, blockId } }).catch(
        () => undefined,
      );
    }, 1500);
  };
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            reach((entry.target as HTMLElement).dataset.block ?? "");
      },
      { threshold: 0.6 },
    );
    for (const element of document.querySelectorAll<HTMLElement>(
      "[data-block]",
    ))
      observer.observe(element);
    return () => observer.disconnect();
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return reach;
}

interface FooterProps {
  data: Played;
}

function Footer({ data }: FooterProps) {
  return (
    <nav
      aria-label={m.lrnLessonNav()}
      className="flex flex-wrap items-center justify-between gap-3 border-t pt-6"
    >
      {data.previous ? (
        <ButtonLink
          to="/lessons/$lessonId"
          params={{ lessonId: data.previous }}
          search={{}}
          variant="outline"
          className="max-md:h-10"
        >
          <ArrowLeft aria-hidden className="rtl:rotate-180" />
          {m.lrnPrevious()}
        </ButtonLink>
      ) : (
        <span />
      )}
      {data.next ? (
        <ButtonLink
          to="/lessons/$lessonId"
          params={{ lessonId: data.next }}
          search={{}}
          className="max-md:h-10"
        >
          {m.lrnNext()}
          <ArrowRight aria-hidden className="rtl:rotate-180" />
        </ButtonLink>
      ) : (
        <ButtonLink
          to="/modules/$moduleId"
          params={{ moduleId: data.module.id }}
          search={{}}
          variant={data.completedAt ? "default" : "outline"}
          className="max-md:h-10"
        >
          {m.lrnBackToModule()}
        </ButtonLink>
      )}
    </nav>
  );
}

/**
 * Vowel marks as the lesson sets them: shown, hidden, or the student's to
 * choose with a toggle. Answers are marked the same either way.
 */
function useVowelMarks(setting: VowelMarks) {
  const [marks, setMarks] = useState(setting !== "hidden");
  return useMemo(() => {
    const hidden = setting === "hidden" || (setting === "choice" && !marks);
    return {
      strip: <T,>(value: T): T =>
        hidden ? allWithoutVowelMarks(value) : value,
      toggle:
        setting === "choice" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit max-md:h-10"
            aria-pressed={!marks}
            onClick={() => setMarks((current) => !current)}
          >
            {marks ? m.lrnHideVowelMarks() : m.lrnShowVowelMarks()}
          </Button>
        ) : null,
    };
  }, [setting, marks]);
}

export interface LessonPlayerProps {
  lessonId: string;
}

/** One lesson for its student: read, answer, and move on when it is done. */
export function LessonPlayer({ lessonId }: LessonPlayerProps) {
  const query = lessonQuery(lessonId);
  const data = useSuspenseQuery(query).data;
  const queryClient = useQueryClient();
  const pushed = usePacingChannel(
    lessonId,
    () =>
      void queryClient.invalidateQueries({
        queryKey: pacingQuery(lessonId).queryKey,
      }),
  );
  const paced =
    useQuery({
      ...pacingQuery(lessonId, pushed),
      initialData: { paced: data.paced },
    }).data.paced ?? null;
  const earlyYears = useSlot(youngLessons).length > 0;
  const navigate = useNavigate();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["learning"] });
  const apply = async (
    blockId: string,
    result: {
      check: CheckView;
      score: number | null;
      completed: boolean;
      review: (typeof data)["review"];
    },
  ) => {
    queryClient.setQueryData(query.queryKey, (old) =>
      old
        ? {
            ...old,
            checks: { ...old.checks, [blockId]: result.check },
            score: result.score,
            review: result.review,
          }
        : old,
    );
    if (result.completed && !data.completedAt) {
      await refresh();
      toast.success(m.lrnLessonFinished());
    }
  };
  const ownCode = useMemo(
    (): OwnCode => ({
      codes: data.codes,
      keep: (blockId, code) =>
        void keepOwnCode({ data: { lessonId, blockId, code } }).catch(
          (error: unknown) =>
            toast.error(getMessageFromError(error), { id: "own-code" }),
        ),
    }),
    [data.codes, lessonId],
  );
  const ownProjects = useMemo(
    (): OwnProjects => ({
      lessonId,
      projects: data.projects,
      keep: async (blockId, files, fresh) => {
        await keepOwnProject({ data: { lessonId, blockId, files, fresh } });
        // The card may be drawn afresh before the lesson is read again.
        queryClient.setQueryData(query.queryKey, (old) =>
          old
            ? {
                ...old,
                projects: {
                  ...old.projects,
                  [blockId]: {
                    files,
                    changed: old.projects[blockId]?.changed ?? false,
                  },
                },
              }
            : old,
        );
      },
    }),
    [data.projects, lessonId, queryClient, query.queryKey],
  );
  // A run kept or not changes nothing for the student, so a lost one is let go.
  const keepRun = (blockId: string, run: ProgramRun) =>
    void recordRun({ data: { lessonId, blockId, ...run } }).catch(
      () => undefined,
    );
  const driver: CheckDriver = {
    respond: async (blockId, response) => {
      const result = await respondToCheck({
        data: { lessonId, blockId, response },
      });
      await apply(blockId, result);
    },
    reveal: async (blockId) => {
      const result = await revealCheck({ data: { lessonId, blockId } });
      await apply(blockId, result);
    },
    hint: async (blockId) => {
      const result = await askHint({ data: { lessonId, blockId } });
      await apply(blockId, result);
    },
    ran: keepRun,
    poll: (blockId) => pollResultsQuery(lessonId, blockId),
  };
  // A question asked again is answered once and leaves the score alone.
  const reviewDriver: CheckDriver = {
    respond: async (blockId, response) => {
      const result = await answerReview({
        data: { lessonId, blockId, response },
      });
      queryClient.setQueryData(query.queryKey, (old) =>
        old?.review
          ? {
              ...old,
              review: {
                ...old.review,
                checks: { ...old.review.checks, [blockId]: result.check },
              },
            }
          : old,
      );
    },
    reveal: () => Promise.resolve(),
    ran: keepRun,
  };
  const complete = useMutation({
    mutationFn: () => completeLesson({ data: { lessonId } }),
    onSuccess: async () => {
      await refresh();
      toast.success(m.lrnLessonFinished());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const results = useMutation({
    mutationFn: () => seeResults({ data: { lessonId } }),
    onSuccess: refresh,
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const retry = useMutation({
    mutationFn: () => retryLesson({ data: { lessonId } }),
    onSuccess: async () => {
      await refresh();
      window.scrollTo({ top: 0 });
      toast.success(m.lrnNewAttempt());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const reach = useReadingPosition(lessonId, data.blocks, data.position);
  const watch = useWatching(
    lessonId,
    data.watches,
    (watched) =>
      queryClient.setQueryData(query.queryKey, (old) =>
        old
          ? { ...old, watches: { ...old.watches, [watched.video]: watched } }
          : old,
      ),
    () => {
      if (data.completedAt) return;
      void refresh().then(() => toast.success(m.lrnLessonFinished()));
    },
  );

  const vowels = useVowelMarks(data.vowelMarks);
  // A translated lesson reads in the language its student chose; the
  // server keeps the choice, so every answer's feedback follows it.
  const [switching, setSwitching] = useState(false);
  const readIn = async (locale: ContentLocale) => {
    setSwitching(true);
    try {
      await readLessonIn({ data: { lessonId, locale } });
      await queryClient.invalidateQueries({ queryKey: query.queryKey });
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setSwitching(false);
    }
  };
  const translated =
    data.translation && data.reading === data.translation.locale;
  const title = translated
    ? (data.translation?.title ?? data.title)
    : data.title;
  const languages =
    data.translation && data.language ? (
      <Tabs
        value={data.reading ?? data.language}
        onValueChange={(value: ContentLocale) => void readIn(value)}
      >
        <TabsList aria-label={m.contentLanguage()}>
          {[data.language, data.translation.locale].map((locale) => (
            <TabsTrigger
              key={locale}
              value={locale}
              lang={locale}
              disabled={switching}
            >
              {LOCALE_LABEL[locale]()}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    ) : null;
  const shown = useMemo(
    () =>
      vowels.strip({
        blocks: data.blocks,
        checks: data.checks,
        review: data.review,
      }),
    [vowels, data.blocks, data.checks, data.review],
  );
  // A lesson prints as its student has it: no answers ever reached them.
  const printing = usePrint({
    title,
    lesson: shown.blocks.map(paperBlock),
    link: `/lessons/${lessonId}`,
    language: data.reading,
  });
  const checks = data.blocks.filter(isCheckBlock);
  const auto = checks.filter(
    (block) =>
      block.type !== "written" &&
      block.type !== "scratch" &&
      block.type !== "project",
  );
  const allSettled = auto.every((block) =>
    isSettled(block, data.checks[block.id]),
  );
  const held = heldOf(auto, data.checks);
  const canRetry = auto.length > 0 && allSettled && held.length === 0;
  const hint = ruleText(data.completion, data.passScore);
  const place = m.lrnLessonOf({
    number: formatNumber(data.index + 1),
    total: formatNumber(data.total),
  });
  // A child's score that opened a lesson elsewhere takes them on there
  // once the module has nothing next for them.
  const youngNext = data.next ?? data.sent[0]?.lessonId ?? null;
  if (data.young && earlyYears)
    return (
      <YoungContext.Provider value>
        <YoungLesson
          key={data.attempt}
          title={title}
          blocks={shown.blocks}
          checks={shown.checks}
          driver={driver}
          readAlong={data.readAlong}
          classSounds={data.sounds}
          language={data.reading}
          languages={
            data.translation && data.language
              ? {
                  other:
                    (data.reading ?? data.language) === data.language
                      ? data.translation.locale
                      : data.language,
                  pending: switching,
                  onChoose: (locale) => void readIn(locale),
                }
              : null
          }
          position={data.position}
          onReach={reach}
          watch={watch}
          paced={data.screens ? paced : null}
          onClose={() =>
            void navigate({
              to: "/modules/$moduleId",
              params: { moduleId: data.module.id },
            })
          }
          onFinish={
            data.completion === "mark" && !data.completedAt
              ? () => complete.mutate()
              : undefined
          }
          retry={
            canRetry
              ? { pending: retry.isPending, onRetry: () => retry.mutate() }
              : null
          }
          next={
            youngNext
              ? {
                  label: m.lrnNext(),
                  onNext: () =>
                    void navigate({
                      to: "/lessons/$lessonId",
                      params: { lessonId: youngNext },
                    }),
                }
              : null
          }
        />
      </YoungContext.Provider>
    );
  return (
    <Page width="form">
      <article className="grid gap-6">
        <Progress
          value={((data.index + 1) / data.total) * 100}
          aria-label={m.lrnPlace()}
          getAriaValueText={() => place}
          className="gap-1"
        >
          <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
            {place}
          </span>
        </Progress>
        <RecordHeader
          title={title}
          menu={printing.action ? [printing.action] : []}
          status={
            data.completedAt
              ? { label: m.lrnLessonDone(), tone: "success" }
              : undefined
          }
          facts={[
            ...(data.score === null
              ? []
              : [
                  {
                    label: m.lrnScore(),
                    value: m.lrnScoreIs({ value: formatNumber(data.score) }),
                  },
                ]),
            ...(data.attempt > 1
              ? [
                  {
                    label: m.lrnAttempt(),
                    value: m.lrnAttemptIs({
                      number: formatNumber(data.attempt),
                    }),
                  },
                ]
              : []),
          ]}
        />
        {languages || vowels.toggle ? (
          <div className="flex flex-wrap items-center gap-2">
            {languages}
            {vowels.toggle}
          </div>
        ) : null}
        {paced ? (
          <output className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm leading-5">
            <Radio aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
            {paced.paused ? m.lrnPacedPaused() : m.lrnPacedBanner()}
          </output>
        ) : null}
        <div inert={paced?.paused} className="grid gap-6">
          <YoungContext.Provider value={data.young && earlyYears}>
            <ReaderContext.Provider value={data.readAloud}>
              <OwnCodeContext.Provider value={ownCode}>
                <OwnProjectsContext.Provider value={ownProjects}>
                  <LessonBody
                    key={data.attempt}
                    blocks={shown.blocks}
                    checks={shown.checks}
                    driver={driver}
                    position={data.position}
                    onReach={reach}
                    watch={watch}
                    watches={data.watches}
                    paced={paced}
                    language={data.reading}
                    retry={
                      // Once the whole lesson is answered, its own Start again shows below.
                      canRetry
                        ? undefined
                        : {
                            pending: retry.isPending,
                            onRetry: () => retry.mutate(),
                          }
                    }
                  />
                </OwnProjectsContext.Provider>
              </OwnCodeContext.Provider>
            </ReaderContext.Provider>
          </YoungContext.Provider>
        </div>
        {paced?.paused ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-20 z-20 flex justify-center px-4 md:bottom-6">
            <p className="rounded-full bg-foreground px-4 py-2 text-sm leading-5 font-medium text-background shadow-lg">
              {m.lrnPacedPaused()}
            </p>
          </div>
        ) : null}
        {data.review ? (
          <RecordSection
            variant="page"
            title={m.lrnOnceMore()}
            description={m.lrnOnceMoreHint()}
          >
            <div className="grid gap-6">
              {shown.review?.blocks.filter(isCheckBlock).map((block) => (
                <CheckBlockView
                  key={block.id}
                  block={block}
                  view={shown.review?.checks[block.id]}
                  driver={reviewDriver}
                />
              ))}
            </div>
          </RecordSection>
        ) : null}
        <HeldResults
          held={held}
          pending={results.isPending}
          onSee={() => results.mutate()}
        />
        {data.completedAt ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 px-5 py-4">
            <div className="grid gap-1">
              <p className="inline-flex items-center gap-2 text-sm leading-5 font-medium">
                <CircleCheck aria-hidden className="size-4 text-success" />
                {data.score === null
                  ? m.lrnLessonFinished()
                  : m.lrnFinishedScore({ value: formatNumber(data.score) })}
              </p>
              {data.band ? (
                <p dir="auto" className="ps-6 text-sm leading-5">
                  {data.band}
                </p>
              ) : null}
              {data.sent.length > 0 ? (
                <div className="grid gap-1 ps-6 text-sm leading-5">
                  <p>{m.lrnSentFrom()}</p>
                  <ul className="grid gap-1">
                    {data.sent.map((item) => (
                      <li key={item.lessonId}>
                        <Link
                          to="/lessons/$lessonId"
                          params={{ lessonId: item.lessonId }}
                          search={{}}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {m.lrnConditionElsewhere({
                            lesson: item.title,
                            module: item.moduleTitle,
                          })}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            {canRetry ? (
              <RetryButton
                pending={retry.isPending}
                onRetry={() => retry.mutate()}
              />
            ) : null}
          </div>
        ) : hint || data.completion === "mark" || canRetry ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-5 py-4">
            <p className="text-sm leading-5 text-muted-foreground">
              {canRetry && data.completion === "score"
                ? m.lrnBelowPass({ score: formatNumber(data.passScore ?? 100) })
                : hint}
            </p>
            <div className="flex flex-wrap gap-2">
              {canRetry ? (
                <RetryButton
                  pending={retry.isPending}
                  onRetry={() => retry.mutate()}
                />
              ) : null}
              {data.completion === "mark" ? (
                <Button
                  type="button"
                  className="max-md:h-10"
                  disabled={complete.isPending}
                  onClick={() => complete.mutate()}
                >
                  <CircleCheck aria-hidden />
                  {m.lrnMarkDone()}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        <Footer data={data} />
        {printing.sheet}
      </article>
    </Page>
  );
}

interface Held {
  at: "end" | "teacher";
  answered: boolean;
}

/** The questions still keeping how they went from their student, for the end or the teacher. */
function heldOf(
  blocks: readonly CheckStudentBlock[],
  checks: Record<string, CheckView | undefined>,
): Held[] {
  return blocks.flatMap((block) => {
    const view = checks[block.id];
    return view?.timing && !view.timing.open
      ? [{ at: view.timing.at, answered: view.tries > 0 }]
      : [];
  });
}

interface HeldResultsProps {
  held: Held[];
  pending: boolean;
  onSee: () => void;
  onShowClass?: () => void;
}

/**
 * Where a lesson's questions that wait show how they went: those kept for
 * the end once every one is answered and the student asks, those kept for
 * the teacher when the class is shown. A preview stands in for the teacher.
 */
function HeldResults({ held, pending, onSee, onShowClass }: HeldResultsProps) {
  const forEnd = held.filter((item) => item.at === "end");
  const answered = forEnd.filter((item) => item.answered).length;
  return (
    <>
      {forEnd.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-5 py-4">
          <p className="text-sm leading-5 text-muted-foreground">
            {answered < forEnd.length
              ? m.lrnResultsProgress({
                  answered: formatNumber(answered),
                  total: formatNumber(forEnd.length),
                })
              : m.lrnResultsReady()}
          </p>
          <Button
            type="button"
            className="max-md:h-10"
            disabled={answered < forEnd.length || pending}
            onClick={onSee}
          >
            <Eye aria-hidden />
            {m.lrnSeeResults()}
          </Button>
        </div>
      ) : null}
      {held.some((item) => item.at === "teacher") ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-5 py-4">
          <p className="flex items-start gap-2 text-sm leading-5 text-muted-foreground">
            <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0" />
            {m.lrnResultsTeacher()}
          </p>
          {onShowClass ? (
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              onClick={onShowClass}
            >
              <Eye aria-hidden />
              {m.lrnRelease()}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

interface RetryButtonProps {
  pending: boolean;
  onRetry: () => void;
}

function RetryButton({ pending, onRetry }: RetryButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="max-md:h-10"
      disabled={pending}
      title={m.lrnRetryHint()}
      onClick={onRetry}
    >
      <RotateCcw aria-hidden />
      {m.lrnRetryLesson()}
    </Button>
  );
}

export interface LessonPreviewProps {
  lessonId: string;
  /** Drawn inside a teacher's preview frame, at another width or language. */
  framed?: boolean;
}

/**
 * A lesson as its students will meet it, answered and marked here in the
 * browser so the teacher can try every question; nothing is saved.
 */
export function LessonPreview({ lessonId, framed }: LessonPreviewProps) {
  const data = useSuspenseQuery(lessonEditorQuery(lessonId)).data;
  const own: PreviewLanguage = getLocale() === "ar" ? "ar" : "en";
  const [screen, setScreen] = useState<PreviewScreen>("desktop");
  const [language, setLanguage] = useState<PreviewLanguage>(own);
  const [students, setStudents] = useState<PreviewStudents>("everyone");
  // A frame runs no scripts, so it cannot read the theme; it is told.
  const { resolvedTheme } = useTheme();
  // Another screen or language is a frame of its own, as wide as the
  // screen and in the language chosen; the computer reader speaks in the
  // browser, so it is tried in the teacher's own view.
  const elsewhere = !framed && (screen !== "desktop" || language !== own);
  const earlyYears = useSlot(youngLessons).length > 0;
  const navigate = useNavigate();
  const [rows, setRows] = useState<StoredTry[]>([]);
  const [round, setRound] = useState(0);
  const [shownFeedback, setShownFeedback] = useState<FeedbackShown>({
    end: false,
    teacher: false,
  });
  const vowels = useVowelMarks(data.vowelMarks);
  // Students reading in the translation's language read the translation,
  // as they would by default; the preview shows the lesson so.
  const reading =
    data.translation && data.language && language === otherLocale(data.language)
      ? language
      : data.language;
  const lesson = useMemo(
    () =>
      vowels.strip(
        data.translation && reading !== data.language
          ? translatedLesson(data.content, data.translation.content)
          : lessonOfContent(data.content),
      ),
    [vowels, data.content, data.translation, reading, data.language],
  );
  const blocks = useMemo(
    () => studentBlocks(lesson, `preview:${round}`),
    [lesson, round],
  );
  const checks = useMemo(() => {
    const states = checkStates(lesson, rows);
    return Object.fromEntries(
      checkBlocks(lesson).map((block) => [
        block.id,
        describeCheck(block, rows, states[block.id], shownFeedback),
      ]),
    );
  }, [lesson, rows, shownFeedback]);
  const driver: CheckDriver = {
    respond: (blockId, response: LessonResponse) => {
      const block = checkBlocks(lesson).find((item) => item.id === blockId);
      if (!block) return Promise.resolve();
      const marked = isAuto(block) ? markResponse(block, response) : null;
      setRows((current) => {
        const previous = current.filter(
          (row) =>
            row.blockId === blockId &&
            (row.state === "answered" || row.state === "needs_marking"),
        ).length;
        return [
          ...current,
          {
            blockId,
            try: previous + 1,
            state: marked || block.points === 0 ? "answered" : "needs_marking",
            fraction: marked ? marked.fraction : null,
            response,
            feedback: null,
          },
        ];
      });
      return Promise.resolve();
    },
    // A preview keeps a spoken or drawn answer in the page; nothing is
    // uploaded.
    keepFile: (file) =>
      Promise.resolve({
        fileId: crypto.randomUUID(),
        url: URL.createObjectURL(file),
      }),
    reveal: (blockId) => {
      setRows((current) => [
        ...current,
        {
          blockId,
          try: 1,
          state: "revealed",
          fraction: 0,
          response: {},
          feedback: null,
        },
      ]);
      return Promise.resolve();
    },
    hint: (blockId) => {
      setRows((current) => [
        ...current,
        {
          blockId,
          try: 1,
          state: "hint",
          fraction: null,
          response: {},
          feedback: null,
        },
      ]);
      return Promise.resolve();
    },
  };
  const edit = () =>
    void navigate({
      to: "/lesson-editor",
      search: { id: data.id, moduleId: data.moduleId },
    });
  const printing = usePrint({
    title: data.title,
    content: data.content,
    answers: true,
    link: `/lessons/${data.id}`,
    language: data.language,
  });
  if (data.young && earlyYears)
    return (
      <YoungContext.Provider value>
        <YoungLesson
          key={round}
          title={data.title}
          blocks={blocks}
          checks={checks}
          driver={driver}
          readAlong={data.readAlong}
          language={reading}
          onClose={edit}
          badge={m.lrnPreview()}
          retry={{
            pending: false,
            onRetry: () => {
              setRows([]);
              setRound((current) => current + 1);
            },
          }}
        />
      </YoungContext.Provider>
    );
  const startOver = {
    label: m.lrnStartOver(),
    icon: RotateCcw,
    onSelect: () => {
      setRows([]);
      setShownFeedback({ end: false, teacher: false });
      setRound((current) => current + 1);
    },
  };
  return (
    <Page width="form">
      <article className="grid gap-6">
        <RecordHeader
          title={data.title}
          status={{ label: m.lrnPreview(), tone: "info" }}
          facts={[
            {
              label: m.lrnCompletion(),
              value:
                ruleText(data.completion, data.passScore) ?? m.lrnRuleView(),
            },
          ]}
          alerts={
            framed
              ? []
              : [{ label: m.lrnPreviewHint(), tone: "info", icon: Eye }]
          }
          action={
            framed
              ? undefined
              : { label: m.lrnEditLesson(), icon: Pencil, onClick: edit }
          }
          menu={
            framed
              ? []
              : [...(printing.action ? [printing.action] : []), startOver]
          }
        />
        {framed ? null : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Segmented
              label={m.lrnPreviewScreen()}
              value={screen}
              onChange={setScreen}
              options={[
                { value: "desktop", label: m.lrnPreviewDesktop() },
                { value: "tablet", label: m.lrnPreviewTablet() },
                { value: "phone", label: m.lrnPreviewPhone() },
              ]}
            />
            <Segmented
              label={m.lrnPreviewLanguage()}
              value={language}
              onChange={setLanguage}
              options={[
                { value: "en", label: LOCALE_LABEL.en() },
                { value: "ar", label: LOCALE_LABEL.ar() },
              ]}
            />
            <Segmented
              label={m.lrnPreviewStudents()}
              value={students}
              onChange={setStudents}
              options={[
                { value: "everyone", label: m.lrnPreviewEveryone() },
                { value: "reader", label: m.lrnPreviewReader() },
              ]}
            />
          </div>
        )}
        {elsewhere ? (
          // The frame shows the page as the server draws it, with no scripts
          // of its own: answering is tried in the teacher's own view.
          <iframe
            key={`${screen}:${language}`}
            sandbox="allow-same-origin"
            title={m.lrnPreviewFrame({ title: data.title })}
            src={`/lesson-frame/${data.id}?ui=${language}&theme=${resolvedTheme === "dark" ? "dark" : "light"}`}
            style={{ maxWidth: SCREEN_WIDTH[screen] }}
            className="mx-auto h-[min(80dvh,900px)] w-full rounded-xl border bg-background shadow-sm"
          />
        ) : (
          <>
            {vowels.toggle}
            <YoungContext.Provider value={data.young && earlyYears}>
              <ReaderContext.Provider value={!framed && students === "reader"}>
                <LessonBody
                  key={round}
                  blocks={blocks}
                  checks={checks}
                  driver={driver}
                  language={reading}
                  retry={{
                    pending: false,
                    onRetry: () => {
                      setRows([]);
                      setRound((current) => current + 1);
                    },
                  }}
                />
              </ReaderContext.Provider>
            </YoungContext.Provider>
            <HeldResults
              held={heldOf(blocks.filter(isCheckBlock), checks)}
              pending={false}
              onSee={() =>
                setShownFeedback((current) => ({ ...current, end: true }))
              }
              onShowClass={() =>
                setShownFeedback((current) => ({ ...current, teacher: true }))
              }
            />
          </>
        )}
        {printing.sheet}
      </article>
    </Page>
  );
}

type PreviewScreen = "desktop" | "tablet" | "phone";
type PreviewLanguage = "en" | "ar";
type PreviewStudents = "everyone" | "reader";

/** The width of the screen a lesson is previewed on, as common devices are. */
const SCREEN_WIDTH: Record<PreviewScreen, string> = {
  desktop: "100%",
  tablet: "768px",
  phone: "390px",
};
