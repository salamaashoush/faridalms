import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import { ShieldAlert, UserX } from "lucide-react";

import type { ModuleFillings } from "~/utils/extension";

import { audienceKinds } from "~/components/announcements/slots";
import { officeNeeds } from "~/components/home/slots";
import { formatPhone } from "~/components/people/format";
import {
  personRecordParts,
  studentColumns,
  studentEditorParts,
  studentFamilyParts,
  studentFilters,
} from "~/components/people/slots";
import * as m from "~/i18n/messages";
import {
  guardiansQuery,
  relationsQuery,
  withoutGuardianQuery,
} from "~/queries/families";
import { fill, NOTHING_READ } from "~/utils/extension";

import { PersonChildren } from "./PersonChildren";
import { StudentFamily, StudentFamilyOverview } from "./StudentFamily";
import {
  guardianLinks,
  guardiansProblem,
  StudentGuardiansField,
} from "./StudentGuardians";

/** The guardian column's value for a student without a guardian linked. */
const MISSING = "missing";
/** Its value for a student whose guardians have no phone. */
const LINKED = "linked";

const phoneOf = (value: string | null) =>
  value === null || value === MISSING || value === LINKED ? null : value;

/**
 * What families shows across the product: a student's guardians on their
 * record, in the student form and list, the families audience, the office's
 * count of students without one, and the children on a guardian's record.
 */
export const FAMILIES: ModuleFillings = {
  module: "families",
  fillings: [
    fill(studentFamilyParts, {
      label: m.studentTabFamily,
      Tab: StudentFamily,
      Overview: StudentFamilyOverview,
      alerts: {
        custody: {
          label: m.studentCustodyAlert,
          tone: "warning",
          icon: ShieldAlert,
        },
        no_guardian: {
          label: m.studentAlertNoGuardian,
          tone: "warning",
          icon: UserX,
        },
      },
      messageLabel: m.studentMessageGuardians,
    }),
    fill(studentEditorParts, {
      key: "families",
      title: m.studentGuardians,
      query: (studentId) =>
        studentId ? guardiansQuery(studentId) : relationsQuery,
      initial: () => [],
      problem: guardiansProblem,
      sent: (value) =>
        guardianLinks(value as Parameters<typeof guardianLinks>[0]),
      carried: () => [],
      Field: StudentGuardiansField,
    }),
    fill(studentColumns, {
      key: "guardian",
      header: m.studentsGuardianPhone,
      query: () => NOTHING_READ,
      cell: (_read, value) => {
        const phone = phoneOf(value);
        if (phone)
          return (
            <bdi dir="ltr" className="tabular-nums">
              {formatPhone(phone)}
            </bdi>
          );
        return value === LINKED ? (
          <Value>{null}</Value>
        ) : (
          <StatusText tone="warning">{m.studentsMissingGuardian()}</StatusText>
        );
      },
      text: (_read, value) => phoneOf(value) ?? "",
    }),
    fill(studentFilters, {
      key: "guardian",
      query: () => NOTHING_READ,
      facetOf: (_read, value, onChange) => ({
        id: "guardian",
        label: m.studentGuardians(),
        options: [{ value: MISSING, label: m.studentsMissingGuardian() }],
        selected: value === MISSING ? [MISSING] : [],
        onChange: (chosen) =>
          onChange(chosen.includes(MISSING) ? MISSING : undefined),
      }),
      statuses: [],
    }),
    fill(officeNeeds, {
      query: (capabilities) =>
        capabilities.includes("people:read") ? withoutGuardianQuery : null,
      needOf: ({ count }: { count: number }) =>
        count > 0
          ? {
              key: "guardians",
              label: m.homeWithoutGuardian({ count }),
              link: { to: "/students", search: { guardian: MISSING } },
            }
          : null,
    }),
    fill(audienceKinds, {
      scope: "families",
      label: m.annScopeFamilies,
    }),
    fill(personRecordParts, { Overview: PersonChildren }),
  ],
};
