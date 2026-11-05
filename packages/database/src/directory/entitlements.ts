import type { ModuleId } from "@faridalms/domain/modules";
import type { SchoolEntitlements } from "@faridalms/domain/plans";

import { MODULE_IDS } from "@faridalms/domain/modules";
import { BASIC_ENTITLEMENTS } from "@faridalms/domain/plans";

import { schoolEntitlements } from "./schema";

export const entitlementColumns = {
  modules: schoolEntitlements.modules,
  poolBytes: schoolEntitlements.poolBytes,
  classBytes: schoolEntitlements.classBytes,
  moduleBytes: schoolEntitlements.moduleBytes,
  personBytes: schoolEntitlements.personBytes,
  students: schoolEntitlements.students,
  staffAccounts: schoolEntitlements.staffAccounts,
  videoHours: schoolEntitlements.videoHours,
  customDomains: schoolEntitlements.customDomains,
  emailPerMonth: schoolEntitlements.emailPerMonth,
  captionMinutes: schoolEntitlements.captionMinutes,
  access: schoolEntitlements.access,
  trialEndsOn: schoolEntitlements.trialEndsOn,
  notice: schoolEntitlements.notice,
  revision: schoolEntitlements.revision,
};

export type EntitlementColumns = Omit<SchoolEntitlements, "modules"> & {
  modules: string[];
};

const isModule = (id: string): id is ModuleId =>
  (MODULE_IDS as readonly string[]).includes(id);

export function entitledOf(row: EntitlementColumns | null): SchoolEntitlements {
  return row
    ? { ...row, modules: row.modules.filter(isModule) }
    : BASIC_ENTITLEMENTS;
}
