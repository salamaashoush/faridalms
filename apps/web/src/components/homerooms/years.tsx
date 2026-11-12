import type { ModuleFillings } from "~/utils/extension";

import { rolloverCarrierWords } from "~/components/years/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";

/** How homerooms show over a rollover, where a school has both. */
export const HOMEROOMS_IN_YEARS: ModuleFillings = {
  module: "homerooms",
  needs: ["school_years"],
  fillings: [
    fill(rolloverCarrierWords, {
      carrier: "homerooms",
      describe: (row) =>
        m.rolloverSubjectsCarry({ count: row.subjects.length }),
      teacher: m.classesClassTeacher,
    }),
  ],
};
