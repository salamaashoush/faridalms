import type { EditorView } from "@codemirror/view";
import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Textarea } from "@faridalms/ui/textarea";
import { LoaderCircle, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import type * as CodeEditor from "./code-editor";
import type { RunEnd, RunLanguage, RunStream } from "./runner/runner";

import { friendlyError } from "./friendly";
import { RUN_SECONDS, runCode } from "./runner/runner";
import { WebPreview } from "./WebPreview";

/** What a code block can be run as: a program, or a web page to look at. */
export type EditorLanguage = RunLanguage | "html";

export const LANGUAGE_NAMES: Record<EditorLanguage, string> = {
  python: "Python",
  javascript: "JavaScript",
  html: "HTML",
};

/** How long typing pauses before a web page is drawn again. */
const REDRAW_MS = 800;

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
 * Code a student can change and run in the browser, with what it reads and
 * what it prints. A lesson's runnable blocks and its code exercises share it.
 */
export function CodeRunner({
  source,
  initial = source,
  language,
  drawn,
  locked = false,
  readOnly = false,
  onChange,
  className,
}: {
  /** The code as given, which Reset puts back. */
  source: string;
  /** The code to start from, such as the student's last answer. */
  initial?: string;
  language: EditorLanguage;
  /** How the code reads before the editor loads. */
  drawn?: ReactNode;
  locked?: boolean;
  readOnly?: boolean;
  onChange?: (code: string) => void;
  className?: string;
}) {
  const keysId = useId();
  const inputId = useId();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const stopRun = useRef<(() => void) | null>(null);
  const tools = useRef<typeof CodeEditor | null>(null);
  const [code, setCode] = useState(initial);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<Piece[]>([]);
  const [phase, setPhase] = useState<"idle" | "loading" | "running">("idle");
  const [end, setEnd] = useState<RunEnd | null>(null);
  const [said, setSaid] = useState("");
  const [page, setPage] = useState(() => ({ html: initial }));
  const redraw = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = () => {
    if (language === "html") {
      if (!locked) setPage({ html: code });
      return;
    }
    if (locked || phase !== "idle") return;
    setOutput([]);
    setEnd(null);
    setSaid(language === "python" ? m.codeLoadingPython() : m.codeRunning());
    setPhase("loading");
    if (view.current) tools.current?.markErrorLine(view.current, null);
    const started = runCode(
      {
        language,
        code,
        stdin: input ? input.replace(/\n$/, "").split("\n") : [],
      },
      {
        onStarted: () => setPhase("running"),
        onOutput: (stream, text) =>
          setOutput((pieces) => append(pieces, stream, text)),
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
      if (
        result.status === "done" &&
        result.error?.line &&
        view.current &&
        tools.current
      )
        tools.current.markErrorLine(view.current, result.error.line);
    });
  };
  const runFromKeys = useEffectEvent(run);
  const changed = useEffectEvent((next: string) => {
    setCode(next);
    onChange?.(next);
    // A web page is drawn again as the student types, once they pause.
    if (language !== "html" || locked) return;
    clearTimeout(redraw.current);
    redraw.current = setTimeout(() => setPage({ html: next }), REDRAW_MS);
  });
  // The editor is made once for its code, from where the student left it;
  // whether it can be changed follows on its own below.
  const opening = useEffectEvent(() => ({ code: initial, readOnly }));

  useEffect(() => {
    let cancelled = false;
    void import("./code-editor").then((loaded) => {
      if (cancelled || !host.current) return;
      tools.current = loaded;
      view.current = loaded.createCodeEditor(host.current, {
        ...opening(),
        language,
        label: m.codeEditorLabel({ language: LANGUAGE_NAMES[language] }),
        describedBy: keysId,
        onChange: (next) => changed(next),
        onRun: () => runFromKeys(),
      });
      setReady(true);
    });
    return () => {
      cancelled = true;
      view.current?.destroy();
      view.current = null;
      stopRun.current?.();
      clearTimeout(redraw.current);
    };
  }, [language, keysId]);

  useEffect(() => {
    if (view.current && tools.current)
      tools.current.setReadOnly(view.current, readOnly);
  }, [readOnly]);

  const busy = phase !== "idle";
  const note = end ? endNote(end) : null;
  const why =
    end?.status === "done" && end.error && language !== "html"
      ? friendlyError(language, end.error.name)
      : null;
  const reads = language !== "html" && READS_INPUT[language].test(code);
  const showOutput = busy || end !== null;
  return (
    <section
      aria-label={LANGUAGE_NAMES[language]}
      className={cn("overflow-hidden rounded-lg border bg-card", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5">
        <span className="text-[13px] leading-[18px] font-medium text-muted-foreground">
          {LANGUAGE_NAMES[language]}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {code !== source && !readOnly ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="max-md:h-10"
              disabled={busy}
              onClick={() => {
                if (view.current && tools.current)
                  tools.current.replaceCode(view.current, source);
                else setCode(source);
              }}
            >
              <RotateCcw aria-hidden />
              {m.codeReset()}
            </Button>
          ) : null}
          {busy ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-md:h-10"
              onClick={() => stopRun.current?.()}
            >
              <Square aria-hidden />
              {m.codeStop()}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="max-md:h-10"
              disabled={locked}
              aria-keyshortcuts="Control+Enter Meta+Enter"
              onClick={run}
            >
              <Play aria-hidden />
              {m.codeRun()}
            </Button>
          )}
        </div>
      </div>
      {locked ? (
        <p
          dir="auto"
          className="border-b bg-muted/50 px-3 py-2 text-[13px] leading-[18px] text-muted-foreground"
        >
          {m.codePredictFirst()}
        </p>
      ) : null}
      {/* The lesson's own token colours, wherever the code is shown. */}
      <div dir="ltr" className="fe relative">
        <div ref={host} />
        {ready ? null : (
          <div className="[&>pre]:my-0 [&>pre]:rounded-none [&>pre]:bg-transparent">
            {drawn ?? (
              <pre className="fe-code-block">
                <code>{initial}</code>
              </pre>
            )}
          </div>
        )}
      </div>
      <p id={keysId} className="sr-only">
        {m.codeKeys()}
      </p>
      {reads ? (
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
            value={input}
            onChange={(event) => setInput(event.target.value)}
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
      {language === "html" && !locked ? <WebPreview page={page} /> : null}
      {showOutput ? (
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
        {said}
      </p>
    </section>
  );
}
