import { voiceCanRead } from "@faridalms/domain/arabic";
import { textDirection } from "@faridalms/domain/content";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Volume2 } from "lucide-react";
import { createContext, useSyncExternalStore } from "react";

import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

/** A lesson set out for young children: text read aloud, larger answers. */
export const YoungContext = createContext(false);

// One sound at a time, through one element, which iPad Safari lets play
// again once a tap has started it.
let player: HTMLAudioElement | null = null;
// What reads next once the current sound ends, for a screen read in order.
let queue: { text: string; narration: string | null }[] = [];
let afterSound: (() => void) | null = null;
// The utterance being said; one cancelled reports its end late, after the
// next has begun, and must not move the reading on.
let speaking: SpeechSynthesisUtterance | null = null;

export function stopSounds() {
  queue = [];
  afterSound = null;
  speaking = null;
  player?.pause();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  tellWord(null);
}

const soundEnded = () => {
  const next = afterSound;
  afterSound = null;
  next?.();
};

/** Plays a teacher's recording, stopping whatever was playing. */
export function playRecording(fileId: string) {
  stopSounds();
  if (!player) {
    player = new Audio();
    player.addEventListener("ended", soundEnded);
  }
  player.src = `/files/${fileId}`;
  // A refused play (no tap yet, or the file is gone) leaves the page silent.
  void player.play().catch(() => undefined);
}

const languageOf = (text: string) =>
  textDirection(text) === "rtl" ? "ar" : getLocale();

function subscribeVoices(onChange: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", onChange);
  return () =>
    window.speechSynthesis.removeEventListener("voiceschanged", onChange);
}

/** The languages this browser has a voice for, as a stable string. */
const voiceLanguages = () =>
  typeof window === "undefined" || !("speechSynthesis" in window)
    ? ""
    : [
        ...new Set(
          window.speechSynthesis
            .getVoices()
            .map((voice) => voice.lang.slice(0, 2).toLowerCase()),
        ),
      ].join(",");

/** The word the browser's voice is saying: where it sits in the text read. */
export interface SpokenWord {
  text: string;
  start: number;
  length: number;
}

const wordListeners = new Set<(word: SpokenWord | null) => void>();

/** Hears each word as the browser's voice reaches it, and null when it stops. */
export function onSpokenWord(listener: (word: SpokenWord | null) => void) {
  wordListeners.add(listener);
  return () => {
    wordListeners.delete(listener);
  };
}

const tellWord = (word: SpokenWord | null) =>
  wordListeners.forEach((listener) => listener(word));

function speak(text: string) {
  stopSounds();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = languageOf(text);
  utterance.rate = 0.9;
  // Safari, which most school tablets run, names each word as it is said;
  // Chrome's network voices name none, and then nothing is lit.
  utterance.addEventListener("boundary", (event) => {
    if (event.name !== "word" || speaking !== utterance) return;
    const length =
      event.charLength ||
      (/^\S+/.exec(text.slice(event.charIndex))?.[0].length ?? 0);
    if (length > 0) tellWord({ text, start: event.charIndex, length });
  });
  utterance.addEventListener("end", () => {
    if (speaking !== utterance) return;
    speaking = null;
    tellWord(null);
    soundEnded();
  });
  utterance.addEventListener("error", () => {
    if (speaking === utterance) tellWord(null);
  });
  speaking = utterance;
  window.speechSynthesis.speak(utterance);
}

/** Whether the browser's own voice may read this text, as `ReadAloud` decides. */
function speakable(text: string, voices: string) {
  return (
    text.trim() !== "" &&
    voiceCanRead(text) &&
    voices.split(",").includes(languageOf(text))
  );
}

/**
 * Reads something aloud without a tap on its speaker, as a screen opens:
 * the recording if there is one, else the browser's voice where it is safe.
 * Says whether anything played.
 */
export function sayAloud(text: string, narration: string | null): boolean {
  if (narration) {
    playRecording(narration);
    return true;
  }
  if (!speakable(text, voiceLanguages())) return false;
  speak(text);
  return true;
}

function readNext() {
  const item = queue.shift();
  if (!item) return;
  const rest = queue;
  const played = sayAloud(item.text, item.narration);
  // Starting a sound stops the last and clears what was waiting; the rest
  // of this screen goes back in line behind it.
  queue = rest;
  if (played) afterSound = readNext;
  else readNext();
}

/**
 * Reads a screen's words one after another, as a page of a book is read:
 * each recording where there is one, else the browser's voice where it is
 * safe. Anything else played stops it.
 */
export function sayInOrder(
  items: { text: string; narration: string | null }[],
) {
  stopSounds();
  queue = [...items];
  readNext();
}

/**
 * A speaker that reads what sits beside it: the teacher's recording when
 * there is one, else, where `voice` allows, the browser's own voice for a
 * text it can read safely. Nothing shows when neither can be heard.
 */
export function ReadAloud({
  text,
  narration,
  voice = true,
  size = "default",
  className,
}: {
  text: string;
  narration?: string | null;
  /** Whether the browser's voice may stand in for a missing recording. */
  voice?: boolean;
  size?: "small" | "default" | "card" | "large";
  className?: string;
}) {
  const voices = useSyncExternalStore(
    subscribeVoices,
    voiceLanguages,
    () => "",
  );
  const spoken = !narration && voice && speakable(text, voices);
  if (!narration && !spoken) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        "shrink-0 rounded-full",
        {
          small: "size-10",
          default: "size-11",
          card: "size-14 [&_svg]:size-6",
          large: "size-16 [&_svg]:size-7",
        }[size],
        className,
      )}
      aria-label={m.lrnReadAloud()}
      onClick={(event) => {
        // A speaker on a card plays the card without choosing it.
        event.stopPropagation();
        if (narration) playRecording(narration);
        else speak(text);
      }}
    >
      <Volume2 aria-hidden className="size-5" />
    </Button>
  );
}
