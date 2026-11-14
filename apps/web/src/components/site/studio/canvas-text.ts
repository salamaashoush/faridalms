import type { Field, SectionType } from "@faridalms/domain/site-sections";

import { readEmphasis, writeEmphasis } from "@faridalms/domain/site-emphasis";
import { SECTION_SPECS } from "@faridalms/domain/site-sections";

/** How long a field's words may run, and whether they may break onto new lines. */
export interface TextRule {
  max: number;
  multiline: boolean;
}

/** The rule a section's words field declares, or null when the field holds no plain words. */
export function textRule(type: SectionType, field: string): TextRule | null {
  const fields: Partial<Record<string, Field>> = SECTION_SPECS[type].fields;
  const spec = fields[field];
  return spec?.kind === "text"
    ? { max: spec.max, multiline: spec.multiline ?? false }
    : null;
}

/** A stretch of words as the canvas draws them, set apart or not. */
export interface DrawnRun {
  words: string;
  emphasised: boolean;
}

/**
 * The words a field's stored text draws, without the asterisks that set
 * words apart in a heading. Text drawn without emphasis is drawn as stored.
 */
export function drawnRuns(stored: string, emphasis: boolean): DrawnRun[] {
  if (!emphasis) return stored ? [{ words: stored, emphasised: false }] : [];
  const { plain, emphasised } = readEmphasis(stored);
  const runs: DrawnRun[] = [];
  for (let at = 0; at < plain.length; at++) {
    const on = emphasised[at] ?? false;
    const last = runs.at(-1);
    if (last && last.emphasised === on) last.words += plain.charAt(at);
    else runs.push({ words: plain.charAt(at), emphasised: on });
  }
  return runs;
}

/**
 * Words typed where set-apart words close stay outside them, as they do
 * typed after the closing asterisk in the panel. The browser puts them
 * inside, where the caret sits at the end of the emphasis.
 */
export function typedAfterEmphasis(
  runs: readonly DrawnRun[],
  caret: number,
  typed: number,
): DrawnRun[] {
  const flags = runs.flatMap((run) =>
    Array.from({ length: run.words.length }, () => run.emphasised),
  );
  const from = caret - typed;
  if (
    typed <= 0 ||
    from <= 0 ||
    !flags.slice(from - 1, caret).every(Boolean) ||
    flags[caret] === true
  )
    return [...runs];
  flags.fill(false, from, caret);
  const plain = runs.map((run) => run.words).join("");
  const next: DrawnRun[] = [];
  for (let at = 0; at < plain.length; at++) {
    const on = flags[at] ?? false;
    const last = next.at(-1);
    if (last && last.emphasised === on) last.words += plain.charAt(at);
    else next.push({ words: plain.charAt(at), emphasised: on });
  }
  return next;
}

/** The stored text for words as drawn, the set-apart ones between asterisks. */
export function storedFrom(runs: readonly DrawnRun[], emphasis: boolean) {
  const plain = runs.map((run) => run.words).join("");
  if (!emphasis) return plain;
  const emphasised = runs.flatMap((run) =>
    Array.from({ length: run.words.length }, () => run.emphasised),
  );
  return writeEmphasis(plain, emphasised);
}

/** Where a point in the drawn words falls in the stored text, past any asterisk before it. */
export function storedOffset(stored: string, drawn: number, emphasis: boolean) {
  if (!emphasis) return Math.min(drawn, stored.length);
  const { raw } = readEmphasis(stored);
  return raw[Math.min(drawn, raw.length - 1)] ?? stored.length;
}

/** Where a point in the stored text falls among the drawn words. */
export function drawnOffset(stored: string, at: number, emphasis: boolean) {
  if (!emphasis) return Math.min(at, stored.length);
  const { raw, plain } = readEmphasis(stored);
  const index = raw.findIndex((rawAt) => rawAt >= at);
  return index === -1 ? plain.length : index;
}

/**
 * Words typed into a field as the panel would take them: a single-line
 * field keeps no line breaks, as its input does not.
 */
export function typedWords(stored: string, rule: TextRule): string {
  return rule.multiline ? stored : stored.replace(/[\r\n]+/g, "");
}

/** Whether a field's words are near enough their limit for the count left to be shown. */
export const nearLimit = (length: number, rule: TextRule) =>
  length > rule.max * 0.8;
