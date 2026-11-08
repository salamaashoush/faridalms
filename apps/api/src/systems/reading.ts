import type { FluencyMark } from "@faridalms/domain/learning";
import type { NormRow, ReadingLanguage } from "@faridalms/domain/reading";

import {
  gradesOverTime,
  lessonReadingsOf,
  quizReadingsOf,
  readingNormsOf,
  resetReadingNorms,
  saveReadingNorms,
} from "@faridalms/database/stores/reading";
import {
  checkBlocks,
  fluencyOf,
  lessonContentOf,
  readingWords,
} from "@faridalms/domain/learning";
import { lessonOfContent } from "@faridalms/domain/lesson-content";
import {
  DEFAULT_NORMS,
  normStanding,
  passageLanguage,
  practiseWords,
  prosodyTotal,
  READING_LANGUAGES,
  resetNormsSchema,
  saveNormsSchema,
  seasonOf,
} from "@faridalms/domain/reading";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { requireStudent } from "../core/reach";
import { yearOf } from "../core/years";
import { publishedQuiz } from "../quizzes/quiz";

const id = v.pipe(v.string(), v.uuid());

/** The norms the school reads by, each language its own or the defaults. */
async function normsIn(context: UnitContext) {
  const saved = await readingNormsOf(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
  });
  return Object.fromEntries(
    READING_LANGUAGES.map((language) => {
      const own = saved.find((row) => row.language === language);
      return [
        language,
        {
          rows: own?.rows ?? DEFAULT_NORMS[language],
          own: own !== undefined,
          version: own?.version ?? 0,
        },
      ];
    }),
  ) as Record<
    ReadingLanguage,
    { rows: NormRow[]; own: boolean; version: number }
  >;
}

/** The school's reading norms, for whoever manages the school's settings. */
export const norms = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "school:manage");
  return normsIn(context);
});

/** Keeps the school's own norms for a language, in place of the defaults. */
export const saveNorms = writeProcedure
  .input(
    v.object({
      ...saveNormsSchema.entries,
      expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }),
  )
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    const saved = await saveReadingNorms(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      language: input.language,
      rows: input.rows,
      expectedVersion: input.expectedVersion,
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "reading.norms",
      objectType: "org",
      objectId: context.schoolId,
      details: { language: input.language, rows: input.rows.length },
    });
    return saved;
  });

/** Sets the school's own norms for a language aside, so it reads the defaults again. */
export const resetNorms = writeProcedure
  .input(resetNormsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    await resetReadingNorms(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      language: input.language,
    });
    await audit(context, {
      action: "reading.norms_reset",
      objectType: "org",
      objectId: context.schoolId,
      details: { language: input.language },
    });
    return {};
  });

/** The passage a lesson's reading question holds, as the student read it. */
const passageIn = (content: unknown, blockId: string) => {
  const block = checkBlocks(
    lessonOfContent(
      lessonContentOf(content as Parameters<typeof lessonContentOf>[0]),
    ),
  ).find((item) => item.id === blockId);
  return block?.type === "written" ? (block.passage ?? "") : "";
};

interface Marked {
  source: "lesson" | "quiz";
  sourceId: string;
  title: string;
  passage: string;
  fluency: FluencyMark;
  markedAt: string;
}

/**
 * Every reading aloud of a student a teacher marked word by word this
 * school year, in lessons and quizzes, with what it came to.
 */
async function readingsOf(context: UnitContext, studentId: string) {
  const { year } = await yearOf(context, "");
  const from = year?.startsOn ?? context.today;
  const before = year?.endsBefore ?? context.today;
  const [lessons, quizzes] = await Promise.all([
    lessonReadingsOf(context.tx, {
      tenantId: context.tenantId,
      studentId,
      from,
      before,
    }),
    quizReadingsOf(context.tx, {
      tenantId: context.tenantId,
      studentId,
      from,
      before,
    }),
  ]);
  const quizzesById = new Map(
    await Promise.all(
      [...new Set(quizzes.map((row) => row.assignmentId))].map(
        async (assignmentId) =>
          [assignmentId, await publishedQuiz(context, assignmentId)] as const,
      ),
    ),
  );
  const marked: Marked[] = [
    ...lessons.map((row) => ({
      source: "lesson" as const,
      sourceId: row.lessonId,
      title: row.title,
      passage: passageIn(row.content, row.blockId),
      fluency: row.fluency,
      markedAt: row.markedAt,
    })),
    ...quizzes.map((row) => {
      const quiz = quizzesById.get(row.assignmentId);
      const block = quiz
        ? checkBlocks(quiz).find((item) => item.id === row.blockId)
        : undefined;
      return {
        source: "quiz" as const,
        sourceId: row.assignmentId,
        title: row.title,
        passage: block?.type === "written" ? (block.passage ?? "") : "",
        fluency: row.fluency,
        markedAt: row.markedAt,
      };
    }),
  ];
  return marked
    .filter((row) => row.passage)
    .toSorted((a, b) => a.markedAt.localeCompare(b.markedAt))
    .map((row) => {
      const result = fluencyOf(readingWords(row.passage).length, row.fluency);
      return {
        source: row.source,
        sourceId: row.sourceId,
        title: row.title,
        markedAt: row.markedAt,
        language: passageLanguage(row.passage),
        read: result.read,
        correct: result.correct,
        accuracy: result.accuracy,
        perMinute: result.perMinute,
        prosody: row.fluency.prosody ?? null,
        prosodyTotal: row.fluency.prosody
          ? prosodyTotal(row.fluency.prosody)
          : null,
        practise: practiseWords(row.passage, row.fluency),
      };
    });
}

/**
 * A student's reading aloud over the school year for staff who reach
 * them: each marked reading set against the norm for the grade they were
 * in and the time of year it was read.
 */
export const student = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read");
    await requireStudent(context, "teaching", input.studentId);
    const [readings, grades, school] = await Promise.all([
      readingsOf(context, input.studentId),
      gradesOverTime(context.tx, {
        tenantId: context.tenantId,
        studentId: input.studentId,
      }),
      normsIn(context),
    ]);
    const gradeOn = (day: string) =>
      grades.find(
        (row) => row.from <= day && (row.before === null || day < row.before),
      )?.grade ?? null;
    return {
      readings: readings.map((reading) => {
        const day = reading.markedAt.slice(0, 10);
        const season = seasonOf(day);
        const grade = gradeOn(day);
        const norm = grade
          ? school[reading.language].rows.find(
              (row) => row.grade === grade && row.season === season,
            )
          : undefined;
        return {
          ...reading,
          grade,
          season,
          norm: norm ?? null,
          standing: normStanding(reading.perMinute, norm),
        };
      }),
    };
  });

/**
 * A student's own reading aloud this school year: how many words they read
 * correctly a minute each time, and the words their teacher marked for
 * them to practise. Norms are for their teachers.
 */
export const mine = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "own-work:read");
  const readings = await readingsOf(context, context.actor.userId);
  return {
    readings: readings.map((reading) => ({
      source: reading.source,
      sourceId: reading.sourceId,
      title: reading.title,
      markedAt: reading.markedAt,
      language: reading.language,
      perMinute: reading.perMinute,
      accuracy: reading.accuracy,
      practise: reading.practise,
    })),
  };
});
