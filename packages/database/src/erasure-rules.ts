/**
 * What erasing a person does to each table that names one. Erasure empties
 * the person's row in core.users, so a reference a table keeps then names
 * nobody: "kept" is for school records the law or the school must hold.
 * "to_erase" is erasure proposed but not yet built. Neither is settled
 * until the owner's and the lawyer's review marks it reviewed.
 */
export type ErasureRule =
  | { rule: "erased" }
  | { rule: "kept" | "to_erase"; why: string; reviewed: boolean };

/** Every table with a key to core.users; `bun run db:verify` refuses one missing here. */
export const ERASURE_RULES: Record<string, ErasureRule> = {
  "core.absence_reports": {
    rule: "to_erase",
    why: "A family's note and file about an absence; the attendance mark it explains stays in attendance_events.",
    reviewed: false,
  },
  "core.access_arrangements": { rule: "erased" },
  "core.access_role_assignments": {
    rule: "to_erase",
    why: "The roles a person held; nothing outside the person's own access needs them.",
    reviewed: false,
  },
  "core.accounts": { rule: "erased" },
  "core.admission_applications": { rule: "erased" },
  "core.admission_entries": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.admission_form_versions": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.admission_letters": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.assessments": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.assignment_recipients": {
    rule: "to_erase",
    why: "Who was set a piece of work: the student's learning activity.",
    reviewed: false,
  },
  "core.assignments": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.attempt_authentications": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.attempt_declarations": {
    rule: "to_erase",
    why: "A student's declaration on their own work; held with the work while an exam session keeps it.",
    reviewed: false,
  },
  "core.attendance_contacts": {
    rule: "to_erase",
    why: "Calls about an absence, being moved into Messages.",
    reviewed: false,
  },
  "core.attendance_events": {
    rule: "kept",
    why: "The statutory attendance record.",
    reviewed: false,
  },
  "core.attendance_registers": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.bank_comments": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.bank_questions": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.breaches": {
    rule: "kept",
    why: "The breach register the law requires; names the staff who logged and closed it.",
    reviewed: false,
  },
  "core.broadcast_recipients": {
    rule: "to_erase",
    why: "Who was sent a notice and whether they read it.",
    reviewed: false,
  },
  "core.broadcasts": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.calendar_events": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.calendar_feeds": { rule: "erased" },
  "core.caption_drafts": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.class_group_members": {
    rule: "to_erase",
    why: "A student's place in a working group.",
    reviewed: false,
  },
  "core.class_groups": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.class_meetings": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.consent_records": {
    rule: "kept",
    why: "Proof of consent given or refused, which the law asks the school to show.",
    reviewed: false,
  },
  "core.contact_points": { rule: "erased" },
  "core.coursework_assessments": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.demographics": { rule: "erased" },
  "core.discussion_posts": { rule: "erased" },
  "core.document_holds": { rule: "erased" },
  "core.document_comments": {
    rule: "to_erase",
    why: "Words a member of staff wrote to colleagues while writing a document.",
    reviewed: false,
  },
  "core.document_templates": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.document_threads": {
    rule: "kept",
    why: "Names the member of staff who started or resolved it; its words are in core.document_comments.",
    reviewed: false,
  },
  "core.document_translations": { rule: "erased" },
  "core.document_versions": { rule: "erased" },
  "core.documents": { rule: "erased" },
  "core.enrollments": { rule: "erased" },
  "core.erasure_approvals": {
    rule: "kept",
    why: "The record of the erasure itself.",
    reviewed: false,
  },
  "core.external_ids": { rule: "erased" },
  "core.family_shares": {
    rule: "to_erase",
    why: "What a family shared from a child's work.",
    reviewed: false,
  },
  "core.file_subjects": { rule: "erased" },
  "core.files": { rule: "erased" },
  "core.goal_judgements": { rule: "erased" },
  "core.grade_scale_versions": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.import_runs": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.learning_modules": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.legal_holds": {
    rule: "kept",
    why: "A hold the school placed; it stops erasure while it stands.",
    reviewed: false,
  },
  "core.lesson_changes": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.lesson_code": { rule: "erased" },
  "core.lesson_openings": {
    rule: "to_erase",
    why: "A student's learning activity.",
    reviewed: false,
  },
  "core.lesson_progress": {
    rule: "to_erase",
    why: "A student's learning activity.",
    reviewed: false,
  },
  "core.lesson_projects": { rule: "erased" },
  "core.lesson_releases": {
    rule: "to_erase",
    why: "A student's learning activity.",
    reviewed: false,
  },
  "core.lesson_responses": { rule: "erased" },
  "core.lesson_runs": { rule: "erased" },
  "core.lesson_shares": { rule: "erased" },
  "core.lesson_watches": {
    rule: "to_erase",
    why: "A student's learning activity.",
    reviewed: false,
  },
  "core.lessons": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.login_identities": { rule: "erased" },
  "core.lti_scores": { rule: "erased" },
  "core.message_contacts": { rule: "erased" },
  "core.message_drafts": { rule: "erased" },
  "core.message_threads": { rule: "erased" },
  "core.messages": { rule: "erased" },
  "core.module_audiences": { rule: "erased" },
  "core.notification_deliveries": { rule: "erased" },
  "core.notifications": {
    rule: "to_erase",
    why: "What a person was told in the app.",
    reviewed: false,
  },
  "core.paced_lessons": {
    rule: "to_erase",
    why: "Names the student whose work was shown to the class.",
    reviewed: false,
  },
  "core.peer_reviews": { rule: "erased" },
  "core.period_grades": {
    rule: "kept",
    why: "The school's grade record, which a transcript is made from.",
    reviewed: false,
  },
  "core.privacy_notices": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.program_remarks": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.quiz_answers": { rule: "erased" },
  "core.records_requests": {
    rule: "kept",
    why: "The register of records requests the law requires.",
    reviewed: false,
  },
  "core.rubrics": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.saved_views": { rule: "erased" },
  "core.shared_blocks": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.site_enquiries": { rule: "erased" },
  "core.site_enquiry_entries": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.site_pages": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.site_redirects": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "core.staff_absences": {
    rule: "kept",
    why: "The school's record of cover; how long to keep it is for review.",
    reviewed: false,
  },
  "core.standard_evidence": { rule: "erased" },
  "core.standard_observations": { rule: "erased" },
  "core.student_movements": {
    rule: "kept",
    why: "The safeguarding record of who arrived, left and collected a child.",
    reviewed: false,
  },
  "core.student_school_years": { rule: "erased" },
  "core.submission_attempts": {
    rule: "to_erase",
    why: "A student's own work; held while an exam session keeps it.",
    reviewed: false,
  },
  "core.submissions": {
    rule: "to_erase",
    why: "A student's own work; held while an exam session keeps it.",
    reviewed: false,
  },
  "core.thread_members": { rule: "erased" },
  "core.user_preferences": { rule: "erased" },
  "core.user_relationships": { rule: "erased" },
  "core.user_roles": { rule: "erased" },
  "core.work_comment_answers": {
    rule: "to_erase",
    why: "Words a student wrote.",
    reviewed: false,
  },
  "core.work_comment_replies": {
    rule: "to_erase",
    why: "Words someone wrote.",
    reviewed: false,
  },
  "core.work_comments": {
    rule: "to_erase",
    why: "Words someone wrote.",
    reviewed: false,
  },
  "core.year_rollovers": {
    rule: "kept",
    why: "Names the member of staff who did it; the record belongs to the school.",
    reviewed: false,
  },
  "health.records": { rule: "erased" },
  "health.requested_changes": { rule: "erased" },
};
