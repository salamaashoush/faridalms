import type { ModuleFillings } from "~/utils/extension";

import {
  classesTabs,
  classRecordParts,
  groupWords,
} from "~/components/classes/slots";
import { officeNeeds } from "~/components/home/slots";
import { studentClassesParts } from "~/components/people/slots";
import * as m from "~/i18n/messages";
import {
  homeroomDirectoryQuery,
  homeroomOfClassQuery,
  unstaffedHomeroomsQuery,
} from "~/queries/homerooms";
import { fill } from "~/utils/extension";

import type { Of } from "./ClassParts";

import { homeroomPart } from "./ClassParts";
import { HomeroomDirectory } from "./HomeroomDirectory";
import { MoveManySheet } from "./Placement";
import { MoveStudent, StudentHomeroom } from "./StudentHomeroom";

/** What homerooms show across the portal, wherever a page has a place for it. */
export const HOMEROOMS: ModuleFillings = {
  module: "homerooms",
  fillings: [
    fill(classesTabs, {
      value: "homerooms",
      label: m.homeroomsTab,
      prefetch: (queryClient, search, views) =>
        queryClient.ensureQueryData(homeroomDirectoryQuery(search, views)),
      Tab: HomeroomDirectory,
    }),
    fill(classRecordParts, {
      query: (classId) => homeroomOfClassQuery(classId),
      partOf: (of: Of, record, navigate) => homeroomPart(of, record, navigate),
    }),
    fill(groupWords, {
      group: m.homeroomWord,
      teacher: m.studentHomeroomTeacher,
    }),
    fill(studentClassesParts, {
      Section: StudentHomeroom,
      keeps: (episode) => episode.source === "homeroom",
      move: { label: m.enrolmentMove, One: MoveStudent, Many: MoveManySheet },
    }),
    fill(officeNeeds, {
      query: (capabilities) =>
        capabilities.includes("classes:read") ? unstaffedHomeroomsQuery : null,
      needOf: ({ count }: { count: number }) =>
        count > 0
          ? {
              key: "homerooms",
              label: m.homeWithoutHomeroomTeacher({ count }),
              link: { to: "/classes", search: { scope: "homerooms" } },
            }
          : null,
    }),
  ],
};
