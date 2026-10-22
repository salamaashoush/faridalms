import type { StudentLevel } from "@faridalms/puzzles/level";
import type { Program } from "@faridalms/puzzles/program";

import { levelSchema } from "@faridalms/puzzles/level";
import { countBlocks, programSchema } from "@faridalms/puzzles/program";
import { solves } from "@faridalms/puzzles/run";
import { ARROWS, pythonOf } from "@faridalms/puzzles/text";
import * as v from "valibot";

import type { ContentDocument, ContentNode, FeedbackTime } from "./content";
import type { CrosswordEntry } from "./crossword";
import type { MathNote } from "./math-marking";

import { matchAnswer, parseNumber } from "./answers";
import {
  codeSource,
  contentDocumentSchema,
  contentPlainText,
  FEEDBACK_TIMES,
  GATE_WAITS,
  holdsSuggestions,
  MAX_LATEX,
  mathText,
  narrationWordsSchema,
  textDirection,
} from "./content";
import { contentIssues } from "./content-checks";
import { emptyContent } from "./content-conversion";
import {
  crosswordLayout,
  crosswordLetters,
  MAX_CROSSWORD_WORDS,
  squaresOf,
} from "./crossword";
import { embedProviderNames, FRAMED_KEY, framedKey } from "./embed";
import {
  contentOfLesson,
  hintsOf,
  isContentDocument,
  lessonOfContent,
} from "./lesson-content";
import { MATH_FORMS } from "./math-forms";
import { keyIssue, markMath } from "./math-marking";
import {
  projectFilesSchema,
  projectLanguages,
  starterFilesSchema,
} from "./project";
import { scratchChecksSchema, scratchNotesSchema } from "./scratch-project";
import { seededRandom } from "./seeded";
import { MAX_QUESTION_STANDARDS } from "./standards";
import { MAX_STROKE_POINTS, MAX_STROKES, traceResults } from "./tracing";
import { CONTENT_LOCALES } from "./translations";
import {
  lettersBetween,
  MAX_SEARCH_SIZE,
  MAX_SEARCH_WORDS,
  spells,
  wordSearch,
} from "./wordsearch";

export { gapsSource, parseGaps } from "./gaps";

export const SCHOOL_FEATURES = ["elearning"] as const;
export type SchoolFeature = (typeof SCHOOL_FEATURES)[number];

export const MODULE_STATES = ["draft", "published", "archived"] as const;
export type ModuleState = (typeof MODULE_STATES)[number];
export const LESSON_COMPLETIONS = [
  "view",
  "mark",
  "quiz",
  "score",
  "reflection",
  "watch",
] as const;
export type LessonCompletion = (typeof LESSON_COMPLETIONS)[number];
/**
 * The share of a recording a student must play for it to count as watched,
 * leaving room for credits and a skipped silence.
 */
export const WATCHED_SHARE = 0.9;
export const LESSON_MEDIA_BYTES = 200 * 1024 * 1024;
export const MAX_LESSON_BLOCKS = 60;
export const VOWEL_MARKS = ["shown", "hidden", "choice"] as const;
export type VowelMarks = (typeof VOWEL_MARKS)[number];
export const MAX_CHOICE_OPTIONS = 8;
export const MAX_ACCEPTED_ANSWERS = 10;
export const MAX_GAPS = 20;
export const MAX_PAIRS = 8;
export const MAX_DISTRACTORS = 4;
export const MAX_ORDER_ITEMS = 10;
export const MAX_HINTS = 5;
/** Languages a code puzzle's lines are written in; only Python marks indentation. */
export const PARSONS_LANGUAGES = [
  "python",
  "javascript",
  "html",
  "text",
] as const;
export type ParsonsLanguage = (typeof PARSONS_LANGUAGES)[number];
export const MAX_PARSONS_LINES = 20;
export const MAX_PROGRAM_TESTS = 12;
/** The longest program a student hands in, in characters. */
export const MAX_PROGRAM_CHARS = 20_000;
export const MAX_PARSONS_DISTRACTORS = 6;
export const MAX_INDENT = 6;
export const MAX_SORT_GROUPS = 4;
/** The most questions one draw asks of each attempt. */
export const MAX_DRAW = 20;
const MAX_DRAW_TAG = 40;
export const MAX_SORT_ITEMS = 20;
export const MAX_MODULE_CLASSES = 20;
/**
 * How long a spoken answer may run, as Seesaw lets a teacher cap a child's
 * recording at 15, 45 or 90 seconds; three minutes for older students.
 */
export const RECORD_SECONDS = [15, 45, 90, 180] as const;
export type RecordSeconds = (typeof RECORD_SECONDS)[number];
/** The longest passage a student reads aloud, about a page of text. */
export const MAX_PASSAGE = 5000;
/**
 * Answers made as a picture: drawn with a finger on the screen, or a photo
 * of something made on paper or with blocks, as Seesaw's young learners
 * answer. Each comes back to the teacher to look at and mark.
 */
export const PICTURE_ANSWERS = ["drawing", "photo"] as const;
export type PictureAnswer = (typeof PICTURE_ANSWERS)[number];
/** Counting goes to twenty, as the Kindergarten standard does (K.CC.B.5). */
export const MAX_COUNT = 20;
/**
 * How the things to count are set out: scattered, in a row, or in ten
 * frames, which the EEF names as a representation to connect to number.
 */
export const COUNT_LAYOUTS = ["scatter", "line", "frame"] as const;
export type CountLayout = (typeof COUNT_LAYOUTS)[number];
/** Seconds the things to count stay in view before hiding, for seeing a number at a glance. */
export const FLASH_SECONDS = [2, 3, 5] as const;
/** A word built from up to twelve tiles, with up to six that do not belong. */
export const MAX_TILES = 12;
export const MAX_EXTRA_TILES = 6;
/** Things to find in one picture. */
export const MAX_HOTSPOTS = 8;
/** Places marked on one picture, the ones to find and others beside them. */
export const MAX_PLACES = 12;
export const MAX_PLACE_NAME = 60;
/** Labels beside a picture's own that fit no place, so the last place is still a choice. */
export const MAX_LABEL_EXTRAS = 6;
/**
 * How far past a marked place a tap still finds it, across the picture: a
 * young finger lands several millimetres off what it aims at.
 */
export const HOTSPOT_SLACK = 0.03;
/** Words a highlight question asks to be found, few enough to tap through on a phone. */
export const MAX_TARGETS = 20;
/** Places on a number line, so its ticks stay readable on a phone. */
export const MAX_LINE_STEPS = 200;
/** Taken off a check's credit for each try after the first, as Moodle's interactive mode does. */
export const TRY_PENALTY = 1 / 3;

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const text = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));
const requiredText = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const version = (min: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min));

/** A soundtrack needs captions, or for audio alone a transcript (WCAG 1.2.1). */
export function needsCaptions(mediaType: string): boolean {
  return mediaType.startsWith("video/");
}
export const needsTranscript = (mediaType: string) =>
  mediaType.startsWith("audio/");

/** A teacher's recording of a question or part, played to children who cannot read yet. */
const narration = v.optional(v.nullable(id));

/** What every question shares: how it is asked, what it is worth, and how it helps. */
const checkFields = {
  id,
  prompt: requiredText(1000),
  narration,
  /** When each word of the prompt starts in its recording. */
  narrationWords: v.optional(v.nullable(narrationWordsSchema)),
  /** 0 counts for nothing; a practice question still gives feedback. */
  points: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
  /** Shown in order, one more after each wrong try. */
  hints: v.pipe(v.array(text(500)), v.maxLength(MAX_HINTS)),
  explanation: text(1000),
  /** When the student learns how it went; at once when absent. */
  feedbackAt: v.optional(v.picklist(FEEDBACK_TIMES)),
  /** Tries before the answer is shown; null lets the student keep trying until they ask. */
  tries: v.nullable(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10)),
  ),
  /** Asked when the video above reaches this second, rather than in the reading. */
  videoAt: v.optional(
    v.nullable(
      v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(21600)),
    ),
  ),
  /** The school's standards a marked answer gives evidence of. */
  standards: v.optional(
    v.pipe(v.array(id), v.maxLength(MAX_QUESTION_STANDARDS)),
  ),
};

const accepted = v.pipe(
  v.array(requiredText(200)),
  v.minLength(1),
  v.maxLength(MAX_ACCEPTED_ANSWERS),
);

const matching = {
  caseSensitive: v.boolean(),
  /** Forgive a slip or two in spelling. */
  closeEnough: v.boolean(),
  tehMarbuta: v.boolean(),
};

/**
 * A picture on an option, item or side of a pair. Its words may be left out,
 * as for children who cannot read yet; its description then names it.
 */
export const pictureSchema = v.object({ fileId: id, alt: text(300) });
export type Picture = v.InferOutput<typeof pictureSchema>;
const picture = v.optional(v.nullable(pictureSchema));
/** A position or size across a picture, from its start edge to its end. */
const unit = v.pipe(v.number(), v.minValue(0), v.maxValue(1));

interface Named {
  text: string;
  picture?: Picture | null | undefined;
}

/** What a part is called: its words, else its picture's description. */
export const partName = (part: Named) =>
  part.text.trim() || part.picture?.alt.trim() || "";

const named = <S extends v.GenericSchema<Named, Named>>(schema: S) =>
  v.pipe(
    schema,
    v.check(
      (part: v.InferOutput<S>) => partName(part) !== "",
      "learning.part_unnamed",
    ),
  );

export const choiceOptionSchema = named(
  v.object({
    id,
    text: text(300),
    picture,
    narration,
    /** Shown to a student who picks this option. */
    feedback: text(300),
  }),
);

const gapSegment = v.variant("type", [
  v.object({
    type: v.literal("text"),
    text: v.pipe(v.string(), v.maxLength(2000)),
  }),
  v.pipe(
    v.object({
      type: v.literal("gap"),
      id,
      answers: accepted,
      /** Words to choose from; none for a gap the student types into. */
      options: v.pipe(
        v.array(requiredText(100)),
        v.maxLength(MAX_CHOICE_OPTIONS),
      ),
    }),
    v.check(
      (gap) =>
        gap.options.length === 0 ||
        (gap.options.length >= 2 &&
          gap.answers.every((answer) => gap.options.includes(answer))),
      "learning.gap_options",
    ),
  ),
]);

/** A passage's words as a highlight question holds them: plain text, and the words to find. */
const highlightSegment = v.variant("type", [
  v.object({
    type: v.literal("text"),
    text: v.pipe(v.string(), v.maxLength(2000)),
  }),
  v.object({ type: v.literal("target"), id, text: requiredText(80) }),
]);

export const lessonBlockSchema = v.variant("type", [
  v.object({ id, type: v.literal("content"), content: contentDocumentSchema }),
  v.pipe(
    v.object({
      id,
      type: v.literal("media"),
      fileId: id,
      name: requiredText(255),
      mediaType: requiredText(128),
      sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(1)),
      caption: text(500),
      captionsFileId: v.nullable(id),
      captionsLang: v.picklist(["en", "ar"]),
      /** For audio alone, a transcript stands in for captions. */
      transcript: text(20000),
    }),
    v.check(
      (block) =>
        (!needsCaptions(block.mediaType) || block.captionsFileId !== null) &&
        (!needsTranscript(block.mediaType) ||
          block.captionsFileId !== null ||
          block.transcript !== ""),
      "learning.captions_required",
    ),
  ),
  v.object({
    id,
    type: v.literal("gate"),
    /** What opens the rest of the lesson; only work a student can finish alone. */
    requires: v.picklist(GATE_WAITS),
  }),
  v.object({
    id,
    type: v.literal("draw"),
    /** Questions in the bank carrying this tag are drawn from. */
    tag: requiredText(MAX_DRAW_TAG),
    count: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_DRAW)),
    /** What each drawn question is worth, whatever it was kept with. */
    points: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
  }),
  v.pipe(
    v.object({
      ...checkFields,
      type: v.literal("choice"),
      options: v.pipe(
        v.array(choiceOptionSchema),
        v.minLength(2),
        v.maxLength(MAX_CHOICE_OPTIONS),
      ),
      correctOptionIds: v.pipe(
        v.array(id),
        v.minLength(1, "learning.correct_option"),
      ),
      multiple: v.boolean(),
      shuffle: v.boolean(),
    }),
    v.check(
      (block) =>
        block.correctOptionIds.every((optionId) =>
          block.options.some((option) => option.id === optionId),
        ) &&
        (block.multiple || block.correctOptionIds.length === 1),
      "learning.correct_option",
    ),
  ),
  v.object({
    ...checkFields,
    type: v.literal("poll"),
    /** A poll asks what students think, so it has no right answer to count. */
    points: v.literal(0),
    options: v.pipe(
      v.array(choiceOptionSchema),
      v.minLength(2),
      v.maxLength(MAX_CHOICE_OPTIONS),
    ),
    multiple: v.boolean(),
    /** Whether a student sees how their class answered, once they have. */
    classResults: v.boolean(),
  }),
  v.object({
    ...checkFields,
    ...matching,
    type: v.literal("text"),
    answers: accepted,
  }),
  v.pipe(
    v.object({
      ...checkFields,
      type: v.literal("math"),
      /** The answers accepted, in LaTeX; one meaning the same as any is right. */
      answers: v.pipe(
        v.array(requiredText(MAX_LATEX)),
        v.minLength(1),
        v.maxLength(MAX_ACCEPTED_ANSWERS),
      ),
      /** How far a number may be from the key, for answers worked to decimals. */
      tolerance: v.pipe(v.number(), v.minValue(0)),
      /** How the answer must be written, beyond meaning the same as the key. */
      form: v.optional(v.picklist(MATH_FORMS)),
      /** For an answer asked to a precision: how many significant figures or decimal places. */
      places: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10)),
      ),
      /**
       * The answers are quantities with units: the same quantity in any units
       * is right, or only in the units the key is written in.
       */
      units: v.optional(v.picklist(["convert", "same"])),
    }),
    v.check((block) => keyIssue(block) !== "units", "learning.math_key_units"),
    v.check((block) => keyIssue(block) !== "form", "learning.math_key_form"),
  ),
  v.pipe(
    v.object({
      ...checkFields,
      ...matching,
      type: v.literal("gaps"),
      segments: v.pipe(v.array(gapSegment), v.maxLength(MAX_GAPS * 2 + 1)),
      /**
       * The gaps are filled from a bank of words: every gap's answer and
       * these extra ones, which fit none. Absent for gaps typed or chosen
       * one by one.
       */
      bank: v.optional(
        v.pipe(v.array(requiredText(100)), v.maxLength(MAX_CHOICE_OPTIONS)),
      ),
    }),
    v.check((block) => {
      const gaps = block.segments.filter((segment) => segment.type === "gap");
      return gaps.length >= 1 && gaps.length <= MAX_GAPS;
    }, "learning.gaps_needed"),
    v.check(
      (block) =>
        !block.bank ||
        block.segments.every(
          (segment) => segment.type === "text" || segment.options.length === 0,
        ),
      "learning.bank_options",
    ),
  ),
  v.pipe(
    v.object({
      ...checkFields,
      type: v.literal("highlight"),
      segments: v.pipe(
        v.array(highlightSegment),
        v.maxLength(MAX_TARGETS * 2 + 1),
      ),
    }),
    v.check((block) => {
      const targets = block.segments.filter(
        (segment) => segment.type === "target",
      );
      return targets.length >= 1 && targets.length <= MAX_TARGETS;
    }, "learning.targets_needed"),
  ),
  v.pipe(
    v.object({
      ...checkFields,
      type: v.literal("number"),
      /** An exact value within a tolerance, or any value in a range. */
      mode: v.picklist(["exact", "range"]),
      value: v.number(),
      tolerance: v.pipe(v.number(), v.minValue(0)),
      percent: v.boolean(),
      min: v.number(),
      max: v.number(),
      /** Answered by placing a point on a number line from `from` to `to`, in steps. */
      line: v.optional(
        v.pipe(
          v.object({
            from: v.number(),
            to: v.number(),
            step: v.pipe(v.number(), v.gtValue(0)),
          }),
          v.check(
            (line) =>
              line.from < line.to &&
              (line.to - line.from) / line.step <= MAX_LINE_STEPS,
            "learning.number_line",
          ),
        ),
      ),
    }),
    v.check(
      (block) => block.mode === "exact" || block.min <= block.max,
      "learning.number_range",
    ),
    v.check(
      (block) =>
        !block.line ||
        (block.mode === "exact"
          ? block.value >= block.line.from && block.value <= block.line.to
          : block.max >= block.line.from && block.min <= block.line.to),
      "learning.number_line_answer",
    ),
  ),
  v.object({
    ...checkFields,
    type: v.literal("matching"),
    /** Played as memory pairs: cards face down, turned over two at a time. */
    memory: v.optional(v.boolean()),
    pairs: v.pipe(
      v.array(
        v.pipe(
          v.object({
            id,
            prompt: text(300),
            promptPicture: picture,
            promptNarration: narration,
            answer: text(300),
            answerPicture: picture,
            answerNarration: narration,
          }),
          v.check(
            (pair) =>
              partName({ text: pair.prompt, picture: pair.promptPicture }) !==
                "" &&
              partName({ text: pair.answer, picture: pair.answerPicture }) !==
                "",
            "learning.part_unnamed",
          ),
        ),
      ),
      v.minLength(2),
      v.maxLength(MAX_PAIRS),
    ),
    /** Answers that match no prompt, so the last pair is still a choice. */
    distractors: v.pipe(
      v.array(named(v.object({ id, text: text(300), picture, narration }))),
      v.maxLength(MAX_DISTRACTORS),
    ),
  }),
  v.object({
    ...checkFields,
    type: v.literal("ordering"),
    /** In their right order; students see them shuffled. */
    items: v.pipe(
      v.array(named(v.object({ id, text: text(300), picture, narration }))),
      v.minLength(2),
      v.maxLength(MAX_ORDER_ITEMS),
    ),
    /** Credit for the whole order only, or for each neighbouring pair in order. */
    scoring: v.picklist(["all", "neighbours"]),
  }),
  v.object({
    ...checkFields,
    type: v.literal("parsons"),
    /** The program's language; only Python marks how far a line is indented. */
    language: v.picklist(PARSONS_LANGUAGES),
    /** The program in order, each line with how far it is indented. */
    lines: v.pipe(
      v.array(
        v.object({
          id,
          code: requiredText(200),
          indent: v.pipe(
            v.number(),
            v.integer(),
            v.minValue(0),
            v.maxValue(MAX_INDENT),
          ),
        }),
      ),
      v.minLength(2),
      v.maxLength(MAX_PARSONS_LINES),
    ),
    /** Lines that belong nowhere in it, for students to leave out. */
    distractors: v.pipe(
      v.array(v.object({ id, code: requiredText(200) })),
      v.maxLength(MAX_PARSONS_DISTRACTORS),
    ),
  }),
  v.pipe(
    v.object({
      ...checkFields,
      type: v.literal("sorting"),
      groups: v.pipe(
        v.array(v.object({ id, name: requiredText(100), narration })),
        v.minLength(2),
        v.maxLength(MAX_SORT_GROUPS),
      ),
      items: v.pipe(
        v.array(
          named(
            v.object({ id, text: text(300), picture, narration, groupId: id }),
          ),
        ),
        v.minLength(2),
        v.maxLength(MAX_SORT_ITEMS),
      ),
    }),
    v.check(
      (block) =>
        block.items.every((item) =>
          block.groups.some((group) => group.id === item.groupId),
        ),
      "learning.sort_group",
    ),
  ),
  v.pipe(
    v.object({
      ...checkFields,
      type: v.literal("hotspot"),
      /** The picture children search; required before the question is shown. */
      picture,
      /**
       * Each marked place: its box across the picture (left, top, width,
       * height), the name it is listed by for a keyboard or screen reader,
       * and whether it is one to find. The others are there so that list
       * is a choice, not the answer.
       */
      places: v.pipe(
        v.array(
          v.object({
            box: v.tuple([unit, unit, unit, unit]),
            name: text(MAX_PLACE_NAME),
            correct: v.boolean(),
          }),
        ),
        v.maxLength(MAX_PLACES),
      ),
    }),
    v.check((block) => {
      const finds = block.places.filter((place) => place.correct).length;
      return Boolean(block.picture) && finds > 0 && finds <= MAX_HOTSPOTS;
    }, "learning.hotspot_needed"),
  ),
  v.pipe(
    v.object({
      ...checkFields,
      type: v.literal("labelling"),
      /** The picture whose places are labelled; required before the question is shown. */
      picture,
      /** Each place to label: its box across the picture (left, top, width, height) and its label. */
      places: v.pipe(
        v.array(
          v.object({
            box: v.tuple([unit, unit, unit, unit]),
            name: requiredText(MAX_PLACE_NAME),
          }),
        ),
        v.maxLength(MAX_PLACES),
      ),
      /** Labels that belong to no place. */
      extras: v.pipe(
        v.array(requiredText(MAX_PLACE_NAME)),
        v.maxLength(MAX_LABEL_EXTRAS),
      ),
    }),
    // Two places with one label could each take it, so no answer would be wrong.
    v.check((block) => {
      const labels = [
        ...block.places.map((place) => place.name),
        ...block.extras,
      ].map((label) => label.trim().toLocaleLowerCase());
      return (
        Boolean(block.picture) &&
        block.places.length > 0 &&
        new Set(labels).size === labels.length
      );
    }, "learning.labels_needed"),
  ),
  v.pipe(
    v.object({
      ...checkFields,
      type: v.literal("crossword"),
      /** Each word with the clue that asks for it; the grid is laid out from the words. */
      words: v.pipe(
        v.array(
          v.object({ id, answer: requiredText(40), clue: requiredText(300) }),
        ),
        v.minLength(2, "learning.crossword_layout"),
        v.maxLength(MAX_CROSSWORD_WORDS),
      ),
    }),
    v.check(
      (block) => crosswordLayout(block.words) !== null,
      "learning.crossword_layout",
    ),
  ),
  v.pipe(
    v.object({
      ...checkFields,
      type: v.literal("wordsearch"),
      /** The words hidden in the grid, which is made from them and the question's id. */
      words: v.pipe(
        v.array(v.object({ id, answer: requiredText(40) })),
        v.minLength(2, "learning.wordsearch_layout"),
        v.maxLength(MAX_SEARCH_WORDS),
      ),
    }),
    v.check(
      (block) => wordSearch(block.words, block.id) !== null,
      "learning.wordsearch_layout",
    ),
  ),
  v.object({
    ...checkFields,
    type: v.literal("spelling"),
    /** What the word names, for children who cannot read it yet. */
    picture,
    /**
     * The word as the tiles that build it, in order: a sound's letters
     * together ("sh", "ee"), so a tile is what a child hears.
     */
    tiles: v.pipe(
      v.array(requiredText(8)),
      v.minLength(1, "learning.tiles_needed"),
      v.maxLength(MAX_TILES),
    ),
    /** Tiles that belong to no place, so the last one is still a choice. */
    extras: v.pipe(v.array(requiredText(8)), v.maxLength(MAX_EXTRA_TILES)),
  }),
  v.object({
    ...checkFields,
    type: v.literal("tracing"),
    /** The teacher's own writing of it, stroke by stroke, in order. */
    strokes: v.pipe(
      v.array(
        v.pipe(
          v.array(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
          v.minLength(2),
          v.maxLength(MAX_STROKE_POINTS * 2),
        ),
      ),
      v.minLength(1, "learning.trace_needed"),
      v.maxLength(MAX_STROKES),
    ),
  }),
  v.object({
    ...checkFields,
    type: v.literal("counting"),
    /** What is counted, drawn again for each one; without it, round counters. */
    picture,
    count: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(MAX_COUNT),
    ),
    /** Say how many are shown, or put that many into ten frames. */
    mode: v.picklist(["count", "make"]),
    layout: v.picklist(COUNT_LAYOUTS),
    /** Shown for this many seconds, then hidden; none keeps them in view. */
    flashSeconds: v.nullable(v.picklist(FLASH_SECONDS)),
  }),
  v.object({
    ...checkFields,
    type: v.literal("written"),
    /** Null for no limit. */
    wordLimit: v.nullable(
      v.pipe(v.number(), v.integer(), v.minValue(10), v.maxValue(5000)),
    ),
    /** Answered by speaking, up to this many seconds, rather than writing. */
    recordSeconds: v.optional(v.nullable(v.picklist(RECORD_SECONDS))),
    /** The spoken answer is recorded on camera, or with the student's screen. */
    recordVideo: v.optional(v.boolean()),
    /**
     * A passage the student reads aloud, their recording the answer, for
     * their teacher to mark word by word as a running record is.
     */
    passage: v.optional(v.pipe(v.string(), v.maxLength(MAX_PASSAGE))),
    /** Answered with a drawing or a photo rather than words. */
    answerWith: v.optional(v.nullable(v.picklist(PICTURE_ANSWERS))),
    /** The picture a drawing is made over, as a colouring page. */
    picture,
  }),
  v.object({
    ...checkFields,
    type: v.literal("scratch"),
    /** The project every student starts from; none starts from the studio's own. */
    starter: v.nullable(v.object({ fileId: id })),
    /** Students may offer their project to the class gallery, as with a project of files. */
    gallery: v.optional(v.boolean(), false),
    /**
     * What every student's project should have. Each save is read for
     * them, to tell the student and the teacher which are there; they
     * mark nothing.
     */
    checks: v.optional(scratchChecksSchema, []),
  }),
  v.object({
    ...checkFields,
    type: v.literal("project"),
    /** The files every student starts from; none starts from an empty page. */
    files: starterFilesSchema,
    /**
     * Students may offer their handed-in project to the class gallery, where
     * classmates see it once their teacher shows it, and may build on it.
     */
    gallery: v.optional(v.boolean(), false),
    /** What students with no starter begin from: a web page, or a Python program. */
    language: v.optional(v.picklist(projectLanguages), "web"),
  }),
  v.object({
    ...checkFields,
    type: v.literal("program"),
    language: v.picklist(["python", "javascript"]),
    /** The code a student starts from; empty when they write it all. */
    starter: v.pipe(v.string(), v.maxLength(5000)),
    /**
     * What the program is given to read and must print for each. A hidden
     * test is run and counted, but the student never sees its input.
     */
    tests: v.pipe(
      v.array(
        v.object({
          id,
          input: v.pipe(v.string(), v.maxLength(2000)),
          expected: v.pipe(v.string(), v.maxLength(5000)),
          hidden: v.boolean(),
        }),
      ),
      v.minLength(1),
      v.maxLength(MAX_PROGRAM_TESTS),
    ),
  }),
  v.object({
    ...checkFields,
    type: v.literal("puzzle"),
    /** The grid, the blocks a program may be built from, and the teacher's answer. */
    level: levelSchema,
  }),
]);
export type LessonBlock = v.InferOutput<typeof lessonBlockSchema>;
export type LessonBlockType = LessonBlock["type"];
export type ChoiceBlock = Extract<LessonBlock, { type: "choice" }>;
export type PollBlock = Extract<LessonBlock, { type: "poll" }>;
export type TextBlock = Extract<LessonBlock, { type: "text" }>;
export type MathBlock = Extract<LessonBlock, { type: "math" }>;
export type GapsBlock = Extract<LessonBlock, { type: "gaps" }>;
export type HighlightBlock = Extract<LessonBlock, { type: "highlight" }>;
export type NumberBlock = Extract<LessonBlock, { type: "number" }>;
export type MatchingBlock = Extract<LessonBlock, { type: "matching" }>;
export type OrderingBlock = Extract<LessonBlock, { type: "ordering" }>;
export type ParsonsBlock = Extract<LessonBlock, { type: "parsons" }>;
export type SortingBlock = Extract<LessonBlock, { type: "sorting" }>;
export type WrittenBlock = Extract<LessonBlock, { type: "written" }>;
export type CountingBlock = Extract<LessonBlock, { type: "counting" }>;
export type TracingBlock = Extract<LessonBlock, { type: "tracing" }>;
export type SpellingBlock = Extract<LessonBlock, { type: "spelling" }>;
export type HotspotBlock = Extract<LessonBlock, { type: "hotspot" }>;
export type LabellingBlock = Extract<LessonBlock, { type: "labelling" }>;
export type CrosswordBlock = Extract<LessonBlock, { type: "crossword" }>;
export type WordSearchBlock = Extract<LessonBlock, { type: "wordsearch" }>;
export type ScratchBlock = Extract<LessonBlock, { type: "scratch" }>;
export type ProgramBlock = Extract<LessonBlock, { type: "program" }>;
export type ProjectBlock = Extract<LessonBlock, { type: "project" }>;
export type PuzzleBlock = Extract<LessonBlock, { type: "puzzle" }>;
export type DrawBlock = Extract<LessonBlock, { type: "draw" }>;
/** A question the server marks the moment it is answered. */
export type AutoBlock =
  | ChoiceBlock
  | PollBlock
  | TextBlock
  | MathBlock
  | GapsBlock
  | HighlightBlock
  | NumberBlock
  | MatchingBlock
  | OrderingBlock
  | ParsonsBlock
  | SortingBlock
  | CountingBlock
  | TracingBlock
  | SpellingBlock
  | HotspotBlock
  | LabellingBlock
  | CrosswordBlock
  | WordSearchBlock
  | ProgramBlock
  | PuzzleBlock;
/** A question its teacher marks: words, a recording or picture, or a project. */
export type MarkedBlock = WrittenBlock | ScratchBlock | ProjectBlock;
export type CheckBlock = AutoBlock | MarkedBlock;

const AUTO_TYPES = new Set<LessonBlockType>([
  "choice",
  "poll",
  "text",
  "math",
  "gaps",
  "highlight",
  "number",
  "matching",
  "ordering",
  "parsons",
  "sorting",
  "counting",
  "tracing",
  "spelling",
  "hotspot",
  "labelling",
  "crossword",
  "wordsearch",
  "program",
  "puzzle",
]);

const MARKED_TYPES = new Set<LessonBlockType>([
  "written",
  "scratch",
  "project",
]);

export const isAuto = (block: LessonBlock): block is AutoBlock =>
  AUTO_TYPES.has(block.type);

/**
 * Questions whose feedback can wait: those answered in one go. Code is
 * learnt by running it and a young child's activity by trying, so both
 * always answer at once.
 */
const DEFERRABLE_TYPES = new Set<LessonBlockType>([
  "choice",
  "text",
  "math",
  "gaps",
  "highlight",
  "number",
  "matching",
  "ordering",
  "sorting",
  "labelling",
  "crossword",
  "wordsearch",
]);

export { FEEDBACK_TIMES, type FeedbackTime };

export function feedbackAtOf(block: LessonBlock): FeedbackTime {
  if (!DEFERRABLE_TYPES.has(block.type) || !("feedbackAt" in block))
    return "now";
  if (block.type === "matching" && block.memory) return "now";
  return block.feedbackAt ?? "now";
}

/** Which kinds of waiting feedback a student has been given. */
export interface FeedbackShown {
  /** They asked to see how they did, having answered every question that waits for the end. */
  end: boolean;
  /** Their teacher has shown their class. */
  teacher: boolean;
}

export const ALL_SHOWN: FeedbackShown = { end: true, teacher: true };

export const feedbackOpen = (block: LessonBlock, shown: FeedbackShown) => {
  const at = feedbackAtOf(block);
  return at === "now" || shown[at];
};

/** The questions of a lesson still keeping how they went from its student. */
export const heldChecks = (document: LessonDocument, shown: FeedbackShown) =>
  autoBlocks(document).filter((block) => !feedbackOpen(block, shown));
export const isTeacherMarked = (block: LessonBlock): block is MarkedBlock =>
  MARKED_TYPES.has(block.type);
export const isCheck = (block: LessonBlock): block is CheckBlock =>
  isAuto(block) || isTeacherMarked(block);

export const lessonDocumentSchema = v.pipe(
  v.object({
    version: v.literal(2),
    blocks: v.pipe(v.array(lessonBlockSchema), v.maxLength(MAX_LESSON_BLOCKS)),
  }),
  v.check(
    (document) =>
      new Set(document.blocks.map((block) => block.id)).size ===
      document.blocks.length,
    "learning.duplicate_ids",
  ),
);
export type LessonDocument = v.InferOutput<typeof lessonDocumentSchema>;

export function emptyLesson(): LessonDocument {
  return { version: 2, blocks: [] };
}

export function contentBlock(content: ContentDocument): LessonBlock {
  return { id: crypto.randomUUID(), type: "content", content };
}

/**
 * A lesson as its teacher writes it: one document. Lessons stored as a list
 * of blocks are read as the document they become.
 */
export function lessonContentOf(value: unknown): ContentDocument {
  if (isContentDocument(value)) return value;
  return contentOfLesson(upgradeLesson(value)) ?? emptyContent();
}

const mediaOf = (node: ContentNode): ContentNode[] =>
  node.type === "media" ? [node] : (node.children ?? []).flatMap(mediaOf);

/** Videos other services host that the school's player can follow. */
const FRAMED_PROVIDERS = new Set(["youtube", "vimeo"]);

const framedNodes = (node: ContentNode): ContentNode[] =>
  node.type === "embed" &&
  node.provider &&
  node.embedId &&
  FRAMED_PROVIDERS.has(node.provider)
    ? [node]
    : (node.children ?? []).flatMap(framedNodes);

const framedOf = (node: ContentNode): string[] =>
  framedNodes(node).map((embed) =>
    framedKey(embed.provider ?? "", embed.embedId ?? ""),
  );

/**
 * What these blocks play that watching counts, each once: uploads by file
 * id, YouTube and Vimeo videos by their key, in the order they come.
 */
export function watchables(
  blocks: readonly (
    | { type: "content"; content: ContentDocument }
    | { type: "media"; fileId: string }
    | { type: string }
  )[],
): string[] {
  const found = blocks.flatMap((block) =>
    block.type === "content" && "content" in block
      ? (block.content.root.children ?? []).flatMap((node) => [
          ...mediaOf(node).flatMap((media) =>
            media.fileId ? [media.fileId] : [],
          ),
          ...framedOf(node),
        ])
      : block.type === "media" && "fileId" in block
        ? [block.fileId]
        : [],
  );
  return [...new Set(found)];
}

/** The videos and recordings these blocks play, each once, by file. */
export function mediaFiles(
  blocks: readonly (
    | { type: "content"; content: ContentDocument }
    | { type: "media"; fileId: string }
    | { type: string }
  )[],
): string[] {
  const files = blocks.flatMap((block) =>
    block.type === "content" && "content" in block
      ? mediaOf(block.content.root).flatMap((node) =>
          node.fileId ? [node.fileId] : [],
        )
      : block.type === "media" && "fileId" in block
        ? [block.fileId]
        : [],
  );
  return [...new Set(files)];
}

export const lessonMedia = (document: LessonDocument) =>
  mediaFiles(document.blocks);

/** Everything a lesson plays that watching counts, uploads and framed videos. */
export const lessonWatchables = (document: LessonDocument) =>
  watchables(document.blocks);

/** The code blocks a lesson lets students run, by block id, with each one's program. */
export function runnableCode(document: LessonDocument): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (node: ContentNode) => {
    if (node.type === "code" && node.$?.run && node.$.id)
      found.set(node.$.id, codeSource(node));
    for (const child of node.children ?? []) walk(child);
  };
  for (const block of document.blocks)
    if (block.type === "content") walk(block.content.root);
  return found;
}

/** A lesson's videos and recordings with their names, each once, in reading order. */
export function lessonRecordings(
  document: LessonDocument,
): { key: string; name: string; video: boolean }[] {
  const found = document.blocks.flatMap((block) =>
    block.type === "content"
      ? (block.content.root.children ?? []).flatMap((node) => [
          ...mediaOf(node).flatMap((media) =>
            media.fileId
              ? [
                  {
                    key: media.fileId,
                    name: media.name ?? "",
                    video: (media.mime ?? "").startsWith("video/"),
                  },
                ]
              : [],
          ),
          ...framedNodes(node).map((embed) => ({
            key: framedKey(embed.provider ?? "", embed.embedId ?? ""),
            name:
              embed.caption?.trim() ||
              (embed.provider ? embedProviderNames[embed.provider] : ""),
            video: true,
          })),
        ])
      : block.type === "media"
        ? [
            {
              key: block.fileId,
              name: block.name,
              video: block.mediaType.startsWith("video/"),
            },
          ]
        : [],
  );
  return found.filter(
    (item, index) =>
      found.findIndex((other) => other.key === item.key) === index,
  );
}

/** A question a video stops for: the second, and the question's block. */
export interface VideoStop {
  at: number;
  blockId: string;
}

/**
 * The questions each video stops for, by the key watching counts it under,
 * in time order: questions stamped with a time belong to the nearest video
 * above them, an upload or a YouTube or Vimeo video.
 */
export function videoStops(
  blocks: readonly (
    | { type: "content"; content: ContentDocument }
    | { type: "media"; fileId: string }
    | { type: string; id?: string; videoAt?: number | null }
  )[],
): Map<string, VideoStop[]> {
  const stops = new Map<string, VideoStop[]>();
  let video: string | null = null;
  for (const block of blocks) {
    const played = watchables([block]);
    if (played.length > 0) {
      video = played.at(-1) ?? null;
      continue;
    }
    if (
      video &&
      "videoAt" in block &&
      typeof block.videoAt === "number" &&
      block.id
    )
      stops.set(video, [
        ...(stops.get(video) ?? []),
        { at: block.videoAt, blockId: block.id },
      ]);
  }
  for (const list of stops.values()) list.sort((a, b) => a.at - b.at);
  return stops;
}

/** How much of one recording a student has played, in whole seconds. */
export interface Watched {
  watchedSeconds: number;
  durationSeconds: number;
}

export const watchedEnough = (watched: Watched | undefined) =>
  watched !== undefined &&
  watched.watchedSeconds >= watched.durationSeconds * WATCHED_SHARE;

/**
 * A lesson's parts, split at its continue gates: what a teacher leading it
 * live opens to the class one at a time. A gate at the very end opens
 * nothing more, so it adds no part.
 */
export function lessonParts<T extends { id: string; type: string }>(
  blocks: readonly T[],
): T[][] {
  const parts: T[][] = [[]];
  for (const block of blocks) {
    if (block.type === "gate") parts.push([]);
    else parts.at(-1)?.push(block);
  }
  while (parts.length > 1 && parts.at(-1)?.length === 0) parts.pop();
  return parts;
}

/** The part of a lesson a block is in, by the gates above it, or -1 when it has no such block. */
export function partOf(
  blocks: readonly { id: string; type: string }[],
  blockId: string,
): number {
  let part = 0;
  for (const block of blocks) {
    if (block.id === blockId) return part;
    if (block.type === "gate") part += 1;
  }
  return -1;
}

/** Whether a lesson's questions give it a score that another lesson can depend on. */
export function lessonScored(content: ContentDocument): boolean {
  return autoBlocks(lessonOfContent(content)).some((block) => block.points > 0);
}

/**
 * What stops a lesson going in front of students, as an error code: no
 * words, a question not finished, or a rule for finishing that the lesson
 * cannot meet. Drafts save whatever their state.
 */
export function lessonIssue(lesson: {
  completion: LessonCompletion;
  content: ContentDocument;
  young?: boolean;
}): string | null {
  const document = lessonOfContent(lesson.content);
  if (lessonPlainText(document).trim() === "") return "learning.lesson_empty";
  if (holdsSuggestions(lesson.content)) return "learning.unreviewed";
  // Only a quiz draws questions from the bank, one draw for each attempt.
  if (document.blocks.some((block) => block.type === "draw"))
    return "learning.lesson_incomplete";
  const uncaptioned = mediaOf(lesson.content.root).some(
    (node) =>
      !node.captionsFileId &&
      ((node.mime ?? "").startsWith("video/") || !node.transcript),
  );
  if (uncaptioned) return "learning.captions_required";
  const parsed = v.safeParse(lessonDocumentSchema, document);
  if (!parsed.success) {
    const { message } = parsed.issues[0];
    return message.startsWith("learning.")
      ? message
      : "learning.lesson_incomplete";
  }
  if (
    (lesson.completion === "quiz" || lesson.completion === "score") &&
    autoBlocks(document).length === 0
  )
    return "learning.needs_quiz";
  if (
    lesson.completion === "reflection" &&
    !document.blocks.some((block) => block.type === "written")
  )
    return "learning.needs_reflection";
  if (lesson.completion === "watch" && lessonWatchables(document).length === 0)
    return "learning.needs_media";
  // A young child learns from each answer as they give it.
  if (
    lesson.young &&
    autoBlocks(document).some((block) => feedbackAtOf(block) !== "now")
  )
    return "learning.young_feedback";
  const last = document.blocks.findLastIndex((block) => block.type !== "gate");
  if (document.blocks.slice(last + 1).length > 0)
    return "learning.gate_opens_nothing";
  const [problem] = contentIssues(lesson.content);
  return problem ? `content.${problem}` : null;
}

/** A question saved when it had one hint, with its hints in order. */
function withHints(block: Record<string, unknown>): LessonBlock {
  if (!("hint" in block)) return block as LessonBlock;
  const { hint: _hint, ...rest } = block;
  return Object.assign(rest, { hints: hintsOf(block) }) as LessonBlock;
}

/**
 * A lesson saved before questions had points, hints and feedback, in today's
 * shape: its quizzes become choice questions and its reflections unmarked
 * written answers. Published versions keep whatever shape they had.
 */
export function upgradeLesson(value: unknown): LessonDocument {
  if (isContentDocument(value)) return lessonOfContent(value);
  const document = (value ?? {}) as {
    version?: number;
    blocks?: Record<string, unknown>[];
  };
  if (document.version === 2)
    return { version: 2, blocks: (document.blocks ?? []).map(withHints) };
  const blocks = (document.blocks ?? []).map((block): LessonBlock => {
    switch (block.type) {
      case "quiz": {
        const correct = (block.correctOptionIds as string[] | undefined) ?? [];
        return {
          id: block.id as string,
          type: "choice",
          prompt: (block.question as string | undefined) ?? "",
          points: 1,
          hints: [],
          explanation: (block.explanation as string | undefined) ?? "",
          tries: null,
          options: (
            (block.options as { id: string; text: string }[] | undefined) ?? []
          ).map((option) => ({ ...option, feedback: "" })),
          correctOptionIds: correct,
          multiple: correct.length > 1,
          shuffle: false,
        };
      }
      case "reflection":
        return {
          id: block.id as string,
          type: "written",
          prompt: (block.prompt as string | undefined) ?? "",
          points: 0,
          hints: [],
          explanation: "",
          tries: null,
          wordLimit: null,
        };
      case "media":
        return { transcript: "", ...block } as LessonBlock;
      default:
        return block as LessonBlock;
    }
  });
  return { version: 2, blocks };
}

function gapText(block: GapsBlock): string {
  return block.segments
    .map((segment) => (segment.type === "text" ? segment.text : "___"))
    .join("");
}

export function lessonPlainText(document: LessonDocument): string {
  return document.blocks
    .map((block) => {
      switch (block.type) {
        case "content":
          return contentPlainText(block.content);
        case "media":
          return [block.name, block.caption, block.transcript]
            .filter(Boolean)
            .join("\n");
        case "gate":
        case "draw":
          return "";
        case "gaps":
          return [block.prompt, gapText(block)].join("\n");
        case "highlight":
          return [
            block.prompt,
            block.segments.map((segment) => segment.text).join(""),
          ].join("\n");
        case "labelling":
          return [
            block.prompt,
            ...block.places.map((place) => place.name),
          ].join("\n");
        case "crossword":
          return [
            block.prompt,
            ...block.words.map((word) => `${word.answer}: ${word.clue}`),
          ].join("\n");
        case "wordsearch":
          return [block.prompt, ...block.words.map((word) => word.answer)].join(
            "\n",
          );
        case "matching":
          return [
            block.prompt,
            ...block.pairs.map((pair) => `${pair.prompt}: ${pair.answer}`),
          ].join("\n");
        case "ordering":
          return [block.prompt, ...block.items.map((item) => item.text)].join(
            "\n",
          );
        case "parsons":
          return [block.prompt, ...block.lines.map((line) => line.code)].join(
            "\n",
          );
        case "program":
          return [block.prompt, block.starter].filter(Boolean).join("\n");
        case "sorting":
          return [
            block.prompt,
            ...block.groups.map((group) => group.name),
            ...block.items.map((item) => item.text),
          ].join("\n");
        default:
          return block.prompt;
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Files the lesson shows, with the pictures and files its text embeds. */
export function lessonFileIds(document: LessonDocument): string[] {
  return [
    ...new Set(
      document.blocks.flatMap((block) =>
        block.type === "media"
          ? [
              block.fileId,
              ...(block.captionsFileId ? [block.captionsFileId] : []),
            ]
          : [],
      ),
    ),
  ];
}

export const checkBlocks = (document: LessonDocument): CheckBlock[] =>
  document.blocks.filter(isCheck);
export const autoBlocks = (document: LessonDocument): AutoBlock[] =>
  document.blocks.filter(isAuto);

/** What a student sends for each kind of question. */
export const responseSchema = v.variant("type", [
  v.object({
    type: v.literal("choice"),
    optionIds: v.pipe(
      v.array(id),
      v.minLength(1),
      v.maxLength(MAX_CHOICE_OPTIONS),
    ),
  }),
  v.object({
    type: v.literal("poll"),
    optionIds: v.pipe(
      v.array(id),
      v.minLength(1),
      v.maxLength(MAX_CHOICE_OPTIONS),
    ),
  }),
  v.object({ type: v.literal("text"), text: requiredText(500) }),
  v.object({
    type: v.literal("gaps"),
    answers: v.record(id, text(200)),
  }),
  v.object({ type: v.literal("number"), text: requiredText(60) }),
  v.object({
    type: v.literal("highlight"),
    /** The words the student picked out, by their place in the passage. */
    chosen: v.pipe(
      v.array(v.pipe(v.string(), v.maxLength(20))),
      v.maxLength(400),
    ),
  }),
  v.object({ type: v.literal("math"), latex: requiredText(MAX_LATEX) }),
  v.object({ type: v.literal("matching"), pairs: v.record(id, id) }),
  v.object({
    type: v.literal("ordering"),
    order: v.pipe(v.array(id), v.minLength(2), v.maxLength(MAX_ORDER_ITEMS)),
  }),
  v.object({
    type: v.literal("parsons"),
    /** The lines the student put in the program, in order, with their indents. */
    lines: v.pipe(
      v.array(
        v.object({
          id,
          indent: v.pipe(
            v.number(),
            v.integer(),
            v.minValue(0),
            v.maxValue(MAX_INDENT),
          ),
        }),
      ),
      v.maxLength(MAX_PARSONS_LINES + MAX_PARSONS_DISTRACTORS),
    ),
  }),
  v.object({ type: v.literal("sorting"), groups: v.record(id, id) }),
  v.object({
    type: v.literal("counting"),
    value: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
  }),
  v.object({
    type: v.literal("wordsearch"),
    /** Each stretch of squares the student marked: from row and column, to row and column. */
    found: v.pipe(
      v.array(
        v.tuple([
          v.pipe(
            v.number(),
            v.integer(),
            v.minValue(0),
            v.maxValue(MAX_SEARCH_SIZE),
          ),
          v.pipe(
            v.number(),
            v.integer(),
            v.minValue(0),
            v.maxValue(MAX_SEARCH_SIZE),
          ),
          v.pipe(
            v.number(),
            v.integer(),
            v.minValue(0),
            v.maxValue(MAX_SEARCH_SIZE),
          ),
          v.pipe(
            v.number(),
            v.integer(),
            v.minValue(0),
            v.maxValue(MAX_SEARCH_SIZE),
          ),
        ]),
      ),
      v.maxLength(MAX_SEARCH_WORDS),
    ),
  }),
  v.object({
    type: v.literal("crossword"),
    /** The letter in each square, by its row and column. */
    squares: v.record(
      v.pipe(v.string(), v.regex(/^\d{1,2}-\d{1,2}$/u)),
      v.pipe(v.string(), v.maxLength(4)),
    ),
  }),
  v.object({
    type: v.literal("labelling"),
    /** The label put on each place, by the place's number. */
    labels: v.record(
      v.pipe(v.string(), v.regex(/^[1-9]\d?$/u)),
      text(MAX_PLACE_NAME),
    ),
  }),
  v.object({
    type: v.literal("hotspot"),
    /** Where the child tapped, across the picture: every find, and a miss last. */
    taps: v.pipe(v.array(v.tuple([unit, unit])), v.maxLength(MAX_HOTSPOTS + 1)),
  }),
  v.object({
    type: v.literal("spelling"),
    tiles: v.pipe(v.array(text(8)), v.maxLength(MAX_TILES)),
  }),
  v.object({
    type: v.literal("tracing"),
    strokes: v.pipe(
      v.array(
        v.pipe(
          v.array(v.pipe(v.number(), v.minValue(-1), v.maxValue(2))),
          v.maxLength(MAX_STROKE_POINTS * 2),
        ),
      ),
      v.maxLength(MAX_STROKES * 2),
    ),
  }),
  v.pipe(
    v.object({
      type: v.literal("written"),
      text: text(20000),
      /** A spoken answer: the student's recording and how long it runs. */
      recording: v.optional(
        v.object({
          fileId: id,
          seconds: v.pipe(v.number(), v.minValue(0), v.maxValue(200)),
          /** Recorded on camera, or of the student's screen. */
          video: v.optional(v.boolean()),
        }),
      ),
      /** A drawn or photographed answer, as the student's own picture. */
      picture: v.optional(v.object({ fileId: id })),
    }),
    v.check(
      (answer) =>
        answer.text !== "" ||
        answer.recording !== undefined ||
        answer.picture !== undefined,
      "learning.response",
    ),
  ),
  v.object({
    type: v.literal("scratch"),
    /** The student's project as they last saved it, an .sb3. */
    project: v.object({ fileId: id }),
    /** The stage at that save, for the teacher's view of the class. */
    thumbnail: v.optional(v.object({ fileId: id })),
    /**
     * The classmate whose project in the gallery this one began from. A
     * student's studio says so as it saves, and the server keeps it only
     * where that classmate's project is in the gallery or the student's
     * last save already said the same.
     */
    remixOf: v.optional(id),
    /**
     * What the project was found to have, of all a question can ask for,
     * and what in it is worth a second look. The server reads the saved
     * project for both; whatever a student sends here is replaced.
     */
    has: v.optional(scratchChecksSchema),
    notes: v.optional(scratchNotesSchema),
  }),
  v.object({
    type: v.literal("project"),
    /** The student's files as they handed them in. */
    files: projectFilesSchema,
    /**
     * The classmate whose project in the gallery this one began from, which
     * the server adds as it takes the answer: whatever a student sends here
     * is replaced.
     */
    remixOf: v.optional(id),
  }),
  /** The program the student built, as what its blocks do. */
  v.object({ type: v.literal("puzzle"), program: programSchema }),
  v.object({
    type: v.literal("program"),
    code: v.pipe(v.string(), v.maxLength(MAX_PROGRAM_CHARS)),
    /**
     * How each test went, which the server adds as it marks: whatever a
     * student sends here is replaced.
     */
    results: v.optional(
      v.record(
        id,
        v.object({
          passed: v.boolean(),
          /** What it printed; kept for tests the student can see. */
          output: v.nullable(v.pipe(v.string(), v.maxLength(4000))),
          /** The error it stopped with, as Python names it. */
          error: v.nullable(v.pipe(v.string(), v.maxLength(500))),
          /** Stopped for taking too long or printing too much. */
          stopped: v.nullable(v.picklist(["time", "output"])),
        }),
      ),
    ),
  }),
]);
export type LessonResponse = v.InferOutput<typeof responseSchema>;
export type ProgramResult = NonNullable<
  Extract<LessonResponse, { type: "program" }>["results"]
>[string];

/**
 * Whether a program printed what a test expects: line by line, ignoring
 * spaces at the ends of lines and blank lines at the end, which nobody
 * reading the output can see.
 */
export function outputMatches(expected: string, printed: string): boolean {
  return seenOutput(expected) === seenOutput(printed);
}

function seenOutput(output: string): string {
  const kept = output
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  while (kept.at(-1) === "") kept.pop();
  return kept.join("\n");
}

/**
 * An answer with nothing in it that a student's word alone never settles:
 * whose project it was built on, and what a coding project has.
 */
export function ownResponse(response: LessonResponse): LessonResponse {
  if (response.type === "scratch") {
    const { remixOf: _claimed, has: _found, notes: _seen, ...own } = response;
    return own;
  }
  if (response.type !== "project") return response;
  const { remixOf: _claimed, ...own } = response;
  return own;
}

/** The files an answer is made of; each must be the student's own upload. */
export function responseFiles(response: LessonResponse): string[] {
  const ids =
    response.type === "written"
      ? [response.recording?.fileId, response.picture?.fileId]
      : response.type === "scratch"
        ? [response.project.fileId, response.thumbnail?.fileId]
        : [];
  return ids.filter((fileId) => fileId !== undefined);
}

export type { MathNote } from "./math-marking";

export interface Marked {
  /** From 0 to 1; partial credit where the question allows it. */
  fraction: number;
  correct: boolean;
  /** The feedback of each option the student chose. */
  feedback: string[];
  /** Per blank, pair or item, whether it was right. */
  parts: Record<string, boolean>;
  note?: MathNote;
}

const round = (value: number) => Math.round(value * 10000) / 10000;

/**
 * Marks an answer to a question the server can mark. A multiple-answer
 * question gives credit per right choice and takes it back per wrong one,
 * never below nothing, as Canvas does.
 */
/** The boxes of a picture's places that are to be found. */
export function placesToFind(
  places: readonly {
    box: readonly [number, number, number, number];
    correct: boolean;
  }[],
): [number, number, number, number][] {
  return places.filter((place) => place.correct).map((place) => [...place.box]);
}

/** Whether a tap lands on a marked place, or near enough for a small finger. */
export function regionHit(
  [left, top, width, height]: readonly [number, number, number, number],
  [x, y]: readonly [number, number],
): boolean {
  return (
    x >= left - HOTSPOT_SLACK &&
    x <= left + width + HOTSPOT_SLACK &&
    y >= top - HOTSPOT_SLACK &&
    y <= top + height + HOTSPOT_SLACK
  );
}

export function markResponse(
  block: AutoBlock,
  response: LessonResponse,
): Marked {
  const none: Marked = { fraction: 0, correct: false, feedback: [], parts: {} };
  const share = (results: Record<string, boolean>): Marked => {
    const values = Object.values(results);
    const hits = values.filter(Boolean).length;
    return {
      ...none,
      fraction: round(hits / values.length),
      correct: hits === values.length,
      parts: results,
    };
  };
  switch (block.type) {
    case "choice": {
      if (response.type !== "choice") return none;
      const chosen = new Set(response.optionIds);
      const right = new Set(block.correctOptionIds);
      const feedback = block.options
        .filter((option) => chosen.has(option.id) && option.feedback)
        .map((option) => option.feedback);
      const exact =
        chosen.size === right.size &&
        [...chosen].every((one) => right.has(one));
      if (!block.multiple)
        return { ...none, fraction: exact ? 1 : 0, correct: exact, feedback };
      const hits = [...chosen].filter((one) => right.has(one)).length;
      const misses = chosen.size - hits;
      return {
        ...none,
        fraction: round(Math.max(0, (hits - misses) / right.size)),
        correct: exact,
        feedback,
      };
    }
    case "poll": {
      if (response.type !== "poll") return none;
      // Any answer to a poll settles it, and its points are none.
      const chosen = new Set(response.optionIds);
      return {
        ...none,
        fraction: 1,
        correct: true,
        feedback: block.options
          .filter((option) => chosen.has(option.id) && option.feedback)
          .map((option) => option.feedback),
      };
    }
    case "text": {
      if (response.type !== "text") return none;
      const correct = matchAnswer(response.text, block.answers, block) !== null;
      return { ...none, fraction: correct ? 1 : 0, correct };
    }
    case "math": {
      if (response.type !== "math") return none;
      const { correct, note } = markMath(block, response.latex);
      return {
        ...none,
        fraction: correct ? 1 : 0,
        correct,
        ...(note ? { note } : {}),
      };
    }
    case "gaps": {
      if (response.type !== "gaps") return none;
      const gaps = block.segments.filter((segment) => segment.type === "gap");
      const results = Object.fromEntries(
        gaps.map((gap) => {
          const typed = response.answers[gap.id] ?? "";
          const right =
            gap.options.length > 0
              ? gap.answers.includes(typed)
              : matchAnswer(typed, gap.answers, block) !== null;
          return [gap.id, right];
        }),
      );
      return share(results);
    }
    case "highlight": {
      if (response.type !== "highlight") return none;
      // Each word found earns its share, and each picked wrongly takes one
      // back, so picking every word earns nothing.
      const tokens = highlightTokens(block).filter((token) => token.word);
      const targets = tokens.filter((token) => token.target);
      const chosen = new Set(response.chosen);
      const parts = Object.fromEntries(
        tokens
          .filter((token) => chosen.has(token.id))
          .map((token) => [token.id, token.target]),
      );
      const found = targets.filter((token) => chosen.has(token.id)).length;
      const wrong = Object.values(parts).filter((right) => !right).length;
      const fraction = Math.max(0, (found - wrong) / targets.length);
      return {
        ...none,
        fraction,
        correct: found === targets.length && wrong === 0,
        parts,
      };
    }
    case "number": {
      if (response.type !== "number") return none;
      const given = parseNumber(response.text);
      if (given === null) return none;
      const correct =
        block.mode === "range"
          ? given >= block.min && given <= block.max
          : Math.abs(given - block.value) <=
            (block.percent
              ? (Math.abs(block.value) * block.tolerance) / 100
              : block.tolerance) +
              1e-9;
      return { ...none, fraction: correct ? 1 : 0, correct };
    }
    case "matching": {
      if (response.type !== "matching") return none;
      // Compared by text, so two prompts sharing an answer accept either copy.
      const texts = new Map([
        ...block.pairs.map((pair) => [pair.id, pair.answer] as const),
        ...block.distractors.map((other) => [other.id, other.text] as const),
      ]);
      return share(
        Object.fromEntries(
          block.pairs.map((pair) => {
            const chosen = response.pairs[pair.id];
            return [
              pair.id,
              chosen !== undefined && texts.get(chosen) === pair.answer,
            ];
          }),
        ),
      );
    }
    case "ordering": {
      if (response.type !== "ordering") return none;
      const expected = block.items.map((item) => item.id);
      const { order } = response;
      if (
        order.length !== expected.length ||
        new Set(order).size !== order.length ||
        !order.every((itemId) => expected.includes(itemId))
      )
        return none;
      const parts = Object.fromEntries(
        order.map((itemId, index) => [itemId, expected[index] === itemId]),
      );
      const exact = Object.values(parts).every(Boolean);
      if (block.scoring === "all")
        return { ...none, fraction: exact ? 1 : 0, correct: exact, parts };
      let neighbours = 0;
      for (let index = 0; index < order.length - 1; index++)
        if (
          expected.indexOf(order[index + 1] ?? "") ===
          expected.indexOf(order[index] ?? "") + 1
        )
          neighbours++;
      return {
        ...none,
        fraction: round(neighbours / (order.length - 1)),
        correct: exact,
        parts,
      };
    }
    case "parsons": {
      if (response.type !== "parsons") return none;
      const codeOf = new Map(
        [...block.lines, ...block.distractors].map((line) => [
          line.id,
          line.code.trim(),
        ]),
      );
      const given = response.lines;
      if (
        given.some((line) => !codeOf.has(line.id)) ||
        new Set(given.map((line) => line.id)).size !== given.length
      )
        return none;
      // Lines are compared by their words, so two alike (a closing brace)
      // may go either way round.
      const right = (index: number) => {
        const line = given[index];
        const wanted = block.lines[index];
        return Boolean(
          line &&
          wanted &&
          codeOf.get(line.id) === wanted.code.trim() &&
          (block.language !== "python" || line.indent === wanted.indent),
        );
      };
      const parts = Object.fromEntries(
        given.map((line, index) => [line.id, right(index)]),
      );
      const correct =
        given.length === block.lines.length && given.every((_, i) => right(i));
      return { ...none, fraction: correct ? 1 : 0, correct, parts };
    }
    case "program": {
      if (response.type !== "program" || !response.results) return none;
      const { results } = response;
      return share(
        Object.fromEntries(
          block.tests.map((test) => [
            test.id,
            results[test.id]?.passed ?? false,
          ]),
        ),
      );
    }
    case "puzzle": {
      if (response.type !== "puzzle") return none;
      // Run here as it ran for the student, so no browser's word is taken.
      const correct = solves(block.level, response.program);
      return { ...none, fraction: correct ? 1 : 0, correct };
    }
    case "hotspot": {
      if (response.type !== "hotspot") return none;
      const finds = placesToFind(block.places);
      const results = Object.fromEntries(
        finds.map((region, index) => [
          `region-${index + 1}`,
          response.taps.some((tap) => regionHit(region, tap)),
        ]),
      );
      const marked = share(results);
      // A tap that finds nothing, or another place, is a miss, even once
      // every place is found.
      return response.taps.every((tap) =>
        finds.some((region) => regionHit(region, tap)),
      )
        ? marked
        : { ...marked, correct: false };
    }
    case "labelling": {
      if (response.type !== "labelling") return none;
      return share(
        Object.fromEntries(
          block.places.map((place, index) => [
            placeNumber(index),
            response.labels[placeNumber(index)] === place.name,
          ]),
        ),
      );
    }
    case "crossword": {
      if (response.type !== "crossword") return none;
      const layout = crosswordLayout(block.words);
      if (!layout) return none;
      return share(
        Object.fromEntries(
          layout.entries.map((entry) => {
            const letters = crosswordLetters(
              block.words.find((word) => word.id === entry.id)?.answer ?? "",
            );
            return [
              entry.id,
              squaresOf(entry).every(
                (key, index) =>
                  crosswordLetters(response.squares[key] ?? "")[0] ===
                  letters[index],
              ),
            ];
          }),
        ),
      );
    }
    case "wordsearch": {
      if (response.type !== "wordsearch") return none;
      const search = wordSearch(block.words, block.id);
      if (!search) return none;
      return share(
        Object.fromEntries(
          block.words.map((word) => [
            word.id,
            response.found.some((stretch) =>
              spells(search.rows, stretch, word.answer),
            ),
          ]),
        ),
      );
    }
    case "spelling": {
      if (response.type !== "spelling") return none;
      const results = Object.fromEntries(
        block.tiles.map((tile, index) => [
          `slot-${index + 1}`,
          response.tiles[index] === tile,
        ]),
      );
      const marked = share(results);
      // A tile too many is a wrong word, even with every place right.
      return response.tiles.length === block.tiles.length
        ? marked
        : { ...marked, correct: false };
    }
    case "tracing": {
      if (response.type !== "tracing") return none;
      return share(traceResults(block.strokes, response.strokes));
    }
    case "counting": {
      if (response.type !== "counting") return none;
      const correct = response.value === block.count;
      return { ...none, fraction: correct ? 1 : 0, correct };
    }
    case "sorting": {
      if (response.type !== "sorting") return none;
      return share(
        Object.fromEntries(
          block.items.map((item) => [
            item.id,
            response.groups[item.id] === item.groupId,
          ]),
        ),
      );
    }
  }
  return none;
}

/** Where a student stands on one question, from their tries so far. */
export interface CheckState {
  tries: number;
  fraction: number;
  correct: boolean;
  /** They asked to see the answer, or ran out of tries. */
  revealed: boolean;
  /** For an answer its teacher marks: marked, and with what feedback. */
  marked: boolean;
  firstTryCorrect: boolean;
  /** Its feedback waited, so it was answered in one go however often it changed. */
  once: boolean;
  /** Hints the student asked for, before or between tries. */
  hints: number;
  /** How a question missed at first went when asked again at the end. */
  review: number | null;
}

/**
 * Whether a question is settled: answered right or revealed, or, for one
 * its teacher marks or one whose feedback waits, answered.
 */
export const settled = (block: CheckBlock, state: CheckState | undefined) =>
  state !== undefined &&
  (isTeacherMarked(block) || feedbackAtOf(block) !== "now"
    ? state.tries > 0
    : state.correct || state.revealed);

/**
 * Credit for a question: its best try, less a share for each extra try and
 * each hint asked for, as a wrong try would have cost; nothing once revealed.
 */
export function creditOf(state: CheckState | undefined): number {
  if (!state || state.tries === 0) return 0;
  if (state.revealed && !state.correct) return 0;
  return Math.max(
    0,
    state.fraction - TRY_PENALTY * (state.tries - 1 + state.hints),
  );
}

/**
 * A lesson's score from its auto-marked questions, weighted by points, or
 * null when it has none that count.
 */
export function lessonScore(
  document: LessonDocument,
  states: Record<string, CheckState>,
): number | null {
  const counted = autoBlocks(document).filter((block) => block.points > 0);
  const total = counted.reduce((sum, block) => sum + block.points, 0);
  if (total === 0) return null;
  const earned = counted.reduce(
    (sum, block) => sum + block.points * creditOf(states[block.id]),
    0,
  );
  return Math.round((earned / total) * 100);
}

/**
 * Whether a student's work finishes a lesson on its own. "Mark" needs the
 * student to say so; "view" is finished by opening it.
 */
export function completionMet(
  lesson: { completion: LessonCompletion; passScore: number | null },
  document: LessonDocument,
  states: Record<string, CheckState>,
  watched: Record<string, Watched> = {},
): boolean {
  const auto = autoBlocks(document);
  const written = document.blocks.filter(
    (block): block is WrittenBlock => block.type === "written",
  );
  switch (lesson.completion) {
    case "view":
      return true;
    case "mark":
      return false;
    case "quiz":
      return auto.every((block) => settled(block, states[block.id]));
    case "score":
      return (
        auto.every((block) => settled(block, states[block.id])) &&
        (lessonScore(document, states) ?? 0) >= (lesson.passScore ?? 100)
      );
    case "reflection":
      return written.every((block) => settled(block, states[block.id]));
    case "watch":
      return lessonWatchables(document).every((video) =>
        watchedEnough(watched[video]),
      );
  }
  return false;
}

/**
 * A lesson shown only to the students whose best score in an earlier lesson
 * of its module is at least `atLeast`, below `below`, or between the two.
 */
export interface LessonCondition {
  lessonId: string;
  atLeast: number | null;
  below: number | null;
}

/** A student's finish and best score in one lesson. */
export interface LessonResult {
  completed: boolean;
  score: number | null;
}

/**
 * Whether a lesson is on a student's path through its module, off it, or
 * waiting on the lesson its condition depends on.
 */
export type PathState = "on" | "off" | "pending";

/** Whether a score meets a condition; a lesson finished without one meets every condition. */
export function meetsCondition(
  condition: Pick<LessonCondition, "atLeast" | "below">,
  score: number | null,
): boolean {
  if (score === null) return true;
  return (
    (condition.atLeast === null || score >= condition.atLeast) &&
    (condition.below === null || score < condition.below)
  );
}

/**
 * Where each of a module's lessons stands on one student's path, as Canvas
 * mastery paths route by score. A lesson with a condition is on the path
 * once the lesson it depends on is finished with a score in range, off when
 * the score is out of range or that lesson is off the path itself, and
 * pending until then. A lesson the student has finished stays on their
 * path, so a better score later never hides work they did; a condition on
 * a lesson the module no longer has is void.
 */
export function pathOf(
  lessons: readonly { id: string; condition: LessonCondition | null }[],
  results: ReadonlyMap<string, LessonResult>,
): Map<string, PathState> {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const states = new Map<string, PathState>();
  const resolve = (lessonId: string, depth: number): PathState => {
    const known = states.get(lessonId);
    if (known) return known;
    const condition = byId.get(lessonId)?.condition;
    let state: PathState = "on";
    if (
      condition &&
      !results.get(lessonId)?.completed &&
      byId.has(condition.lessonId) &&
      depth < byId.size
    ) {
      const before = resolve(condition.lessonId, depth + 1);
      const result = results.get(condition.lessonId);
      state =
        before === "on" && result?.completed
          ? meetsCondition(condition, result.score)
            ? "on"
            : "off"
          : before === "off"
            ? "off"
            : "pending";
    }
    states.set(lessonId, state);
    return state;
  };
  for (const lesson of lessons) resolve(lesson.id, 0);
  return states;
}

/**
 * How far a student is through a module along their own path: the lessons
 * on it, how many they have finished, and the mean of their best scores in
 * those that are scored, or null when none is.
 */
export function moduleStanding(
  lessons: readonly { id: string; condition: LessonCondition | null }[],
  results: ReadonlyMap<string, LessonResult>,
) {
  const path = pathOf(lessons, results);
  const on = lessons.filter((lesson) => path.get(lesson.id) === "on");
  const completed = on.filter(
    (lesson) => results.get(lesson.id)?.completed,
  ).length;
  const scores = on.flatMap((lesson) => {
    const score = results.get(lesson.id)?.score;
    return score === null || score === undefined ? [] : [score];
  });
  return {
    lessons: on.length,
    completed,
    finished: on.length > 0 && completed === on.length,
    score:
      scores.length === 0
        ? null
        : Math.round(
            scores.reduce((sum, score) => sum + score, 0) / scores.length,
          ),
  };
}

/** Whether a student has met a module's prerequisite: finished it, at the score it asks for. */
export function prerequisiteMet(
  standing: { finished: boolean; score: number | null },
  minimum: number | null,
): boolean {
  return (
    standing.finished &&
    (minimum === null || standing.score === null || standing.score >= minimum)
  );
}

/** A part as a student sees it: its words, its picture, or both. */
export interface StudentPart {
  id: string;
  text: string;
  picture?: Picture | null;
  narration?: string | null;
}

/**
 * A block as its student receives it: keys, hints, explanations and option
 * feedback stay on the server until a try calls for them.
 */
export type StudentBlock =
  | Exclude<LessonBlock, CheckBlock>
  | Omit<WrittenBlock, "explanation" | "hints">
  | Omit<ScratchBlock, "explanation" | "hints">
  | Omit<ProjectBlock, "explanation" | "hints">
  | (Omit<
      ChoiceBlock,
      "correctOptionIds" | "explanation" | "hints" | "options"
    > & {
      options: StudentPart[];
    })
  | (Omit<PollBlock, "explanation" | "hints" | "options"> & {
      options: StudentPart[];
    })
  | Omit<TextBlock, "answers" | "explanation" | "hints">
  | Omit<MathBlock, "answers" | "explanation" | "hints" | "tolerance">
  | (Omit<GapsBlock, "explanation" | "hints" | "segments" | "bank"> & {
      segments: (
        | { type: "text"; text: string }
        | { type: "gap"; id: string; options: string[] }
      )[];
      /** A word bank's words, every gap's answer and the extra ones, shuffled together. */
      bank?: string[];
    })
  | (Pick<
      HighlightBlock,
      | "id"
      | "type"
      | "prompt"
      | "narration"
      | "narrationWords"
      | "points"
      | "tries"
      | "videoAt"
    > & {
      /** The passage's words and the spaces between, none saying whether it is to be found. */
      tokens: { id: string; text: string; word: boolean }[];
    })
  | Pick<
      NumberBlock,
      | "id"
      | "type"
      | "prompt"
      | "narration"
      | "narrationWords"
      | "points"
      | "tries"
      | "videoAt"
      | "line"
    >
  | (Omit<MatchingBlock, "distractors" | "explanation" | "hints" | "pairs"> & {
      prompts: StudentPart[];
      choices: StudentPart[];
    })
  | Omit<OrderingBlock, "explanation" | "hints">
  | (Omit<ParsonsBlock, "explanation" | "hints" | "lines" | "distractors"> & {
      /** The program's lines and the ones that belong nowhere, shuffled together. */
      lines: { id: string; code: string }[];
    })
  | (Omit<SortingBlock, "explanation" | "hints" | "items"> & {
      items: StudentPart[];
    })
  | Omit<CountingBlock, "explanation" | "hints">
  | Omit<TracingBlock, "explanation" | "hints">
  | Omit<HotspotBlock, "explanation" | "hints">
  | (Omit<WordSearchBlock, "explanation" | "hints"> & {
      /** The grid's letters, row by row; where each word is, the student finds. */
      rows: string[][];
      /** Whether rows read from the right, as Arabic words do. */
      rtl: boolean;
    })
  | (Omit<CrosswordBlock, "explanation" | "hints" | "words"> & {
      width: number;
      height: number;
      /** Each word's place and clue, with nothing of its letters but how many. */
      entries: (CrosswordEntry & { clue: string })[];
      /** Whether words across read from the right, as Arabic ones do. */
      rtl: boolean;
    })
  | (Omit<LabellingBlock, "explanation" | "hints" | "places" | "extras"> & {
      /** Each place's box, numbered in order, with nothing of its label. */
      spots: [number, number, number, number][];
      /** Every label, the places' own and the extra ones, shuffled together. */
      bank: string[];
    })
  | (Omit<SpellingBlock, "explanation" | "hints" | "tiles" | "extras"> & {
      /** Every tile, the word's and the extra ones, in one shuffled pile. */
      pile: { id: string; text: string }[];
      /** How many places the word takes. */
      places: number;
    })
  | (Omit<ProgramBlock, "explanation" | "hints" | "tests"> & {
      /** The tests a student can see, with what each gives and expects. */
      tests: { id: string; input: string; expected: string }[];
      /** The tests run but never shown, by id. */
      hiddenTests: string[];
    })
  | (Omit<PuzzleBlock, "explanation" | "hints" | "level"> & {
      level: StudentLevel;
    });

export function shuffled<T>(items: T[], seed: string): T[] {
  const random = seededRandom(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

/**
 * A lesson as its student may see it before answering. Options that shuffle
 * keep one order per student, so a reload never reshuffles an answer.
 */
export function studentBlocks(
  document: LessonDocument,
  seed: string,
): StudentBlock[] {
  return document.blocks.map((block): StudentBlock => {
    switch (block.type) {
      case "choice": {
        const {
          correctOptionIds: _key,
          explanation: _why,
          hints: _hints,
          ...rest
        } = block;
        const options = block.options.map(
          ({
            id: optionId,
            text: label,
            picture: shown,
            narration: voice,
          }) => ({
            id: optionId,
            text: label,
            picture: shown ?? null,
            narration: voice ?? null,
          }),
        );
        return {
          ...rest,
          options: block.shuffle
            ? shuffled(options, `${seed}:${block.id}`)
            : options,
        };
      }
      case "poll": {
        const { explanation: _why, hints: _hints, ...rest } = block;
        // A poll's options keep their order, as a scale from agree to disagree must.
        return {
          ...rest,
          options: block.options.map((option) => ({
            id: option.id,
            text: option.text,
            picture: option.picture ?? null,
            narration: option.narration ?? null,
          })),
        };
      }
      case "text": {
        const {
          answers: _answers,
          explanation: _why,
          hints: _hints,
          ...rest
        } = block;
        return rest;
      }
      case "math": {
        const {
          answers: _answers,
          explanation: _why,
          hints: _hints,
          tolerance: _tolerance,
          form: _form,
          units: _units,
          ...rest
        } = block;
        return rest;
      }
      case "gaps": {
        const { explanation: _why, hints: _hints, bank, ...rest } = block;
        const words = bank
          ? [
              ...new Set([
                ...block.segments.flatMap((segment) =>
                  segment.type === "gap" ? (segment.answers[0] ?? []) : [],
                ),
                ...bank,
              ]),
            ]
          : null;
        return {
          ...rest,
          ...(words
            ? { bank: shuffled(words, `${seed}:${block.id}:bank`) }
            : {}),
          segments: block.segments.map((segment) =>
            segment.type === "text"
              ? segment
              : {
                  type: "gap" as const,
                  id: segment.id,
                  options: shuffled(segment.options, `${seed}:${segment.id}`),
                },
          ),
        };
      }
      case "highlight":
        return {
          id: block.id,
          type: block.type,
          prompt: block.prompt,
          narration: block.narration ?? null,
          narrationWords: block.narrationWords ?? null,
          points: block.points,
          tries: block.tries,
          ...(typeof block.videoAt === "number"
            ? { videoAt: block.videoAt }
            : {}),
          tokens: highlightTokens(block).map(
            ({ target: _target, ...token }) => token,
          ),
        };
      case "number":
        return {
          id: block.id,
          type: block.type,
          prompt: block.prompt,
          narration: block.narration ?? null,
          narrationWords: block.narrationWords ?? null,
          points: block.points,
          tries: block.tries,
          ...(typeof block.videoAt === "number"
            ? { videoAt: block.videoAt }
            : {}),
          ...(block.line ? { line: block.line } : {}),
        };
      case "matching": {
        const {
          pairs,
          distractors,
          explanation: _why,
          hints: _hints,
          ...rest
        } = block;
        // One choice per distinct answer, so a repeated answer is not a clue.
        const seen = new Set<string>();
        const choices: StudentPart[] = [
          ...pairs.map((pair) => ({
            id: pair.id,
            text: pair.answer,
            picture: pair.answerPicture ?? null,
            narration: pair.answerNarration ?? null,
          })),
          ...distractors.map((extra) => ({
            id: extra.id,
            text: extra.text,
            picture: extra.picture ?? null,
            narration: extra.narration ?? null,
          })),
        ].filter((choice) => {
          const same = `${choice.text}\n${choice.picture?.fileId ?? ""}`;
          if (seen.has(same)) return false;
          seen.add(same);
          return true;
        });
        return {
          ...rest,
          prompts: pairs.map((pair) => ({
            id: pair.id,
            text: pair.prompt,
            picture: pair.promptPicture ?? null,
            narration: pair.promptNarration ?? null,
          })),
          choices: shuffled(choices, `${seed}:${block.id}`),
        };
      }
      case "ordering": {
        const { explanation: _why, hints: _hints, ...rest } = block;
        let items = shuffled(block.items, `${seed}:${block.id}`);
        // A shuffle that lands on the answer would hand it over; turn it once.
        if (items.every((item, index) => item.id === block.items[index]?.id))
          items = [...items.slice(1), ...items.slice(0, 1)];
        return { ...rest, items };
      }
      case "parsons": {
        const {
          explanation: _why,
          hints: _hints,
          lines,
          distractors,
          ...rest
        } = block;
        const all = [...lines, ...distractors].map((line) => ({
          id: line.id,
          code: line.code.trim(),
        }));
        let shown = shuffled(all, `${seed}:${block.id}`);
        // A shuffle that lands on the program would hand it over; turn it once.
        if (shown.every((line, index) => line.id === all[index]?.id))
          shown = [...shown.slice(1), ...shown.slice(0, 1)];
        return { ...rest, lines: shown };
      }
      case "sorting": {
        const { explanation: _why, hints: _hints, items, ...rest } = block;
        return {
          ...rest,
          items: shuffled(
            items.map((item) => ({
              id: item.id,
              text: item.text,
              picture: item.picture ?? null,
              narration: item.narration ?? null,
            })),
            `${seed}:${block.id}`,
          ),
        };
      }
      case "spelling": {
        const {
          tiles,
          extras,
          explanation: _why,
          hints: _hints,
          ...rest
        } = block;
        return {
          ...rest,
          places: tiles.length,
          pile: shuffled(
            [...tiles, ...extras].map((letters, index) => ({
              id: `tile-${index}`,
              text: letters,
            })),
            `${seed}:${block.id}`,
          ),
        };
      }
      // A hotspot's places travel with it, as a tracing's model does, so a
      // find is judged under the finger and only a miss or the last find
      // counts as a try.
      case "program": {
        const { explanation: _why, hints: _hints, tests, ...rest } = block;
        return {
          ...rest,
          tests: tests
            .filter((test) => !test.hidden)
            .map(({ id: testId, input, expected }) => ({
              id: testId,
              input,
              expected,
            })),
          hiddenTests: tests
            .filter((test) => test.hidden)
            .map((test) => test.id),
        };
      }
      case "puzzle": {
        const { explanation: _why, hints: _hints, level, ...rest } = block;
        const { solution, ...given } = level;
        const puzzle: StudentLevel = {
          ...given,
          ideal: solution.length > 0 ? countBlocks(solution) : null,
        };
        return { ...rest, level: puzzle };
      }
      case "written":
      case "scratch":
      case "project":
      case "counting":
      case "tracing":
      case "hotspot": {
        const { explanation: _why, hints: _hints, ...rest } = block;
        return rest;
      }
      case "wordsearch": {
        const { explanation: _why, hints: _hints, ...rest } = block;
        return {
          ...rest,
          rows: wordSearch(block.words, block.id)?.rows ?? [],
          rtl:
            textDirection(block.words.map((word) => word.answer).join(" ")) ===
            "rtl",
        };
      }
      case "crossword": {
        const { explanation: _why, hints: _hints, words, ...rest } = block;
        const layout = crosswordLayout(words);
        return {
          ...rest,
          width: layout?.width ?? 0,
          height: layout?.height ?? 0,
          entries: (layout?.entries ?? []).map((entry) => ({
            ...entry,
            clue: words.find((word) => word.id === entry.id)?.clue ?? "",
          })),
          rtl:
            textDirection(words.map((word) => word.answer).join(" ")) === "rtl",
        };
      }
      case "labelling": {
        const {
          explanation: _why,
          hints: _hints,
          places,
          extras,
          ...rest
        } = block;
        return {
          ...rest,
          spots: places.map((place) => place.box),
          bank: shuffled(
            [...places.map((place) => place.name), ...extras],
            `${seed}:${block.id}`,
          ),
        };
      }
      default:
        return block;
    }
  });
}

/**
 * A puzzle's program in words: a row of arrows as its arrows, a program of
 * blocks as the Python it comes to.
 */
export function puzzleKey(level: {
  style: StudentLevel["style"];
  solution: v.InferOutput<typeof programSchema>;
}): string[] {
  if (level.style === "blocks") return pythonOf(level.solution);
  const arrows = level.solution.flatMap((step) =>
    step.op === "go" ? [ARROWS[step.to]] : [],
  );
  return arrows.length > 0 ? [arrows.join(" ")] : [];
}

/** A labelled place's key in answers and marks: its number, from 1, as the student sees it. */
export const placeNumber = (index: number) => String(index + 1);

/**
 * A highlight question's passage as the words a student taps: each word of
 * the plain text, each word to find whole, and the spaces between, the
 * words numbered alike so none gives itself away.
 */
export function highlightTokens(
  block: Pick<HighlightBlock, "segments">,
): { id: string; text: string; word: boolean; target: boolean }[] {
  const tokens: { id: string; text: string; word: boolean; target: boolean }[] =
    [];
  let words = 0;
  for (const segment of block.segments) {
    if (segment.type === "target") {
      words += 1;
      tokens.push({
        id: `w${words}`,
        text: segment.text,
        word: true,
        target: true,
      });
      continue;
    }
    for (const part of segment.text.split(/(\s+)/u)) {
      if (!part) continue;
      if (/^\s+$/u.test(part)) {
        tokens.push({
          id: `s${tokens.length}`,
          text: part,
          word: false,
          target: false,
        });
        continue;
      }
      words += 1;
      tokens.push({ id: `w${words}`, text: part, word: true, target: false });
    }
  }
  return tokens;
}

/** The answer to show once a question is settled. */
export function answerKey(block: AutoBlock): string[] {
  switch (block.type) {
    case "choice":
      return block.correctOptionIds;
    case "text":
      return block.answers.slice(0, 1);
    case "math":
      return block.answers.slice(0, 1).map((latex) => mathText({ latex }));
    case "gaps":
      return block.segments.flatMap((segment) =>
        segment.type === "gap" ? [segment.answers[0] ?? ""] : [],
      );
    case "highlight":
      return block.segments.flatMap((segment) =>
        segment.type === "target" ? [segment.text] : [],
      );
    case "number":
      return [
        block.mode === "range"
          ? `${block.min} – ${block.max}`
          : block.tolerance > 0
            ? `${block.value} ± ${block.tolerance}${block.percent ? "%" : ""}`
            : String(block.value),
      ];
    case "matching":
      return block.pairs.map(
        (pair) =>
          `${partName({ text: pair.prompt, picture: pair.promptPicture })}: ${partName({ text: pair.answer, picture: pair.answerPicture })}`,
      );
    case "ordering":
      return block.items.map(partName);
    case "parsons":
      return block.lines.map(
        (line) => `${"    ".repeat(line.indent)}${line.code.trim()}`,
      );
    case "counting":
      return [String(block.count)];
    case "tracing":
      return [block.prompt];
    case "spelling":
      return [block.tiles.join("")];
    case "hotspot":
      return [block.picture?.alt || block.prompt];
    case "labelling":
      return block.places.map(
        (place, index) => `${placeNumber(index)} ${place.name}`,
      );
    case "wordsearch":
      return block.words.map((word) => word.answer);
    case "crossword":
      return (crosswordLayout(block.words)?.entries ?? []).map(
        (entry) =>
          `${entry.number} ${crosswordLetters(block.words.find((word) => word.id === entry.id)?.answer ?? "").join("")}`,
      );
    case "sorting":
      return block.items.map(
        (item) =>
          `${partName(item)}: ${block.groups.find((group) => group.id === item.groupId)?.name ?? ""}`,
      );
    case "puzzle":
      return puzzleKey(block.level);
  }
  return [];
}

const keyProgram = (block: AutoBlock, open: boolean) =>
  open && block.type === "puzzle" ? { keyProgram: block.level.solution } : {};

/** The right answer for each blank, pair or item, shown beside it once settled. */
export function partKey(block: AutoBlock): Record<string, string> {
  switch (block.type) {
    case "spelling":
      return Object.fromEntries(
        block.tiles.map((tile, index) => [`slot-${index + 1}`, tile]),
      );
    case "gaps":
      return Object.fromEntries(
        block.segments.flatMap((segment) =>
          segment.type === "gap"
            ? [[segment.id, segment.answers[0] ?? ""]]
            : [],
        ),
      );
    case "matching":
      return Object.fromEntries(
        block.pairs.map((pair) => [
          pair.id,
          partName({ text: pair.answer, picture: pair.answerPicture }),
        ]),
      );
    case "highlight":
      return Object.fromEntries(
        highlightTokens(block)
          .filter((token) => token.target)
          .map((token) => [token.id, token.text]),
      );
    case "labelling":
      return Object.fromEntries(
        block.places.map((place, index) => [placeNumber(index), place.name]),
      );
    case "crossword":
      return Object.fromEntries(
        block.words.map((word) => [
          word.id,
          crosswordLetters(word.answer).join(""),
        ]),
      );
    case "wordsearch": {
      // Where each word is, as its two ends, so a student shown the answer sees it in the grid.
      const lines = wordSearch(block.words, block.id)?.lines ?? {};
      return Object.fromEntries(
        Object.entries(lines).map(([wordId, line]) => [
          wordId,
          [
            line.row,
            line.col,
            line.row + line.down * (line.length - 1),
            line.col + line.along * (line.length - 1),
          ].join(","),
        ]),
      );
    }
    case "ordering":
      return Object.fromEntries(
        block.items.map((item, index) => [item.id, String(index + 1)]),
      );
    case "parsons":
      return Object.fromEntries(
        block.lines.map((line, index) => [line.id, String(index + 1)]),
      );
    case "sorting":
      return Object.fromEntries(
        block.items.map((item) => [
          item.id,
          block.groups.find((group) => group.id === item.groupId)?.name ?? "",
        ]),
      );
    default:
      return {};
  }
}

const percentSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(100),
);

export const lessonConditionSchema = v.pipe(
  v.object({
    lessonId: id,
    atLeast: v.nullable(percentSchema),
    below: v.nullable(percentSchema),
  }),
  v.check(
    (input) =>
      (input.atLeast !== null || input.below !== null) &&
      (input.atLeast === null ||
        input.below === null ||
        input.atLeast < input.below),
    "learning.condition",
  ),
);

export const startPacedSchema = v.object({ lessonId: id, classId: id });

export const releaseSchema = v.object({
  lessonId: id,
  classId: id,
  studentId: v.optional(id),
});

export const paceSchema = v.object({
  id,
  step: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(999)),
  ),
  paused: v.optional(v.boolean()),
  revealed: v.optional(v.boolean()),
});

export const saveModuleSchema = v.object({
  id: optionalId,
  expectedVersion: version(0),
  title: requiredText(200),
  summary: text(1000),
  classIds: v.pipe(
    v.array(id),
    v.minLength(1),
    v.maxLength(MAX_MODULE_CLASSES),
  ),
  prerequisiteId: optionalId,
  /** The mean score in the prerequisite a student needs, or none. */
  prerequisiteScore: v.optional(v.nullable(percentSchema), null),
  sequential: v.boolean(),
  /**
   * The classes taken only by some of their groups and students; any class
   * not listed, or listed with none chosen, takes the module whole.
   */
  audiences: v.optional(
    v.pipe(
      v.array(
        v.object({
          classId: id,
          groupIds: v.pipe(v.array(id), v.maxLength(50)),
          studentIds: v.pipe(v.array(id), v.maxLength(500)),
        }),
      ),
      v.maxLength(MAX_MODULE_CLASSES),
    ),
    [],
  ),
});
export type SaveModule = v.InferOutput<typeof saveModuleSchema>;

export const publishModuleSchema = v.object({
  id,
  expectedVersion: version(1),
  /** Empty to open now, or when it should open. */
  publishAt: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoTimestamp())]),
    "",
  ),
});

export const moduleRefSchema = v.object({ id, expectedVersion: version(1) });

export const copyLessonSchema = v.object({ id, moduleId: id });

export const planSchema = v.object({ moduleId: id });

export const savePlanSchema = v.object({
  moduleId: id,
  content: contentDocumentSchema,
});

export const duplicateModuleSchema = v.object({
  id,
  classIds: v.pipe(
    v.array(id),
    v.minLength(1),
    v.maxLength(MAX_MODULE_CLASSES),
  ),
});

/** Messages a scored lesson or quiz may give by score, as Moodle's overall feedback does. */
export const MAX_FEEDBACK_BANDS = 6;

/** A message for students scoring at least `from` percent, below the next band up. */
export const feedbackBandSchema = v.object({
  id,
  from: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
  text: requiredText(500),
});
export type FeedbackBand = v.InferOutput<typeof feedbackBandSchema>;

export const feedbackBandsSchema = v.pipe(
  v.array(feedbackBandSchema),
  v.maxLength(MAX_FEEDBACK_BANDS),
  v.check(
    (bands) => new Set(bands.map((band) => band.from)).size === bands.length,
    "learning.band_twice",
  ),
);

/** The message for a score: the band starting highest at or below it. */
export function bandFor(
  bands: readonly FeedbackBand[],
  score: number | null,
): FeedbackBand | null {
  if (score === null) return null;
  return (
    bands
      .filter((band) => band.from <= score)
      .toSorted((a, b) => b.from - a.from)[0] ?? null
  );
}

export const saveLessonSchema = v.pipe(
  v.object({
    id: optionalId,
    moduleId: id,
    expectedVersion: version(0),
    title: requiredText(200),
    completion: v.picklist(LESSON_COMPLETIONS),
    passScore: v.nullable(
      v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
    ),
    content: contentDocumentSchema,
    /** Ask the questions missed first time once more at the end. */
    review: v.optional(v.boolean(), false),
    /** Whether students read vowel marks, or choose for themselves. */
    vowelMarks: v.optional(v.picklist(VOWEL_MARKS), "shown"),
    /** The language the lesson teaches in; none reads it from its words. */
    language: v.optional(v.nullable(v.picklist(CONTENT_LOCALES)), null),
    /**
     * The lesson in the other language: its title, empty for the original's,
     * and its document. Null takes the translation away; left out, it stays.
     */
    translation: v.optional(
      v.nullable(
        v.object({
          title: v.pipe(v.string(), v.trim(), v.maxLength(200)),
          content: contentDocumentSchema,
        }),
      ),
    ),
    /** Set out for young children: read aloud on a tap, larger answers. */
    young: v.optional(v.boolean(), false),
    /** A young lesson lights each word as the voice reads it. */
    readAlong: v.optional(v.boolean(), true),
    /** Show the lesson only to students scoring in a range in an earlier lesson. */
    condition: v.optional(v.nullable(lessonConditionSchema), null),
    /** What a student is told on finishing, by their score. */
    bands: v.optional(feedbackBandsSchema, []),
    /** Put the saved lesson in front of students at once, when its module is open. */
    publish: v.optional(v.boolean(), false),
    /** Mark answers already given again, where a changed key marks them differently. */
    remark: v.optional(v.boolean(), false),
  }),
  v.forward(
    v.check(
      (input) => (input.completion === "score") === (input.passScore !== null),
      "learning.pass_score",
    ),
    ["passScore"],
  ),
);
export type SaveLesson = v.InferOutput<typeof saveLessonSchema>;

/** The language a student reads a lesson with a translation in. */
export const readLessonInSchema = v.object({
  lessonId: id,
  locale: v.picklist(CONTENT_LOCALES),
});

export const moveLessonSchema = v.object({
  id,
  position: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(999)),
});

export const respondSchema = v.object({
  lessonId: id,
  blockId: id,
  response: responseSchema,
});

/** A student checks a code exercise; the server runs it to mark it. */
export const respondProgramSchema = v.object({
  lessonId: id,
  blockId: id,
  code: v.pipe(v.string(), v.maxLength(MAX_PROGRAM_CHARS)),
});

/** A student's own version of a runnable code block, kept as they change it. */
export const keepCodeSchema = v.object({
  lessonId: id,
  blockId: v.pipe(v.string(), v.regex(/^[\da-z]{8,36}$/)),
  code: v.pipe(v.string(), v.maxLength(MAX_PROGRAM_CHARS)),
});

export const keepProjectSchema = v.object({
  lessonId: id,
  blockId: id,
  files: projectFilesSchema,
  /** The student began again from the starter, so it builds on nobody's project. */
  fresh: v.optional(v.boolean()),
});

/** How a project offered to the class gallery stands. */
export const SHARE_STATES = ["offered", "shown", "declined"] as const;
export type ShareState = (typeof SHARE_STATES)[number];

/** A project question of a lesson, as its gallery is asked for or offered to. */
export const galleryRefSchema = v.object({ lessonId: id, blockId: id });
/** A classmate's project in a question's gallery. */
export const galleryItemSchema = v.object({
  lessonId: id,
  blockId: id,
  studentId: id,
});
export const decideShareSchema = v.object({
  lessonId: id,
  blockId: id,
  studentId: id,
  show: v.boolean(),
});

/** How a run of a program ended: as it should, raising an error, or stopped. */
export const RUN_OUTCOMES = [
  "done",
  "error",
  "timeout",
  "output",
  "stopped",
] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];
/** As much of what a run printed as its replay shows. */
export const MAX_RUN_OUTPUT = 2000;

/**
 * A student ran a code exercise in the browser. The run is kept for their
 * teacher to replay as the browser reported it, and never marks anything.
 */
export const runSchema = v.object({
  lessonId: id,
  blockId: id,
  code: v.pipe(v.string(), v.maxLength(MAX_PROGRAM_CHARS)),
  input: v.pipe(v.string(), v.maxLength(4000)),
  outcome: v.picklist(RUN_OUTCOMES),
  error: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(500))),
  output: v.pipe(v.string(), v.maxLength(MAX_RUN_OUTPUT)),
});

/** A run as kept, for the code exercise it belongs to. */
export type ProgramRun = Omit<
  v.InferOutput<typeof runSchema>,
  "lessonId" | "blockId"
>;

/** A teacher replays how one student of a class came to a code exercise's program. */
export const runsQuerySchema = v.object({
  moduleId: id,
  classId: id,
  lessonId: id,
  blockId: id,
  studentId: id,
});

/** A student gives up on a question and asks to see its answer. */
export const revealSchema = v.object({ lessonId: id, blockId: id });

/** A teacher marks an answer only they can judge, with credit out of the question's points. */
/** Answers to one question a teacher gives the same mark at once. */
export const MAX_MARKED_TOGETHER = 100;

/**
 * A teacher's marking of a passage read aloud: the words read wrongly,
 * misread, left out or told, by their place in the passage; the last word
 * read, when the reading stopped short; and how many seconds it ran.
 */
export const fluencyMarkSchema = v.object({
  errors: v.pipe(
    v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2000))),
    v.maxLength(2000),
  ),
  lastWord: v.nullable(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2000)),
  ),
  seconds: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(600)),
});
export type FluencyMark = v.InferOutput<typeof fluencyMarkSchema>;

/** A passage's words as a reading is counted: each run of letters between spaces. */
export const readingWords = (passage: string): string[] =>
  passage.split(/\s+/u).filter(Boolean);

/**
 * What a marked reading comes to: the words read, those read correctly,
 * accuracy as a share of those read, and words correct per minute, the
 * measure oral reading fluency is tracked by (Hasbrouck and Tindal 2017).
 */
export function fluencyOf(words: number, mark: FluencyMark) {
  const read = Math.min(words, (mark.lastWord ?? words - 1) + 1);
  const errors = new Set(mark.errors.filter((place) => place < read)).size;
  const correct = Math.max(0, read - errors);
  return {
    read,
    correct,
    accuracy: read === 0 ? 0 : correct / read,
    perMinute: Math.round((correct * 60) / mark.seconds),
  };
}

export const markSchema = v.object({
  lessonId: id,
  blockId: id,
  studentIds: v.pipe(
    v.array(id),
    v.minLength(1),
    v.maxLength(MAX_MARKED_TOGETHER),
  ),
  points: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
  feedback: text(2000),
  /** For a passage read aloud by one student, how it was read. */
  fluency: v.optional(fluencyMarkSchema),
});

export const positionSchema = v.object({
  lessonId: id,
  blockId: v.pipe(v.string(), v.maxLength(64)),
});

/** Longer than any lesson recording a school uploads. */
const MAX_MEDIA_SECONDS = 6 * 60 * 60;
const second = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(MAX_MEDIA_SECONDS),
);

/**
 * Stretches of a recording a student played since their last report, in
 * whole seconds, with its length and where they are in it.
 */
export const watchSchema = v.object({
  lessonId: id,
  /** An upload's file id, or a YouTube or Vimeo video's key. */
  video: v.union([id, v.pipe(v.string(), v.regex(FRAMED_KEY))]),
  ranges: v.pipe(
    v.array(
      v.pipe(
        v.tuple([second, second]),
        v.check(([start, end]) => start < end, "learning.watch_range"),
      ),
    ),
    v.maxLength(200),
  ),
  durationSeconds: v.pipe(second, v.minValue(1)),
  positionSeconds: second,
});

export const overrideSchema = v.object({
  lessonId: id,
  studentId: id,
  completed: v.boolean(),
});

export const progressQuerySchema = v.object({ moduleId: id, classId: id });

/** One stored try, as the responses ledger holds it. */
export interface ResponseRow {
  blockId: string;
  try: number;
  state:
    | "answered"
    | "revealed"
    | "needs_marking"
    | "marked"
    | "reviewed"
    | "hint"
    | "remarked";
  fraction: number | null;
}

/**
 * Each question's state in one attempt, from its rows in order. A question
 * with limited tries is revealed once they run out; one its teacher marks
 * takes the fraction of its latest mark. One whose feedback waits is one
 * try however often its answer changed, since nothing told the student it
 * was wrong: its last answer is the one that counts.
 */
export function checkStates(
  document: LessonDocument,
  rows: readonly ResponseRow[],
): Record<string, CheckState> {
  const states: Record<string, CheckState> = {};
  for (const block of checkBlocks(document)) {
    const mine = rows.filter((row) => row.blockId === block.id);
    // An answer marked again after its key changed counts as marked again.
    const again = new Map(
      mine
        .filter((row) => row.state === "remarked")
        .map((row) => [row.try, row.fraction]),
    );
    const answered = mine
      .filter(
        (row) => row.state === "answered" || row.state === "needs_marking",
      )
      .map((row) =>
        again.has(row.try)
          ? { ...row, fraction: again.get(row.try) ?? null }
          : row,
      );
    const marking = isTeacherMarked(block);
    const held = feedbackAtOf(block) !== "now";
    // A question answered at once ends at its first right answer, which a
    // try marked right again after its key changed may now be.
    const right = held ? undefined : answered.find((row) => row.fraction === 1);
    const last = right ?? answered.at(-1);
    const mark = mine.findLast((row) => row.state === "marked");
    const tries = right
      ? right.try
      : answered.length === 0
        ? 0
        : Math.max(...answered.map((row) => row.try));
    const asked = mine.filter((row) => row.state === "hint").length;
    const fraction = marking ? (mark?.fraction ?? 0) : (last?.fraction ?? 0);
    const correct = marking ? false : fraction === 1;
    states[block.id] = {
      tries: held ? Math.min(1, tries) : tries,
      fraction,
      correct,
      revealed:
        !marking &&
        (mine.some((row) => row.state === "revealed") ||
          (!held && !correct && block.tries !== null && tries >= block.tries)),
      marked: mark !== undefined,
      firstTryCorrect:
        asked === 0 &&
        (held
          ? correct
          : answered.some((row) => row.try === 1 && row.fraction === 1)),
      once: held,
      hints: asked,
      review: mine.find((row) => row.state === "reviewed")?.fraction ?? null,
    };
  }
  return states;
}

/**
 * The answers to a question that mark differently under its key as it now
 * stands, each with its new mark: the tries an earlier key marked, for a
 * teacher who chooses to mark them again.
 */
export function remarksOf(
  block: AutoBlock,
  rows: readonly (ResponseRow & { response: Record<string, unknown> })[],
): { try: number; fraction: number }[] {
  // A program was marked by running it against its tests, which only a
  // fresh run can do again.
  if (block.type === "program") return [];
  const mine = rows.filter((row) => row.blockId === block.id);
  const again = new Map(
    mine
      .filter((row) => row.state === "remarked")
      .map((row) => [row.try, row.fraction]),
  );
  return mine.flatMap((row) => {
    if (row.state !== "answered") return [];
    const parsed = v.safeParse(responseSchema, row.response);
    if (!parsed.success) return [];
    const fraction = markResponse(block, parsed.output).fraction;
    const before = again.has(row.try) ? again.get(row.try) : row.fraction;
    return fraction === before ? [] : [{ try: row.try, fraction }];
  });
}

/**
 * How a student stands on a question, as its teacher reads a class at a
 * glance: right first time, right after trying, shown the answer, still
 * working on it, answered wrong in the one go it had, or not reached.
 */
export type CheckStanding =
  | "first"
  | "later"
  | "shown"
  | "trying"
  | "missed"
  | "unseen";

export function standingOf(state: CheckState | undefined): CheckStanding {
  if (!state || (state.tries === 0 && !state.revealed)) return "unseen";
  if (state.firstTryCorrect) return "first";
  // Answered in one go, with no tries left to make.
  if (state.once) return "missed";
  if (state.correct) return "later";
  if (state.revealed) return "shown";
  return "trying";
}

/** A question the student did not get right first time, now settled. */
export const missed = (block: CheckBlock, state: CheckState | undefined) =>
  isAuto(block) && settled(block, state) && !state?.firstTryCorrect;

/**
 * The questions a lesson asks again at its end: those missed first time,
 * once every question is settled, so the second go is from memory.
 */
export function reviewBlocks(
  document: LessonDocument,
  states: Record<string, CheckState>,
): AutoBlock[] {
  // One whose feedback waited was answered once, with no answer to remember.
  const asked = autoBlocks(document).filter(
    (block) => feedbackAtOf(block) === "now",
  );
  if (!asked.every((block) => settled(block, states[block.id]))) return [];
  return asked.filter((block) => missed(block, states[block.id]));
}

/** A question asked again at the end: the answer given then, and how it went. */
export function describeReview(
  block: AutoBlock,
  rows: readonly StoredTry[],
): CheckView {
  const row = rows.find(
    (item) => item.blockId === block.id && item.state === "reviewed",
  );
  const response = (row?.response ?? null) as LessonResponse | null;
  const marked = response ? markResponse(block, response) : null;
  const done = row !== undefined;
  return {
    tries: done ? 1 : 0,
    response,
    correct: row?.fraction === 1,
    // One go only: a wrong one is settled with its answer shown.
    revealed: done && row.fraction !== 1,
    fraction: row?.fraction ?? 0,
    triesLeft: done ? 0 : 1,
    feedback: marked?.feedback ?? [],
    parts: marked?.parts ?? {},
    hints: [],
    hintsLeft: 0,
    askable: 0,
    asked: 0,
    key: done ? answerKey(block) : null,
    partKey: done ? partKey(block) : null,
    ...keyProgram(block, done),
    explanation: done ? block.explanation : null,
    marked: false,
    credit: null,
    markFeedback: null,
    timing: null,
  };
}

/** A stored try with what the student sent and any teacher feedback. */
export interface StoredTry extends ResponseRow {
  response: Record<string, unknown>;
  feedback: string | null;
}

/** What a student is shown about one question: their tries so far, and the answer once it is settled. */
export interface CheckView {
  tries: number;
  response: LessonResponse | null;
  correct: boolean;
  revealed: boolean;
  fraction: number;
  triesLeft: number | null;
  feedback: string[];
  parts: Record<string, boolean>;
  /** Why a maths answer meaning the key was still not right. */
  note?: MathNote;
  /** Hints so far: one more after each wrong try, and each one asked for, until the answer is shown. */
  hints: string[];
  /** Hints a further wrong try would still open. */
  hintsLeft: number;
  /** Hints the student may still ask for now. */
  askable: number;
  /** Hints the student asked for, rather than had after a wrong try. */
  asked: number;
  key: string[] | null;
  partKey: Record<string, string> | null;
  /** A puzzle's answer as the program it is, to read as blocks once settled. */
  keyProgram?: Program;
  explanation: string | null;
  marked: boolean;
  /** Points an answer its teacher marks earned, once marked. */
  credit: number | null;
  markFeedback: string | null;
  /** For a question whose feedback waits: what for, and whether it has come. */
  timing: { at: "end" | "teacher"; open: boolean } | null;
}

export function describeCheck(
  block: CheckBlock,
  rows: readonly StoredTry[],
  state: CheckState | undefined,
  shown: FeedbackShown = ALL_SHOWN,
): CheckView {
  const at = feedbackAtOf(block);
  const mine = rows.filter(
    (row) =>
      row.blockId === block.id &&
      (row.state === "answered" || row.state === "needs_marking"),
  );
  const response = (mine.at(-1)?.response ?? null) as LessonResponse | null;
  const mark = rows.findLast(
    (row) => row.blockId === block.id && row.state === "marked",
  );
  const tries = state?.tries ?? 0;
  const asked = Math.min(block.hints.length, state?.hints ?? 0);
  // Before a question is sent or its feedback comes, only hints asked for show.
  const before = isTeacherMarked(block) ? tries === 0 : true;
  const base: CheckView = {
    tries,
    response,
    correct: false,
    revealed: false,
    fraction: 0,
    triesLeft: null,
    feedback: [],
    parts: {},
    hints: before ? block.hints.slice(0, asked) : [],
    hintsLeft: 0,
    askable: before ? block.hints.length - asked : 0,
    asked,
    key: null,
    partKey: null,
    explanation: null,
    marked: state?.marked ?? false,
    credit: null,
    markFeedback: null,
    timing: at === "now" ? null : { at, open: shown[at] },
  };
  // Until it is shown, the student has only the answer they kept.
  if (base.timing && !base.timing.open) return base;
  if (isTeacherMarked(block))
    return {
      ...base,
      credit:
        mark && block.points > 0 ? (mark.fraction ?? 0) * block.points : null,
      markFeedback: mark?.feedback ?? null,
    };
  const marked = response ? markResponse(block, response) : null;
  const open = settled(block, state);
  // Every try before the question settles was wrong, so each opens one more,
  // as each one asked for does.
  const wrongTries = !open && marked && !marked.correct ? tries : 0;
  const shownHints = open
    ? []
    : block.hints.slice(0, Math.min(block.hints.length, wrongTries + asked));
  // The last try shows the answer rather than a hint.
  const reachable =
    block.tries === null
      ? block.hints.length
      : Math.min(block.hints.length, block.tries - 1);
  return {
    ...base,
    correct: state?.correct ?? false,
    revealed: state?.revealed ?? false,
    fraction: state?.fraction ?? 0,
    triesLeft:
      block.tries === null || base.timing
        ? null
        : Math.max(0, block.tries - tries),
    feedback: marked?.feedback ?? [],
    parts: marked?.parts ?? {},
    ...(marked?.note ? { note: marked.note } : {}),
    hints: shownHints,
    hintsLeft:
      shownHints.length > 0 ? Math.max(0, reachable - shownHints.length) : 0,
    askable: open ? 0 : block.hints.length - shownHints.length,
    key: open ? answerKey(block) : null,
    partKey: open ? partKey(block) : null,
    ...keyProgram(block, open),
    explanation: open ? block.explanation : null,
  };
}

const CHECK_TYPES = new Set<LessonBlockType>([...AUTO_TYPES, ...MARKED_TYPES]);

/**
 * A quiz with one wrong option fewer in each choice question that has two
 * or more wrong ones, as a student's access arrangements may give them; the
 * one left out is the same each time the student opens the attempt.
 */
function withFewerChoices(
  document: LessonDocument,
  seed: string,
): LessonDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) => {
      if (block.type !== "choice") return block;
      const wrong = block.options.filter(
        (option) => !block.correctOptionIds.includes(option.id),
      );
      if (wrong.length < 2) return block;
      const [dropped] = shuffled(wrong, `${seed}:${block.id}:fewer`);
      return {
        ...block,
        options: block.options.filter((option) => option !== dropped),
      };
    }),
  };
}

/**
 * A quiz as its student sees it: a lesson's blocks, with the questions in the
 * student's own order when the teacher asks, text between them left where it
 * stands.
 */
export function studentQuiz(
  document: LessonDocument,
  seed: string,
  shuffle: boolean,
  fewerChoices = false,
): StudentBlock[] {
  const blocks = studentBlocks(
    fewerChoices ? withFewerChoices(document, seed) : document,
    seed,
  );
  if (!shuffle) return blocks;
  const slots = blocks.flatMap((block, index) =>
    CHECK_TYPES.has(block.type) ? [index] : [],
  );
  const order = shuffled(
    slots.map((slot) => blocks[slot] as StudentBlock),
    `${seed}:order`,
  );
  const result = [...blocks];
  slots.forEach((slot, index) => {
    result[slot] = order[index] as StudentBlock;
  });
  return result;
}

/** One stored quiz answer, as marked when its attempt was handed in. */
export interface QuizAnswer {
  blockId: string;
  response: Record<string, unknown>;
  fraction: number | null;
  state: "draft" | "marked" | "needs_marking";
  feedback: string | null;
  /** In a practice quiz: answers checked, hints asked for, and whether the answer was shown. */
  tries?: number;
  hints?: number;
  revealed?: boolean;
}

/**
 * Each question's result in one handed-in attempt. "answers" shows the key,
 * explanation and option feedback; "feedback" which parts were wrong with
 * the feedback on what was chosen, but not the key; "marks" only whether
 * each part was right. Hints belong to practice and never show.
 */
export function quizViews(
  document: LessonDocument,
  answers: readonly QuizAnswer[],
  show: "answers" | "feedback" | "marks",
): Record<string, CheckView> {
  const blocks = checkBlocks(document);
  const rows: StoredTry[] = answers.flatMap((answer): StoredTry[] => {
    const block = blocks.find((item) => item.id === answer.blockId);
    if (!block) return [];
    const base = {
      blockId: answer.blockId,
      try: 1,
      response: answer.response,
      feedback: null,
    };
    if (!isTeacherMarked(block))
      return [{ ...base, state: "answered", fraction: answer.fraction ?? 0 }];
    const sent: StoredTry = { ...base, state: "needs_marking", fraction: null };
    return answer.state === "marked"
      ? [
          sent,
          {
            ...base,
            state: "marked",
            fraction: answer.fraction,
            feedback: answer.feedback,
          },
        ]
      : [sent];
  });
  const states = checkStates(document, rows);
  return Object.fromEntries(
    blocks.map((block) => {
      const state = states[block.id];
      const view = describeCheck(
        block,
        rows,
        state && isAuto(block) ? { ...state, revealed: true } : state,
      );
      const shown =
        show === "answers"
          ? view
          : {
              ...view,
              key: null,
              partKey: null,
              keyProgram: undefined,
              explanation: null,
              feedback: show === "feedback" ? view.feedback : [],
            };
      return [block.id, { ...shown, hints: [], hintsLeft: 0, triesLeft: null }];
    }),
  );
}

const wordsIn = (value: string) => value.split(/\s+/).filter(Boolean).length;

/** Why an answer cannot be taken for this question, or null when it can. */
export function responseIssue(
  block: CheckBlock,
  response: LessonResponse,
): "learning.response" | "learning.option" | "learning.word_limit" | null {
  if (response.type !== block.type) return "learning.response";
  if (
    block.type === "choice" &&
    response.type === "choice" &&
    response.optionIds.some(
      (optionId) => !block.options.some((option) => option.id === optionId),
    )
  )
    return "learning.option";
  // A class's answers are counted from each vote, so one counts once.
  if (
    block.type === "poll" &&
    response.type === "poll" &&
    (response.optionIds.some(
      (optionId) => !block.options.some((option) => option.id === optionId),
    ) ||
      new Set(response.optionIds).size !== response.optionIds.length ||
      (!block.multiple && response.optionIds.length > 1))
  )
    return "learning.option";
  if (block.type === "highlight" && response.type === "highlight") {
    const words = new Set(
      highlightTokens(block)
        .filter((token) => token.word)
        .map((token) => token.id),
    );
    if (response.chosen.some((token) => !words.has(token)))
      return "learning.option";
  }
  if (block.type === "wordsearch" && response.type === "wordsearch") {
    const rows = wordSearch(block.words, block.id)?.rows ?? [];
    if (
      response.found.some(
        (stretch) =>
          stretch.some((at) => at >= rows.length) ||
          !lettersBetween(rows, stretch),
      )
    )
      return "learning.option";
  }
  if (block.type === "crossword" && response.type === "crossword") {
    const squares = new Set(
      (crosswordLayout(block.words)?.entries ?? []).flatMap(squaresOf),
    );
    if (
      Object.entries(response.squares).some(
        ([key, letter]) =>
          !squares.has(key) || crosswordLetters(letter).length > 1,
      )
    )
      return "learning.option";
  }
  if (block.type === "labelling" && response.type === "labelling") {
    const bank = new Set([
      ...block.places.map((place) => place.name),
      ...block.extras,
    ]);
    if (
      Object.entries(response.labels).some(
        ([place, label]) =>
          Number(place) > block.places.length ||
          (label !== "" && !bank.has(label)),
      )
    )
      return "learning.option";
  }
  if (block.type === "written" && response.type === "written") {
    const spoken = (block.recordSeconds ?? null) !== null;
    const pictured = (block.answerWith ?? null) !== null;
    // A spoken answer is a recording within its length, a drawn or
    // photographed one a picture, and a written one words.
    if (spoken !== (response.recording !== undefined))
      return "learning.response";
    if (pictured !== (response.picture !== undefined))
      return "learning.response";
    if (Boolean(block.recordVideo) !== Boolean(response.recording?.video))
      return "learning.response";
    if (
      response.recording &&
      response.recording.seconds > (block.recordSeconds ?? 0) + 1
    )
      return "learning.response";
    if (block.wordLimit !== null && wordsIn(response.text) > block.wordLimit)
      return "learning.word_limit";
  }
  return null;
}

export const classSoundsSchema = v.object({ classId: id });
export const setClassSoundsSchema = v.object({ classId: id, on: v.boolean() });
