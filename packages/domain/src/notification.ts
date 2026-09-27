/** Audiences of the per-school announcements table, which the legacy import reads. */
export const ANNOUNCEMENT_AUDIENCES = [
  "everyone",
  "parents",
  "students",
  "teachers",
] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];
