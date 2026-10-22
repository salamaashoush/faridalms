import type { Digits } from "./people";

/**
 * Arabic notation as the school books of Egypt and the Levant write
 * mathematics: the letters for unknowns, constants and functions those
 * books agree on (x as س, f as د, e as هـ, π as ط), functions by their
 * Arabic abbreviations, as Edraak's MathJax extension draws them. A letter
 * the books do not agree on stays as written; a teacher may type an Arabic
 * one outright.
 */
const LETTERS: Readonly<Record<string, string>> = {
  a: "أ",
  b: "ب",
  c: "جـ",
  e: "هـ",
  f: "د",
  k: "ك",
  l: "ل",
  m: "م",
  n: "ن",
  r: "ر",
  x: "س",
  y: "ص",
  z: "ع",
  π: "ط",
};

const FUNCTIONS: Readonly<Record<string, string>> = {
  sin: "جا",
  cos: "جتا",
  tan: "ظا",
  cot: "ظتا",
  sec: "قا",
  csc: "قتا",
  log: "لو",
  ln: "لوهـ",
  lim: "نهــا",
};

/** Arrows point the way a formula read right to left runs. */
const MIRRORED: Readonly<Record<string, string>> = {
  "→": "←",
  "←": "→",
  "⟶": "⟵",
  "⟵": "⟶",
  "⇒": "⇐",
  "⇐": "⇒",
  "⟹": "⟸",
  "⟸": "⟹",
};

const PUNCTUATION: Readonly<Record<string, string>> = { ",": "،", ";": "؛" };

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

/**
 * The Arabic letter a formula in Arabic notation draws for a Latin one, if
 * any; a capital as its small letter, as geometry's points A, B, C are أ،
 * ب، جـ.
 */
export const arabicLetter = (letter: string): string | undefined =>
  LETTERS[/^[A-Z]$/u.test(letter) ? letter.toLowerCase() : letter];

/** A function's Arabic abbreviation, as \sin is جا. */
export const arabicFunction = (name: string): string | undefined =>
  FUNCTIONS[name];

const TOKEN = /<(mi|mn|mo)((?:\s[^>]*)?)>([^<]*)<\/\1>/gu;

/**
 * Temml's MathML redrawn in Arabic notation. Only the drawn tokens change:
 * the LaTeX annotation stays as written, for copying and editing.
 */
export function arabicMathML(markup: string, digits: Digits): string {
  return markup.replace(
    TOKEN,
    (whole, tag: string, attributes: string, text: string) => {
      const drawn =
        tag === "mi"
          ? (FUNCTIONS[text] ?? arabicLetter(text))
          : tag === "mn"
            ? digits === "arab"
              ? text
                  .replaceAll(/[.,]/gu, "٫")
                  .replaceAll(/[0-9]/gu, (digit) =>
                    ARABIC_INDIC.charAt(Number(digit)),
                  )
              : undefined
            : (MIRRORED[text] ?? PUNCTUATION[text]);
      return drawn === undefined || drawn === text
        ? whole
        : `<${tag}${attributes}>${drawn}</${tag}>`;
    },
  );
}

const READ: readonly (readonly [RegExp, string])[] = [
  ...Object.entries(FUNCTIONS)
    .toSorted(([, one], [, other]) => other.length - one.length)
    .map(
      ([name, written]) =>
        [
          new RegExp(written.replaceAll("ـ", "ـ*"), "gu"),
          ` \\${name} `,
        ] as const,
    ),
  ...Object.entries(LETTERS).map(
    ([latin, written]) =>
      [
        new RegExp(written.replaceAll("ـ", "ـ*"), "gu"),
        // Apart from what comes before, so as not to run on from a command.
        latin === "π" ? " \\pi " : ` ${latin}`,
      ] as const,
  ),
  [/[اإآ]/gu, " a"],
];

/**
 * Arabic letters and function abbreviations, as a student in Arabic
 * notation types them, read as the Latin LaTeX a key is written in, so
 * that 2س + 1 answers 2x + 1. Each letter stands for one Latin letter.
 */
export function latinMath(latex: string): string {
  let text = latex;
  for (const [written, latin] of READ) text = text.replace(written, latin);
  return text.replaceAll("ـ", "");
}
