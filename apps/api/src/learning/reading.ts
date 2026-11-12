import { lessonReadingsOf } from "@faridalms/database/stores/learning";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { lessonReadings } from "../coursework/points";

/** The readings aloud a student gave in lessons, for coursework's reading records. */
export const ELEARNING_READINGS: ModuleContributions = {
  module: "elearning",
  needs: ["coursework"],
  contributions: [
    contribute(lessonReadings, {
      readingsOf: (context, input) =>
        lessonReadingsOf(context.tx, {
          tenantId: context.tenantId,
          ...input,
        }),
    }),
  ],
};
