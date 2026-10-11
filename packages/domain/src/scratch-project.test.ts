import { describe, expect, it } from "vitest";

import { scratchReadingOf } from "./scratch-project";

const scratchFeaturesOf = (code: unknown) => scratchReadingOf(code).has;

type Inputs = Record<string, unknown>;

/** A block that starts a script, with the first block under it. */
const hat = (opcode: string, next: string | null, fields: Inputs = {}) => ({
  opcode,
  next,
  parent: null,
  inputs: {},
  fields,
  shadow: false,
  topLevel: true,
});

const block = (
  opcode: string,
  next: string | null = null,
  inputs: Inputs = {},
  fields: Inputs = {},
) => ({
  opcode,
  next,
  parent: "above",
  inputs,
  fields,
  shadow: false,
  topLevel: false,
});

const sprite = (blocks: Record<string, unknown>, name = "Sprite1") => ({
  isStage: false,
  name,
  blocks,
});
const stage = { isStage: true, name: "Stage", blocks: {} };
const project = (...sprites: unknown[]) => ({ targets: [stage, ...sprites] });

/** A stack held inside a loop or a choice. */
const inside = (id: string) => [2, id];

describe("what a coding project has", () => {
  it("is nothing for a file that is not a project", () => {
    for (const file of [
      null,
      7,
      "project",
      [],
      {},
      { targets: "all" },
      { targets: [null, 3, { blocks: { a: 7, b: { opcode: 5 } } }] },
    ])
      expect(scratchFeaturesOf(file)).toEqual([]);
  });

  it("finds a script that starts with the flag, repeats, and plays a sound", () => {
    expect(
      scratchFeaturesOf(
        project(
          sprite({
            start: hat("event_whenflagclicked", "loop"),
            loop: block("control_forever", null, { SUBSTACK: inside("meow") }),
            meow: block("sound_playuntildone", null, {
              SOUND_MENU: [1, "menu"],
            }),
            menu: block("sound_sounds_menu"),
          }),
        ),
      ),
    ).toEqual(["flag", "loop", "sound"]);
  });

  it("counts nothing left loose, under no block that starts it", () => {
    expect(
      scratchFeaturesOf(
        project(
          sprite({
            loose: {
              ...block("control_forever", null, { SUBSTACK: inside("say") }),
              topLevel: true,
            },
            say: block("looks_say"),
            // A flag with nothing under it starts nothing.
            start: hat("event_whenflagclicked", null),
          }),
        ),
      ),
    ).toEqual([]);
  });

  it("counts no loop or choice with nothing inside it", () => {
    expect(
      scratchFeaturesOf(
        project(
          sprite({
            start: hat("event_whenflagclicked", "loop"),
            loop: block("control_repeat", "choice", { TIMES: [1, [6, "10"]] }),
            choice: block("control_if", null, { CONDITION: [2, "key"] }),
            key: block("sensing_keypressed"),
          }),
        ),
      ),
    ).toEqual(["flag", "input"]);
  });

  it("finds a choice made on a key, with a count kept in a variable", () => {
    expect(
      scratchFeaturesOf(
        project(
          sprite({
            start: hat("event_whenflagclicked", "loop"),
            loop: block("control_forever", null, {
              SUBSTACK: inside("choice"),
            }),
            choice: block("control_if_else", null, {
              CONDITION: [2, "key"],
              SUBSTACK2: inside("score"),
            }),
            key: block("sensing_keypressed"),
            score: block("data_changevariableby", null, {
              VALUE: [1, [4, "1"]],
            }),
          }),
        ),
      ),
    ).toEqual(["flag", "loop", "choice", "variable", "input"]);
  });

  it("counts a message once another script hears it", () => {
    const sender = sprite({
      start: hat("event_whenthisspriteclicked", "send"),
      send: block("event_broadcast", null, {
        BROADCAST_INPUT: [1, [11, "go", "message-1"]],
      }),
    });
    const hears = (message: string) =>
      sprite(
        {
          heard: hat("event_whenbroadcastreceived", "say", {
            BROADCAST_OPTION: [message, "message-1"],
          }),
          say: block("looks_say"),
        },
        "Sprite2",
      );
    expect(scratchFeaturesOf(project(sender, hears("go")))).toEqual([
      "message",
      "sprites",
      "input",
    ]);
    expect(scratchFeaturesOf(project(sender, hears("stop")))).toEqual([
      "sprites",
      "input",
    ]);
  });

  it("reads a message picked from the block's own menu", () => {
    expect(
      scratchFeaturesOf(
        project(
          sprite({
            start: hat("event_whenflagclicked", "send"),
            send: block("event_broadcastandwait", null, {
              BROADCAST_INPUT: [1, "menu"],
            }),
            menu: block(
              "event_broadcast_menu",
              null,
              {},
              { BROADCAST_OPTION: ["go", "message-1"] },
            ),
            heard: hat("event_whenbroadcastreceived", "say", {
              BROADCAST_OPTION: ["go", "message-1"],
            }),
            say: block("looks_say"),
          }),
        ),
      ),
    ).toEqual(["flag", "message"]);
  });

  it("finds a block of the student's own making once a script uses it", () => {
    const made = {
      define: hat("procedures_definition", "jump"),
      jump: block("motion_changeyby"),
    };
    expect(scratchFeaturesOf(project(sprite(made)))).toEqual([]);
    expect(
      scratchFeaturesOf(
        project(
          sprite({
            ...made,
            start: hat("event_whenkeypressed", "call"),
            call: block("procedures_call"),
          }),
        ),
      ),
    ).toEqual(["input", "custom"]);
  });

  it("finds clones made and given something to do", () => {
    expect(
      scratchFeaturesOf(
        project(
          sprite({
            start: hat("event_whenflagclicked", "clone"),
            clone: block("control_create_clone_of"),
            born: hat("control_start_as_clone", "fall"),
            fall: block("motion_changeyby"),
          }),
        ),
      ),
    ).toEqual(["flag", "clones"]);
  });

  it("ends on blocks that name each other in a ring", () => {
    expect(
      scratchFeaturesOf(
        project(
          sprite({
            start: hat("event_whenflagclicked", "one"),
            one: block("looks_say", "two"),
            two: block("looks_say", "one", { MESSAGE: [3, "two", [10, ""]] }),
          }),
        ),
      ),
    ).toEqual(["flag"]);
  });
});

describe("what in a coding project is worth a second look", () => {
  const notes = (...sprites: unknown[]) =>
    scratchReadingOf(project(...sprites)).notes;
  const send = (message: string) =>
    block("event_broadcast", null, {
      BROADCAST_INPUT: [1, [11, message, "id"]],
    });
  const hear = (message: string, next: string) =>
    hat("event_whenbroadcastreceived", next, {
      BROADCAST_OPTION: [message, "id"],
    });

  it("is nothing in a project whose messages are heard and whose checks are looped", () => {
    expect(
      notes(
        sprite({
          start: hat("event_whenflagclicked", "loop"),
          loop: block("control_forever", null, { SUBSTACK: inside("choice") }),
          choice: block("control_if", "send", {
            CONDITION: [2, "key"],
            SUBSTACK: inside("say"),
          }),
          key: block("sensing_keypressed"),
          say: block("looks_say"),
          send: send("go"),
          heard: hear("go", "say2"),
          say2: block("looks_say"),
        }),
      ),
    ).toEqual([]);
  });

  it("names a message nobody hears, and one nobody sends", () => {
    expect(
      notes(
        sprite({
          start: hat("event_whenflagclicked", "send"),
          send: send("start game"),
          heard: hear("game over", "say"),
          say: block("looks_say"),
        }),
      ),
    ).toEqual([
      { kind: "unheard", message: "start game" },
      { kind: "unsent", message: "game over" },
    ]);
  });

  it("takes a message picked as the project runs to be any of them", () => {
    expect(
      notes(
        sprite({
          start: hat("event_whenflagclicked", "send"),
          send: block("event_broadcast", null, {
            BROADCAST_INPUT: [3, "which", [11, "go", "id"]],
          }),
          which: block("data_variable"),
          heard: hear("game over", "say"),
          say: block("looks_say"),
        }),
      ),
    ).toEqual([]);
  });

  it("notes a key checked once after the flag, but not one checked on its own event", () => {
    const check = {
      choice: block("control_if", null, {
        CONDITION: [2, "both"],
        SUBSTACK: inside("say"),
      }),
      both: block("operator_and", null, { OPERAND1: [2, "key"] }),
      key: block("sensing_keypressed"),
      say: block("looks_say"),
    };
    expect(
      notes(
        sprite({ start: hat("event_whenflagclicked", "choice"), ...check }),
      ),
    ).toEqual([{ kind: "once" }]);
    expect(
      notes(sprite({ start: hat("event_whenkeypressed", "choice"), ...check })),
    ).toEqual([]);
  });

  it("notes a forever inside another loop, and none that follows a loop", () => {
    const say = block("looks_say");
    expect(
      notes(
        sprite({
          start: hat("event_whenflagclicked", "outer"),
          outer: block("control_repeat", null, { SUBSTACK: inside("inner") }),
          inner: block("control_forever", null, { SUBSTACK: inside("say") }),
          say,
        }),
      ),
    ).toEqual([{ kind: "forever" }]);
    expect(
      notes(
        sprite({
          start: hat("event_whenflagclicked", "outer"),
          outer: block("control_repeat", "inner", { SUBSTACK: inside("say") }),
          inner: block("control_forever", null, { SUBSTACK: inside("say2") }),
          say,
          say2: say,
        }),
      ),
    ).toEqual([]);
  });

  it("reads what a project has in the same pass", () => {
    expect(
      scratchReadingOf(
        project(
          sprite({
            start: hat("event_whenflagclicked", "send"),
            send: send("go"),
          }),
        ),
      ),
    ).toEqual({ has: ["flag"], notes: [{ kind: "unheard", message: "go" }] });
  });
});
