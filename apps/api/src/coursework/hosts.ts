import type { AssignmentRow } from "@faridalms/database/stores/coursework";

import {
  assignmentTitles,
  studentOfWork,
} from "@faridalms/database/stores/coursework";

import type { GoLive } from "../core/publication";
import type { FileHost } from "../files/authorize";

/** The kinds of record this module keeps files and documents in, filled as its systems load. */
export const COURSEWORK_HOSTS: FileHost[] = [
  {
    hostType: "assignment",
    titlesOf: async (context, ids) =>
      new Map(
        [...(await assignmentTitles(context.tx, context.tenantId, ids))].map(
          ([id, row]) => [
            id,
            {
              titleEn: row.title,
              titleAr: row.title,
              placeEn: row.classEn,
              placeAr: row.classAr,
            },
          ],
        ),
      ),
  },
  {
    hostType: "submission",
    studentOf: (context, id) =>
      studentOfWork(context.tx, context.tenantId, { type: "submission", id }),
  },
  {
    hostType: "submission_attempt",
    studentOf: (context, id) =>
      studentOfWork(context.tx, context.tenantId, {
        type: "submission_attempt",
        id,
      }),
  },
];

/** What this module sets to go out later: work set to open on a day. */
export const COURSEWORK_GO_LIVES: GoLive<AssignmentRow>[] = [];
