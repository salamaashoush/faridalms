import type { EditorView } from "@codemirror/view";
import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import * as m from "~/i18n/messages";

import type * as CodeEditor from "./code-editor";
import type { RunReport } from "./ProgramRun";
import type { RunLanguage } from "./runner/runner";

import { RunOutput, useProgramRun } from "./ProgramRun";
import { WebPreview } from "./WebPreview";

export type { RunReport } from "./ProgramRun";

/** What a code block can be run as: a program, or a web page to look at. */
export type EditorLanguage = RunLanguage | "html";

export const LANGUAGE_NAMES: Record<EditorLanguage, string> = {
  python: "Python",
  javascript: "JavaScript",
  html: "HTML",
};

/** How long typing pauses before a web page is drawn again. */
const REDRAW_MS = 800;

export interface CodeRunnerProps {
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
  onRan?: (report: RunReport) => void;
  className?: string;
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
  onRan,
  className,
}: CodeRunnerProps) {
  const keysId = useId();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const tools = useRef<typeof CodeEditor | null>(null);
  const [code, setCode] = useState(initial);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(() => ({ html: initial }));
  const redraw = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // A page is looked at, not run; its runs are never started.
  const program = useProgramRun(language === "html" ? "javascript" : language, {
    onRan,
    onErrorLine: (line) => {
      if (view.current) tools.current?.markErrorLine(view.current, line);
    },
  });

  const run = () => {
    if (locked) return;
    if (language === "html") setPage({ html: code });
    else program.run(code);
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
      clearTimeout(redraw.current);
    };
  }, [language, keysId]);

  useEffect(() => {
    if (view.current && tools.current)
      tools.current.setReadOnly(view.current, readOnly);
  }, [readOnly]);

  const busy = language !== "html" && program.busy;
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
              onClick={program.stop}
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
      {language === "html" ? (
        locked ? null : (
          <WebPreview page={page} />
        )
      ) : (
        <RunOutput run={program} code={code} />
      )}
    </section>
  );
}
