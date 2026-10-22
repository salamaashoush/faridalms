import type { FeedbackBand } from "@faridalms/domain/learning";

import { MAX_FEEDBACK_BANDS } from "@faridalms/domain/learning";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Plus, X } from "lucide-react";
import { useId } from "react";

import * as m from "~/i18n/messages";

/**
 * Messages a scored lesson or quiz gives by score, each for a score from
 * its own up to the next: a few words of encouragement, or where to look
 * again, as Moodle's overall feedback does.
 */
export function FeedbackBands({
  bands,
  onChange,
}: {
  bands: FeedbackBand[];
  onChange: (bands: FeedbackBand[]) => void;
}) {
  const id = useId();
  const change = (index: number, patch: Partial<FeedbackBand>) =>
    onChange(
      bands.map((band, at) => (at === index ? { ...band, ...patch } : band)),
    );
  return (
    <fieldset className="grid min-w-0 gap-2" aria-describedby={`${id}-hint`}>
      <legend className="text-sm leading-5 font-medium">
        {m.bandsTitle()}
      </legend>
      <p
        id={`${id}-hint`}
        className="text-[13px] leading-[18px] text-muted-foreground"
      >
        {m.bandsHint()}
      </p>
      {bands.map((band, index) => (
        <div key={band.id} className="grid gap-1.5 rounded-md border p-2">
          <div className="flex items-center gap-2">
            <label
              htmlFor={`${id}-${band.id}-from`}
              className="text-[13px] leading-[18px] text-muted-foreground"
            >
              {m.bandsFrom()}
            </label>
            <Input
              id={`${id}-${band.id}-from`}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={band.from}
              onChange={(event) =>
                change(index, {
                  from: Math.min(
                    100,
                    Math.max(0, Math.round(Number(event.target.value) || 0)),
                  ),
                })
              }
              className="h-8 w-20 tabular-nums"
            />
            <span aria-hidden className="text-sm text-muted-foreground">
              %
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ms-auto max-md:size-10"
              aria-label={m.bandsRemove({ from: band.from })}
              onClick={() => onChange(bands.filter((_, at) => at !== index))}
            >
              <X aria-hidden />
            </Button>
          </div>
          <Input
            aria-label={m.bandsText({ from: band.from })}
            placeholder={m.bandsPlaceholder()}
            value={band.text}
            maxLength={500}
            dir="auto"
            onChange={(event) => change(index, { text: event.target.value })}
            className="h-8"
          />
        </div>
      ))}
      {new Set(bands.map((band) => band.from)).size < bands.length ? (
        <p className="text-[13px] leading-[18px] text-destructive">
          {m.bandsTwice()}
        </p>
      ) : null}
      {bands.length < MAX_FEEDBACK_BANDS ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit max-md:h-10"
          onClick={() =>
            onChange([
              ...bands,
              {
                id: crypto.randomUUID(),
                from: bands.length === 0 ? 80 : 0,
                text: "",
              },
            ])
          }
        >
          <Plus aria-hidden />
          {m.bandsAdd()}
        </Button>
      ) : null}
    </fieldset>
  );
}

/** The messages as they are kept: those written, the first for each score. */
export function keptBands(bands: readonly FeedbackBand[]): FeedbackBand[] {
  const seen = new Set<number>();
  return bands.flatMap((band) => {
    const text = band.text.trim();
    if (!text || seen.has(band.from)) return [];
    seen.add(band.from);
    return [{ ...band, text }];
  });
}
