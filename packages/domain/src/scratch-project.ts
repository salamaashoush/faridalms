import * as v from "valibot";

/**
 * What a teacher can ask a coding project to have. Each is told from the
 * project itself, and only from blocks that run: a block left loose on the
 * workspace, under nothing that starts it, does nothing and counts for
 * nothing. They say what a project is made of, never how good it is. A
 * count of blocks rates a story low and a pile of blocks high, so these
 * are a list for the student to work to and the teacher to mark beside.
 */
export const SCRATCH_FEATURES = [
  "flag",
  "loop",
  "choice",
  "variable",
  "message",
  "sprites",
  "input",
  "sound",
  "custom",
  "clones",
] as const;
export type ScratchFeature = (typeof SCRATCH_FEATURES)[number];

/** The things a question asks for, each once. */
export const scratchChecksSchema = v.pipe(
  v.array(v.picklist(SCRATCH_FEATURES)),
  v.maxLength(SCRATCH_FEATURES.length),
  v.check(
    (checks) => new Set(checks).size === checks.length,
    "learning.checks_repeated",
  ),
);

/** The most blocks read from one project; Scratch's own projects stop far short. */
const MAX_BLOCKS = 200_000;

interface Block {
  opcode: string;
  next: string | null;
  inputs: Record<string, unknown>;
  fields: Record<string, unknown>;
  topLevel: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function blocksOf(target: Record<string, unknown>): Map<string, Block> {
  const blocks = new Map<string, Block>();
  if (!isRecord(target.blocks)) return blocks;
  for (const [id, block] of Object.entries(target.blocks))
    if (isRecord(block) && typeof block.opcode === "string")
      blocks.set(id, {
        opcode: block.opcode,
        next: typeof block.next === "string" ? block.next : null,
        inputs: isRecord(block.inputs) ? block.inputs : {},
        fields: isRecord(block.fields) ? block.fields : {},
        topLevel: block.topLevel === true,
      });
  return blocks;
}

/**
 * A block that starts a script: Scratch's own events, an extension's, the
 * start of a clone, and the definition of a block of the student's making.
 */
const startsScript = (opcode: string) =>
  /^[A-Za-z0-9]+_when/.test(opcode) ||
  opcode === "control_start_as_clone" ||
  opcode === "procedures_definition";

/** The blocks an input holds: a stack inside a loop, or a block dropped in a slot. */
const heldBy = (input: unknown): string[] =>
  Array.isArray(input)
    ? input.slice(1).filter((item) => typeof item === "string")
    : [];

const holdsStack = (block: Block) =>
  heldBy(block.inputs.SUBSTACK).length > 0 ||
  heldBy(block.inputs.SUBSTACK2).length > 0;

/** The name a field shows, which is the first thing it keeps. */
const named = (field: unknown): string | null =>
  Array.isArray(field) && typeof field[0] === "string" ? field[0] : null;

const LOOPS = new Set([
  "control_repeat",
  "control_forever",
  "control_repeat_until",
  "control_while",
  "control_for_each",
]);
const CHOICES = new Set(["control_if", "control_if_else"]);
const CHANGES = new Set(["data_setvariableto", "data_changevariableby"]);
const SENDS = new Set(["event_broadcast", "event_broadcastandwait"]);
const ANSWERS = new Set([
  "event_whenkeypressed",
  "event_whenthisspriteclicked",
  "event_whenstageclicked",
]);
const SENSES = new Set(["sensing_keypressed", "sensing_mousedown"]);
const SOUNDS = new Set(["sound_play", "sound_playuntildone"]);

const any = (opcodes: ReadonlySet<string>, among: ReadonlySet<string>) =>
  [...opcodes].some((opcode) => among.has(opcode));

/** A message a script sends, or true when a block decides which as it runs. */
function sent(block: Block, blocks: Map<string, Block>): string | true {
  const input = block.inputs.BROADCAST_INPUT;
  const held = Array.isArray(input) ? (input[1] as unknown) : null;
  if (Array.isArray(held) && typeof held[1] === "string") return held[1];
  const menu = typeof held === "string" ? blocks.get(held) : undefined;
  return (
    (menu?.opcode === "event_broadcast_menu"
      ? named(menu.fields.BROADCAST_OPTION)
      : null) ?? true
  );
}

/**
 * Something in a project worth a second look: a mistake beginners make
 * often enough to be worth naming, found from the blocks alone. Each is a
 * question to the student, not a fault, since a project can mean what it
 * says.
 */
export type ScratchNote =
  /** A message is sent that no script hears, or heard that nothing sends. */
  | { kind: "unheard" | "unsent"; message: string }
  /** A key, the mouse or a touch is checked once, straight after the flag. */
  | { kind: "once" }
  /** A "forever" sits inside another loop, which then never goes round again. */
  | { kind: "forever" };

export const MAX_SCRATCH_NOTES = 8;
const MAX_MESSAGE_NAME = 60;

export const scratchNotesSchema = v.pipe(
  v.array(
    v.variant("kind", [
      v.object({
        kind: v.picklist(["unheard", "unsent"]),
        message: v.pipe(v.string(), v.maxLength(MAX_MESSAGE_NAME)),
      }),
      v.object({ kind: v.literal("once") }),
      v.object({ kind: v.literal("forever") }),
    ]),
  ),
  v.maxLength(MAX_SCRATCH_NOTES),
);

/** What is true at one moment, so that asking once is asking too early. */
const MOMENTS = new Set([
  "sensing_keypressed",
  "sensing_mousedown",
  "sensing_touchingobject",
  "sensing_touchingcolor",
  "sensing_coloristouchingcolor",
]);

/** Whether a block, or any block dropped into it, is one of these. */
function holds(
  blocks: Map<string, Block>,
  from: readonly string[],
  opcodes: ReadonlySet<string>,
): boolean {
  const seen = new Set<string>();
  const waiting = [...from];
  for (let id = waiting.pop(); id !== undefined; id = waiting.pop()) {
    const block = blocks.get(id);
    if (!block || seen.has(id) || seen.size >= 200) continue;
    seen.add(id);
    if (opcodes.has(block.opcode)) return true;
    for (const input of Object.values(block.inputs))
      waiting.push(...heldBy(input));
  }
  return false;
}

/** What a project's running blocks come to, gathered in one pass over them. */
interface Reading {
  sprites: number;
  /** The blocks that run, and the blocks that start the scripts they are in. */
  ran: Set<string>;
  started: Set<string>;
  sends: Set<string | true>;
  receives: Set<string>;
  /** A check made once after the flag; a forever inside another loop. */
  once: boolean;
  forever: boolean;
}

/**
 * Reads a project's `project.json`. The file comes from a student's
 * browser, so nothing in it is taken to be as Scratch would have written
 * it: whatever is not, is passed over.
 */
function read(project: unknown): Reading {
  const targets =
    isRecord(project) && Array.isArray(project.targets)
      ? project.targets.filter(isRecord)
      : [];
  const reading: Reading = {
    sprites: targets.filter((target) => target.isStage !== true).length,
    ran: new Set(),
    started: new Set(),
    sends: new Set(),
    receives: new Set(),
    once: false,
    forever: false,
  };
  let count = 0;

  for (const target of targets) {
    const blocks = blocksOf(target);
    const seen = new Set<string>();
    // Each block with what is around it: whether a loop holds it, and
    // whether the flag started its script.
    const waiting: { id: string; looped: boolean; flagged: boolean }[] = [];
    for (const block of blocks.values()) {
      if (!block.topLevel || !block.next || !startsScript(block.opcode))
        continue;
      reading.started.add(block.opcode);
      const message =
        block.opcode === "event_whenbroadcastreceived"
          ? named(block.fields.BROADCAST_OPTION)
          : null;
      if (message !== null) reading.receives.add(message);
      waiting.push({
        id: block.next,
        looped: false,
        flagged: block.opcode === "event_whenflagclicked",
      });
    }
    for (let at = waiting.pop(); at !== undefined; at = waiting.pop()) {
      const block = blocks.get(at.id);
      if (!block || seen.has(at.id) || count >= MAX_BLOCKS) continue;
      seen.add(at.id);
      count += 1;
      const loop = LOOPS.has(block.opcode);
      const choice = CHOICES.has(block.opcode);
      if (loop || choice) {
        // One with nothing inside repeats or chooses nothing.
        if (holdsStack(block)) reading.ran.add(block.opcode);
      } else reading.ran.add(block.opcode);
      if (block.opcode === "control_forever" && at.looped)
        reading.forever = true;
      if (
        choice &&
        at.flagged &&
        !at.looped &&
        holds(blocks, heldBy(block.inputs.CONDITION), MOMENTS)
      )
        reading.once = true;
      if (SENDS.has(block.opcode)) reading.sends.add(sent(block, blocks));
      if (block.next) waiting.push({ ...at, id: block.next });
      for (const [name, input] of Object.entries(block.inputs))
        for (const id of heldBy(input))
          waiting.push({
            ...at,
            id,
            looped: at.looped || (loop && name.startsWith("SUBSTACK")),
          });
    }
  }
  return reading;
}

function featuresIn(reading: Reading): ScratchFeature[] {
  const { ran, started, sends, receives } = reading;
  const has: Record<ScratchFeature, boolean> = {
    flag: started.has("event_whenflagclicked"),
    loop: any(LOOPS, ran),
    choice: any(CHOICES, ran),
    variable: any(CHANGES, ran),
    // A message counts once something hears it.
    message: [...sends].some((message) =>
      message === true ? receives.size > 0 : receives.has(message),
    ),
    sprites: reading.sprites >= 2,
    input: any(ANSWERS, started) || any(SENSES, ran),
    sound:
      any(SOUNDS, ran) ||
      [...ran].some((opcode) => /^(?:music_play|text2speech_)/.test(opcode)),
    custom: started.has("procedures_definition") && ran.has("procedures_call"),
    clones:
      started.has("control_start_as_clone") &&
      ran.has("control_create_clone_of"),
  };
  return SCRATCH_FEATURES.filter((feature) => has[feature]);
}

function notesIn(reading: Reading): ScratchNote[] {
  const { sends, receives } = reading;
  const notes: ScratchNote[] = [
    ...[...sends]
      .filter((message) => message !== true)
      .filter((message) => !receives.has(message))
      .map((message) => ({ kind: "unheard" as const, message })),
    // A block that picks its message as it runs may send any of them.
    ...(sends.has(true)
      ? []
      : [...receives]
          .filter((message) => !sends.has(message))
          .map((message) => ({ kind: "unsent" as const, message }))),
    ...(reading.once ? [{ kind: "once" as const }] : []),
    ...(reading.forever ? [{ kind: "forever" as const }] : []),
  ];
  return notes
    .slice(0, MAX_SCRATCH_NOTES)
    .map((note) =>
      "message" in note
        ? { ...note, message: note.message.slice(0, MAX_MESSAGE_NAME) }
        : note,
    );
}

/** What a coding project has, and what in it is worth a second look. */
export function scratchReadingOf(project: unknown): {
  has: ScratchFeature[];
  notes: ScratchNote[];
} {
  const reading = read(project);
  return { has: featuresIn(reading), notes: notesIn(reading) };
}
