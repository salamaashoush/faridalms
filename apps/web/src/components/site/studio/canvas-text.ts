import type { Field, SectionType } from "@faridalms/domain/site-sections";

import { readEmphasis, writeEmphasis } from "@faridalms/domain/site-emphasis";
import { MAX_LINK_LABEL } from "@faridalms/domain/site-links";
import { SECTION_SPECS } from "@faridalms/domain/site-sections";

/** How long a field's words may run, and whether they may break onto new lines. */
export interface TextRule {
  max: number;
  multiline: boolean;
}

/** One list a field sits in: the list's field, and the id of the entry holding the words. */
export interface FieldStep {
  list: string;
  id: string;
}

/**
 * A words field by its path: a section's own field (`heading`), or a field
 * of an entry of a list, named by the entry's id (`items.<id>.title`,
 * `items.<id>.actions.<id>.label`).
 */
export interface FieldPath {
  steps: FieldStep[];
  key: string;
}

export function fieldPath(field: string): FieldPath {
  const parts = field.split(".");
  const key = parts.pop() ?? "";
  const steps: FieldStep[] = [];
  for (let at = 0; at + 1 < parts.length; at += 2)
    steps.push({ list: parts[at] ?? "", id: parts[at + 1] ?? "" });
  return { steps, key };
}

/** The section field a path starts from, which the panel edits and undoes it as. */
export const topField = (field: string) => field.split(".")[0] ?? field;

type Fields = Partial<Record<string, Field>>;

/** The rule a words field declares, or null when the path holds no plain words. */
export function textRule(type: SectionType, field: string): TextRule | null {
  const { steps, key } = fieldPath(field);
  let fields: Fields = SECTION_SPECS[type].fields;
  for (const step of steps) {
    const list = fields[step.list];
    if (list?.kind === "links")
      return key === "label" && step === steps.at(-1)
        ? { max: MAX_LINK_LABEL, multiline: false }
        : null;
    if (list?.kind !== "items") return null;
    fields = list.fields;
  }
  const spec = fields[key];
  return spec?.kind === "text"
    ? { max: spec.max, multiline: spec.multiline ?? false }
    : null;
}

type Entries = Record<string, unknown>[];

/**
 * A section's data with one words field set, the entries it passes through
 * found by id wherever they now stand. Null when an entry is gone, so words
 * typed for it are dropped rather than written to another.
 */
export function withWords(
  data: Record<string, unknown>,
  field: string,
  value: string,
): Record<string, unknown> | null {
  const { steps, key } = fieldPath(field);
  const set = (
    holder: Record<string, unknown>,
    at: number,
  ): Record<string, unknown> | null => {
    const step = steps[at];
    if (!step) return { ...holder, [key]: value };
    const entries = holder[step.list];
    if (!Array.isArray(entries)) return null;
    const list = entries as Entries;
    const index = list.findIndex((entry) => entry.id === step.id);
    const entry = list[index];
    if (!entry) return null;
    const next = set(entry, at + 1);
    if (!next) return null;
    return { ...holder, [step.list]: list.with(index, next) };
  };
  return set(data, 0);
}

/** An entry a field passes through: a button of a links field, or an item of a list, counted from one. */
export interface FieldPlace {
  kind: "links" | "items";
  number: number;
}

/** Where each entry a field passes through stands now, outermost first; null when one is gone. */
export function fieldPlaces(
  type: SectionType,
  data: Record<string, unknown>,
  field: string,
): FieldPlace[] | null {
  const places: FieldPlace[] = [];
  let fields: Fields = SECTION_SPECS[type].fields;
  let holder: Record<string, unknown> | undefined = data;
  for (const step of fieldPath(field).steps) {
    const spec = fields[step.list];
    const entries: unknown = holder?.[step.list];
    if (!Array.isArray(entries)) return null;
    const list = entries as Entries;
    const index = list.findIndex((entry) => entry.id === step.id);
    if (index === -1 || (spec?.kind !== "items" && spec?.kind !== "links"))
      return null;
    places.push({ kind: spec.kind, number: index + 1 });
    if (spec.kind === "items") fields = spec.fields;
    holder = list[index];
  }
  return places;
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
