import type {
  HistoryChange,
  HistoryField,
  HistoryValue,
} from "@faridalms/domain/history";

import { CATALOGUE } from "@faridalms/domain/descriptors/catalogue";
import { cn } from "@faridalms/ui/cn";
import { ArrowRight } from "lucide-react";

import { MEANING_LABEL } from "~/components/attendance/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatDate, formatNumber } from "~/utils/datetime";

import { formatPhone } from "./format";

const FIELD_LABEL: Record<HistoryField, () => string> = {
  "core.users.given_name_en": m.historyGivenNameEn,
  "core.users.middle_name_en": m.historyMiddleNamesEn,
  "core.users.family_name_en": m.historyFamilyNameEn,
  "core.users.given_name_ar": m.historyGivenNameAr,
  "core.users.middle_name_ar": m.historyMiddleNamesAr,
  "core.users.family_name_ar": m.historyFamilyNameAr,
  "core.users.preferred_given_name": m.peoplePreferredName,
  "core.users.birth_date": m.studentBirthdate,
  "core.user_relationships.relation_meaning": m.guardianRelation,
  "core.user_relationships.legal_guardian": m.guardianLegal,
  "core.user_relationships.portal_access": m.guardianPortalAccess,
  "core.user_relationships.receives_notifications":
    m.guardianReceivesNotifications,
  "core.user_relationships.primary_contact": m.recordPrimaryContact,
  "core.user_relationships.emergency_contact": m.guardianEmergencyContact,
  "core.user_relationships.residence": m.guardianResidence,
  "core.user_relationships.pickup": m.guardianPickup,
  "core.contact_points.phone": m.familyMobile,
  "core.academic_sessions.title_en": m.yearsNameEnglish,
  "core.academic_sessions.title_ar": m.yearsNameArabic,
  "core.academic_sessions.starts_on": m.yearsFirstDay,
  "core.academic_sessions.ends_on": m.yearsLastDay,
  "core.academic_sessions.terms": m.yearsTerms,
  "core.academic_sessions.lifecycle": m.historyYearState,
  "core.attendance_events.meaning": m.historyAttendanceMark,
};

const RELATIONS =
  CATALOGUE.find((space) => space.namespace === "relation")?.values ?? [];

const CHOICES: Partial<Record<HistoryField, Record<string, () => string>>> = {
  "core.user_relationships.residence": {
    primary: m.guardianResidencePrimary,
    secondary: m.guardianResidenceSecondary,
    none: m.guardianResidenceNone,
  },
  "core.user_relationships.pickup": {
    allowed: m.guardianPickupAllowed,
    ask_office: m.guardianPickupAskOffice,
    not_allowed: m.guardianPickupNotAllowed,
  },
  "core.academic_sessions.lifecycle": {
    upcoming: m.yearsUpcoming,
    current: m.yearsCurrent,
    closed: m.yearsClosed,
  },
  "core.attendance_events.meaning": MEANING_LABEL,
};

function choiceLabel(field: HistoryField, value: string) {
  if (field === "core.user_relationships.relation_meaning") {
    const relation = RELATIONS.find((row) => row.meaning === value);
    return relation ? inLocale(relation.en, relation.ar) : value;
  }
  return CHOICES[field]?.[value]?.() ?? value;
}

const blank = (value: HistoryValue) => value === null || value === "";

function shown(change: HistoryChange, value: HistoryValue) {
  if (blank(value)) return m.historyBlank();
  if (typeof value === "boolean") return value ? m.commonYes() : m.commonNo();
  if (typeof value === "number") return formatNumber(value);
  switch (change.kind) {
    case "date":
      return formatDate(value);
    case "phone":
      return formatPhone(value);
    case "choice":
      return choiceLabel(change.field, value);
    default:
      return value;
  }
}

/** The old and new value of each field an entry changed. */
export interface HistoryChangesProps {
  changes: readonly HistoryChange[];
}

export function HistoryChanges({ changes }: HistoryChangesProps) {
  if (changes.length === 0) return null;
  return (
    <dl className="mt-1 grid gap-1 text-[13px] leading-[18px]">
      {changes.map((change) => (
        <div
          key={change.field}
          className="flex flex-wrap items-baseline gap-x-2"
        >
          <dt className="text-muted-foreground">
            {FIELD_LABEL[change.field]()}
          </dt>
          <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
            <span className="sr-only">{m.historyWas()}</span>
            <bdi
              dir={change.kind === "phone" ? "ltr" : undefined}
              className={cn(
                "text-muted-foreground",
                blank(change.before) ? "italic" : "line-through",
              )}
            >
              {shown(change, change.before)}
            </bdi>
            <ArrowRight
              aria-hidden
              className="size-3.5 shrink-0 self-center text-muted-foreground rtl:rotate-180"
            />
            <span className="sr-only">{m.historyNow()}</span>
            <bdi dir={change.kind === "phone" ? "ltr" : undefined}>
              {shown(change, change.after)}
            </bdi>
          </dd>
        </div>
      ))}
    </dl>
  );
}
