import type {
  AssignmentStatus,
  AssignmentWindow,
  LatePolicy,
  LearnerState,
  ResubmissionPolicy,
  SubmissionFormat,
} from "@faridalms/domain/assignment";

import { Badge } from "@faridalms/ui/badge";

import * as m from "~/i18n/messages";

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, () => string> = {
  draft: m.assignmentStatusDraft,
  published: m.assignmentStatusPublished,
  archived: m.assignmentStatusArchived,
};
export const WINDOW_LABEL: Record<AssignmentWindow, () => string> = {
  scheduled: m.assignmentWindowScheduled,
  open: m.assignmentWindowOpen,
  late: m.assignmentWindowLate,
  closed: m.assignmentWindowClosed,
};
export const LEARNER_STATE_LABEL: Record<LearnerState, () => string> = {
  scheduled: m.learnerStateScheduled,
  not_started: m.learnerStateNotStarted,
  draft: m.learnerStateDraft,
  submitted: m.learnerStateSubmitted,
  returned: m.learnerStateReturned,
  missing: m.learnerStateMissing,
};
export const LATE_POLICY_LABEL: Record<LatePolicy, () => string> = {
  not_accepted: m.latePolicyNotAccepted,
  accepted: m.latePolicyAccepted,
  accepted_with_deduction: m.latePolicyDeduction,
};
export const SUBMISSION_FORMAT_LABEL: Record<SubmissionFormat, () => string> = {
  written: m.submissionFormatWritten,
  files: m.submissionFormatFiles,
  written_and_files: m.submissionFormatBoth,
};
export const RESUBMISSION_LABEL: Record<ResubmissionPolicy, () => string> = {
  not_allowed: m.resubmissionNotAllowed,
  until_due: m.resubmissionUntilDue,
  until_close: m.resubmissionUntilClose,
};

const STATUS_CLASS: Record<AssignmentStatus, string> = {
  draft:
    "border-transparent bg-[var(--warning)]/20 text-[var(--warning-foreground)] dark:text-[var(--warning)]",
  published: "border-transparent bg-[var(--success)]/15 text-[var(--success)]",
  archived: "border-transparent bg-muted text-muted-foreground",
};
export function AssignmentStatusBadge({
  status,
}: {
  status: AssignmentStatus;
}) {
  return (
    <Badge className={STATUS_CLASS[status]}>
      {ASSIGNMENT_STATUS_LABEL[status]()}
    </Badge>
  );
}

const WINDOW_CLASS: Record<AssignmentWindow, string> = {
  scheduled: "border-transparent bg-muted text-muted-foreground",
  open: "border-transparent bg-primary/10 text-primary",
  late: "border-transparent bg-[var(--warning)]/20 text-[var(--warning-foreground)] dark:text-[var(--warning)]",
  closed: "border-transparent bg-destructive/15 text-destructive",
};
export function WindowBadge({ window }: { window: AssignmentWindow }) {
  return (
    <Badge className={WINDOW_CLASS[window]}>{WINDOW_LABEL[window]()}</Badge>
  );
}

const LEARNER_CLASS: Record<LearnerState, string> = {
  scheduled: "border-transparent bg-muted text-muted-foreground",
  not_started: "",
  draft:
    "border-transparent bg-[var(--warning)]/20 text-[var(--warning-foreground)] dark:text-[var(--warning)]",
  submitted: "border-transparent bg-primary/10 text-primary",
  returned: "border-transparent bg-[var(--success)]/15 text-[var(--success)]",
  missing: "border-transparent bg-destructive/15 text-destructive",
};
export function LearnerStateBadge({
  state,
  late = false,
}: {
  state: LearnerState;
  late?: boolean;
}) {
  return (
    <Badge
      variant={state === "not_started" ? "outline" : "default"}
      className={LEARNER_CLASS[state]}
    >
      {LEARNER_STATE_LABEL[state]()}
      {late && (state === "submitted" || state === "returned")
        ? ` · ${m.assignmentWindowLate()}`
        : null}
    </Badge>
  );
}
