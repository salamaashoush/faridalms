import type { LeaverRow } from "@faridalms/database/stores/privacy";

import type { UnitContext } from "./context";

import { point } from "./extension";

/**
 * People a module keeps records of who are no longer at the school, and
 * whom the retention review brings up for erasure: applicants who were not
 * admitted, say. Read whatever is on, since the duty to erase outlives the
 * module that kept them.
 */
export interface RetentionSubjects {
  leavers(context: UnitContext): Promise<LeaverRow[]>;
}

export const retentionSubjects = point<RetentionSubjects>("retention subjects");
