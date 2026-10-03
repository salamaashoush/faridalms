import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Eye,
  Pause,
  Play,
} from "lucide-react";
import { useEffect, useState } from "react";

import * as m from "~/i18n/messages";
import { programRunsQuery } from "~/queries/learning";
import { formatDateTime, formatNumber } from "~/utils/datetime";

import { friendlyError } from "./friendly";
import { changedLines } from "./lines";
import { RUN_SECONDS } from "./runner/runner";

type Replay = Awaited<
  ReturnType<NonNullable<ReturnType<typeof programRunsQuery>["queryFn"]>>
>;
type Run = Replay["runs"][number];
type Mark = Replay["checks"][number];

type Step =
  | { id: string; at: string; attempt: number; kind: "run"; run: Run }
  | {
      id: string;
      at: string;
      attempt: number;
      kind: "checked";
      check: Extract<Mark, { kind: "checked" }>;
    }
  | { id: string; at: string; attempt: number; kind: "shown" };

/** How long each step shows while the replay plays. */
const STEP_MS = 1500;

function stepsOf(replay: Replay): Step[] {
  const runs = replay.runs.map((run): Step => ({
    id: `run:${run.ranAt}`,
    at: run.ranAt,
    attempt: run.attempt,
    kind: "run",
    run,
  }));
  const marks = replay.checks.map((mark): Step =>
    mark.kind === "checked"
      ? {
          id: `checked:${mark.at}`,
          at: mark.at,
          attempt: mark.attempt,
          kind: "checked",
          check: mark,
        }
      : {
          id: `shown:${mark.at}`,
          at: mark.at,
          attempt: mark.attempt,
          kind: "shown",
        },
  );
  return [...runs, ...marks].toSorted((a, b) => a.at.localeCompare(b.at));
}

const codeOf = (step: Step | undefined) =>
  step?.kind === "run"
    ? step.run.code
    : step?.kind === "checked"
      ? step.check.code
      : null;

function RunResult({
  run,
  language,
}: {
  run: Run;
  language: Replay["language"];
}) {
  const name = run.error?.split(":")[0] ?? "";
  const why = run.error ? friendlyError(language, name) : null;
  return (
    <div className="grid gap-2 text-sm leading-6">
      {run.input ? (
        <div className="grid gap-1">
          <p className="text-[13px] leading-[18px] font-medium text-muted-foreground">
            {m.codeTestGives()}
          </p>
          <pre
            dir="ltr"
            className="overflow-x-auto rounded-md bg-muted/60 px-3 py-2 font-mono text-[13px] leading-5"
          >
            {run.input}
          </pre>
        </div>
      ) : null}
      <div className="grid gap-1">
        <p className="text-[13px] leading-[18px] font-medium text-muted-foreground">
          {m.codeTestGot()}
        </p>
        {run.output ? (
          <pre
            dir="ltr"
            className="max-h-40 overflow-auto rounded-md bg-muted/60 px-3 py-2 font-mono text-[13px] leading-5"
          >
            {run.output}
          </pre>
        ) : (
          <p className="text-muted-foreground">{m.codeTestNothing()}</p>
        )}
      </div>
      {run.error ? (
        <div className="grid gap-1">
          <p
            dir="ltr"
            className="justify-self-start font-mono text-[13px] leading-5 text-destructive"
          >
            {run.error}
          </p>
          {why ? <p className="text-muted-foreground">{why}</p> : null}
        </div>
      ) : run.outcome === "timeout" ? (
        <p className="text-destructive">
          {m.codeTimedOut({ seconds: formatNumber(RUN_SECONDS) })}
        </p>
      ) : run.outcome === "output" ? (
        <p className="text-destructive">{m.codeTooMuch()}</p>
      ) : run.outcome === "stopped" ? (
        <p className="text-muted-foreground">{m.codeStopped()}</p>
      ) : null}
    </div>
  );
}

/**
 * How one student came to their program for a code exercise, step by step:
 * each run in the browser and each answer checked, with the lines each step
 * changed marked, played through or stepped by hand.
 */
export function ProgramReplay(input: {
  moduleId: string;
  classId: string;
  lessonId: string;
  blockId: string;
  studentId: string;
}) {
  const query = useQuery(programRunsQuery(input));
  const [picked, setPicked] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const steps = query.data ? stepsOf(query.data) : [];
  const last = steps.length - 1;
  const at = Math.min(picked ?? last, last);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = setTimeout(() => {
      setPicked(at + 1);
      if (at + 1 >= last) setPlaying(false);
    }, STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, at, last]);

  if (!query.data) return <div aria-busy="true" className="min-h-60" />;
  const step = steps[at];
  if (!step)
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        {m.lrnReplayNone()}
      </p>
    );
  const { runs, checks, language, starter } = query.data;
  const errors = runs.filter((run) => run.outcome === "error").length;
  const checked = checks.filter((mark) => mark.kind === "checked").length;
  const code = codeOf(step);
  const before =
    codeOf(steps.slice(0, at).findLast((item) => codeOf(item) !== null)) ??
    starter;
  const texts = code?.split("\n") ?? [];
  const changed =
    code === null ? new Set<number>() : changedLines(before.split("\n"), texts);
  const lines = texts.map((text, index) => ({
    number: index + 1,
    text,
    changed: changed.has(index),
  }));
  const attempts = new Set(steps.map((item) => item.attempt)).size;
  const go = (next: number) => {
    setPlaying(false);
    setPicked(Math.max(0, Math.min(last, next)));
  };

  return (
    <div className="grid gap-4">
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {[
          m.lrnReplayRuns({ count: runs.length }),
          ...(errors > 0 ? [m.lrnReplayErrors({ count: errors })] : []),
          m.lrnReplayChecks({ count: checked }),
        ].join(" · ")}
      </p>
      <div className="grid gap-2">
        <div
          aria-hidden
          className="flex h-2 gap-px overflow-hidden rounded-full"
        >
          {steps.map((item, index) => (
            <span
              key={item.id}
              className={cn(
                "min-w-px flex-1",
                item.kind === "checked"
                  ? item.check.passed === item.check.total
                    ? "bg-success"
                    : "bg-info"
                  : item.kind === "shown"
                    ? "bg-warning"
                    : item.run.outcome === "done"
                      ? "bg-muted-foreground/40"
                      : "bg-destructive/70",
                index > at && "opacity-30",
              )}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={m.lrnReplayEarlier()}
            disabled={at === 0}
            onClick={() => go(at - 1)}
          >
            <ChevronLeft aria-hidden className="rtl:rotate-180" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={last === 0}
            onClick={() => {
              if (!playing && at >= last) setPicked(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            {playing ? m.lrnReplayPause() : m.lrnReplayPlay()}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={m.lrnReplayLater()}
            disabled={at === last}
            onClick={() => go(at + 1)}
          >
            <ChevronRight aria-hidden className="rtl:rotate-180" />
          </Button>
          <input
            type="range"
            min={0}
            max={last}
            value={at}
            aria-label={m.lrnReplayStep({
              step: formatNumber(at + 1),
              total: formatNumber(last + 1),
            })}
            aria-valuetext={m.lrnReplayStep({
              step: formatNumber(at + 1),
              total: formatNumber(last + 1),
            })}
            onChange={(event) => go(Number(event.target.value))}
            className="min-w-32 flex-1 accent-primary"
          />
          <p
            aria-live="polite"
            className="text-[13px] leading-[18px] text-muted-foreground tabular-nums"
          >
            {m.lrnReplayStep({
              step: formatNumber(at + 1),
              total: formatNumber(last + 1),
            })}
          </p>
        </div>
      </div>
      <section className="grid gap-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="inline-flex items-center gap-1.5 text-sm leading-5 font-medium">
            {step.kind === "run" ? (
              <>
                {step.run.outcome === "done" ? (
                  <Play aria-hidden className="size-4 text-muted-foreground" />
                ) : (
                  <CircleX aria-hidden className="size-4 text-destructive" />
                )}
                {m.lrnReplayRan()}
              </>
            ) : step.kind === "checked" ? (
              <>
                <CircleCheck
                  aria-hidden
                  className={cn(
                    "size-4",
                    step.check.passed === step.check.total
                      ? "text-success"
                      : "text-muted-foreground",
                  )}
                />
                {m.lrnReplayChecked()}
                <span className="font-normal text-muted-foreground">
                  {m.codeTestsPassed({
                    passed: formatNumber(step.check.passed),
                    total: formatNumber(step.check.total),
                  })}
                </span>
              </>
            ) : (
              <>
                <Eye aria-hidden className="size-4 text-warning" />
                {m.lrnReplayShown()}
              </>
            )}
          </p>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {attempts > 1
              ? `${m.lrnAttemptIs({ number: formatNumber(step.attempt) })} · `
              : ""}
            {formatDateTime(step.at)}
          </p>
        </div>
        {code === null ? null : (
          <div className="grid gap-1.5">
            <pre
              dir="ltr"
              className="max-h-80 overflow-auto rounded-md bg-muted/60 py-2 font-mono text-[13px] leading-5 [font-variant-ligatures:none]"
            >
              {lines.map((line) => (
                <span
                  key={line.number}
                  className={cn("flex px-3", line.changed && "bg-info/15")}
                >
                  <span
                    aria-hidden
                    className="me-3 w-6 shrink-0 text-end text-muted-foreground/70 select-none"
                  >
                    {line.number}
                  </span>
                  <code className="whitespace-pre">{line.text || " "}</code>
                </span>
              ))}
            </pre>
            {changed.size > 0 ? (
              <p className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
                <span aria-hidden className="size-3 rounded-sm bg-info/15" />
                {m.lrnReplayChanged()}
              </p>
            ) : null}
          </div>
        )}
        {step.kind === "run" ? (
          <RunResult run={step.run} language={language} />
        ) : null}
      </section>
    </div>
  );
}
