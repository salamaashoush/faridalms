import type { MathForm } from "./math-forms";

import { numericValue, sameLatex, sameMath } from "./math-answers";
import { inMathForm, PRECISION_FORMS } from "./math-forms";
import { compareQuantity, keyInAnswerUnits, readQuantity } from "./math-units";

/**
 * Why a maths answer that means the key was still not right: not in the
 * form asked for, named, or in other units where the key's were asked
 * for, or without its units.
 */
export type MathNote = MathForm | "units" | "unitless";

/** What a maths question accepts and how. */
export interface MathKey {
  answers: readonly string[];
  tolerance: number;
  form?: MathForm;
  /** For an answer asked to a precision: how many significant figures or decimal places. */
  places?: number;
  units?: "convert" | "same";
}

const ARABIC_DIGITS = /[٠-٩۰-۹]/gu;

/** A number as written, perhaps in standard form: its digits and its value. */
function writtenNumber(
  latex: string,
): { mantissa: string; value: number; scaled: boolean } | null {
  const plain = latex
    .replace(ARABIC_DIGITS, (digit) => {
      const code = digit.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .replaceAll(/(\d)(?:\{,\}|٫)(\d)/gu, "$1.$2")
    .replaceAll(/\\[,;:! ]|\s|~/gu, "")
    .replaceAll("−", "-");
  const match =
    /^([-+]?\d+(?:\.\d+)?)(?:(?:\\times|\\cdot|×)10\^\{?([-+]?\d+)\}?)?$/u.exec(
      plain,
    );
  if (!match?.[1]) return null;
  return {
    mantissa: match[1].replace(/^[-+]/u, ""),
    value: Number(match[1]) * 10 ** Number(match[2] ?? 0),
    scaled: match[2] !== undefined,
  };
}

function rounded(value: number, form: MathForm, places: number): number {
  if (value === 0) return 0;
  const power =
    form === "figures"
      ? places - 1 - Math.floor(Math.log10(Math.abs(value)))
      : places;
  const scale = 10 ** power;
  return Math.round(value * scale) / scale;
}

/**
 * How many significant figures or decimal places a number is written to:
 * the least and the most, as a whole number's trailing zeros may or may
 * not count, as STACK's NumSigFigs allows.
 */
function precisionOf(
  written: { mantissa: string; scaled: boolean },
  form: MathForm,
): [number, number] {
  const [whole = "", decimals] = written.mantissa.split(".");
  if (form === "places")
    return written.scaled
      ? [-1, -1]
      : [decimals?.length ?? 0, decimals?.length ?? 0];
  const digits = `${whole}${decimals ?? ""}`.replace(/^0+/u, "");
  if (decimals !== undefined) return [digits.length, digits.length];
  return [digits.replace(/0+$/u, "").length, digits.length];
}

const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * An answer asked to a precision: right when it is the key rounded so and
 * written so; "precision" when it is the right value at some other
 * precision, or worked out but not written as a decimal.
 */
function precisionResult(
  answer: string,
  target: number,
  form: MathForm,
  places: number,
): "right" | "precision" | "wrong" {
  const written = writtenNumber(answer);
  const want = rounded(target, form, places);
  if (written) {
    const [least, most] = precisionOf(written, form);
    if (close(written.value, want) && places >= least && places <= most)
      return "right";
    if (
      close(rounded(written.value, form, places), want) ||
      close(rounded(target, form, most), written.value)
    )
      return "precision";
    return "wrong";
  }
  const worked = numericValue(answer);
  return worked !== null && close(rounded(worked, form, places), want)
    ? "precision"
    : "wrong";
}

type Outcome = "right" | "units" | "unitless" | "precision" | "wrong";

/** How an answer compares with one accepted answer. */
function outcomeFor(key: MathKey, answer: string, accepted: string): Outcome {
  const strict = key.units === "same";
  if (key.form && PRECISION_FORMS.has(key.form) && key.places !== undefined) {
    if (key.units) {
      const converted = keyInAnswerUnits(answer, accepted);
      if (!converted) {
        const compared = compareQuantity(
          answer,
          accepted,
          key.tolerance,
          strict,
        );
        return compared === "unitless" ? "unitless" : "wrong";
      }
      const result = precisionResult(
        converted.written,
        converted.value,
        key.form,
        key.places,
      );
      return result === "right" && strict && !converted.sameUnits
        ? "units"
        : result;
    }
    const target = numericValue(accepted);
    if (target !== null)
      return precisionResult(answer, target, key.form, key.places);
  }
  const compared = key.units
    ? compareQuantity(answer, accepted, key.tolerance, strict)
    : null;
  if (compared) return compared;
  // What cannot be worked out is compared as written.
  return (sameMath(answer, accepted, key.tolerance) ??
    sameLatex(answer, accepted))
    ? "right"
    : "wrong";
}

/** Marks a maths answer: right or not, and why not when it meant the key. */
export function markMath(
  key: MathKey,
  answer: string,
): { correct: boolean; note?: MathNote } {
  const outcomes = new Set(
    key.answers.map((accepted) => outcomeFor(key, answer, accepted)),
  );
  if (outcomes.has("right")) {
    if (!key.form || PRECISION_FORMS.has(key.form)) return { correct: true };
    // A form is asked of a quantity's number, not its units.
    const written = key.units
      ? (readQuantity(answer)?.number ?? answer)
      : answer;
    return inMathForm(written, key.form) === false
      ? { correct: false, note: key.form }
      : { correct: true };
  }
  if (outcomes.has("precision") && key.form)
    return { correct: false, note: key.form };
  if (outcomes.has("units")) return { correct: false, note: "units" };
  if (outcomes.has("unitless")) return { correct: false, note: "unitless" };
  return { correct: false };
}

/**
 * Whether each accepted answer is written as its question asks: with units
 * where units are asked, and in the form asked. A key in another form is
 * most often a slip in choosing one or the other.
 */
export function keyIssue(key: MathKey): "units" | "form" | null {
  if (
    key.units &&
    !key.answers.every(
      (accepted) => (readQuantity(accepted)?.powers.size ?? 0) > 0,
    )
  )
    return "units";
  if (!key.form) return null;
  if (PRECISION_FORMS.has(key.form)) {
    const places = key.places ?? 0;
    const fits = (accepted: string) => {
      const number = key.units ? readQuantity(accepted)?.number : accepted;
      return (
        number !== undefined &&
        (numericValue(number) !== null || writtenNumber(number) !== null)
      );
    };
    return places >= 0 && key.answers.every(fits) ? null : "form";
  }
  const form = key.form;
  return key.answers.every(
    (accepted) =>
      inMathForm(
        key.units ? (readQuantity(accepted)?.number ?? accepted) : accepted,
        form,
      ) !== false,
  )
    ? null
    : "form";
}
