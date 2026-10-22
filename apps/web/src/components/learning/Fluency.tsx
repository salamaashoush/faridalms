import type { FluencyMark } from "@faridalms/domain/learning";

import { fluencyOf, readingWords } from "@faridalms/domain/learning";
import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import { useId, useState } from "react";

import { FormField } from "~/components/system/field";
import { Segmented } from "~/components/system/panel";
import * as m from "~/i18n/messages";
import { formatNumber, formatPercent } from "~/utils/datetime";

/** What a marked reading comes to, in one line. */
export function FluencySummary({
  passage,
  mark,
}: {
  passage: string;
  mark: FluencyMark;
}) {
  const result = fluencyOf(readingWords(passage).length, mark);
  return (
    <p className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
      {m.fluencySummary({
        read: formatNumber(result.read),
        errors: formatNumber(result.read - result.correct),
        accuracy: formatPercent(Math.round(result.accuracy * 100)),
        perMinute: formatNumber(result.perMinute),
      })}
    </p>
  );
}

/**
 * A passage's lines, each word with its place in the whole passage, so
 * the passage reads as written and every word is marked where it is.
 */
function placedLines(passage: string) {
  const lines: { word: string; place: number }[][] = [];
  let place = 0;
  for (const line of passage.split("\n")) {
    const words = line.split(/\s+/u).filter(Boolean);
    lines.push(words.map((word, index) => ({ word, place: place + index })));
    place += words.length;
  }
  return lines;
}

/**
 * A passage read aloud, marked as its teacher listens: each word tapped
 * when it was misread, left out or told, and the word the reading stopped
 * at when it stopped short, as a running record is taken.
 */
export function FluencyMarker({
  passage,
  mark,
  onChange,
}: {
  passage: string;
  mark: FluencyMark;
  onChange: (mark: FluencyMark) => void;
}) {
  const id = useId();
  const [tapping, setTapping] = useState<"errors" | "stop">("errors");
  const words = readingWords(passage);
  const last = mark.lastWord ?? words.length - 1;
  const errors = new Set(mark.errors);
  const lines = placedLines(passage);
  const tap = (at: number) => {
    if (tapping === "stop")
      onChange({ ...mark, lastWord: at === words.length - 1 ? null : at });
    else
      onChange({
        ...mark,
        errors: errors.has(at)
          ? mark.errors.filter((error) => error !== at)
          : [...mark.errors, at].toSorted((a, b) => a - b),
      });
  };
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Segmented<"errors" | "stop">
          label={m.fluencyTapping()}
          value={tapping}
          options={[
            { value: "errors", label: m.fluencyTapErrors() },
            { value: "stop", label: m.fluencyTapStop() },
          ]}
          onChange={setTapping}
          className="flex-nowrap"
        />
        <FormField id={`${id}-seconds`} label={m.fluencySeconds()}>
          {(control) => (
            <Input
              {...control}
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              className="w-24 max-md:h-10"
              value={mark.seconds}
              onChange={(event) => {
                const seconds = Math.round(Number(event.target.value));
                if (seconds >= 1 && seconds <= 600)
                  onChange({ ...mark, seconds });
              }}
            />
          )}
        </FormField>
      </div>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {tapping === "stop" ? m.fluencyStopHint() : m.fluencyErrorsHint()}
      </p>
      <div dir="auto" className="grid gap-2 text-base leading-9">
        {lines.map((line, index) => (
          <p key={index}>
            {line.map(({ word, place: at }) => (
              <span key={at}>
                <button
                  type="button"
                  aria-pressed={errors.has(at)}
                  aria-current={at === last && mark.lastWord !== null}
                  onClick={() => tap(at)}
                  className={cn(
                    "-mx-0.5 rounded px-0.5 transition-colors hover:bg-primary/10",
                    errors.has(at) &&
                      "bg-destructive/15 text-destructive line-through decoration-2",
                    at > last && "text-muted-foreground/60",
                    at === last &&
                      mark.lastWord !== null &&
                      "ring-2 ring-primary ring-offset-1",
                  )}
                >
                  {word}
                </button>{" "}
              </span>
            ))}
          </p>
        ))}
      </div>
      <FluencySummary passage={passage} mark={mark} />
    </div>
  );
}
