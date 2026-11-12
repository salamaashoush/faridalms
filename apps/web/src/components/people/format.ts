import type { StudentStatus } from "@faridalms/domain/people";
import type { Tone } from "@faridalms/ui/system/status";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

export interface Named {
  fullNameEn: string | null;
  fullNameAr: string | null;
  preferredGivenName?: string | null;
}

/** A person's name in the reader's script, falling back to the other one. */
export function displayName(person: Named): string {
  return inLocale(person.fullNameEn, person.fullNameAr);
}

/** The name in the other script, when the person has one that differs. */
export function otherName(person: Named): string | null {
  const other = getLocale() === "ar" ? person.fullNameEn : person.fullNameAr;
  return other && other !== displayName(person) ? other : null;
}

export function labelOf(
  value: { labelEn: string | null; labelAr: string | null } | null | undefined,
) {
  return value ? inLocale(value.labelEn, value.labelAr) : null;
}

export const STATUS_LABEL: Record<StudentStatus, () => string> = {
  enrolled: m.studentStatusEnrolled,
  pre_enrolled: m.studentStatusPreEnrolled,
  left: m.studentStatusLeft,
  graduated: m.studentStatusGraduated,
  unplaced: m.studentStatusUnplaced,
};

export const STATUS_TONE: Record<StudentStatus, Tone> = {
  enrolled: "success",
  pre_enrolled: "info",
  left: "neutral",
  graduated: "neutral",
  unplaced: "warning",
};

/** A stored E.164 number, grouped for reading and never reversed in Arabic. */
export function formatPhone(value: string): string {
  const match = /^\+(20)(\d{2,3})(\d{3})(\d{4})$/.exec(value);
  return match ? `+${match[1]} ${match[2]} ${match[3]} ${match[4]}` : value;
}

export const NATURAL_ROLE_LABEL: Record<string, () => string> = {
  student: m.naturalRoleStudent,
  teacher: m.naturalRoleTeacher,
  aide: m.naturalRoleAide,
  counselor: m.naturalRoleCounselor,
  principal: m.naturalRolePrincipal,
  site_administrator: m.naturalRoleSiteAdministrator,
  district_administrator: m.naturalRoleDistrictAdministrator,
  system_administrator: m.naturalRoleSystemAdministrator,
  proctor: m.naturalRoleProctor,
  staff: m.naturalRoleStaff,
  parent: m.naturalRoleParent,
  guardian: m.naturalRoleGuardian,
  relative: m.naturalRoleRelative,
};

export function roleLabel(role: string): string {
  return NATURAL_ROLE_LABEL[role]?.() ?? role;
}

/** Ranges are half-open, so the last day shown is the one before the end. */
export function lastDay(endsBefore: string) {
  const date = new Date(`${endsBefore}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** The options whose label holds what is searched for, as typed. */
export function matching(
  search: string,
  list: { value: string; label: string }[],
) {
  const needle = search.trim().toLocaleLowerCase();
  return list.filter((option) =>
    option.label.toLocaleLowerCase().includes(needle),
  );
}
