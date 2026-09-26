import type { Capability } from "@faridalms/domain/capabilities";

import { useSuspenseQuery } from "@tanstack/react-query";

import { getLocale } from "~/i18n/runtime";
import { currentUserQuery } from "~/queries/user";

/** A bilingual pair in the reader's language, falling back to the other. */
export function inLocale(en: string | null, ar: string | null): string {
  return (getLocale() === "ar" ? (ar ?? en) : (en ?? ar)) ?? "";
}

export function useCurrentUser() {
  const user = useSuspenseQuery(currentUserQuery).data;
  return {
    ...user,
    name: user.preferredName ?? inLocale(user.nameEn, user.nameAr),
    email: user.loginName ?? "",
    avatarUrl: null as string | null,
    school: {
      ...user.school,
      name: inLocale(user.school.nameEn, user.school.nameAr),
    },
  };
}

/**
 * Capability check for the UI. The server re-checks every one of these; hiding
 * a control is a courtesy, never the enforcement.
 */
export function useCapability(capability: Capability): boolean {
  return useCurrentUser().capabilities.includes(capability);
}
