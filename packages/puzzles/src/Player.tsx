import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Code, Play, RotateCcw, Square } from "lucide-react";
import { useRef, useState } from "react";

import type { Level, StudentLevel } from "./level";
import type { Program } from "./program";
import type { End } from "./run";
import type { PuzzleStrings } from "./strings";
import type { EditorSetting, WorkspaceHandle } from "./Workspace";

import { ArrowStrip } from "./ArrowStrip";
import { Board } from "./Board";
import { countBlocks } from "./program";
import { misfit } from "./run";
import { pythonOf } from "./text";
import { usePlayback } from "./usePlayback";
import { Workspace } from "./Workspace";

export type { EditorSetting } from "./Workspace";

/** A puzzle as it is played: a student's, or a teacher's with its answer. */
export type PlayedLevel = Omit<StudentLevel, "ideal"> &
  Partial<Pick<StudentLevel, "ideal">> &
  Partial<Pick<Level, "solution">>;

/**
 * A puzzle to solve: its board, the program being built for it as a row of
 * arrows or as blocks, and the run that shows what the program does. Every
 * run starts from the beginning and plays the whole program, so what the
 * hero did is what the program says, and the block being carried out is
 * marked as it goes.
 */
export function Player({
  level,
  program,
  onChange,
  onEnd,
  setting,
  strings,
  className,
}: {
  level: PlayedLevel;
  program: Program;
  /** Absent where the program is only read and played. */
  onChange?: (program: Program) => void;
  /** A run has played to its end: how it ended, and the program it ran. */
  onEnd?: (end: End, program: Program) => void;
  setting: EditorSetting;
  strings: PuzzleStrings;
  className?: string;
}) {
  // Blocks left loose count towards the limit but are not in the program.
  const [loose, setLoose] = useState(0);
  const [python, setPython] = useState(false);
  const { frame, ms, running, end, play, stop } = usePlayback(level);
  const workspace = useRef<WorkspaceHandle>(null);

  const blocks = countBlocks(program);
  const used = blocks + loose;
  const over = misfit(level, program) === "limit";
  const editable = onChange !== undefined && !running;
  const change = (next: Program) => {
    // A run belongs to the program it ran.
    stop();
    onChange?.(next);
  };
  const start = () => {
    // The blocks as they stand now, a change only just made among them.
    const now = workspace.current?.read() ?? program;
    if (JSON.stringify(now) !== JSON.stringify(program)) onChange?.(now);
    play(now, (how) => onEnd?.(how, now));
  };

  return (
    <div data-puzzle={level.style} className={cn("@container", className)}>
      <div
        className={cn(
          "grid gap-4",
          // Side by side only where the blocks still get a tray beside them.
          level.style === "blocks" &&
            "@5xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]",
        )}
      >
        <div className="grid content-start gap-3">
          <Board level={level} frame={frame} ms={ms} strings={strings} />
          <div className="flex flex-wrap items-center justify-center gap-2">
            {running ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-28"
                onClick={stop}
              >
                <Square aria-hidden />
                {strings.stop}
              </Button>
            ) : (
              <Button
                type="button"
                className="h-11 min-w-28"
                disabled={program.length === 0 || over}
                onClick={start}
              >
                <Play aria-hidden />
                {strings.run}
              </Button>
            )}
            {end ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={stop}
              >
                <RotateCcw aria-hidden />
                {strings.again}
              </Button>
            ) : null}
          </div>
          <output
            data-puzzle-end={end ?? undefined}
            className="grid justify-items-center gap-1 text-center text-sm leading-5 empty:hidden"
          >
            {over ? (
              <p className="font-medium text-warning-foreground dark:text-warning">
                {strings.tooManyBlocks(level.limit ?? 0)}
              </p>
            ) : end ? (
              <p
                className={cn(
                  "font-medium",
                  end === "solved"
                    ? "text-success"
                    : "text-warning-foreground dark:text-warning",
                )}
              >
                {strings.ends[end]}
              </p>
            ) : null}
            {end === "solved" &&
            typeof level.ideal === "number" &&
            blocks > level.ideal ? (
              <p className="text-muted-foreground">
                {strings.fewer(blocks, level.ideal)}
              </p>
            ) : null}
          </output>
        </div>
        {level.style === "arrows" ? (
          <ArrowStrip
            program={program}
            onChange={editable ? change : undefined}
            limit={level.limit}
            at={running ? frame.at : null}
            strings={strings}
          />
        ) : (
          <div className="grid content-start gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] leading-[18px] font-medium text-muted-foreground">
                {strings.program}
                {" · "}
                <span className="tabular-nums">
                  {level.limit === null
                    ? strings.blocksUsed(used)
                    : strings.blocksOf(used, level.limit)}
                </span>
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="max-md:h-10"
                aria-pressed={python}
                onClick={() => setPython((shown) => !shown)}
              >
                <Code aria-hidden />
                {python ? strings.hidePython : strings.showPython}
              </Button>
            </div>
            <Workspace
              ref={workspace}
              level={level}
              program={program}
              onChange={
                onChange
                  ? (next, all) => {
                      setLoose(Math.max(0, all - countBlocks(next)));
                      // Moving a block about changes nothing the program says.
                      if (JSON.stringify(next) !== JSON.stringify(program))
                        change(next);
                    }
                  : undefined
              }
              at={running ? frame.at : null}
              locked={running}
              setting={setting}
              strings={strings}
            />
            {python ? (
              <figure className="grid gap-1">
                <figcaption className="text-[13px] leading-[18px] text-muted-foreground">
                  {strings.python}
                </figcaption>
                <pre
                  dir="ltr"
                  className="overflow-x-auto rounded-lg border bg-muted/40 px-3 py-2 font-mono text-[13px] leading-5 [font-variant-ligatures:none]"
                >
                  <code>{pythonOf(program).join("\n")}</code>
                </pre>
              </figure>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
