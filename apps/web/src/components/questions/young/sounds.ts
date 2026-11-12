// Feedback sounds drawn with Web Audio rather than shipped as files: a few
// soft notes, so there is nothing to license or load.

const KEY = "farida:lesson-sounds";

let context: AudioContext | null = null;

// A class whose teacher turned lesson sounds off stays quiet on every device.
let classAllows = true;

export function setClassSounds(on: boolean) {
  classAllows = on;
}

export function soundsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundsOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // A browser that keeps nothing simply forgets the choice.
  }
}

function note(
  audio: AudioContext,
  frequency: number,
  start: number,
  length: number,
  wave: OscillatorType,
  loudness: number,
) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = wave;
  oscillator.frequency.value = frequency;
  const at = audio.currentTime + start;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(loudness, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + length + 0.05);
}

/**
 * A short sound for what just happened: a soft tick for a tap, two rising
 * notes for a right answer, two soft falling ones for "not yet", and a
 * little run at the end.
 */
export function playSound(kind: "tap" | "right" | "wrong" | "done") {
  if (!classAllows || !soundsOn() || typeof AudioContext === "undefined")
    return;
  context ??= new AudioContext();
  // Started by the child's tap, which is what lets a page make sound.
  if (context.state === "suspended") void context.resume();
  const audio = context;
  if (kind === "tap") note(audio, 1200, 0, 0.05, "sine", 0.05);
  else if (kind === "right") {
    note(audio, 1046.5, 0, 0.18, "sine", 0.18);
    note(audio, 1318.5, 0.1, 0.28, "sine", 0.18);
  } else if (kind === "wrong") {
    note(audio, 392, 0, 0.16, "triangle", 0.12);
    note(audio, 311.1, 0.12, 0.24, "triangle", 0.12);
  } else
    [523.3, 659.3, 784, 1046.5].forEach((frequency, index) =>
      note(audio, frequency, index * 0.09, 0.3, "sine", 0.15),
    );
}
