export const SCHOOL_YEAR_STATUSES = ["planning", "active", "closed"] as const;
export type SchoolYearStatus = (typeof SCHOOL_YEAR_STATUSES)[number];
