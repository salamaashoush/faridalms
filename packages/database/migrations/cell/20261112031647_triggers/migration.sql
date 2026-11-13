create trigger row_meta before insert or update on core.absence_reports for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.academic_sessions for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.academic_weeks for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.access_arrangements for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.access_role_assignments
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.access_roles for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.accounts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.admission_applications
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.admission_events for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.admission_forms for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.admission_intakes for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.admission_items for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.assessments for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.assignment_recipients
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.assignment_terms for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.assignments for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.assistant_requests for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.assistant_settings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.attendance_events for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.attendance_registers
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.attendance_settings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.bank_comments for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.bank_questions for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.bell_schedules for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.breaches for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.broadcast_audiences for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.broadcast_families
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.broadcast_grades
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.broadcast_recipients
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.broadcasts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.calendar_dates for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.calendar_event_audiences
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.calendar_event_families
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.calendar_event_grades
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.calendar_events for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.calendar_feeds for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.caption_drafts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.class_grades
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.class_grading for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.class_group_members for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.class_groups for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.class_lesson_settings
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.class_meetings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.class_periods for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.class_running_grades for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.class_years for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.classes for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.contact_points for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.emergency_contacts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.courses for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.demographics
  for each row execute function app.row_meta_keyed('user_id');
create trigger row_meta before insert or update on core.descriptor_overrides
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.descriptors for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.devices for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.discussion_likes for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.discussion_posts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.document_comments for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.document_files for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.document_links for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.document_templates for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.document_threads for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.document_translations
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.documents for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.enrollments for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.external_ids for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.family_shares for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.federated_identities
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.file_previews for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.file_publications for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.file_subjects for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.files for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.goal_judgements for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.goal_reports for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.grade_scale_versions
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.grade_scales for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.grade_level_settings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.gradebook_settings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.homeroom_classes for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.homeroom_members for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.homerooms for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.identity_provider_orgs
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.identity_providers for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.import_runs for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.intake_grades
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.intake_years
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.learning_modules for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.legal_holds for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lesson_changes for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lesson_code for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lesson_openings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lesson_progress for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lesson_projects for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lesson_releases for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lesson_shares for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lesson_sittings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lesson_watches for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.lessons for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.locations for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.login_identities for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.media_folders for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.media_item_tags for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.media_item_texts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.media_tags for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.message_contacts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.message_drafts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.message_threads for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.messages for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.module_audiences for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.module_classes for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.module_discussions for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.module_templates for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.notification_deliveries
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.notifications for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.org_features for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.orgs for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.paced_lessons for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.passkeys for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.peer_review_comments
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.peer_review_settings
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.peer_reviews for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.period_grades for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.privacy_notices for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.program_remarks for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.programme_categories
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.programme_grade_levels
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.programmes for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.quiz_answers for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.quiz_draws for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.quiz_sittings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.reading_norms for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.records_requests for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.register_periods for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.relationship_restrictions
  for each row execute function app.row_meta_keyed('relationship_id');
create trigger row_meta before insert or update on core.retention_settings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.rubrics for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.saved_views for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.shared_blocks for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_categories for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_classes for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_enquiries for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_pages for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_posts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_published_pages
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_published_posts
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_redirects for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.site_settings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.staff_absences for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.standard_evidence for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.standard_frameworks for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.standard_observations
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.standard_sittings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.standards for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.student_departures for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.student_movements for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.student_grades
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.student_school_years
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.submission_attempts for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.submissions for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.tenants
  for each row execute function app.row_meta_keyed('tenant_id');
create trigger row_meta before insert or update on core.thread_members for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.timetable_days for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.timetables for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.user_preferences for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.user_relationships for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.user_roles for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.users for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.work_comment_answers
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.work_comment_replies
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.work_comments for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.work_sittings for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.year_rollovers for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.young_classes for each row execute function app.row_meta();
create trigger row_meta before insert or update on health.records for each row execute function app.row_meta();
create trigger row_meta before insert or update on health.requested_changes for each row execute function app.row_meta();

create trigger refuse_update_delete before delete or update on audit.anchors
  for each row execute function audit.refuse_change();
create trigger hash_row before insert on audit.log for each row execute function audit.hash_row();
create trigger refuse_truncate before truncate on audit.log for each statement execute function audit.refuse_change();
create trigger refuse_update_delete before delete or update on audit.log
  for each row execute function audit.refuse_change();
create trigger check_payload before insert on audit.payloads for each row execute function audit.check_payload();
create trigger refuse_update before update on audit.payloads for each row execute function audit.refuse_change();
create trigger refuse_update_delete before delete or update on audit.seal_batches
  for each row execute function audit.refuse_change();
create trigger refuse_update_delete before delete or update on audit.seal_members
  for each row execute function audit.refuse_change();

-- A period register and its period are written in one unit of work, so the
-- check waits for its end. It holds whether attendance or the timetable is on.
create constraint trigger register_period_held after insert or update of kind, status
  on core.attendance_registers deferrable initially deferred
  for each row execute function app.register_period_held();
create constraint trigger register_period_held after update of status or delete
  on core.register_periods deferrable initially deferred
  for each row execute function app.register_period_held();

create trigger documents_frozen_guard before update on core.documents
  for each row execute function app.documents_frozen_guard();

create trigger index_host after insert or update of title, status, org_id on core.assignments
  for each row execute function app.index_host('assignment', 'title');
create trigger index_host after insert or update of title_ar, title_en, status, org_id on core.broadcasts
  for each row execute function app.index_host('announcement', 'title_ar', 'title_en');
create trigger index_host after insert or update of title_en, title_ar, location, status, org_id on core.calendar_events
  for each row execute function app.index_host('calendar_event', 'title_en', 'title_ar', 'location');
create trigger index_host after insert or update of title_ar, title_en, code, status, org_id on core.classes
  for each row execute function app.index_host('class', 'title_ar', 'title_en', 'code');
create trigger index_translation after insert on core.document_translations
  for each row execute function app.index_translation();
create trigger index_translation_change after update of plain_text, status on core.document_translations
  for each row when (((old.plain_text is distinct from new.plain_text) or (old.status is distinct from new.status))) execute function app.index_translation();
create trigger index_document after insert on core.documents for each row execute function app.index_document();
create trigger index_document_change after update of plain_text, status, org_id on core.documents
  for each row when (((old.plain_text is distinct from new.plain_text) or (old.status is distinct from new.status) or (old.org_id is distinct from new.org_id))) execute function app.index_document();
create trigger index_host after insert or update of title, status, org_id on core.learning_modules
  for each row execute function app.index_host('learning_module', 'title');
create trigger index_host after insert or update of title, status on core.lessons
  for each row execute function app.index_host('lesson', 'title');
create trigger index_host after insert or update of subject, status, org_id on core.message_threads
  for each row execute function app.index_host('message_thread', 'subject');
create trigger index_message after insert or update of body, status, redacted_at on core.messages
  for each row execute function app.index_message();
create trigger index_user_orgs after insert or update of org_id, status, valid_during on core.user_roles
  for each row execute function app.index_user_orgs();
create trigger index_user after insert or update of full_name_ar, full_name_en, preferred_given_name, preferred_family_name, status, erased_at on core.users
  for each row execute function app.index_user();
