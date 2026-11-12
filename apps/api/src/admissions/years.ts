import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import {
  intakesOfYear,
  setIntakeYear,
  yearsOfIntakes,
} from "@faridalms/database/stores/intake-years";
import {
  placements,
  place,
  saveArrival,
} from "@faridalms/database/stores/placements";
import { schoolYears } from "@faridalms/database/stores/years";
import { admissionsYear } from "@faridalms/domain/admissions";
import { intakeYearPartSchema, yearViewSchema } from "@faridalms/domain/years";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { audit } from "../core/procedure";
import { scopeFor } from "../core/reach";
import { openYear } from "../years/years";
import { enrolmentParts, intakeParts, intakeViews } from "./points";

/**
 * Intakes by school year, where admissions and school years are both on:
 * the year an intake admits into, the lists narrowed to a year (the year
 * admissions are for, given none), and the placement in that year of a
 * child enrolled from it, from the intake's first day.
 */
export const ADMISSIONS_IN_YEARS: ModuleContributions = {
  module: "admissions",
  needs: ["school_years"],
  contributions: [
    contribute(intakeParts, {
      key: "year",
      save: async (context, input) => {
        const read = v.safeParse(intakeYearPartSchema, input.value);
        if (!read.success)
          throw new ORPCError("BAD_REQUEST", { message: "validation.invalid" });
        const { yearId } = read.output;
        const held = (
          await yearsOfIntakes(context.tx, {
            tenantId: context.tenantId,
            intakeIds: [input.intakeId],
          })
        ).get(input.intakeId);
        // An intake's year is fixed once it has one.
        if (held && held.yearId !== yearId)
          throw new ORPCError("BAD_REQUEST", { message: "intake.fixed" });
        if (!yearId) return;
        const year = held
          ? held
          : { ...(await openYear(context, yearId)).year, yearId };
        if (input.startsOn < year.startsOn || input.startsOn >= year.endsBefore)
          throw new ORPCError("BAD_REQUEST", { message: "intake.year" });
        if (held) return;
        await setIntakeYear(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          intakeId: input.intakeId,
          yearId,
        });
      },
      factsOf: async (context, intakeIds) =>
        new Map(
          [
            ...(await yearsOfIntakes(context.tx, {
              tenantId: context.tenantId,
              intakeIds,
            })),
          ].map(([intakeId, year]) => [
            intakeId,
            {
              value: { yearId: year.yearId },
              labelEn: year.titleEn,
              labelAr: year.titleAr,
              rank: 0,
            },
          ]),
        ),
    }),
    contribute(intakeViews, {
      key: "year",
      select: async (context, value) => {
        const years = (
          await schoolYears(context.tx, context.tenantId, context.schoolId)
        ).filter((year) => year.lifecycle !== "closed");
        const read = value === null ? null : v.safeParse(yearViewSchema, value);
        if (read && !read.success)
          throw new ORPCError("BAD_REQUEST", { message: "validation.invalid" });
        if (read?.output === "all") return null;
        const year = read
          ? years.find((row) => row.id === read.output)
          : admissionsYear(years, context.today);
        if (read && !year) throw new ORPCError("NOT_FOUND");
        if (!year) return null;
        return {
          intakeIds: await intakesOfYear(context.tx, {
            tenantId: context.tenantId,
            orgId: context.schoolId,
            yearId: year.id,
          }),
          title: { titleEn: year.titleEn, titleAr: year.titleAr },
        };
      },
    }),
    contribute(enrolmentParts, {
      enrolled: async (context, input) => {
        const held = (
          await yearsOfIntakes(context.tx, {
            tenantId: context.tenantId,
            intakeIds: [input.intakeId],
          })
        ).get(input.intakeId);
        if (!held) return;
        const { year } = await openYear(context, held.yearId);
        const scope = scopeFor(context, "school");
        await place(context.tx, scope, {
          studentId: input.studentId,
          year,
          from: input.startsOn,
          source: "admission",
        });
        const from =
          input.startsOn > year.startsOn ? input.startsOn : year.startsOn;
        const placement = (
          await placements(context.tx, scope, input.studentId)
        ).find((row) => row.schoolYearId === year.id && row.from <= from);
        const entryTypes = await descriptorsFor(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          namespace: "school_entry_type",
          today: context.today,
        });
        if (placement)
          await saveArrival(context.tx, {
            tenantId: context.tenantId,
            placementId: placement.id,
            entryTypeId:
              entryTypes.find((each) => each.meaning === input.entry)?.id ??
              null,
            previousSchool: input.previousSchool,
          });
        await audit(context, {
          action: "placement.change",
          objectType: "student_school_year",
          objectId: placement?.id ?? null,
          subjectUserId: input.studentId,
          studentUserId: input.studentId,
          details: {
            schoolYearId: year.id,
            entry: input.entry,
            applicationId: input.applicationId,
          },
        });
      },
    }),
  ],
};
