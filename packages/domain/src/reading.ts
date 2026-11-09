import * as v from "valibot";

/**
 * Reading aloud tracked over a year: words correct per minute from each
 * passage a teacher marks, set against the grade's norms for the time of
 * year, and the words a student read wrongly kept for them to practise.
 */

export const READING_LANGUAGES = ["en", "ar"] as const;
export type ReadingLanguage = (typeof READING_LANGUAGES)[number];

/** The three benchmark times of a school year the norms are read at. */
export const READING_SEASONS = ["fall", "winter", "spring"] as const;
export type ReadingSeason = (typeof READING_SEASONS)[number];

export const NORM_PERCENTILES = ["p10", "p25", "p50", "p75", "p90"] as const;
export type NormPercentile = (typeof NORM_PERCENTILES)[number];

const wcpm = v.nullable(
  v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(400)),
);

/** One grade's words correct per minute at one time of year, by percentile. */
export const normRowSchema = v.object({
  /** The grade level's fixed meaning, such as grade_3, which every school shares. */
  grade: v.pipe(v.string(), v.regex(/^[a-z0-9_]{1,40}$/)),
  season: v.picklist(READING_SEASONS),
  p10: wcpm,
  p25: wcpm,
  p50: wcpm,
  p75: wcpm,
  p90: wcpm,
});
export type NormRow = v.InferOutput<typeof normRowSchema>;

export const MAX_NORM_ROWS = 60;

/**
 * The percentiles of a row written lower than one before them: a 50th
 * percentile under the 25th cannot be. Blank percentiles are skipped.
 */
export function fallingPercentiles(row: NormRow): NormPercentile[] {
  let highest: number | null = null;
  return NORM_PERCENTILES.filter((percentile) => {
    const value = row[percentile];
    if (value === null) return false;
    if (highest !== null && value < highest) return true;
    highest = value;
    return false;
  });
}

export const readingNormsSchema = v.pipe(
  v.array(normRowSchema),
  v.maxLength(MAX_NORM_ROWS),
  v.check(
    (rows) =>
      new Set(rows.map((row) => `${row.grade}:${row.season}`)).size ===
      rows.length,
    "reading.norm_repeated",
  ),
  v.check(
    (rows) => rows.every((row) => fallingPercentiles(row).length === 0),
    "reading.norm_order",
  ),
);

export const saveNormsSchema = v.object({
  language: v.picklist(READING_LANGUAGES),
  rows: readingNormsSchema,
});

export const resetNormsSchema = v.object({
  language: v.picklist(READING_LANGUAGES),
});

const hasbrouckTindal = (
  grade: string,
  rows: readonly [NormPercentile, ...(number | null)[]][],
): NormRow[] =>
  READING_SEASONS.map((season, index) => ({
    grade,
    season,
    ...(Object.fromEntries(
      rows.map(([percentile, ...values]) => [
        percentile,
        values[index] ?? null,
      ]),
    ) as Record<NormPercentile, number | null>),
  }));

/**
 * The English norms a school starts from: Hasbrouck and Tindal's 2017
 * update of compiled oral reading fluency norms (Behavioral Research and
 * Teaching, Technical Report 1702), grades 1 to 6. Grade 1 has none in the
 * autumn. Arabic has no published equivalent to start from, so the school
 * writes its own.
 */
export const DEFAULT_NORMS: Record<ReadingLanguage, NormRow[]> = {
  en: [
    ...hasbrouckTindal("grade_1", [
      ["p90", null, 97, 116],
      ["p75", null, 59, 91],
      ["p50", null, 29, 60],
      ["p25", null, 16, 34],
      ["p10", null, 9, 18],
    ]),
    ...hasbrouckTindal("grade_2", [
      ["p90", 111, 131, 148],
      ["p75", 84, 109, 124],
      ["p50", 50, 84, 100],
      ["p25", 36, 59, 72],
      ["p10", 23, 35, 43],
    ]),
    ...hasbrouckTindal("grade_3", [
      ["p90", 134, 161, 166],
      ["p75", 104, 137, 139],
      ["p50", 83, 97, 112],
      ["p25", 59, 79, 91],
      ["p10", 40, 62, 63],
    ]),
    ...hasbrouckTindal("grade_4", [
      ["p90", 153, 168, 184],
      ["p75", 125, 143, 160],
      ["p50", 94, 120, 133],
      ["p25", 75, 95, 105],
      ["p10", 60, 71, 83],
    ]),
    ...hasbrouckTindal("grade_5", [
      ["p90", 179, 183, 195],
      ["p75", 153, 160, 169],
      ["p50", 121, 133, 146],
      ["p25", 87, 109, 119],
      ["p10", 64, 84, 102],
    ]),
    ...hasbrouckTindal("grade_6", [
      ["p90", 185, 195, 204],
      ["p75", 159, 166, 173],
      ["p50", 132, 145, 146],
      ["p25", 112, 116, 122],
      ["p10", 89, 91, 91],
    ]),
  ],
  ar: [],
};

/**
 * The benchmark time a reading falls in, by its month: autumn from August
 * to November, winter from December to February, spring from March on.
 */
export function seasonOf(date: string): ReadingSeason {
  const month = Number(date.slice(5, 7));
  if (month >= 8 && month <= 11) return "fall";
  if (month === 12 || month <= 2) return "winter";
  return "spring";
}

/** The language a passage is read in: Arabic when its letters are, English otherwise. */
export const passageLanguage = (passage: string): ReadingLanguage =>
  /\p{Script=Arabic}/u.test(passage) ? "ar" : "en";

/**
 * Where a reading stands against its grade's norm: well below the 50th
 * percentile (ten words or more under it, the point at which Hasbrouck and
 * Tindal advise fluency work), around it, or well above it. Null without a
 * 50th percentile to compare with.
 */
export function normStanding(
  wordsPerMinute: number,
  row: NormRow | undefined,
): "below" | "near" | "above" | null {
  if (!row || row.p50 === null) return null;
  if (wordsPerMinute <= row.p50 - 10) return "below";
  if (wordsPerMinute >= row.p50 + 10) return "above";
  return "near";
}

/**
 * Prosody on the Multidimensional Fluency Scale (Zutell and Rasinski):
 * expression and volume, phrasing, smoothness and pace, each from 1 to 4.
 */
export const PROSODY_DIMENSIONS = [
  "expression",
  "phrasing",
  "smoothness",
  "pace",
] as const;
export type ProsodyDimension = (typeof PROSODY_DIMENSIONS)[number];
export const PROSODY_LEVELS = [1, 2, 3, 4] as const;

const level = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4));
export const prosodySchema = v.object({
  expression: v.optional(level),
  phrasing: v.optional(level),
  smoothness: v.optional(level),
  pace: v.optional(level),
});
export type Prosody = v.InferOutput<typeof prosodySchema>;

/** The scale's total, from 4 to 16, once every dimension is scored. */
export function prosodyTotal(prosody: Prosody): number | null {
  let total = 0;
  for (const dimension of PROSODY_DIMENSIONS) {
    const score = prosody[dimension];
    if (score === undefined) return null;
    total += score;
  }
  return total;
}

/**
 * The words a reading got wrong, as a student practises them: each once,
 * in the order met, without the punctuation around it, and only those
 * before the place the reading stopped.
 */
export function practiseWords(
  passage: string,
  mark: { errors: readonly number[]; lastWord: number | null },
): string[] {
  const words = passage.split(/\s+/u).filter(Boolean);
  const read = Math.min(words.length, (mark.lastWord ?? words.length - 1) + 1);
  const seen = new Set<string>();
  const found: string[] = [];
  for (const place of [...new Set(mark.errors)].toSorted((a, b) => a - b)) {
    if (place >= read) continue;
    const word = (words[place] ?? "").replaceAll(
      /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu,
      "",
    );
    const key = word.toLocaleLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    found.push(word);
  }
  return found;
}
