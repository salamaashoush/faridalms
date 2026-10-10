import { Textarea } from "@faridalms/ui/textarea";
import { LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import type { Drawing, RunEnd, RunLanguage, RunStream } from "./runner/runner";

import { friendlyError } from "./friendly";
import { RUN_SECONDS, runCode } from "./runner/runner";
import { TurtleCanvas } from "./TurtleCanvas";

/** A run as it ended: the code and input it had, and what it printed. */
export interface RunReport {
  code: string;
  input: string;
  end: RunEnd;
  printed: string;
}

/** As much of what a run prints as a report carries. */
const REPORTED_CHARS = 2000;

const READS_INPUT: Record<RunLanguage, RegExp> = {
  python: /\binput\s*\(/,
  javascript: /\bprompt\s*\(/,
};

type Piece = { id: number; stream: RunStream; text: string };

function append(pieces: Piece[], stream: RunStream, text: string): Piece[] {
  const last = pieces.at(-1);
  return last?.stream === stream
    ? [...pieces.slice(0, -1), { ...last, text: last.text + text }]
    : [...pieces, { id: (last?.id ?? 0) + 1, stream, text }];
}

/** What the end of a run says to the student, or null when it ended well. */
function endNote(end: RunEnd): string | null {
  if (end.status === "failed") return m.codeFailed();
  if (end.status === "stopped")
    return end.reason === "timeout"
      ? m.codeTimedOut({ seconds: formatNumber(RUN_SECONDS) })
      : end.reason === "output"
        ? m.codeTooMuch()
        : m.codeStopped();
  if (!end.error) return null;
  if (end.error.name === "EOFError") return m.codeNeedsInput();
  return end.error.line === null
    ? end.error.message
    : m.codeErrorAt({
        line: formatNumber(end.error.line),
        message: end.error.message,
      });
}

/**
 * A program's runs in the browser: what it is given to read, what it
 * prints and draws, and how its last run ended. One run at a time; a new
 * one starts from nothing.
 */
export function useProgramRun(
  language: RunLanguage,
  options: {
    /** Told how each run ended, with what it was given and printed. */
    onRan?: ((report: RunReport) => void) | undefined;
    /** Told the line the last run failed on, and null as a new run starts. */
    onErrorLine?: ((line: number | null) => void) | undefined;
  } = {},
) {
  const stopRun = useRef<(() => void) | null>(null);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<Piece[]>([]);
  const [phase, setPhase] = useState<"idle" | "loading" | "running">("idle");
  const [end, setEnd] = useState<RunEnd | null>(null);
  const [said, setSaid] = useState("");
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  useEffect(() => () => stopRun.current?.(), []);

  /** Runs the code, with any more files it may import by name. */
  const run = (code: string, modules: Record<string, string> = {}) => {
    if (phase !== "idle") return;
    setOutput([]);
    setEnd(null);
    setDrawing(null);
    setSaid(language === "python" ? m.codeLoadingPython() : m.codeRunning());
    setPhase("loading");
    options.onErrorLine?.(null);
    const given = { code, input };
    let printed = "";
    const started = runCode(
      {
        language,
        code,
        stdin: input ? input.replace(/\n$/, "").split("\n") : [],
        modules,
      },
      {
        onStarted: () => setPhase("running"),
        onOutput: (stream, text) => {
          if (stream === "out" && printed.length < REPORTED_CHARS)
            printed = (printed + text).slice(0, REPORTED_CHARS);
          setOutput((pieces) => append(pieces, stream, text));
        },
        onDrawing: setDrawing,
      },
    );
    stopRun.current = started.stop;
    void started.done.then((result) => {
      stopRun.current = null;
      setPhase("idle");
      setEnd(result);
      // Python's traceback points at the place in the line; the note below
      // only names the line.
      const trace =
        result.status === "done" && result.error ? result.error.trace : "";
      if (trace.includes("\n"))
        setOutput((pieces) => append(pieces, "err", `${trace}\n`));
      setSaid(endNote(result) ?? m.codeFinished());
      if (result.status === "done" && result.error?.line)
        options.onErrorLine?.(result.error.line);
      options.onRan?.({ ...given, end: result, printed });
    });
  };

  return {
    language,
    input,
    setInput,
    output,
    phase,
    busy: phase !== "idle",
    end,
    said,
    drawing,
    run,
    stop: () => stopRun.current?.(),
  };
}

export type ProgramRunState = ReturnType<typeof useProgramRun>;

/**
 * What a program is given and gives back, under its code: the lines it may
 * read when it asks for them, what it drew, what it printed, and why it
 * stopped when it did not end well.
 */
export function RunOutput({
  run,
  code,
}: {
  run: ProgramRunState;
  /** The code as it stands, which says whether it reads anything. */
  code: string;
}) {
  const inputId = useId();
  const { language, end, busy, phase, output, drawing } = run;
  const note = end ? endNote(end) : null;
  const why =
    end?.status === "done" && end.error
      ? friendlyError(language, end.error.name)
      : null;
  return (
    <>
      {READS_INPUT[language].test(code) ? (
        <div className="grid gap-1.5 border-t px-3 py-2.5">
          <label
            htmlFor={inputId}
            dir="auto"
            className="text-[13px] leading-[18px] font-medium"
          >
            {m.codeInput()}
          </label>
          <Textarea
            id={inputId}
            dir="ltr"
            rows={2}
            spellCheck={false}
            value={run.input}
            onChange={(event) => run.setInput(event.target.value)}
            className="min-h-0 font-mono text-[13px] leading-5"
            aria-describedby={`${inputId}-hint`}
          />
          <p
            id={`${inputId}-hint`}
            dir="auto"
            className="text-[13px] leading-[18px] text-muted-foreground"
          >
            {m.codeInputHint()}
          </p>
        </div>
      ) : null}
      {drawing ? <TurtleCanvas drawing={drawing} /> : null}
      {busy || end !== null ? (
        <div className="grid gap-1 border-t bg-muted/30 px-3 py-2.5">
          <div
            dir="auto"
            className="flex items-center gap-2 text-[13px] leading-[18px] font-medium text-muted-foreground"
          >
            {m.codeOutput()}
            {busy ? (
              <span className="inline-flex items-center gap-1.5 font-normal">
                <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
                {phase === "loading" && language === "python"
                  ? m.codeLoadingPython()
                  : m.codeRunning()}
              </span>
            ) : null}
          </div>
          {output.length > 0 ? (
            <pre
              dir="ltr"
              className="max-h-72 overflow-auto font-mono text-[13px] leading-5 [overflow-wrap:anywhere] whitespace-pre-wrap [font-variant-ligatures:none]"
            >
              {output.map((piece) => (
                <span
                  key={piece.id}
                  className={
                    piece.stream === "err"
                      ? "text-destructive"
                      : piece.stream === "in"
                        ? "font-semibold text-primary"
                        : undefined
                  }
                >
                  {piece.text}
                </span>
              ))}
            </pre>
          ) : end && !busy && !note ? (
            <p
              dir="auto"
              className="text-[13px] leading-[18px] text-muted-foreground"
            >
              {m.codeNoOutput()}
            </p>
          ) : null}
          {note ? (
            <p
              dir="auto"
              className={
                end?.status === "done"
                  ? "text-sm leading-5 font-medium text-destructive"
                  : "text-sm leading-5 text-muted-foreground"
              }
            >
              {note}
            </p>
          ) : null}
          {why ? (
            <p dir="auto" className="text-sm leading-5 text-muted-foreground">
              {why}
            </p>
          ) : null}
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {run.said}
      </p>
    </>
  );
}
