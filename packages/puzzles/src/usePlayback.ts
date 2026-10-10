import { useEffect, useRef, useState } from "react";

import type { Level } from "./level";
import type { Frame } from "./playback";
import type { Program } from "./program";
import type { End } from "./run";

import { frameMs, framesOf, startFrame } from "./playback";
import { run } from "./run";

type World = Pick<Level, "cols" | "rows" | "walls" | "gems" | "start" | "goal">;

interface Playing {
  /** The puzzle the run was on; a run belongs to no other. */
  level: World;
  frames: Frame[];
  index: number;
  /** How long each frame takes; nothing for someone who asked for no motion. */
  ms: number;
  end: End;
  /** The run has played to its end. */
  over: boolean;
}

/**
 * A program's run on a puzzle, played back a frame at a time. Every run
 * starts from the beginning and plays the whole program. A puzzle that
 * changes under a run, as when its teacher repaints the grid, puts the
 * board back to its start.
 */
export function usePlayback(level: World) {
  const [playing, setPlaying] = useState<Playing | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const latest = useRef(level);
  useEffect(() => {
    latest.current = level;
  }, [level]);
  useEffect(() => () => clearInterval(timer.current), []);

  const shown = playing?.level === level ? playing : null;
  const stop = () => {
    clearInterval(timer.current);
    setPlaying(null);
  };
  /** Runs a program, and tells how it ended once it has played. */
  const play = (program: Program, onEnd?: (end: End) => void) => {
    clearInterval(timer.current);
    const result = run(level, program);
    const frames = framesOf(level, result);
    const last = frames.length - 1;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const played = {
      level,
      frames,
      end: result.end,
      ms: still ? 0 : frameMs(last),
    };
    const finish = () => {
      clearInterval(timer.current);
      setPlaying({ ...played, index: last, over: true });
      onEnd?.(result.end);
    };
    // Shown at once to someone who has asked for no motion.
    if (last === 0 || still) {
      finish();
      return;
    }
    let index = 0;
    setPlaying({ ...played, index, over: false });
    timer.current = setInterval(() => {
      if (latest.current !== level) {
        clearInterval(timer.current);
        return;
      }
      index += 1;
      if (index >= last) finish();
      else setPlaying({ ...played, index, over: false });
    }, played.ms);
  };

  return {
    frame: shown?.frames[shown.index] ?? startFrame(level),
    ms: shown?.ms ?? 0,
    running: shown !== null && !shown.over,
    end: shown?.over ? shown.end : null,
    play,
    stop,
  };
}
