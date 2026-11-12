import { withPurpose } from "@faridalms/database/context";
import {
  healthChangeById,
  studentOfHealthRecord,
} from "@faridalms/database/stores/records";

import type { FileHost } from "../files/authorize";

import { can } from "../core/procedure";
import { scopeFor } from "../core/reach";

/** The kinds of record this module keeps files and documents in, filled as its systems load. */
export const STUDENT_RECORDS_HOSTS: FileHost[] = [
  {
    hostType: "health_record",
    studentOf: (context, id) =>
      studentOfHealthRecord(context.tx, context.tenantId, id),
  },
  {
    hostType: "health_change",
    read: (context, changeId, file) =>
      withPurpose(context.tx, "health", async (tx) => {
        if (!file || !can(context, "health:write")) return false;
        const change = await healthChangeById(tx, {
          ...scopeFor(context, "people"),
          orgId: context.schoolId,
          id: changeId,
        });
        return change?.fileId === file.id;
      }),
  },
];
