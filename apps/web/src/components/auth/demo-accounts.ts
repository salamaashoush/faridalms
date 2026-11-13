import type { PortalFace } from "~/queries/portal";

import * as m from "~/i18n/messages";

export const DEMO_PASSWORD = "farida-development-password";

/** A seeded sign-in the development portal offers with one click. */
export interface DemoAccount {
  loginName: string;
  label: () => string;
  /** Offered only where the school's portal names this audience. */
  audience?: string;
}

const NORTHWIND: readonly DemoAccount[] = [
  {
    loginName: "principal.northwind@northwind.example.com",
    label: () => m.roleAdmin(),
  },
  {
    loginName: "teacher1.northwind@northwind.example.com",
    label: () => m.roleTeacher(),
  },
  {
    loginName: "parent1001@northwind.example.com",
    label: () => m.roleParent(),
    audience: "families",
  },
  {
    loginName: "student1007@northwind.example.com",
    label: () => m.roleStudent(),
  },
];

/** The seeded schools' sign-ins by school; the bare portal offers Northwind's. */
const BY_SCHOOL: Readonly<Record<string, readonly DemoAccount[]>> = {
  northwind: NORTHWIND,
  lanternfield: [
    {
      loginName: "admin.lanternfield@lanternfield.example.com",
      label: () => m.roleAdmin(),
    },
    {
      loginName: "teacher1.lanternfield@lanternfield.example.com",
      label: () => m.roleTeacher(),
    },
    {
      loginName: "student1.lanternfield@lanternfield.example.com",
      label: () => m.roleStudent(),
    },
  ],
};

/** The seeded sign-ins of the school whose portal this is, for those it signs in. */
export function demoAccounts(face: PortalFace | null): readonly DemoAccount[] {
  if (!face) return NORTHWIND;
  return (BY_SCHOOL[face.school] ?? []).filter(
    (account) =>
      account.audience === undefined ||
      face.audiences.includes(account.audience),
  );
}
