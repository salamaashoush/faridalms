import type { Role } from "@faridalms/domain/identity";

import * as m from "~/i18n/messages";

export type Stage = "early_years" | "primary" | "middle";

export const STAGE_LABEL: Record<Stage, () => string> = {
  early_years: m.adminStageEarlyYears,
  primary: m.adminStagePrimary,
  middle: m.adminStageMiddle,
};

export const ROLE_LABEL: Record<Role, () => string> = {
  admin: m.roleAdmin,
  teacher: m.roleTeacher,
  parent: m.roleParent,
  student: m.roleStudent,
};
