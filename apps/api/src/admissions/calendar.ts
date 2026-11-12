import { bookedBetween } from "@faridalms/database/stores/admission-decisions";

import { calendarSources } from "../calendar/points";
import { contribute } from "../core/extension";
import { can } from "../core/procedure";

/**
 * The tours, assessments and interviews admissions books, in the calendar
 * of the staff who attend them; those who work admissions see every one.
 */
export const admissionsCalendar = contribute(calendarSources, {
  category: "admissions",
  shows: (context) =>
    can(context, "admissions:read") || can(context, "admissions:manage"),
  async between(context, input) {
    const every =
      can(context, "admissions:read") || can(context, "admissions:manage");
    const booked = await bookedBetween(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      from: input.from,
      to: input.to,
      attendeeId: every ? null : context.actor.userId,
    });
    return booked.map((row) => ({
      id: row.id,
      titleEn: row.applicantNameEn,
      titleAr: row.applicantNameAr,
      startsOn: row.startsOn,
      endsOn: row.startsOn,
      startTime: row.startTime,
      endTime: row.endTime,
      location: row.location || null,
      cancelled: row.outcome === "cancelled",
      origin: { key: "admission", id: row.applicationId, kind: row.kind },
    }));
  },
});
