import {
  schoolYears,
  termsOf,
  workingYear,
} from "@faridalms/database/stores/years";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { linkedYear } from "../years/years";
import { unitFrames } from "./points";

/** A class's units laid along its school year and its terms, where both modules are on. */
export const ELEARNING_IN_YEARS: ModuleContributions = {
  module: "elearning",
  needs: ["school_years"],
  contributions: [
    contribute(unitFrames, {
      ready: async (context) =>
        workingYear(
          await schoolYears(context.tx, context.tenantId, context.schoolId),
          context.today,
        ) !== null,
      frameOf: async (context, classId) => {
        const year = await linkedYear(context, classId);
        if (!year) return null;
        const terms = await termsOf(context.tx, context.tenantId, year.id);
        return {
          titleEn: year.titleEn,
          titleAr: year.titleAr,
          startsOn: year.startsOn,
          endsBefore: year.endsBefore,
          parts: terms.map((term) => ({
            id: term.id,
            titleEn: term.titleEn,
            titleAr: term.titleAr,
            startsOn: term.startsOn,
            endsBefore: term.endsBefore,
          })),
        };
      },
    }),
  ],
};
