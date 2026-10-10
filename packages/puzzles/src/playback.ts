import type { Heading, Level } from "./level";
import type { Place, Run } from "./run";

import { TURNED } from "./scene";

/** The board at one moment of a run being played back. */
export interface Frame {
  cell: number;
  /**
   * How far round the hero is turned, in degrees, counted on from the
   * frame before so it always turns the short way.
   */
  angle: number;
  /** The gems picked up so far. */
  taken: readonly number[];
  /** The block being carried out; none before the run starts. */
  at: Place | null;
  /** The way the hero lurches when it meets a wall. */
  nudge: Heading | null;
}

const shortWay = (from: number, to: number) =>
  from + ((((to - from) % 360) + 540) % 360) - 180;

/** The board before a run, with nothing moved yet. */
export function startFrame(level: Pick<Level, "start">): Frame {
  return {
    cell: level.start.cell,
    angle: TURNED[level.start.heading],
    taken: [],
    at: null,
    nudge: null,
  };
}

/**
 * A run as the frames a board shows one after another: where it starts,
 * then one for each thing the hero does. Meeting a wall takes two, the
 * lurch and the settling back.
 */
export function framesOf(level: Pick<Level, "start">, run: Run): Frame[] {
  let frame = startFrame(level);
  const frames = [frame];
  const show = (next: Partial<Frame>) => {
    frame = { ...frame, nudge: null, ...next };
    frames.push(frame);
  };
  for (const tick of run.ticks) {
    switch (tick.kind) {
      case "move":
        show({
          at: tick.at,
          cell: tick.to,
          angle: shortWay(frame.angle, TURNED[tick.heading]),
          taken: tick.gem ? [...frame.taken, tick.to] : frame.taken,
        });
        break;
      case "turn":
        show({
          at: tick.at,
          angle: shortWay(frame.angle, TURNED[tick.heading]),
        });
        break;
      case "bump":
        show({
          at: tick.at,
          angle: shortWay(frame.angle, TURNED[tick.heading]),
          nudge: tick.heading,
        });
        show({ at: tick.at });
        break;
      case "look":
        show({ at: tick.at });
        break;
    }
  }
  return frames;
}

/** The longest a run takes to play, however many frames it has. */
const PLAY_MS = 12_000;
const SLOWEST_MS = 420;
const FASTEST_MS = 80;

/** How long each frame of a run stays up: unhurried, but never a long wait. */
export function frameMs(frames: number): number {
  return Math.round(
    Math.min(SLOWEST_MS, Math.max(FASTEST_MS, PLAY_MS / Math.max(1, frames))),
  );
}

/** A block's place as one word, to find its like among drawn blocks. */
export const placeKey = (place: Place) => place.join(".");
