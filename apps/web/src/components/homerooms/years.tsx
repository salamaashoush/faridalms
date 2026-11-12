import type { ModuleFillings } from "~/utils/extension";

import { listWords } from "~/components/classes/slots";
import { rolloverCarrierWords } from "~/components/years/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";

/** How homerooms show over a rollover, and name the year, where a school has both. */
export const HOMEROOMS_IN_YEARS: ModuleFillings = {
  module: "homerooms",
  needs: ["school_years"],
  fillings: [
    fill(listWords, {
      list: "homerooms",
      title: m.homeroomsEmptyTitle,
      body: m.homeroomsEmptyBody,
    }),
    fill(rolloverCarrierWords, {
      carrier: "homerooms",
      describe: (row) =>
        m.rolloverSubjectsCarry({ count: row.subjects.length }),
      teacher: m.classesClassTeacher,
    }),
  ],
};
