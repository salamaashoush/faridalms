import {
  homeroomDirectory,
  homeroomsOfStudents,
} from "@faridalms/database/stores/homerooms";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { localeOf } from "../core/procedure";
import { scopeFor } from "../core/reach";
import { rolloverCarriers } from "../years/carry";
import { homeroomClass, placeInHomeroom, writeHomeroom } from "./write";

/** How homerooms go over from one school year into the next, where a school has both. */
export const HOMEROOMS_IN_YEARS: ModuleContributions = {
  module: "homerooms",
  needs: ["school_years"],
  contributions: [
    contribute(rolloverCarriers, {
      key: "homerooms",
      sources: async (context, classIds, on) =>
        (
          await homeroomDirectory(context.tx, scopeFor(context, "school"), {
            on,
            classIds,
            ended: false,
            q: "",
            gradeIds: [],
            locale: localeOf(context),
          })
        ).map((row) => ({
          id: row.id,
          code: row.code,
          titleEn: row.titleEn,
          titleAr: row.titleAr,
          gradeId: row.gradeId,
          locationId: row.locationId,
          teacherId:
            row.teachers.find((teacher) => teacher.isPrimary)?.userId ?? null,
          partIds: row.subjects.map((subject) => subject.classId),
          subjects: row.subjects.flatMap((subject) =>
            subject.subjectId
              ? [
                  {
                    subjectId: subject.subjectId,
                    teacherId: subject.teacher?.userId ?? null,
                  },
                ]
              : [],
          ),
        })),
      classesOf: async (context, studentIds, on) =>
        new Map(
          [
            ...(
              await homeroomsOfStudents(context.tx, context, studentIds, on)
            ).entries(),
          ].map(([studentId, homeroom]) => [studentId, homeroom.classId]),
        ),
      carry: async (context, runs, row) => {
        const written = await writeHomeroom(context, runs, {
          code: row.code,
          titleEn: row.titleEn || null,
          titleAr: row.titleAr || null,
          gradeId: row.gradeId,
          locationId: row.locationId,
          homeroomTeacherId: row.teacherId,
          subjects: row.subjects.map((subject) => ({
            subjectId: subject.subjectId,
            teacherIds: subject.teacherId ? [subject.teacherId] : [],
          })),
        });
        return { classId: written.homeroomId, classIds: written.classIds };
      },
      join: async (context, input) => {
        const homeroom = await homeroomClass(context, input.classId);
        if (!homeroom) return;
        await placeInHomeroom(context, {
          studentId: input.studentId,
          homeroom,
          from: input.from,
          source: "rollover",
        });
      },
    }),
  ],
};
