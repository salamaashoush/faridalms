import type { ReactNode } from "react";

import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import {
  CircleAlert,
  CircleCheck,
  Minus,
  Plus,
  RotateCw,
  X,
} from "lucide-react";
import { useId, useRef, useState } from "react";

import type { Tool } from "./design";
import type { BlockName, Level } from "./level";
import type { EditorSetting } from "./Player";
import type { DesignerStrings } from "./strings";

import { Board } from "./Board";
import { TOOLS, painted, resized, styled, turned } from "./design";
import { BLOCK_NAMES, MAX_SIDE, PUZZLE_STYLES } from "./level";
import { PACKS } from "./levels";
import { startFrame } from "./playback";
import { Player } from "./Player";
import { countBlocks } from "./program";
import { solves } from "./run";
import { CELL } from "./scene";

const label = "text-[13px] leading-[18px] font-medium";
const hint = "text-[13px] leading-[18px] text-muted-foreground";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid content-start gap-3">
      <h3 className="text-sm leading-5 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** A grid's width or height, one square more or fewer at a press. */
function Stepper({
  name,
  value,
  least,
  onChange,
  strings,
}: {
  name: string;
  value: number;
  least: number;
  onChange: (value: number) => void;
  strings: DesignerStrings;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn(label, "min-w-16")}>{name}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="max-md:size-10"
        aria-label={strings.fewer(name)}
        disabled={value <= least}
        onClick={() => onChange(value - 1)}
      >
        <Minus aria-hidden />
      </Button>
      <output className="w-6 text-center text-sm leading-5 tabular-nums">
        {value}
      </output>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="max-md:size-10"
        aria-label={strings.more(name)}
        disabled={value >= MAX_SIDE}
        onClick={() => onChange(value + 1)}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}

/**
 * Where a teacher makes a puzzle: the grid, painted a square at a time,
 * how it is answered and with which blocks, and their own answer, built
 * and run as a student will. A puzzle is saved once that answer solves it,
 * so no class is handed one that cannot be done.
 */
export function Designer({
  level,
  setting,
  strings,
  onSave,
  onCancel,
}: {
  level: Level;
  setting: EditorSetting;
  strings: DesignerStrings;
  onSave: (level: Level) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const close = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(level);
  const [tool, setTool] = useState<Tool>("wall");
  const words = strings.puzzle;
  const solved = solves(draft, draft.solution);
  const holds = (at: number) =>
    at === draft.start.cell
      ? words.square.hero(words.headings[draft.start.heading])
      : at === draft.goal
        ? words.square.goal
        : draft.walls.includes(at)
          ? words.square.wall
          : draft.gems.includes(at)
            ? words.square.gem
            : words.square.open;
  const offered = new Set<BlockName>(draft.blocks);

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Popup
          initialFocus={close}
          className="fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none"
        >
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 lg:px-3">
            <Button
              ref={close}
              type="button"
              variant="ghost"
              size="icon"
              className="max-md:size-10"
              aria-label={strings.cancel}
              onClick={onCancel}
            >
              <X aria-hidden />
            </Button>
            <Dialog.Title className="min-w-0 flex-1 truncate text-sm leading-5 font-semibold">
              {strings.title}
            </Dialog.Title>
            <Button
              type="button"
              className="max-md:h-10"
              disabled={!solved}
              onClick={() => onSave(draft)}
            >
              {strings.save}
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto grid max-w-6xl gap-8 p-4 lg:p-6">
              <div className="grid gap-8 lg:grid-cols-2">
                <Section title={strings.grid}>
                  <fieldset className="flex flex-wrap gap-1.5">
                    <legend className="sr-only">{strings.tools}</legend>
                    {TOOLS.map((name) => (
                      <Button
                        key={name}
                        type="button"
                        size="sm"
                        variant={tool === name ? "default" : "outline"}
                        className="max-md:h-10"
                        aria-pressed={tool === name}
                        onClick={() => setTool(name)}
                      >
                        {strings.tool[name]}
                      </Button>
                    ))}
                  </fieldset>
                  <div
                    className="relative mx-auto w-full"
                    style={{ maxWidth: draft.cols * CELL * 1.4 }}
                  >
                    <Board level={draft} frame={startFrame(draft)} ms={0} />
                    <div
                      dir="ltr"
                      className="absolute inset-0 grid"
                      style={{
                        gridTemplateColumns: `repeat(${draft.cols}, 1fr)`,
                        gridTemplateRows: `repeat(${draft.rows}, 1fr)`,
                      }}
                    >
                      {Array.from(
                        { length: draft.cols * draft.rows },
                        (_, at) => (
                          <button
                            key={at}
                            type="button"
                            data-square={at}
                            aria-label={strings.paint(
                              (at % draft.cols) + 1,
                              Math.floor(at / draft.cols) + 1,
                              holds(at),
                            )}
                            className="rounded-md outline-none hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/60"
                            onClick={() => setDraft(painted(draft, at, tool))}
                          />
                        ),
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <Stepper
                      name={strings.columns}
                      value={draft.cols}
                      least={draft.rows === 1 ? 2 : 1}
                      onChange={(cols) =>
                        setDraft(resized(draft, cols, draft.rows))
                      }
                      strings={strings}
                    />
                    <Stepper
                      name={strings.rows}
                      value={draft.rows}
                      least={draft.cols === 1 ? 2 : 1}
                      onChange={(rows) =>
                        setDraft(resized(draft, draft.cols, rows))
                      }
                      strings={strings}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="max-md:h-10"
                      onClick={() => setDraft(turned(draft))}
                    >
                      <RotateCw aria-hidden />
                      {strings.turnHero}
                    </Button>
                  </div>
                </Section>
                <div className="grid content-start gap-8">
                  <Section title={strings.style}>
                    <fieldset className="grid gap-2 sm:grid-cols-2">
                      <legend className="sr-only">{strings.style}</legend>
                      {PUZZLE_STYLES.map((style) => (
                        <label
                          key={style}
                          className={cn(
                            "grid cursor-pointer gap-1 rounded-lg border px-3 py-2.5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                            draft.style === style &&
                              "border-primary bg-primary/5",
                          )}
                        >
                          <span className="flex items-center gap-2 text-sm leading-5 font-medium">
                            <input
                              type="radio"
                              name={`${id}-style`}
                              className="size-4 accent-primary outline-none"
                              checked={draft.style === style}
                              onChange={() => setDraft(styled(draft, style))}
                            />
                            {strings.styles[style]}
                          </span>
                          <span className={hint}>
                            {strings.styleHints[style]}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    {draft.style === "blocks" ? (
                      <>
                        <fieldset className="grid gap-2">
                          <legend className={cn(label, "mb-2")}>
                            {strings.offered}
                          </legend>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {BLOCK_NAMES.map((name) => (
                              <label
                                key={name}
                                className="flex min-h-9 items-center gap-2 text-sm leading-5"
                              >
                                <Checkbox
                                  checked={offered.has(name)}
                                  onCheckedChange={(checked) =>
                                    setDraft({
                                      ...draft,
                                      blocks: BLOCK_NAMES.filter((block) =>
                                        block === name
                                          ? checked
                                          : offered.has(block),
                                      ),
                                    })
                                  }
                                />
                                {strings.blockNames[name]}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <div className="grid gap-1.5">
                          <label htmlFor={`${id}-limit`} className={label}>
                            {strings.limit}
                          </label>
                          <Input
                            id={`${id}-limit`}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={99}
                            placeholder={strings.limitNone}
                            aria-describedby={`${id}-limit-hint`}
                            className="w-28 max-md:h-10"
                            value={draft.limit ?? ""}
                            onChange={(event) => {
                              const limit = Math.round(
                                Number(event.target.value),
                              );
                              setDraft({
                                ...draft,
                                limit:
                                  event.target.value === "" ||
                                  !Number.isFinite(limit)
                                    ? null
                                    : Math.min(99, Math.max(1, limit)),
                              });
                            }}
                          />
                          <p id={`${id}-limit-hint`} className={hint}>
                            {strings.limitHint}
                          </p>
                        </div>
                      </>
                    ) : null}
                  </Section>
                  <Section title={strings.startFrom}>
                    {PACKS.map((pack) => (
                      <div key={pack.id} className="grid gap-1.5">
                        <p className={hint}>{strings.packs[pack.id]}</p>
                        <ul className="flex flex-wrap gap-2">
                          {pack.levels.map((ready, index) => (
                            // The ready-made puzzles are a fixed list.
                            <li key={`${pack.id}-${index + 1}`}>
                              <button
                                type="button"
                                aria-label={strings.level(
                                  strings.packs[pack.id],
                                  index + 1,
                                )}
                                className="flex size-16 items-center justify-center rounded-lg border bg-card p-1 outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50"
                                onClick={() => setDraft(structuredClone(ready))}
                              >
                                <Board
                                  level={ready}
                                  frame={startFrame(ready)}
                                  ms={0}
                                />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </Section>
                </div>
              </div>
              <Section title={strings.answer}>
                <p className={hint}>{strings.answerHint}</p>
                <output
                  className={cn(
                    "flex items-center gap-2 text-sm leading-5 font-medium",
                    solved
                      ? "text-success"
                      : "text-warning-foreground dark:text-warning",
                  )}
                >
                  {solved ? (
                    <CircleCheck aria-hidden className="size-4" />
                  ) : (
                    <CircleAlert aria-hidden className="size-4" />
                  )}
                  {solved
                    ? strings.answerSolves
                    : countBlocks(draft.solution) === 0
                      ? strings.answerMissing
                      : strings.answerFails}
                </output>
                <Player
                  level={draft}
                  program={draft.solution}
                  onChange={(solution) => setDraft({ ...draft, solution })}
                  setting={setting}
                  strings={words}
                />
              </Section>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
