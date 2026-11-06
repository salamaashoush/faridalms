import { Button } from "@faridalms/ui/button";
import { Nfc } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import * as m from "~/i18n/messages";

import { readBadgeCards } from "./nfc";

/** A card still on the device is not read twice in this time. */
const AGAIN_MS = 5000;

export interface CardReaderProps {
  onBadge: (secret: string) => void;
}

/**
 * Reads the cards children tap on an Android device. Chrome asks the
 * teacher's leave once, after a tap on the button, and then reads until
 * the screen closes.
 */
export function CardReader({ onBadge }: CardReaderProps) {
  const [state, setState] = useState<"idle" | "reading" | "failed">("idle");
  const [attempt, setAttempt] = useState(0);
  const seen = useRef(new Map<string, number>());
  const read = useEffectEvent((secret: string) => {
    const now = Date.now();
    if (now - (seen.current.get(secret) ?? 0) < AGAIN_MS) return;
    seen.current.set(secret, now);
    onBadge(secret);
  });
  // Started right after the tap, while Chrome still counts it as the
  // teacher's gesture, which it needs to ask for leave to read cards.
  useEffect(() => {
    if (attempt === 0) return undefined;
    const controller = new AbortController();
    readBadgeCards((secret) => read(secret), controller.signal).catch(() => {
      if (!controller.signal.aborted) setState("failed");
    });
    return () => controller.abort();
  }, [attempt]);

  const start = () => {
    setState("reading");
    setAttempt((current) => current + 1);
  };

  return (
    <div className="grid justify-items-center gap-3 rounded-3xl bg-muted/60 p-5 text-center">
      <Nfc aria-hidden className="size-12 text-primary" />
      {state === "reading" ? (
        <p className="text-xl leading-8 font-semibold">{m.attCardTap()}</p>
      ) : (
        <>
          {state === "failed" ? (
            <p className="max-w-xs text-base">{m.attCardFailed()}</p>
          ) : null}
          <Button type="button" size="lg" onClick={start}>
            {m.attCardStart()}
          </Button>
        </>
      )}
    </div>
  );
}
