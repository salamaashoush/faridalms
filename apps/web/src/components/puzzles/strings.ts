import type {
  DesignerStrings,
  PuzzleStrings,
} from "@faridalms/puzzles/strings";

import type { Locale } from "~/i18n/runtime";

import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";

/**
 * What a puzzle says, in the reader's language, or in the language of the
 * page it is printed on.
 */
export function puzzleStrings(locale: Locale = getLocale()): PuzzleStrings {
  const at = { locale };
  const numbers = new Intl.NumberFormat(locale);
  const formatNumber = (value: number) => numbers.format(value);
  return {
    board: (columns, rows) =>
      m.puzzleBoard(
        {
          columns: formatNumber(columns),
          rows: formatNumber(rows),
        },
        at,
      ),
    square: {
      open: m.puzzleSquareOpen({}, at),
      wall: m.puzzleSquareWall({}, at),
      goal: m.puzzleSquareGoal({}, at),
      gem: m.puzzleSquareGem({}, at),
      hero: (heading) => m.puzzleSquareHero({ heading }, at),
    },
    hero: m.puzzleHero({}, at),
    headings: {
      north: m.puzzleNorth({}, at),
      east: m.puzzleEast({}, at),
      south: m.puzzleSouth({}, at),
      west: m.puzzleWest({}, at),
    },
    arrows: {
      north: m.puzzleArrowNorth({}, at),
      east: m.puzzleArrowEast({}, at),
      south: m.puzzleArrowSouth({}, at),
      west: m.puzzleArrowWest({}, at),
    },
    run: m.puzzleRun({}, at),
    stop: m.puzzleStop({}, at),
    again: m.puzzleAgain({}, at),
    undo: m.puzzleUndo({}, at),
    clear: m.puzzleClear({}, at),
    steps: m.puzzleSteps({}, at),
    noSteps: m.puzzleNoSteps({}, at),
    removeStep: (number, arrow) =>
      m.puzzleRemoveStep({ number: formatNumber(number), arrow }, at),
    program: m.puzzleProgram({}, at),
    blocksUsed: (used) => m.puzzleBlocksUsed({ used: formatNumber(used) }, at),
    blocksOf: (used, limit) =>
      m.puzzleBlocksOf(
        {
          used: formatNumber(used),
          limit: formatNumber(limit),
        },
        at,
      ),
    ends: {
      solved: m.puzzleEndSolved({}, at),
      bumped: m.puzzleEndBumped({}, at),
      short: m.puzzleEndShort({}, at),
      endless: m.puzzleEndEndless({}, at),
    },
    tooManyBlocks: (limit) =>
      m.puzzleTooManyBlocks({ limit: formatNumber(limit) }, at),
    fewer: (used, ideal) =>
      m.puzzleFewer(
        { used: formatNumber(used), ideal: formatNumber(ideal) },
        at,
      ),
    showPython: m.puzzleShowPython({}, at),
    hidePython: m.puzzleHidePython({}, at),
    python: m.puzzlePython({}, at),
    loading: m.puzzleLoading({}, at),
    blocks: {
      start: m.puzzleBlockStart({}, at),
      forward: m.puzzleBlockForward({}, at),
      go: m.puzzleBlockGo({}, at),
      turn: m.puzzleBlockTurn({}, at),
      repeat: m.puzzleBlockRepeat({}, at),
      until: m.puzzleBlockUntil({}, at),
      if: m.puzzleBlockIf({}, at),
      else: m.puzzleBlockElse({}, at),
      directions: {
        north: m.puzzleGoNorth({}, at),
        east: m.puzzleGoEast({}, at),
        south: m.puzzleGoSouth({}, at),
        west: m.puzzleGoWest({}, at),
      },
      turns: {
        left: m.puzzleTurnLeft({}, at),
        right: m.puzzleTurnRight({}, at),
      },
      sides: {
        ahead: m.puzzleSideAhead({}, at),
        left: m.puzzleSideLeft({}, at),
        right: m.puzzleSideRight({}, at),
      },
    },
  };
}

/** Each block a puzzle may offer, named for a teacher choosing among them. */
export function blockNames(
  locale: Locale = getLocale(),
): DesignerStrings["blockNames"] {
  const at = { locale };
  return {
    go: m.puzzleBlockNameGo({}, at),
    forward: m.puzzleBlockNameForward({}, at),
    turn: m.puzzleBlockNameTurn({}, at),
    repeat: m.puzzleBlockNameRepeat({}, at),
    until: m.puzzleBlockNameUntil({}, at),
    if: m.puzzleBlockNameIf({}, at),
    ifelse: m.puzzleBlockNameIfElse({}, at),
  };
}

/** What the puzzle designer says to a teacher. */
export function designerStrings(): DesignerStrings {
  const numbers = new Intl.NumberFormat(getLocale());
  const formatNumber = (value: number) => numbers.format(value);
  return {
    puzzle: puzzleStrings(),
    title: m.puzzleDesignTitle(),
    save: m.puzzleDesignSave(),
    cancel: m.puzzleDesignCancel(),
    grid: m.puzzleDesignGrid(),
    columns: m.puzzleDesignColumns(),
    rows: m.puzzleDesignRows(),
    more: (what) => m.puzzleDesignMore({ what }),
    fewer: (what) => m.puzzleDesignFewer({ what }),
    tools: m.puzzleDesignTools(),
    tool: {
      wall: m.puzzleToolWall(),
      open: m.puzzleToolOpen(),
      start: m.puzzleToolStart(),
      goal: m.puzzleToolGoal(),
      gem: m.puzzleToolGem(),
    },
    paint: (column, row, holds) =>
      m.puzzleDesignPaint({
        column: formatNumber(column),
        row: formatNumber(row),
        holds,
      }),
    turnHero: m.puzzleDesignTurnHero(),
    style: m.puzzleDesignStyle(),
    styles: { arrows: m.puzzleStyleArrows(), blocks: m.puzzleStyleBlocks() },
    styleHints: {
      arrows: m.puzzleStyleArrowsHint(),
      blocks: m.puzzleStyleBlocksHint(),
    },
    offered: m.puzzleDesignOffered(),
    blockNames: blockNames(),
    limit: m.puzzleDesignLimit(),
    limitNone: m.puzzleDesignLimitNone(),
    limitHint: m.puzzleDesignLimitHint(),
    startFrom: m.puzzleDesignStartFrom(),
    packs: {
      arrows: m.puzzlePackArrows(),
      paths: m.puzzlePackPaths(),
      loops: m.puzzlePackLoops(),
      choices: m.puzzlePackChoices(),
    },
    level: (pack, number) =>
      m.puzzleDesignLevel({ pack, number: formatNumber(number) }),
    answer: m.puzzleDesignAnswer(),
    answerHint: m.puzzleDesignAnswerHint(),
    answerSolves: m.puzzleDesignSolves(),
    answerMissing: m.puzzleDesignMissing(),
    answerFails: m.puzzleDesignFails(),
  };
}

/** Where the web serves the block editor's own pictures and cursors. */
const BLOCKS_MEDIA = "/blockly/media/";

/** How this page tells the block editor about itself. */
export function editorSetting() {
  const locale = getLocale();
  return {
    rtl: getTextDirection(locale) === "rtl",
    arabic: locale === "ar",
    media: BLOCKS_MEDIA,
  };
}
