import type { ModuleFillings } from "~/utils/extension";

import { classRecordSections } from "~/components/classes/slots";
import { fill } from "~/utils/extension";

import { LessonSoundsSection } from "./LessonSounds";

/** What e-learning shows in the pages of core and other modules. */
export const ELEARNING: ModuleFillings = {
  module: "elearning",
  fillings: [
    fill(classRecordSections, { key: "sounds", Section: LessonSoundsSection }),
  ],
};
