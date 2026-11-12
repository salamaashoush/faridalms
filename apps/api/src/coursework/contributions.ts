import { joinOpenWork, workSet } from "@faridalms/database/stores/coursework";

import type { ModuleContributions } from "../core/extension";
import type { GoLive } from "../core/publication";

import { classJoins } from "../classes/points";
import { contribute } from "../core/extension";
import { can } from "../core/procedure";
import { goLives } from "../core/publication";
import { setupMeasures } from "../core/setup";
import { fileHosts } from "../files/authorize";
import { zipExports } from "../files/exports";
import { allowanceFollowers } from "../people/allowances";
import { studentRecordAccess } from "../people/points";
import { searchSources } from "../search/points";
import { DUE_FOLLOWS, dueByAllowances } from "./allowances";
import { COURSEWORK_EXPORTS } from "./exports";
import { WORK_HOSTS } from "./host-rules";
import { COURSEWORK_GO_LIVES, COURSEWORK_HOSTS } from "./hosts";
import { COURSEWORK_LINES } from "./notice-lines";
import { ASSIGNMENT_SEARCH } from "./search";

/** What coursework keeps in step with the classes it is set in. */
export const COURSEWORK: ModuleContributions = {
  module: "coursework",
  contributions: [
    ...COURSEWORK_LINES,
    contribute(studentRecordAccess, {
      key: "coursework",
      may: (context) =>
        can(context, "people:read") && can(context, "assignments:read"),
    }),
    contribute(fileHosts, COURSEWORK_HOSTS),
    contribute(fileHosts, WORK_HOSTS),
    contribute(goLives, COURSEWORK_GO_LIVES as readonly GoLive<unknown>[]),
    contribute(allowanceFollowers, DUE_FOLLOWS),
    contribute(setupMeasures, {
      item: "first_assignment",
      seen: (scope) =>
        workSet(scope.tx, { tenantId: scope.tenantId, orgId: scope.schoolId }),
    }),
    contribute(searchSources, ASSIGNMENT_SEARCH),
    ...COURSEWORK_EXPORTS.map((each) => contribute(zipExports, each)),
    // A student joining a class is given the work still open in it.
    contribute(classJoins, {
      joined: async (context, joins) => {
        for (const [classId, studentIds] of joins)
          if (
            (await joinOpenWork(context.tx, {
              tenantId: context.tenantId,
              studentIds,
              classId,
            })) > 0
          )
            await dueByAllowances(context, { studentIds });
      },
    }),
  ],
};
