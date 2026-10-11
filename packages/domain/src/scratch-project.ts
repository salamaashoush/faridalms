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
 * What a coding project has, read from its `project.json`. The file comes
 * from a student's browser, so nothing in it is taken to be as Scratch
 * would have written it: whatever is not, is passed over.
 */
export function scratchFeaturesOf(project: unknown): ScratchFeature[] {
  const targets =
    isRecord(project) && Array.isArray(project.targets)
      ? project.targets.filter(isRecord)
      : [];
  const ran = new Set<string>();
  const started = new Set<string>();
  const sends = new Set<string | true>();
  const receives = new Set<string>();
  let read = 0;

  for (const target of targets) {
    const blocks = blocksOf(target);
    const seen = new Set<string>();
    const waiting: string[] = [];
    for (const block of blocks.values()) {
      if (!block.topLevel || !block.next || !startsScript(block.opcode))
        continue;
      started.add(block.opcode);
      const message =
        block.opcode === "event_whenbroadcastreceived"
          ? named(block.fields.BROADCAST_OPTION)
          : null;
      if (message !== null) receives.add(message);
      waiting.push(block.next);
    }
    for (let id = waiting.pop(); id !== undefined; id = waiting.pop()) {
      const block = blocks.get(id);
      if (!block || seen.has(id) || read >= MAX_BLOCKS) continue;
      seen.add(id);
      read += 1;
      if (LOOPS.has(block.opcode) || CHOICES.has(block.opcode)) {
        // One with nothing inside repeats or chooses nothing.
        if (holdsStack(block)) ran.add(block.opcode);
      } else ran.add(block.opcode);
      if (SENDS.has(block.opcode)) sends.add(sent(block, blocks));
      if (block.next) waiting.push(block.next);
      for (const input of Object.values(block.inputs))
        waiting.push(...heldBy(input));
    }
  }

  const has: Record<ScratchFeature, boolean> = {
    flag: started.has("event_whenflagclicked"),
    loop: any(LOOPS, ran),
    choice: any(CHOICES, ran),
    variable: any(CHANGES, ran),
    // A message counts once something hears it.
    message: [...sends].some((message) =>
      message === true ? receives.size > 0 : receives.has(message),
    ),
    sprites: targets.filter((target) => target.isStage !== true).length >= 2,
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
