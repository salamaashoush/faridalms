import type { OnboardingItem } from "@faridalms/domain/onboarding";

import { SCHOOL_DAY_MEANINGS } from "@faridalms/domain/calendar";
import { addDays } from "@faridalms/domain/school";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { textArray } from "./sql";

const ADMINISTRATOR_ROLES = [
  "site_administrator",
  "district_administrator",
  "system_administrator",
];
const FAMILY_ROLES = ["family"];
const STAFF_ROLES = ["principal", "teacher", "aide", "counselor", "staff"];

/**
 * What the cell sees of a school's first steps, from its own data: who has
 * signed in, what has been set up and what has been used. A school's own
 * address is the directory's to know and is left to it.
 */
export async function onboardingSeen(
  tx: CellTransaction,
  input: { tenantId: string; orgId: string; today: string },
): Promise<OnboardingItem[]> {
  const tenant = sql`${input.tenantId}::uuid`;
  const org = sql`${input.orgId}::uuid`;
  const signedIn = (roles: readonly string[]) => sql`exists (
    select 1 from core.user_roles r
    join core.accounts a on a.tenant_id = r.tenant_id and a.user_id = r.user_id
      and a.status = 'active' and a.last_authenticated_at is not null
    where r.tenant_id = ${tenant} and r.org_id = ${org} and r.status = 'active'
      and r.role = any(${textArray(roles)}))`;
  const [row] = await tx.execute<Record<OnboardingItem, boolean>>(sql`
    select
      ${signedIn(ADMINISTRATOR_ROLES)} as admin_signed_in,
      exists (select 1 from core.orgs o where o.tenant_id = ${tenant} and o.id = ${org}
        and o.logo_file_id is not null
        and num_nonnulls(o.address, o.phone, o.email) > 0) as school_details,
      exists (select 1 from core.academic_sessions y
        join core.academic_sessions t on t.tenant_id = y.tenant_id and t.school_year_id = y.id
          and t.type = 'term' and t.status = 'active'
        where y.tenant_id = ${tenant} and y.org_id = ${org} and y.type = 'school_year'
          and y.status = 'active' and y.lifecycle in ('current', 'upcoming')) as year_ready,
      exists (select 1 from core.classes c where c.tenant_id = ${tenant}
        and c.org_id = ${org} and c.status = 'active') as classes,
      exists (select 1 from core.user_roles r where r.tenant_id = ${tenant}
        and r.org_id = ${org} and r.status = 'active'
        and r.role = any(${textArray(STAFF_ROLES)})) as staff_invited,
      ${signedIn(STAFF_ROLES)} as staff_signed_in,
      exists (select 1 from core.student_school_years s where s.tenant_id = ${tenant}
        and s.org_id = ${org} and s.status = 'active') as students_imported,
      exists (select 1 from core.user_relationships u
        join core.student_school_years s on s.tenant_id = u.tenant_id
          and s.student_user_id = u.student_user_id and s.org_id = ${org} and s.status = 'active'
        where u.tenant_id = ${tenant} and u.status = 'active') as guardians_linked,
      exists (select 1 from core.class_meetings c
        join core.academic_sessions y on y.tenant_id = c.tenant_id and y.id = c.school_year_id
          and y.status = 'active' and y.lifecycle in ('current', 'upcoming')
        where c.tenant_id = ${tenant} and c.org_id = ${org} and c.status = 'active') as timetable_ready,
      ${signedIn(FAMILY_ROLES)} as families_signed_in,
      exists (select 1 from core.assignments a where a.tenant_id = ${tenant}
        and a.org_id = ${org} and a.status = 'active' and a.state <> 'draft') as first_assignment,
      exists (select 1 from core.attendance_registers g where g.tenant_id = ${tenant}
        and g.org_id = ${org} and g.status = 'active' and g.state = 'submitted') as first_register,
      exists (select 1 from core.site_settings w
        join core.site_published_pages p on p.tenant_id = w.tenant_id and p.org_id = w.org_id
          and p.status = 'active'
        where w.tenant_id = ${tenant} and w.org_id = ${org} and w.live) as website_published,
      exists (select 1 from core.admission_intakes i where i.tenant_id = ${tenant}
        and i.org_id = ${org} and i.status = 'active') as admissions_ready`);
  if (!row) return [];
  return (Object.keys(row) as OnboardingItem[]).filter((item) => row[item]);
}

/**
 * Days of the last week the school's own calendar counts as school days,
 * so a quiet week can be told apart from a holiday.
 */
export async function schoolDaysLastWeek(
  tx: CellTransaction,
  input: { tenantId: string; orgId: string; today: string },
): Promise<number> {
  const [row] = await tx.execute<{ days: number }>(sql`
    select count(distinct d.day_on)::int as days
    from core.calendar_dates d
    join core.calendars c on c.tenant_id = d.tenant_id and c.id = d.calendar_id
      and c.kind = 'school' and c.status = 'active' and c.org_id = ${input.orgId}::uuid
    join core.descriptors e on e.tenant_id = d.tenant_id and e.id = d.event_descriptor_id
    where d.tenant_id = ${input.tenantId}::uuid and d.status = 'active'
      and d.day_on between ${addDays(input.today, -6)}::date and ${input.today}::date
      and e.system_meaning = any(${textArray(SCHOOL_DAY_MEANINGS)})`);
  return row?.days ?? 0;
}

/** Messages to the school's people that failed for good since a moment. */
export async function failedDeliveriesSince(
  tx: CellTransaction,
  input: { tenantId: string; orgId: string; since: Date },
): Promise<number> {
  const [row] = await tx.execute<{ failed: number }>(sql`
    select count(*)::int as failed
    from core.notification_deliveries d
    left join core.notifications n on n.tenant_id = d.tenant_id and n.id = d.notification_id
      and n.created_at = d.notification_created_at
    left join core.messages m on m.tenant_id = d.tenant_id and m.id = d.message_id
    left join core.message_threads t on t.tenant_id = m.tenant_id and t.id = m.thread_id
    where d.tenant_id = ${input.tenantId}::uuid and d.state = 'failed'
      and d.created_at >= ${input.since.toISOString()}::timestamptz
      and coalesce(d.org_id, n.org_id, t.org_id) = ${input.orgId}::uuid`);
  return row?.failed ?? 0;
}
