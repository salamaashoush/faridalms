const ARABIC_INDIC = /[٠-٩]/g;
const PERSIAN = /[۰-۹]/g;
const SEPARATORS = /[.٫,]/g;
export const NOT_DIGIT = /[^0-9٠-٩۰-۹]/g;
export const NOT_FIGURE = /[^0-9٠-٩۰-۹.٫,]/g;

/**
 * A number as typed in either script: Arabic-Indic and Persian digits read
 * as their Western values, and the Arabic decimal separator as a point.
 * Null for nothing typed, NaN for text that is not a number.
 */
export function readNumber(text: string): number | null {
  const plain = text
    .trim()
    .replace(ARABIC_INDIC, (char) => String(char.charCodeAt(0) - 0x660))
    .replace(PERSIAN, (char) => String(char.charCodeAt(0) - 0x6f0))
    .replace(SEPARATORS, ".");
  if (plain === "") return null;
  return /^\d*\.?\d*$/.test(plain) && plain !== "." ? Number(plain) : NaN;
}

/** A number in the reader's digits, without grouping, as a field shows it. */
export function writeNumber(
  value: number,
  formatNumber: (value: number) => string,
): string {
  const point = formatNumber(1.5).replace(/[^.٫,]/g, "") || ".";
  return String(value).replace(/[.\d]/g, (char) =>
    char === "." ? point : formatNumber(Number(char)),
  );
}

/**
 * What a figure field keeps of what was typed: the digits, and the point
 * when decimals are allowed. Null when the text is not a figure or has more
 * places than allowed, so the field keeps what it had.
 */
export function typedFigure(
  text: string,
  decimals: number,
): { text: string; value: number | null } | null {
  const typed = text.replace(decimals > 0 ? NOT_FIGURE : NOT_DIGIT, "");
  const figure = readNumber(typed);
  if (Number.isNaN(figure)) return null;
  const places = typed.split(/[.٫,]/)[1] ?? "";
  if (places.length > decimals) return null;
  return {
    text: typed,
    value:
      figure === null ? null : Number(figure.toFixed(Math.max(0, decimals))),
  };
}
