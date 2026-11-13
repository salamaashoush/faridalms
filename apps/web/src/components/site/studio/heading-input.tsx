import type { SiteLocale } from "@faridalms/domain/site-sections";
import type { KeyboardEvent } from "react";

import {
  emphasisedRuns,
  isEmphasised,
  readEmphasis,
  toggleEmphasis,
} from "@faridalms/domain/site-emphasis";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Highlighter } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import * as m from "~/i18n/messages";
import { formatList } from "~/utils/datetime";

export interface HeadingInputProps {
  id: string;
  value: string;
  max: number;
  locale: SiteLocale;
  onChange: (value: string) => void;
}

interface Selection {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
}

/**
 * A heading's words in a plain input, with a button and Ctrl+I (⌘I) that
 * emphasise the selected words or take their emphasis off. The input keeps
 * the stored text, asterisks and all, so nothing is hidden from a screen
 * reader or the caret; the line beneath draws the words as they will read.
 */
export function HeadingInput({
  id,
  value,
  max,
  locale,
  onChange,
}: HeadingInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<Selection>({
    start: value.length,
    end: value.length,
    direction: "none",
  });
  const restore = useRef<(Selection & { text: string }) | null>(null);
  // Puts the selection back over the same words once the toggled text is drawn.
  useLayoutEffect(() => {
    const element = input.current;
    const next = restore.current;
    if (!element || !next || element.value !== next.text) return;
    restore.current = null;
    element.focus();
    element.setSelectionRange(next.start, next.end, next.direction);
  });
  const remember = () => {
    const element = input.current;
    if (!element) return;
    setSelection({
      start: element.selectionStart ?? element.value.length,
      end: element.selectionEnd ?? element.value.length,
      direction: element.selectionDirection ?? "none",
    });
  };
  const toggle = () => {
    const element = input.current;
    const current = element
      ? {
          start: element.selectionStart ?? selection.start,
          end: element.selectionEnd ?? selection.end,
          direction: element.selectionDirection ?? selection.direction,
        }
      : selection;
    const result = toggleEmphasis(value, current.start, current.end);
    if (!result || result.text.length > max) return;
    const next = {
      start: result.start,
      end: result.end,
      direction: current.direction,
    };
    restore.current = { ...next, text: result.text };
    setSelection(next);
    onChange(result.text);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // The key's place, not its letter: on an Arabic layout the I key types ه.
    if (
      event.code === "KeyI" &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      toggle();
    }
  };
  const runs = emphasisedRuns(value);
  const summary = `${id}-emphasis`;
  const pressed = isEmphasised(value, selection.start, selection.end);
  const dir = locale === "ar" ? "rtl" : "ltr";
  return (
    <div className="grid min-w-0 gap-1.5">
      <Input
        ref={input}
        id={id}
        value={value}
        maxLength={max}
        lang={locale}
        dir={dir}
        aria-describedby={runs.length ? summary : undefined}
        aria-keyshortcuts="Control+I Meta+I"
        className="max-md:h-10"
        onChange={(event) => {
          onChange(event.target.value);
          remember();
        }}
        onSelect={remember}
        onKeyDown={onKeyDown}
      />
      <div className="flex min-w-0 items-start gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 max-md:h-10"
          aria-pressed={pressed}
          aria-controls={id}
          aria-keyshortcuts="Control+I Meta+I"
          title={m.siteEmphasiseKeys()}
          // Keeps the input's selection when the button is pressed with a pointer.
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggle}
        >
          <Highlighter aria-hidden />
          {m.siteEmphasise()}
        </Button>
        {runs.length ? <EmphasisLine value={value} locale={locale} /> : null}
        <span id={summary} className="sr-only" aria-live="polite">
          {runs.length
            ? m.siteEmphasisedWords({
                words: formatList(runs),
              })
            : null}
        </span>
      </div>
    </div>
  );
}

interface EmphasisLineProps {
  value: string;
  locale: SiteLocale;
}

/** The heading's words as they will read, the emphasised ones marked. */
function EmphasisLine({ value, locale }: EmphasisLineProps) {
  const { plain, emphasised } = readEmphasis(value);
  const parts: { words: string; on: boolean; at: number }[] = [];
  for (let at = 0; at < plain.length; at++) {
    const on = emphasised[at] ?? false;
    const last = parts.at(-1);
    if (last && last.on === on) last.words += plain.charAt(at);
    else parts.push({ words: plain.charAt(at), on, at });
  }
  return (
    <p
      aria-hidden
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="min-w-0 flex-1 truncate py-1.5 text-[13px] leading-[18px] text-muted-foreground"
    >
      {parts.map((part) =>
        part.on ? (
          <mark
            key={part.at}
            className="rounded-sm bg-primary/12 px-0.5 font-semibold text-foreground"
          >
            {part.words}
          </mark>
        ) : (
          part.words
        ),
      )}
    </p>
  );
}
