import type { ContentDocument } from "@faridalms/domain/content";
import type { EVENT_CATEGORIES } from "@faridalms/domain/school-schema";

export interface SchoolEvent {
  id: string;
  title: string;
  description: string | null;
  document: ContentDocument | null;
  category: (typeof EVENT_CATEGORIES)[number];
  startsOn: string;
  endsOn: string;
  provisional: boolean;
  updatedAt: Date;
  revision: number;
}

export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const eventColors = {
  general: "#407a64",
  national_vacation: "#b47434",
  school_vacation: "#7164a7",
};
