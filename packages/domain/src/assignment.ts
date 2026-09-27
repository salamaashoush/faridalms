export const ASSIGNMENT_STATUSES = ["draft", "published", "archived"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
export const SUBMISSION_FORMATS = [
  "written",
  "files",
  "written_and_files",
] as const;
export type SubmissionFormat = (typeof SUBMISSION_FORMATS)[number];
export const LATE_POLICIES = [
  "not_accepted",
  "accepted",
  "accepted_with_deduction",
] as const;
export type LatePolicy = (typeof LATE_POLICIES)[number];
export const RESUBMISSION_POLICIES = [
  "not_allowed",
  "until_due",
  "until_close",
] as const;
export type ResubmissionPolicy = (typeof RESUBMISSION_POLICIES)[number];
export const RECIPIENT_MODES = ["class", "groups", "students"] as const;

export interface RubricCriterion {
  id: string;
  title: string;
  description: string;
  maxPoints: number;
}

export type AssignmentWindow = "scheduled" | "open" | "late" | "closed";

interface AssignmentSchedule {
  availableFrom: string | Date | null;
  dueAt: string | Date;
  closesAt: string | Date | null;
  latePolicy: LatePolicy;
}

function millis(value: string | Date): number {
  return typeof value === "string" ? Date.parse(value) : value.getTime();
}

/** Where `now` falls in an assignment's timeline. */
export function assignmentWindow(
  schedule: AssignmentSchedule,
  now: string | Date,
): AssignmentWindow {
  const at = millis(now);
  if (schedule.availableFrom && at < millis(schedule.availableFrom))
    return "scheduled";
  if (at <= millis(schedule.dueAt)) return "open";
  if (schedule.latePolicy === "not_accepted") return "closed";
  if (schedule.closesAt && at > millis(schedule.closesAt)) return "closed";
  return "late";
}

export type LearnerState =
  | "scheduled"
  | "not_started"
  | "draft"
  | "submitted"
  | "returned"
  | "missing";

/** The one word a learner or parent needs about where the work stands. */
export function learnerState(input: {
  window: AssignmentWindow;
  hasDraft: boolean;
  attempts: number;
  released: boolean;
}): LearnerState {
  if (input.attempts > 0) return input.released ? "returned" : "submitted";
  if (input.window === "scheduled") return "scheduled";
  if (input.window === "closed") return "missing";
  return input.hasDraft ? "draft" : "not_started";
}
