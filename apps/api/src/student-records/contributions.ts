import { arrangementsOfStudents } from "@faridalms/database/stores/arrangements";
import { moveHealthRecords } from "@faridalms/database/stores/records";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { withPurposeFor } from "../core/purpose";
import { fileHosts } from "../files/authorize";
import { allowanceKeepers } from "../people/allowances";
import { recordJoins } from "../people/joins";
import { STUDENT_RECORDS_HOSTS } from "./hosts";

/** What student records add to core: health records and their changes as kinds of record, and the access arrangements that allow a student more. */
export const STUDENT_RECORDS: ModuleContributions = {
  module: "student_records",
  contributions: [
    contribute(fileHosts, STUDENT_RECORDS_HOSTS),
    contribute(allowanceKeepers, {
      of: (scope, studentIds) =>
        arrangementsOfStudents(scope.tx, {
          tenantId: scope.tenantId,
          orgId: scope.schoolId,
          studentIds,
        }),
    }),
    contribute(recordJoins, {
      join: (context, input) =>
        withPurposeFor(
          context,
          {
            purpose: "health",
            subjectUserId: input.toUserId,
            reason: "Joined a person's health records to the one record kept",
            write: true,
            capabilities: input.by,
          },
          (purposeTx) =>
            moveHealthRecords(purposeTx, {
              tenantId: context.tenantId,
              fromUserId: input.fromUserId,
              toUserId: input.toUserId,
            }),
        ),
    }),
  ],
};
