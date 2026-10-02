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

export function stopSounds() {
  player?.pause();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Plays a teacher's recording, stopping whatever was playing. */
export function playRecording(fileId: string) {
  stopSounds();
  player ??= new Audio();
  player.src = `/files/${fileId}`;
  // A refused play (no tap yet, or the file is gone) leaves the page silent.
  void player.play().catch(() => undefined);
}

const ARABIC_LETTERS = /[ء-ي]/g;
const VOWEL_MARKS = /[ً-ْ]/g;

/**
 * Whether a browser voice may read a text to a child. Arabic written without
 * its short vowels leaves the voice guessing them, and it misreads about one
 * word in ten, so only vowelled Arabic is read without a recording.
 */
function readable(text: string) {
  const letters = text.match(ARABIC_LETTERS)?.length ?? 0;
  return letters === 0 || (text.match(VOWEL_MARKS)?.length ?? 0) * 2 >= letters;
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

function speak(text: string) {
  stopSounds();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = languageOf(text);
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

/** Whether the browser's own voice may read this text, as `ReadAloud` decides. */
function speakable(text: string, voices: string) {
  return (
    text.trim() !== "" &&
    readable(text) &&
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
  size?: "default" | "small";
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
        size === "small" ? "size-10" : "size-11",
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
