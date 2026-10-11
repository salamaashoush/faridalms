import * as Blockly from "blockly/core";
import * as arabic from "blockly/msg/ar";
import * as english from "blockly/msg/en";

import type { BlockName, Level } from "../level";
import type { Program, Step } from "../program";
import type { Place } from "../run";
import type { PuzzleStrings } from "../strings";

import { HEADINGS, SIDES, blocksOf } from "../level";
import { placeKey } from "../playback";
import { MAX_REPEATS } from "../program";
import { ARABIC } from "./arabic";

type BlockStrings = PuzzleStrings["blocks"];
type BlockState = Blockly.serialization.blocks.State;

const START = "puzzle_start";
/** Where the program's first block sits in a new workspace. */
const ORIGIN = 24;

/** A catalogue's messages; its module carries more than those. */
const wordsOf = (catalogue: object): Record<string, string> =>
  Object.fromEntries(
    Object.entries(catalogue).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

/** Room in a block for the blocks it holds. */
const holding = (name: string) => ({ type: "input_statement", name });

let prepared = false;

/**
 * Tells the block editor what our blocks are and what they say. It keeps
 * its blocks and its keys in one place for the whole page, so they are
 * told once, in the page's one language.
 */
function prepare(strings: BlockStrings) {
  if (prepared) return;
  prepared = true;
  Blockly.ShortcutItems.registerNavigationShortcuts();
  const stack = { previousStatement: null, nextStatement: null };
  Blockly.defineBlocksWithJsonArray([
    {
      type: START,
      message0: strings.start,
      nextStatement: null,
      style: "puzzle_start",
    },
    {
      type: "puzzle_go",
      message0: strings.go,
      args0: [
        {
          type: "field_dropdown",
          name: "TO",
          options: HEADINGS.map((heading) => [
            strings.directions[heading],
            heading,
          ]),
        },
      ],
      ...stack,
      style: "puzzle_move",
    },
    {
      type: "puzzle_forward",
      message0: strings.forward,
      ...stack,
      style: "puzzle_move",
    },
    {
      type: "puzzle_turn",
      message0: strings.turn,
      args0: [
        {
          type: "field_dropdown",
          name: "TO",
          options: [
            [strings.turns.left, "left"],
            [strings.turns.right, "right"],
          ],
        },
      ],
      ...stack,
      style: "puzzle_move",
    },
    {
      type: "puzzle_repeat",
      message0: strings.repeat,
      args0: [
        {
          type: "field_number",
          name: "TIMES",
          value: 4,
          min: 1,
          max: MAX_REPEATS,
          precision: 1,
        },
      ],
      message1: "%1",
      args1: [holding("DO")],
      ...stack,
      style: "puzzle_loop",
    },
    {
      type: "puzzle_until",
      message0: strings.until,
      message1: "%1",
      args1: [holding("DO")],
      ...stack,
      style: "puzzle_loop",
    },
    ...(["puzzle_if", "puzzle_ifelse"] as const).map((type) => ({
      type,
      message0: strings.if,
      args0: [
        {
          type: "field_dropdown",
          name: "PATH",
          options: SIDES.map((side) => [strings.sides[side], side]),
        },
      ],
      message1: "%1",
      args1: [holding("DO")],
      ...(type === "puzzle_ifelse"
        ? { message2: `${strings.else} %1`, args2: [holding("ELSE")] }
        : {}),
      ...stack,
      style: "puzzle_choice",
    })),
  ]);
}

/**
 * White words read on every one of these at the size a block is drawn, and
 * each idea keeps one colour: moving, repeating, choosing.
 */
function themeOf(rtl: boolean): Blockly.Theme {
  return Blockly.Theme.defineTheme("farida", {
    name: "farida",
    base: Blockly.Themes.Zelos,
    blockStyles: {
      puzzle_start: { colourPrimary: "#a16207" },
      puzzle_move: { colourPrimary: "#2563eb" },
      puzzle_loop: { colourPrimary: "#15803d" },
      puzzle_choice: { colourPrimary: "#7e22ce" },
    },
    componentStyles: {
      workspaceBackgroundColour: "var(--color-card)",
      flyoutBackgroundColour: "var(--color-muted)",
      flyoutOpacity: 1,
      scrollbarColour: "var(--color-muted-foreground)",
      scrollbarOpacity: 0.4,
    },
    fontStyle: {
      family: rtl
        ? '"Noto Sans Arabic Variable", "Inter Variable", system-ui, sans-serif'
        : '"Inter Variable", "Noto Sans Arabic Variable", system-ui, sans-serif',
      weight: "600",
      size: 12,
    },
  });
}

const PRESETS: Record<BlockName, BlockState[]> = {
  go: HEADINGS.map((heading) => ({
    type: "puzzle_go",
    fields: { TO: heading },
  })),
  forward: [{ type: "puzzle_forward" }],
  turn: [
    { type: "puzzle_turn", fields: { TO: "left" } },
    { type: "puzzle_turn", fields: { TO: "right" } },
  ],
  repeat: [{ type: "puzzle_repeat" }],
  until: [{ type: "puzzle_until" }],
  if: [{ type: "puzzle_if" }],
  ifelse: [{ type: "puzzle_ifelse" }],
};

function chain(steps: readonly Step[]): { block: BlockState } | undefined {
  const [first, ...rest] = steps;
  if (!first) return undefined;
  return { block: { ...stateOf(first), next: chain(rest) } };
}

const inputs = (bodies: Record<string, readonly Step[] | undefined>) =>
  Object.fromEntries(
    Object.entries(bodies).flatMap(([name, steps]) => {
      const inside = steps ? chain(steps) : undefined;
      return inside ? [[name, inside]] : [];
    }),
  );

function stateOf(step: Step): BlockState {
  if (step.op === "go") return { type: "puzzle_go", fields: { TO: step.to } };
  if (step.op === "forward") return { type: "puzzle_forward" };
  if (step.op === "turn")
    return { type: "puzzle_turn", fields: { TO: step.to } };
  if (step.op === "repeat")
    return {
      type: "puzzle_repeat",
      fields: { TIMES: step.times },
      inputs: inputs({ DO: step.body }),
    };
  if (step.op === "until")
    return { type: "puzzle_until", inputs: inputs({ DO: step.body }) };
  return {
    type: step.else ? "puzzle_ifelse" : "puzzle_if",
    fields: { PATH: step.path },
    inputs: inputs({ DO: step.body, ELSE: step.else }),
  };
}

const picked = <T extends string>(
  block: Blockly.Block,
  field: string,
  from: readonly T[],
): T => {
  const value: unknown = block.getFieldValue(field);
  return from.find((option) => option === value) ?? (from[0] as T);
};

export interface Editor {
  /** Shows a program, unless it is the one already there. */
  load: (program: Program) => void;
  /**
   * The program as its blocks stand this moment. The editor tells of a
   * change a moment after it is made, which is too late for a run started
   * straight after one.
   */
  read: () => Program;
  /** Marks the block at a place as the one being carried out; null marks none. */
  highlight: (place: Place | null) => void;
  lock: (locked: boolean) => void;
  dispose: () => void;
}

/**
 * The block editor on a puzzle: its blocks in a tray, the program under
 * "when run", and nothing else. What the student builds is read back as
 * the program it means, so nothing of the editor's own save is ever kept.
 * Blocks left loose on the workspace count towards the puzzle's limit, as
 * the tray shows it, but are no part of the program.
 */
export function createEditor(
  host: HTMLElement,
  options: {
    level: Pick<Level, "style" | "blocks" | "limit">;
    program: Program;
    rtl: boolean;
    arabic: boolean;
    /** Too narrow for a tray beside the workspace; it goes underneath. */
    narrow: boolean;
    /** Where the editor's own pictures and cursors are served from. */
    media: string;
    strings: PuzzleStrings;
    readOnly: boolean;
    onChange: (program: Program, used: number) => void;
  },
): Editor {
  Blockly.setLocale(
    options.arabic ? { ...wordsOf(arabic), ...ARABIC } : wordsOf(english),
  );
  prepare(options.strings.blocks);

  const workspace = Blockly.inject(host, {
    rtl: options.rtl,
    renderer: "zelos",
    theme: themeOf(options.rtl),
    media: options.media,
    sounds: false,
    trashcan: !options.readOnly,
    readOnly: options.readOnly,
    comments: false,
    collapse: false,
    disable: false,
    horizontalLayout: options.narrow,
    toolboxPosition: options.narrow ? "end" : "start",
    // The block every program hangs from is no part of the count.
    maxBlocks:
      options.level.limit === null ? Infinity : options.level.limit + 1,
    zoom: {
      controls: false,
      wheel: false,
      pinch: true,
      startScale: options.narrow ? 0.8 : 0.9,
    },
    // A program only read is small enough to see whole, and still drags.
    move: { scrollbars: !options.readOnly, drag: true, wheel: true },
    toolbox: {
      kind: "flyoutToolbox",
      contents: blocksOf(options.level).flatMap((name) =>
        PRESETS[name].map((block) => ({ kind: "block", ...block })),
      ),
    },
  });

  // The blocks of the program by their place in it, as last read.
  const ids = new Map<string, string>();
  let shown = "";

  const read = (first: Blockly.Block | null, within: Place): Step[] => {
    const steps: Step[] = [];
    for (let block = first; block; block = block.getNextBlock()) {
      const at = [...within, steps.length];
      ids.set(placeKey(at), block.id);
      const inside = (input: string, branch: number) =>
        read(block.getInputTargetBlock(input), [...at, branch]);
      switch (block.type) {
        case "puzzle_go":
          steps.push({ op: "go", to: picked(block, "TO", HEADINGS) });
          break;
        case "puzzle_forward":
          steps.push({ op: "forward" });
          break;
        case "puzzle_turn":
          steps.push({
            op: "turn",
            to: picked(block, "TO", ["left", "right"] as const),
          });
          break;
        case "puzzle_repeat":
          steps.push({
            op: "repeat",
            times: Number(block.getFieldValue("TIMES")) || 1,
            body: inside("DO", 0),
          });
          break;
        case "puzzle_until":
          steps.push({ op: "until", body: inside("DO", 0) });
          break;
        case "puzzle_if":
          steps.push({
            op: "if",
            path: picked(block, "PATH", SIDES),
            body: inside("DO", 0),
          });
          break;
        case "puzzle_ifelse":
          steps.push({
            op: "if",
            path: picked(block, "PATH", SIDES),
            body: inside("DO", 0),
            else: inside("ELSE", 1),
          });
          break;
      }
    }
    return steps;
  };
  const current = (): Program => {
    ids.clear();
    const [start] = workspace.getBlocksByType(START);
    return start ? read(start.getNextBlock(), []) : [];
  };

  // The program hangs from the corner reading starts at: the top left, or
  // the top right where it is written right to left. The editor measures
  // from the left whichever way it reads, so the program is put back in
  // its corner whenever the workspace takes a new width.
  const settle = () => {
    const [start] = workspace.getBlocksByType(START);
    if (!start) return;
    const at = start.getRelativeToSurfaceXY();
    const edge = options.rtl
      ? workspace.getMetrics().viewWidth - ORIGIN
      : ORIGIN;
    workspace.scroll(
      edge - at.x * workspace.scale,
      ORIGIN - at.y * workspace.scale,
    );
  };

  const load = (program: Program) => {
    const wanted = JSON.stringify(program);
    if (wanted === shown) return;
    shown = wanted;
    // Loading is not the student's doing, and must not be told as theirs.
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(
        {
          blocks: {
            languageVersion: 0,
            blocks: [
              {
                type: START,
                x: ORIGIN,
                y: ORIGIN,
                deletable: false,
                movable: false,
                next: chain(program),
              },
            ],
          },
        },
        workspace,
      );
    } finally {
      Blockly.Events.enable();
    }
    current();
    settle();
  };
  load(options.program);

  const built = new Set<string>([
    Blockly.Events.BLOCK_CREATE,
    Blockly.Events.BLOCK_DELETE,
    Blockly.Events.BLOCK_CHANGE,
    Blockly.Events.BLOCK_MOVE,
  ]);
  workspace.addChangeListener((event) => {
    if (!built.has(event.type) || workspace.isDragging()) return;
    const program = current();
    shown = JSON.stringify(program);
    options.onChange(program, workspace.getAllBlocks(false).length - 1);
  });

  // The editor offers a block taken from the tray by keyboard at the block
  // the student last stood on in the program. One who came to the tray
  // first has stood on none, and the block would be left loose beside a
  // program that still runs nothing. Standing them on the program's last
  // block, and back on the tray's, has the editor offer it there.
  const stand = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const focus = Blockly.getFocusManager();
    const taken = focus.getFocusedNode();
    if (!(taken instanceof Blockly.BlockSvg) || !taken.workspace.isFlyout)
      return;
    const marked = workspace
      .getSvgGroup()
      .querySelector(
        `.${Blockly.FocusManager.PASSIVE_FOCUS_NODE_CSS_CLASS_NAME}`,
      );
    const stood = marked?.id ? workspace.lookUpFocusableNode(marked.id) : null;
    if (workspace.getNavigator().getSourceBlockFromNode(stood)) return;
    let last = workspace
      .getTopBlocks(false)
      .find((block) => block.type === START);
    if (!last) return;
    for (let next = last.getNextBlock(); next; next = next.getNextBlock())
      last = next;
    focus.focusNode(last);
    focus.focusNode(taken);
  };
  host.addEventListener("keydown", stand, true);

  const resized = new ResizeObserver(() => {
    Blockly.svgResize(workspace);
    settle();
  });
  resized.observe(host);

  return {
    load,
    read: current,
    highlight: (place) =>
      workspace.highlightBlock(
        place ? (ids.get(placeKey(place)) ?? null) : null,
      ),
    lock: (locked) => workspace.setIsReadOnly(locked),
    dispose: () => {
      resized.disconnect();
      host.removeEventListener("keydown", stand, true);
      workspace.dispose();
    },
  };
}
