import type { LessonBlock, Picture } from "@faridalms/domain/learning";
import type { Level } from "@faridalms/puzzles/level";
import type { ReactNode } from "react";

import { mathText } from "@faridalms/domain/content";
import {
  isAuto,
  partKey,
  partName,
  placesToFind,
  shuffled,
} from "@faridalms/domain/learning";
import { programFile } from "@faridalms/domain/project";
import { StoredImage } from "@faridalms/editor/files";
import { mediaClock } from "@faridalms/editor/format";
import { MathText, TextWithMath } from "@faridalms/editor/math";
import { Board } from "@faridalms/puzzles/Board";
import { blocksOf } from "@faridalms/puzzles/level";
import { startFrame } from "@faridalms/puzzles/playback";
import { countBlocks } from "@faridalms/puzzles/program";
import { ARROWS, wordsOf } from "@faridalms/puzzles/text";
import { cn } from "@faridalms/ui/cn";

import { QrCode } from "~/components/badges/QrCode";
import { featureNames } from "~/components/coding/scratch-checks";
import { NumberLineDrawing } from "~/components/learning/NumberLine";
import { blockNames, puzzleStrings } from "~/components/puzzles/strings";
import * as m from "~/i18n/messages";

const LATIN = "abcdefghijklmnopqrstuvwxyz".split("");
// Arabic multiple choice is lettered in the abjad order: أ، ب، ج، د.
const ARABIC = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي", "ك", "ل"];

export const letterOf = (index: number, rtl: boolean) =>
  (rtl ? ARABIC : LATIN)[index] ?? String(index + 1);

/** Ruled lines for a written answer: about eight words to a line. */
export const writingLines = (wordLimit: number | null) =>
  wordLimit === null ? 6 : Math.min(20, Math.max(3, Math.round(wordLimit / 8)));

const key = "font-semibold text-neutral-500";

const range = (count: number) => Array.from({ length: count }, (_, n) => n);

/** A passage's pieces with where each starts, which tells repeated words apart. */
function placed<T extends { type: string }>(segments: T[]) {
  let at = 0;
  return segments.map((segment) => {
    const piece = { segment, at };
    at += "text" in segment ? String(segment.text).length + 1 : 1;
    return piece;
  });
}

function Pic({
  picture,
  fileUrl,
  className,
}: {
  picture: Picture | null | undefined;
  fileUrl: (fileId: string) => string;
  className?: string;
}) {
  return picture ? (
    <StoredImage
      src={fileUrl(picture.fileId)}
      alt={picture.alt}
      removed={m.fileRemoved()}
      className={cn("max-h-[3cm] w-auto object-contain", className)}
    />
  ) : null;
}

function Part({
  part,
  fileUrl,
}: {
  part: { text: string; picture?: Picture | null };
  fileUrl: (fileId: string) => string;
}) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Pic picture={part.picture} fileUrl={fileUrl} />
      {part.text ? (
        <span dir="auto">
          <TextWithMath text={part.text} />
        </span>
      ) : null}
    </span>
  );
}

/** A box to write in, holding the answer on a teacher's copy. */
function Box({
  answer,
  wide = false,
}: {
  answer?: string | null;
  wide?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[1.9em] w-fit shrink-0 items-center justify-center justify-self-start rounded-[3px] border border-neutral-500 px-1 align-middle",
        wide ? "min-w-[7em]" : "min-w-[1.9em]",
      )}
    >
      {answer ? <span className={key}>{answer}</span> : null}
    </span>
  );
}

function Lines({ count }: { count: number }) {
  return (
    <div aria-hidden className="grid">
      {range(count).map((line) => (
        <span key={line} className="h-[2.1em] border-b border-neutral-400" />
      ))}
    </div>
  );
}

/** Ten frames to colour in: rows of five, as many frames as the count needs. */
function TenFrames({ count, filled }: { count: number; filled: number }) {
  const frames = Math.max(1, Math.ceil(count / 10));
  return (
    <div className="flex flex-wrap gap-3">
      {range(frames).map((frame) => (
        <div key={frame} className="grid grid-cols-5 border border-neutral-600">
          {range(10).map((cell) => (
            <span
              key={cell}
              className="grid size-[1.6cm] place-items-center border border-neutral-400"
            >
              {frame * 10 + cell < filled ? (
                <span className="size-[1cm] rounded-full bg-neutral-400" />
              ) : null}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

const pointsOf = (stroke: number[]) => {
  const points: string[] = [];
  for (let index = 0; index + 1 < stroke.length; index += 2)
    points.push(`${stroke[index]},${stroke[index + 1]}`);
  return points.join(" ");
};

/** The letters a matching question's answers carry on paper, by pair. */
function matchingLetters(
  block: Extract<LessonBlock, { type: "matching" }>,
  rtl: boolean,
) {
  const choices = shuffled(
    [
      ...block.pairs.map((pair) => ({ id: pair.id })),
      ...block.distractors.map((distractor) => ({ id: distractor.id })),
    ],
    `paper:${block.id}`,
  );
  return (pairId: string) =>
    letterOf(
      choices.findIndex((choice) => choice.id === pairId),
      rtl,
    );
}

/**
 * A puzzle on paper: its board, then somewhere to write the program. A row
 * of arrows is drawn one to a box; a program of blocks is written a block
 * to a line, from the blocks the puzzle names. A teacher's copy carries
 * the teacher's own program.
 */
function PaperPuzzle({
  level,
  answers,
  locale,
}: {
  level: Level;
  answers: boolean;
  locale: "ar" | "en";
}) {
  const strings = puzzleStrings(locale);
  const names = blockNames(locale);
  const at = { locale };
  const arrows = level.solution.flatMap((step) =>
    step.op === "go" ? [ARROWS[step.to]] : [],
  );
  return (
    <div className="grid gap-[0.8em]">
      <Board
        level={level}
        frame={startFrame(level)}
        ms={0}
        strings={strings}
        className="mx-0 [print-color-adjust:exact]"
      />
      {level.gems.length > 0 ? <p>{m.printPuzzleGems({}, at)}</p> : null}
      {level.style === "arrows" ? (
        <>
          <p>{m.printPuzzleArrows({}, at)}</p>
          <div className="flex flex-wrap gap-[0.3em]">
            {range(Math.max(8, arrows.length + 2)).map((box) => (
              <Box key={box} answer={answers ? arrows[box] : null} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-[0.3em]">
            <p>{m.printPuzzleBlocks({}, at)}</p>
            <ul className="flex flex-wrap gap-[0.4em]">
              {blocksOf(level).map((name) => (
                <li
                  key={name}
                  className="rounded-[4px] border border-neutral-500 px-[0.5em] py-[0.1em]"
                >
                  {names[name]}
                </li>
              ))}
            </ul>
            {level.limit === null ? null : (
              <p>
                {m.printPuzzleLimit(
                  { limit: new Intl.NumberFormat(locale).format(level.limit) },
                  at,
                )}
              </p>
            )}
          </div>
          <p>{m.printPuzzleProgram({}, at)}</p>
          {answers ? (
            <ol className={cn("grid gap-[0.2em]", key)}>
              {wordsOf(level.solution, strings.blocks).map((line, index) => (
                <li
                  // A line is nothing but its words and its place.
                  key={`${index}:${line.text}`}
                  style={{ paddingInlineStart: `${line.depth * 1.5}em` }}
                >
                  {line.text}
                </li>
              ))}
            </ol>
          ) : (
            <Lines count={Math.max(6, countBlocks(level.solution) + 2)} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * A question's answer as one line of an answer key, in the letters and
 * numbers its paper form shows. Null where only a teacher can judge, such
 * as writing or tracing.
 */
export function keyOf(block: LessonBlock, rtl: boolean): string | null {
  const list = (items: string[]) =>
    new Intl.ListFormat(rtl ? "ar" : "en", { type: "unit" }).format(items);
  switch (block.type) {
    case "choice":
      return list(
        block.options.flatMap((option, index) =>
          block.correctOptionIds.includes(option.id)
            ? [letterOf(index, rtl)]
            : [],
        ),
      );
    case "text":
      return block.answers[0] ?? null;
    case "math":
      return block.answers[0] ? mathText({ latex: block.answers[0] }) : null;
    case "number":
      return block.mode === "range"
        ? `${block.min} – ${block.max}`
        : String(block.value);
    case "gaps":
      return list(
        block.segments.flatMap((segment) =>
          segment.type === "gap" ? [segment.answers[0] ?? ""] : [],
        ),
      );
    case "matching": {
      const letterFor = matchingLetters(block, rtl);
      return list(
        block.pairs.map((pair, index) => `${index + 1} ${letterFor(pair.id)}`),
      );
    }
    case "ordering":
      return list(block.items.map((item) => partName(item)));
    case "sorting":
      return block.groups
        .filter((group) => group.name.trim())
        .map(
          (group) =>
            `${group.name}: ${list(
              block.items
                .filter((item) => item.groupId === group.id)
                .map((item) => partName(item)),
            )}`,
        )
        .join(" · ");
    case "counting":
      return String(block.count);
    case "spelling":
      return block.tiles.join("");
    default:
      return null;
  }
}

/**
 * A question as it is answered on paper, from the same question the player
 * marks. A teacher's copy shows each answer in its place, in grey, so the
 * copy marks the paper it lies beside.
 */
export function PaperQuestion({
  block,
  number,
  answers,
  rtl,
  fileUrl,
  online,
}: {
  block: LessonBlock;
  number: number;
  answers: boolean;
  rtl: boolean;
  fileUrl: (fileId: string) => string;
  /** The document's own address, for a question only a screen can answer. */
  online?: string | undefined;
}) {
  const locale = rtl ? "ar" : "en";
  if (
    block.type === "content" ||
    block.type === "gate" ||
    block.type === "draw" ||
    block.type === "media"
  )
    return null;
  const parts = answers && isAuto(block) ? partKey(block) : {};
  let body: ReactNode = null;
  switch (block.type) {
    case "choice":
      body = (
        <ol className="grid gap-1.5">
          {block.options.map((option, index) => {
            const right = answers && block.correctOptionIds.includes(option.id);
            return (
              <li key={option.id} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-[0.3em] size-[0.95em] shrink-0 border-[1.5px] border-neutral-700",
                    block.multiple ? "rounded-[2px]" : "rounded-full",
                    right && "bg-neutral-500",
                  )}
                />
                <span className="font-semibold">{letterOf(index, rtl)})</span>
                <Part part={option} fileUrl={fileUrl} />
              </li>
            );
          })}
        </ol>
      );
      break;
    case "text":
      body = (
        <div className="flex h-[2.1em] items-end border-b border-neutral-400 pb-0.5">
          {answers ? <span className={key}>{block.answers[0]}</span> : null}
        </div>
      );
      break;
    case "math":
      // Room to work a formula out, then the answer on the line below.
      body = (
        <div className="flex h-[3.2em] items-end border-b border-neutral-400 pb-0.5">
          {answers && block.answers[0] ? (
            <span className={key}>
              <MathText latex={block.answers[0]} />
            </span>
          ) : null}
        </div>
      );
      break;
    case "number":
      body = block.line ? (
        <NumberLineDrawing
          line={block.line}
          value={answers && block.mode === "exact" ? block.value : null}
        />
      ) : (
        <Box
          wide
          answer={
            answers
              ? block.mode === "range"
                ? `${block.min} – ${block.max}`
                : String(block.value)
              : null
          }
        />
      );
      break;
    case "written":
      body =
        block.answerWith === "drawing" || block.answerWith === "photo" ? (
          <div className="h-[9cm] rounded-[4px] border border-neutral-500 p-[0.6em]">
            <p className="text-[0.75em] text-neutral-500">
              {(block.answerWith === "drawing"
                ? m.printDrawHere
                : m.printPictureHere)({}, { locale })}
            </p>
          </div>
        ) : (
          <Lines
            count={block.recordSeconds ? 4 : writingLines(block.wordLimit)}
          />
        );
      break;
    case "scratch":
      // Paper runs no project; what the project should do is there to plan
      // by and to tick off, and the code takes the student to the studio.
      body = (
        <div className="grid gap-[0.6em]">
          {block.checks.length > 0 ? (
            <div className="grid gap-[0.3em]">
              <p className="font-semibold">
                {m.scratchChecksTitle({}, { locale })}
              </p>
              <ul className="grid gap-[0.25em]">
                {block.checks.map((feature) => (
                  <li key={feature} className="flex items-start gap-[0.6em]">
                    <span
                      aria-hidden
                      className="mt-[0.2em] size-[0.9em] shrink-0 rounded-[2px] border border-neutral-700"
                    />
                    {featureNames(locale)[feature]}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex items-center gap-[0.8em] rounded-[4px] border border-dashed border-neutral-500 px-[0.8em] py-[0.6em] text-[0.85em] text-neutral-600">
            {online ? (
              <QrCode value={online} className="size-[1.8cm] shrink-0" />
            ) : null}
            <p>{m.printOnComputer({}, { locale })}</p>
          </div>
        </div>
      );
      break;
    case "project": {
      // Paper runs no page: the files the project starts from are there to
      // read and plan on, and the code takes the student to the studio. A
      // micro:bit project prints as its program; its other files are the
      // editor's own, and its blocks as it keeps them are no reading.
      const program = programFile(block.files);
      const printed =
        block.language === "microbit"
          ? program
            ? [program]
            : []
          : block.files;
      body = (
        <div className="grid gap-3">
          <div className="flex items-center gap-[0.8em] rounded-[4px] border border-dashed border-neutral-500 px-[0.8em] py-[0.6em] text-[0.85em] text-neutral-600">
            {online ? (
              <QrCode value={online} className="size-[1.8cm] shrink-0" />
            ) : null}
            <p>
              {(block.language === "microbit"
                ? m.printDeviceOnComputer
                : block.language === "python"
                  ? m.printProgramOnComputer
                  : m.printProjectOnComputer)({}, { locale })}
            </p>
          </div>
          {printed
            .filter((file) => file.code.trim())
            .map((file) => (
              <figure key={file.name} className="grid gap-1">
                <figcaption
                  dir="ltr"
                  className="font-mono text-[0.85em] font-semibold"
                >
                  {file.name}
                </figcaption>
                <pre
                  dir="ltr"
                  className="rounded-[4px] border border-neutral-500 px-2 py-1 font-mono whitespace-pre-wrap [font-variant-ligatures:none]"
                >
                  {file.code}
                </pre>
              </figure>
            ))}
        </div>
      );
      break;
    }
    case "gaps":
      body = (
        <>
          {block.bank ? (
            <p className="mb-2 rounded border border-neutral-400 px-2 py-1">
              {shuffled(
                [
                  ...new Set([
                    ...block.segments.flatMap((segment) =>
                      segment.type === "gap" ? (segment.answers[0] ?? []) : [],
                    ),
                    ...block.bank,
                  ]),
                ],
                `paper:${block.id}`,
              ).join(" · ")}
            </p>
          ) : null}
          <p className="leading-[2.4]">
            {placed(block.segments).map(({ segment, at }) =>
              segment.type === "text" ? (
                <span key={at}>
                  <TextWithMath text={segment.text} />
                </span>
              ) : (
                <span key={segment.id} className="whitespace-nowrap">
                  <span
                    className="mx-1 inline-block border-b border-neutral-600 text-center"
                    style={{
                      minWidth: `${Math.max(4, ...segment.answers.map((answer) => answer.length)) + 2}ch`,
                    }}
                  >
                    {answers ? (
                      <span className={key}>{parts[segment.id]}</span>
                    ) : (
                      " "
                    )}
                  </span>
                  {segment.options.length ? (
                    <span className="text-[0.8em] text-neutral-600">
                      ({segment.options.join(" / ")})
                    </span>
                  ) : null}
                </span>
              ),
            )}
          </p>
        </>
      );
      break;
    case "matching": {
      const choices = shuffled(
        [
          ...block.pairs.map((pair) => ({
            id: pair.id,
            text: pair.answer,
            picture: pair.answerPicture,
          })),
          ...block.distractors,
        ],
        `paper:${block.id}`,
      );
      const letterFor = matchingLetters(block, rtl);
      body = (
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
          <ol className="grid content-start gap-1.5">
            {block.pairs.map((pair, index) => (
              <li key={pair.id} className="flex items-center gap-2">
                <span className="font-semibold">{index + 1}.</span>
                <Part
                  part={{ text: pair.prompt, picture: pair.promptPicture }}
                  fileUrl={fileUrl}
                />
                <span className="flex-1" />
                <Box answer={answers ? letterFor(pair.id) : null} />
              </li>
            ))}
          </ol>
          <ol className="grid content-start gap-1.5">
            {choices.map((choice, index) => (
              <li key={choice.id} className="flex items-center gap-2">
                <span className="font-semibold">{letterOf(index, rtl)})</span>
                <Part part={choice} fileUrl={fileUrl} />
              </li>
            ))}
          </ol>
        </div>
      );
      break;
    }
    case "ordering":
      body = (
        <ul className="grid gap-1.5">
          {shuffled(block.items, `paper:${block.id}`).map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <Box answer={answers ? parts[item.id] : null} />
              <Part part={item} fileUrl={fileUrl} />
            </li>
          ))}
        </ul>
      );
      break;
    case "puzzle":
      body = (
        <PaperPuzzle level={block.level} answers={answers} locale={locale} />
      );
      break;
    case "parsons":
      // A teacher's copy numbers the program's lines and dashes the ones left out.
      body = (
        <ul dir="ltr" className="grid gap-1.5">
          {shuffled(
            [...block.lines, ...block.distractors],
            `paper:${block.id}`,
          ).map((line) => (
            <li key={line.id} className="flex items-center gap-2">
              <Box answer={answers ? (parts[line.id] ?? "–") : null} />
              <code className="font-mono whitespace-pre-wrap [font-variant-ligatures:none]">
                {line.code}
              </code>
            </li>
          ))}
        </ul>
      );
      break;
    case "program": {
      // Paper has no Python: the student writes the program out, from the
      // starter if there is one, against the examples its tests give. A
      // teacher's copy shows the hidden tests too, to mark by.
      const examples = block.tests.filter((test) => answers || !test.hidden);
      body = (
        <div className="grid gap-3">
          {block.starter ? (
            <pre
              dir="ltr"
              className="rounded-[4px] border border-neutral-500 px-2 py-1 font-mono whitespace-pre-wrap [font-variant-ligatures:none]"
            >
              {block.starter}
            </pre>
          ) : null}
          {examples.length > 0 ? (
            <table dir="ltr" className="w-full border-collapse">
              <thead>
                <tr>
                  <th
                    dir="auto"
                    className="border border-neutral-500 px-2 py-0.5 text-start font-semibold"
                  >
                    {m.codeTestGives({}, { locale })}
                  </th>
                  <th
                    dir="auto"
                    className="border border-neutral-500 px-2 py-0.5 text-start font-semibold"
                  >
                    {m.codeTestExpects({}, { locale })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {examples.map((test) => (
                  <tr key={test.id}>
                    <td className="border border-neutral-500 px-2 py-0.5 align-top font-mono whitespace-pre-wrap">
                      {test.input}
                    </td>
                    <td className="border border-neutral-500 px-2 py-0.5 align-top font-mono whitespace-pre-wrap">
                      {test.expected}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <Lines count={Math.max(8, block.starter.split("\n").length + 6)} />
        </div>
      );
      break;
    }
    case "sorting": {
      // The editor keeps an empty group at the end to write the next one in.
      const groups = block.groups.filter((group) => group.name.trim());
      body = (
        <div className="grid gap-3">
          <ul className="flex flex-wrap gap-2 rounded-[4px] border border-neutral-500 p-2">
            {shuffled(block.items, `paper:${block.id}`).map((item) => (
              <li
                key={item.id}
                className="rounded-[3px] border border-neutral-400 px-2 py-0.5"
              >
                <Part part={item} fileUrl={fileUrl} />
              </li>
            ))}
          </ul>
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${Math.min(groups.length, 4)}, minmax(0, 1fr))`,
            }}
          >
            {groups.map((group) => (
              <div
                key={group.id}
                className="min-h-[4cm] rounded-[4px] border border-neutral-500"
              >
                <p className="border-b border-neutral-500 px-2 py-1 font-semibold">
                  {group.name}
                </p>
                {answers ? (
                  <ul className="grid gap-0.5 p-2">
                    {block.items
                      .filter((item) => item.groupId === group.id)
                      .map((item) => (
                        <li key={item.id} className={key}>
                          <TextWithMath text={partName(item)} />
                        </li>
                      ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      );
      break;
    }
    case "counting":
      body =
        block.mode === "make" ? (
          <TenFrames count={block.count} filled={answers ? block.count : 0} />
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-3">
              {range(block.count).map((thing) =>
                block.picture ? (
                  <Pic
                    key={thing}
                    picture={block.picture}
                    fileUrl={fileUrl}
                    className="max-h-[1.8cm]"
                  />
                ) : (
                  <span
                    key={thing}
                    className="size-[1.2cm] rounded-full border-2 border-neutral-600"
                  />
                ),
              )}
            </div>
            <p className="flex items-center gap-2">
              {m.printHowMany({}, { locale })}
              <Box answer={answers ? String(block.count) : null} />
            </p>
          </div>
        );
      break;
    case "tracing":
      body = (
        <div className="flex flex-wrap gap-4">
          {[0, 1].map((copy) => (
            <svg
              key={copy}
              aria-hidden
              viewBox="0 0 1 1"
              className="size-[5cm] rounded-[4px] border border-neutral-400"
            >
              {/* The second square is left for the child's own try. */}
              {copy === 0
                ? block.strokes.map((stroke) => (
                    <g key={stroke.join(",")}>
                      <polyline
                        points={pointsOf(stroke)}
                        fill="none"
                        stroke="#777"
                        strokeWidth={0.02}
                        strokeDasharray="0.025 0.03"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx={stroke[0]}
                        cy={stroke[1]}
                        r={0.025}
                        fill="#333"
                      />
                    </g>
                  ))
                : null}
            </svg>
          ))}
        </div>
      );
      break;
    case "spelling":
      body = (
        <div className="grid gap-3">
          <Pic picture={block.picture} fileUrl={fileUrl} />
          <div className="flex flex-wrap gap-1.5" dir={rtl ? "rtl" : "ltr"}>
            {range(block.tiles.length).map((slot) => (
              <span
                key={slot}
                className="grid size-[1.4cm] place-items-center rounded-[4px] border-2 border-neutral-600 text-[1.4em]"
              >
                {answers ? (
                  <span className={key}>{block.tiles[slot]}</span>
                ) : null}
              </span>
            ))}
          </div>
          <p className="flex flex-wrap gap-2 text-[1.2em]">
            {shuffled(
              [...block.tiles, ...block.extras].map((tile, slot) => ({
                tile,
                slot,
              })),
              `paper:${block.id}`,
            ).map(({ tile, slot }) => (
              <span
                key={slot}
                className="rounded-[3px] border border-neutral-400 px-2"
              >
                {tile}
              </span>
            ))}
          </p>
        </div>
      );
      break;
    case "hotspot":
      body = block.picture ? (
        <div className="relative w-fit">
          <StoredImage
            src={fileUrl(block.picture.fileId)}
            alt={block.picture.alt}
            removed={m.fileRemoved()}
            className="max-h-[9cm] w-auto"
          />
          {answers
            ? placesToFind(block.places).map(([left, top, width, height]) => (
                <span
                  key={`${left},${top}`}
                  className="absolute rounded-[4px] border-[3px] border-neutral-500"
                  style={{
                    // Places are measured from the picture's left edge in
                    // either direction, as the picture never mirrors.
                    left: `${left * 100}%`,
                    top: `${top * 100}%`,
                    width: `${width * 100}%`,
                    height: `${height * 100}%`,
                  }}
                />
              ))
            : null}
        </div>
      ) : null;
      break;
  }
  return (
    <section className="paper-question grid gap-2 py-2">
      <p className="flex gap-1.5 font-semibold" dir="auto">
        <span>{number}.</span>
        <span>
          <TextWithMath text={block.prompt} />
        </span>
      </p>
      {typeof block.videoAt === "number" ? (
        <p className="text-[0.8em] text-neutral-600">
          {m.printVideoAt({ time: mediaClock(block.videoAt) }, { locale })}
        </p>
      ) : null}
      {body}
      {answers && "explanation" in block && block.explanation ? (
        <p className="text-[0.85em] text-neutral-600" dir="auto">
          {block.explanation}
        </p>
      ) : null}
    </section>
  );
}
