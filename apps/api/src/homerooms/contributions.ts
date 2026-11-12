import {
  homeroomClassIds,
  homeroomDirectory,
  homeroomsOfClasses,
  homeroomsOfStudents,
  linkedClasses,
  placeMember,
  reachedThroughHomerooms,
  subjectClassIds,
} from "@faridalms/database/stores/homerooms";
import { addDays } from "@faridalms/domain/school";

import type { ModuleContributions } from "../core/extension";

import { dailyRegisters } from "../attendance/daily-registers";
import { joinedClasses } from "../classes/enrolment";
import { classGroups, enrolmentGuards } from "../classes/points";
import { contribute } from "../core/extension";
import { localeOf } from "../core/procedure";
import { scopeFor, sharedClassReach } from "../core/reach";
import { studentGroups } from "../core/student-groups";
import { rolloverCarriers } from "../rollover/carry";
import { timetableGrids } from "../timetable/grids";
import { follow, homeroomClass, writeHomeroom } from "./write";

/** What homerooms tell the rest of the product, wherever it asks. */
export const HOMEROOMS: ModuleContributions = {
  module: "homerooms",
  contributions: [
    contribute(sharedClassReach, {
      classesReached: (context, scope, on) =>
        reachedThroughHomerooms(context.tx, scope, on),
    }),
    contribute(dailyRegisters, {
      classIds: (context, yearId) =>
        homeroomClassIds(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          yearId,
        }),
    }),
    contribute(studentGroups, {
      groupsOf: (context, studentIds, on) =>
        homeroomsOfStudents(context.tx, context, studentIds, on),
    }),
    contribute(classGroups, {
      groupsOf: async (context, classIds) =>
        new Map(
          [
            ...(
              await homeroomsOfClasses(context.tx, context.tenantId, classIds)
            ).entries(),
          ].map(([classId, homeroom]) => [
            classId,
            {
              classId: homeroom.homeroomClassId,
              code: homeroom.code,
              titleEn: homeroom.titleEn,
              titleAr: homeroom.titleAr,
              own: homeroom.own,
            },
          ]),
        ),
    }),
    contribute(timetableGrids, {
      ownersOf: async (context, classIds) =>
        new Map(
          [
            ...(
              await homeroomsOfClasses(context.tx, context.tenantId, classIds)
            ).entries(),
          ].flatMap(([classId, homeroom]) =>
            homeroom.own ? [] : [[classId, homeroom.homeroomClassId] as const],
          ),
        ),
      classesOf: async (context, ownerId) =>
        (await homeroomClass(context, ownerId))
          ? (await linkedClasses(context.tx, context, ownerId)).map(
              (row) => row.id,
            )
          : null,
      plannedElsewhere: (context, yearId) =>
        subjectClassIds(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          yearId,
        }),
    }),
    contribute(enrolmentGuards, {
      refusesEnding: (_context, enrolment) =>
        Promise.resolve(
          enrolment.source === "homeroom" ? "enrollment.derived" : null,
        ),
    }),
    contribute(rolloverCarriers, {
      sources: async (context, year) =>
        (
          await homeroomDirectory(context.tx, scopeFor(context, "school"), {
            yearId: year.id,
            on: addDays(year.endsBefore, -1),
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
      carry: (context, target, row) =>
        writeHomeroom(context, target, {
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
        }),
      join: async (context, input) => {
        await placeMember(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          homeroom: { id: input.classId, schoolYearId: input.target.id },
          studentId: input.studentId,
          from: input.target.startsOn,
          endsBefore: input.target.endsBefore,
          source: "rollover",
        });
        await joinedClasses(
          context,
          new Map([[input.classId, [input.studentId]]]),
        );
        await follow(context, input.classId);
      },
    }),
  ],
};
