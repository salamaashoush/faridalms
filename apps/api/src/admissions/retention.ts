import { unsuccessfulApplicants } from "@faridalms/database/stores/admissions";

import type { RetentionSubjects } from "../core/retention";

export const ADMISSIONS_RETENTION: RetentionSubjects = {
  leavers: async (context) =>
    (
      await unsuccessfulApplicants(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
      })
    ).map((row) => ({
      userId: row.userId,
      kind: "applicant" as const,
      fullNameEn: row.fullNameEn,
      fullNameAr: row.fullNameAr,
      birthDate: row.birthDate,
      leftOn: row.closedOn,
    })),
};
