import { textDirection } from "@faridalms/domain/content";
import { Volume2 } from "lucide-react";
import { createContext, useSyncExternalStore } from "react";

import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

/** A lesson set out for young children: text read aloud, larger answers. */
export const YoungContext = createContext(false);

const subscribe = () => () => {};
const canSpeak = () =>
  typeof window !== "undefined" && "speechSynthesis" in window;

/** Reads a text in the voice of its own script: Arabic, or the page's language. */
function speak(text: string) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = textDirection(text) === "rtl" ? "ar" : getLocale();
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/** A button that reads the text beside it aloud, for children still learning to read. */
export function ReadAloud({ text }: { text: string }) {
  const available = useSyncExternalStore(subscribe, canSpeak, () => false);
  if (!available || !text.trim()) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-11 shrink-0 rounded-full"
      aria-label={m.lrnReadAloud()}
      onClick={() => speak(text)}
    >
      <Volume2 aria-hidden className="size-5" />
    </Button>
  );
}
