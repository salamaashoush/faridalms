alter table audit.anchors force row level security;
grant select, insert on audit.anchors to worker, cell_io;
grant select on audit.anchors to app, retention;

alter table audit.log force row level security;
grant select, insert on audit.log to app, worker, cell_io;
grant select on audit.log to retention;
grant insert on audit.log to integration;

alter table audit.payloads force row level security;
grant select, insert on audit.payloads to app, worker, cell_io;
grant select, delete on audit.payloads to retention;

alter table audit.seal_batches force row level security;
grant select, insert on audit.seal_batches to worker, cell_io;
grant select on audit.seal_batches to app, retention;

alter table audit.seal_members force row level security;
grant select, insert on audit.seal_members to worker, cell_io;
grant select on audit.seal_members to app, retention;

alter table core.absence_reports force row level security;
grant select, insert, update on core.absence_reports to app, worker, cell_io;
grant select, delete on core.absence_reports to retention;
grant update (status, metadata) on core.absence_reports to retention;

alter table core.academic_sessions force row level security;
grant select, insert, update on core.academic_sessions to app, worker, cell_io;
grant select on core.academic_sessions to integration, retention;
grant select (tenant_id, id, org_id, type, title_en, title_ar, span, status) on
  core.academic_sessions to site;

alter table core.academic_weeks force row level security;
grant select, insert, update on core.academic_weeks to app, worker, cell_io;
grant select on core.academic_weeks to integration, retention;

alter table core.access_arrangements force row level security;
grant select, insert, update on core.access_arrangements to app, worker, cell_io;
grant select, delete on core.access_arrangements to retention;
grant update (status, metadata) on core.access_arrangements to retention;

alter table core.access_role_assignments force row level security;
grant select, insert, update on core.access_role_assignments to app, worker, cell_io;
grant select, delete on core.access_role_assignments to retention;
grant update (status, metadata) on core.access_role_assignments to retention;

alter table core.access_roles force row level security;
grant select, insert, update on core.access_roles to worker, cell_io;
grant select, insert on core.access_roles to app;
grant select on core.access_roles to retention;
grant update (name_en, name_ar, description_en, description_ar, capabilities, status, metadata) on
  core.access_roles to app;

alter table core.accounts force row level security;
grant select, insert, update on core.accounts to worker, cell_io;
grant select, insert on core.accounts to app;
grant select on core.accounts to integration, retention;
grant update (state, first_authenticated_at, last_authenticated_at, state_changed_at,
  state_changed_by_user_id, state_reason, status, metadata) on core.accounts to app;
grant update (status, metadata) on core.accounts to retention;

alter table core.admission_applications force row level security;
grant select, insert, update on core.admission_applications to app, worker, cell_io;
grant select on core.admission_applications to retention;
grant update (form, answers, matches, status, metadata) on core.admission_applications to retention;

alter table core.admission_entries force row level security;
grant select, insert on core.admission_entries to app, worker, cell_io;
grant select on core.admission_entries to retention;

alter table core.admission_events force row level security;
grant select, insert, update on core.admission_events to app, worker, cell_io;
grant select on core.admission_events to retention;
grant update (location, result, status, metadata) on core.admission_events to retention;

alter table core.admission_form_versions force row level security;
grant select, insert on core.admission_form_versions to app, worker, cell_io;
grant select on core.admission_form_versions to retention;

alter table core.admission_forms force row level security;
grant select, insert, update on core.admission_forms to app, worker, cell_io;
grant select on core.admission_forms to retention;

alter table core.admission_intakes force row level security;
grant select, insert, update on core.admission_intakes to app, worker, cell_io;
grant select on core.admission_intakes to retention;
grant select (tenant_id, id, org_id, title_en, title_ar, starts_on, opens_on, closes_on,
  currency, fees, decisions_on, status) on core.admission_intakes to site;

alter table core.admission_items force row level security;
grant select, insert, update on core.admission_items to app, worker, cell_io;
grant select on core.admission_items to retention;

alter table core.admission_letters force row level security;
grant select, insert on core.admission_letters to app, worker, cell_io;
grant select on core.admission_letters to retention;

alter table core.assessments force row level security;
grant select, insert, update on core.assessments to app, worker, cell_io;
grant select on core.assessments to integration, retention;

alter table core.assignment_recipients force row level security;
grant select, insert, update on core.assignment_recipients to app, worker, cell_io;
grant select, delete on core.assignment_recipients to retention;
grant update (status, metadata) on core.assignment_recipients to retention;

alter table core.assignment_terms force row level security;
grant select, insert, update on core.assignment_terms to app, worker, cell_io;
grant select on core.assignment_terms to retention;

alter table core.assignments force row level security;
grant select, insert, update on core.assignments to app, worker, cell_io;
grant select on core.assignments to integration, retention;

alter table core.assistant_requests force row level security;
grant select, insert, update on core.assistant_requests to app, worker, cell_io;
grant select on core.assistant_requests to retention;

alter table core.assistant_settings force row level security;
grant select, insert, update on core.assistant_settings to app, worker, cell_io;
grant select on core.assistant_settings to retention;

alter table core.attendance_events force row level security;
grant select, insert, update on core.attendance_events to app, worker, cell_io;
grant select on core.attendance_events to retention;

alter table core.attendance_registers force row level security;
grant select, insert, update on core.attendance_registers to app, worker, cell_io;
grant select on core.attendance_registers to retention;

alter table core.attendance_settings force row level security;
grant select, insert, update on core.attendance_settings to app, worker, cell_io;
grant select on core.attendance_settings to retention;

alter table core.auth_attempts force row level security;
grant select, insert, update on core.auth_attempts to app, worker;
grant select, delete on core.auth_attempts to retention;

alter table core.bank_comments force row level security;
grant select, insert, update on core.bank_comments to app, worker, cell_io;
grant select on core.bank_comments to retention;

alter table core.bank_questions force row level security;
grant select, insert, update on core.bank_questions to app, worker, cell_io;
grant select on core.bank_questions to retention;

alter table core.bell_schedules force row level security;
grant select, insert, update on core.bell_schedules to app, worker, cell_io;
grant select on core.bell_schedules to retention;

alter table core.breaches force row level security;
grant select, insert, update on core.breaches to app, worker, cell_io;
grant select on core.breaches to retention;

alter table core.broadcast_audiences force row level security;
grant select, insert, update on core.broadcast_audiences to app, worker, cell_io;
grant select on core.broadcast_audiences to retention;

alter table core.broadcast_families force row level security;
grant select, insert, update on core.broadcast_families to app, worker, cell_io;
grant select on core.broadcast_families to retention;

alter table core.broadcast_grades force row level security;
grant select, insert, update on core.broadcast_grades to app, worker, cell_io;
grant select on core.broadcast_grades to retention;

alter table core.broadcast_recipients force row level security;
grant select, insert, update on core.broadcast_recipients to app, worker, cell_io;
grant select, delete on core.broadcast_recipients to retention;
grant update (status, metadata) on core.broadcast_recipients to retention;

alter table core.broadcasts force row level security;
grant select, insert, update on core.broadcasts to app, worker, cell_io;
grant select on core.broadcasts to retention;

alter table core.calendar_dates force row level security;
grant select, insert, update on core.calendar_dates to app, worker, cell_io;
grant select on core.calendar_dates to integration, retention;

alter table core.calendar_event_audiences force row level security;
grant select, insert, update on core.calendar_event_audiences to app, worker, cell_io;
grant select on core.calendar_event_audiences to retention;

alter table core.calendar_event_families force row level security;
grant select, insert, update on core.calendar_event_families to app, worker, cell_io;
grant select on core.calendar_event_families to retention;

alter table core.calendar_event_grades force row level security;
grant select, insert, update on core.calendar_event_grades to app, worker, cell_io;
grant select on core.calendar_event_grades to retention;

alter table core.calendar_events force row level security;
grant select, insert, update on core.calendar_events to app, worker, cell_io;
grant select on core.calendar_events to retention;
grant select (tenant_id, id, org_id, category, starts_on, ends_on, start_time, end_time, location,
  provisional, cancelled, status, state, title_en, title_ar, public) on core.calendar_events to
  site;

alter table core.calendar_feeds force row level security;
grant select, insert, update on core.calendar_feeds to app, worker, cell_io;
grant select, delete on core.calendar_feeds to retention;
grant update (status, metadata) on core.calendar_feeds to retention;



alter table core.caption_drafts force row level security;
grant select, insert, update on core.caption_drafts to app, worker, cell_io;
grant select on core.caption_drafts to retention;

alter table core.class_grades force row level security;
grant select, insert, update on core.class_grades to app, worker, cell_io;
grant select on core.class_grades to integration, retention;

alter table core.class_grading force row level security;
grant select, insert, update on core.class_grading to app, worker, cell_io;
grant select on core.class_grading to retention;

alter table core.class_group_members force row level security;
grant select, insert, update on core.class_group_members to app, worker, cell_io;
grant select, delete on core.class_group_members to retention;
grant update (status, metadata) on core.class_group_members to retention;

alter table core.class_groups force row level security;
grant select, insert, update on core.class_groups to app, worker, cell_io;
grant select on core.class_groups to retention;

alter table core.class_lesson_settings force row level security;
grant select, insert, update on core.class_lesson_settings to app, worker, cell_io;
grant select on core.class_lesson_settings to retention;

alter table core.class_meetings force row level security;
grant select, insert, update on core.class_meetings to app, worker, cell_io;
grant select on core.class_meetings to retention;

alter table core.class_periods force row level security;
grant select, insert, update on core.class_periods to app, worker, cell_io;
grant select on core.class_periods to integration, retention;

alter table core.class_running_grades force row level security;
grant select, insert, update on core.class_running_grades to app, worker, cell_io;
grant select on core.class_running_grades to retention;

alter table core.class_years force row level security;
grant select, insert, update on core.class_years to app, worker, cell_io;
grant select on core.class_years to integration, retention;

alter table core.classes force row level security;
grant select, insert, update on core.classes to app, worker, cell_io;
grant select on core.classes to integration, retention;

alter table core.consent_guardians force row level security;
grant select, insert on core.consent_guardians to app, worker, cell_io;
grant select on core.consent_guardians to retention;

alter table core.consent_records force row level security;
grant select, insert on core.consent_records to app, worker, cell_io;
grant select on core.consent_records to retention;

alter table core.contact_points force row level security;
grant select, insert, update on core.contact_points to app, worker, cell_io;
grant select, delete on core.contact_points to retention;
grant select on core.contact_points to integration;
grant update (status, metadata) on core.contact_points to retention;

alter table core.courses force row level security;
grant select, insert, update on core.courses to app, worker, cell_io;
grant select on core.courses to integration, retention;

grant select on core.current_consents to app, worker, cell_io, retention;

alter table core.demographics force row level security;
grant select, insert, update on core.demographics to app, worker, cell_io;
grant select on core.demographics to integration, retention;
grant update (birth_country_code, birth_city, nationality_codes, religion_descriptor_id,
  home_languages, status, metadata) on core.demographics to retention;

alter table core.descriptor_overrides force row level security;
grant select, insert, update on core.descriptor_overrides to app, worker, cell_io;
grant select on core.descriptor_overrides to integration, retention;
grant select (tenant_id, descriptor_id, org_id, label_en, label_ar, sort_order, status) on
  core.descriptor_overrides to site;

alter table core.descriptors force row level security;
grant select, insert, update on core.descriptors to worker, cell_io;
grant select, insert on core.descriptors to app;
grant select on core.descriptors to integration, retention;
grant select (tenant_id, id, namespace, label_en, label_ar, system_meaning, sort_order, status) on
  core.descriptors to site;
grant update (label_en, label_ar, description_en, description_ar, sort_order, color, icon,
  effective_during, status, metadata) on core.descriptors to app;

alter table core.devices force row level security;
grant select, insert, update on core.devices to app, worker, cell_io;
grant select, delete on core.devices to retention;
grant update (status, metadata) on core.devices to retention;

alter table core.discussion_likes force row level security;
grant select, insert, update on core.discussion_likes to app, worker, cell_io;
grant select, delete on core.discussion_likes to retention;
grant update (status, metadata) on core.discussion_likes to retention;

alter table core.discussion_posts force row level security;
grant select, insert, update on core.discussion_posts to app, worker, cell_io;
grant select on core.discussion_posts to retention;
grant update (content, plain_text, redacted_at) on core.discussion_posts to retention;

alter table core.document_comments force row level security;
grant select, insert, update on core.document_comments to app, worker, cell_io;
grant select, delete on core.document_comments to retention;
grant update (status, metadata) on core.document_comments to retention;

alter table core.document_files force row level security;
grant select, insert, update on core.document_files to app, worker, cell_io;
grant select, delete on core.document_files to retention;
grant update (status, metadata) on core.document_files to retention;

alter table core.document_holds force row level security;
grant select, insert, update on core.document_holds to app, worker;
grant select, delete on core.document_holds to retention;

alter table core.document_links force row level security;
grant select, insert, update on core.document_links to app, worker, cell_io;
grant select on core.document_links to retention;

alter table core.document_templates force row level security;
grant select, insert, update on core.document_templates to app, worker, cell_io;
grant select on core.document_templates to retention;

alter table core.document_threads force row level security;
grant select, insert, update on core.document_threads to app, worker, cell_io;
grant select on core.document_threads to retention;

alter table core.document_translations force row level security;
grant select, insert, update on core.document_translations to app, worker, cell_io;
grant select on core.document_translations to retention;
grant update (content, plain_text, status, metadata) on core.document_translations to retention;

alter table core.document_versions force row level security;
grant select, insert on core.document_versions to app, worker, collab, cell_io;
grant select on core.document_versions to retention;
grant update (ydoc_snapshot, content, plain_text, redacted_at) on core.document_versions to
  retention;

alter table core.documents force row level security;
grant select, insert, update on core.documents to app, worker, cell_io;
grant select on core.documents to collab, retention;
grant update (ydoc, content, plain_text, status, metadata) on core.documents to retention;
grant update (ydoc, content, plain_text, last_edited_by_user_id, last_edited_at) on core.documents
  to collab;

alter table core.emergency_contacts force row level security;
grant select, insert, update on core.emergency_contacts to app, worker, cell_io;
grant select, delete on core.emergency_contacts to retention;
grant update (status, metadata) on core.emergency_contacts to retention;

alter table core.enrollments force row level security;
grant select, insert, update on core.enrollments to app, worker, cell_io;
grant select on core.enrollments to integration, retention;
grant update (status, metadata) on core.enrollments to retention;

alter table core.erasure_approvals force row level security;
grant select, insert on core.erasure_approvals to app, worker, cell_io;
grant select on core.erasure_approvals to retention;

alter table core.erasure_items force row level security;
grant select, insert on core.erasure_items to app, worker, cell_io;
grant select on core.erasure_items to retention;

alter table core.external_ids force row level security;
grant select, insert, update on core.external_ids to app, worker, cell_io;
grant select, delete on core.external_ids to retention;
grant select on core.external_ids to integration;
grant update (status, metadata) on core.external_ids to retention;

alter table core.family_shares force row level security;
grant select, insert, update on core.family_shares to app, worker, cell_io;
grant select, delete on core.family_shares to retention;
grant update (status, metadata) on core.family_shares to retention;

alter table core.federated_identities force row level security;
grant select, insert, update on core.federated_identities to app, worker, cell_io;
grant select, delete on core.federated_identities to retention;
grant update (status, metadata) on core.federated_identities to retention;

alter table core.file_previews force row level security;
grant select, insert, update on core.file_previews to app, worker, cell_io;
grant select on core.file_previews to retention;

alter table core.file_publications force row level security;
grant select, insert, update on core.file_publications to app, worker, cell_io;
grant select on core.file_publications to retention;
grant select (tenant_id, id, file_id, derivative, public_key, host_type, host_id, unpublished_at,
  status) on core.file_publications to site;

alter table core.file_subjects force row level security;
grant select, insert, update on core.file_subjects to app, worker, cell_io;
grant select, delete on core.file_subjects to retention;
grant update (status, metadata) on core.file_subjects to retention;

alter table core.files force row level security;
grant select, insert, update on core.files to worker, cell_io;
grant select, insert on core.files to app;
grant select, delete on core.files to retention;
grant update (host_type, host_id, name, linked_at, status, metadata, trashed_at, folder_id,
  description, credit) on core.files to app;
grant update (status, metadata) on core.files to retention;

alter table core.goal_judgements force row level security;
grant select, insert, update on core.goal_judgements to app, worker, cell_io;
grant select, delete on core.goal_judgements to retention;
grant update (status, metadata) on core.goal_judgements to retention;

alter table core.goal_reports force row level security;
grant select, insert, update on core.goal_reports to app, worker, cell_io;
grant select, delete on core.goal_reports to retention;
grant update (status, metadata) on core.goal_reports to retention;

alter table core.grade_scale_versions force row level security;
grant select, insert on core.grade_scale_versions to app, worker, cell_io;
grant select on core.grade_scale_versions to retention;

alter table core.grade_scales force row level security;
grant select, insert, update on core.grade_scales to app, worker, cell_io;
grant select on core.grade_scales to retention;

alter table core.gradebook_settings force row level security;
grant select, insert, update on core.gradebook_settings to app, worker, cell_io;
grant select on core.gradebook_settings to retention;

alter table core.grade_level_settings force row level security;
grant select, insert, update on core.grade_level_settings to app, worker, cell_io;
grant select on core.grade_level_settings to retention;

alter table core.homeroom_classes force row level security;
grant select, insert, update on core.homeroom_classes to app, worker, cell_io;
grant select on core.homeroom_classes to retention;

alter table core.homeroom_members force row level security;
grant select, insert, update on core.homeroom_members to app, worker, cell_io;
grant select on core.homeroom_members to retention;

alter table core.homerooms force row level security;
grant select, insert, update on core.homerooms to app, worker, cell_io;
grant select on core.homerooms to retention;

alter table core.identity_provider_orgs force row level security;
grant select, insert, update on core.identity_provider_orgs to app, worker, cell_io;
grant select on core.identity_provider_orgs to retention;

alter table core.identity_providers force row level security;
grant select, insert, update on core.identity_providers to app, worker, cell_io;
grant select on core.identity_providers to retention;

alter table core.import_rows force row level security;
grant select, insert on core.import_rows to app, worker, cell_io;
grant select on core.import_rows to retention;

alter table core.import_runs force row level security;
grant select, insert, update on core.import_runs to app, worker, cell_io;
grant select on core.import_runs to retention;

alter table core.intake_grades force row level security;
grant select, insert, update on core.intake_grades to app, worker, cell_io;
grant select on core.intake_grades to retention;
grant select (tenant_id, id, intake_id, grade_level_descriptor_id, status) on core.intake_grades to site;

alter table core.intake_years force row level security;
grant select, insert, update on core.intake_years to app, worker, cell_io;
grant select on core.intake_years to retention;
grant select (tenant_id, id, org_id, intake_id, school_year_id, status) on core.intake_years to site;

alter table core.learning_modules force row level security;
grant select, insert, update on core.learning_modules to app, worker, cell_io;
grant select on core.learning_modules to retention;

alter table core.legal_holds force row level security;
grant select, insert, update on core.legal_holds to app, worker, cell_io;
grant select on core.legal_holds to retention;

alter table core.lesson_changes force row level security;
grant select, insert, update on core.lesson_changes to app, worker, cell_io;
grant select on core.lesson_changes to retention;

alter table core.lesson_code force row level security;
grant select, insert, update on core.lesson_code to app, worker, cell_io;
grant select, delete on core.lesson_code to retention;
grant update (status, metadata) on core.lesson_code to retention;

alter table core.lesson_openings force row level security;
grant select, insert, update on core.lesson_openings to app, worker, cell_io;
grant select, delete on core.lesson_openings to retention;
grant update (status, metadata) on core.lesson_openings to retention;

alter table core.lesson_progress force row level security;
grant select, insert, update on core.lesson_progress to app, worker, cell_io;
grant select, delete on core.lesson_progress to retention;
grant update (status, metadata) on core.lesson_progress to retention;

alter table core.lesson_projects force row level security;
grant select, insert, update on core.lesson_projects to app, worker, cell_io;
grant select, delete on core.lesson_projects to retention;
grant update (status, metadata) on core.lesson_projects to retention;

alter table core.lesson_releases force row level security;
grant select, insert, update on core.lesson_releases to app, worker, cell_io;
grant select, delete on core.lesson_releases to retention;
grant update (status, metadata) on core.lesson_releases to retention;

alter table core.lesson_responses force row level security;
grant select, insert on core.lesson_responses to app, worker, cell_io;
grant select on core.lesson_responses to retention;
grant update (response, feedback, redacted_at) on core.lesson_responses to retention;

alter table core.lesson_runs force row level security;
grant select, insert on core.lesson_runs to app, worker, cell_io;
grant select, delete on core.lesson_runs to retention;

alter table core.lesson_shares force row level security;
grant select, insert, update on core.lesson_shares to app, worker, cell_io;
grant select, delete on core.lesson_shares to retention;
grant update (status, metadata) on core.lesson_shares to retention;

alter table core.lesson_sittings force row level security;
grant select, insert, update on core.lesson_sittings to app, worker, cell_io;
grant select, delete on core.lesson_sittings to retention;
grant update (status, metadata) on core.lesson_sittings to retention;

alter table core.lesson_watches force row level security;
grant select, insert, update on core.lesson_watches to app, worker, cell_io;
grant select, delete on core.lesson_watches to retention;
grant update (status, metadata) on core.lesson_watches to retention;

alter table core.lessons force row level security;
grant select, insert, update on core.lessons to app, worker, cell_io;
grant select on core.lessons to retention;

alter table core.locations force row level security;
grant select, insert, update on core.locations to app, worker, cell_io;
grant select on core.locations to retention;

alter table core.login_identities force row level security;
grant select, insert, update on core.login_identities to app, worker, cell_io;
grant select, delete on core.login_identities to retention;
grant update (status, metadata) on core.login_identities to retention;

alter table core.media_folders force row level security;
grant select, insert, update on core.media_folders to app, worker, cell_io;
grant select on core.media_folders to retention;

alter table core.media_item_tags force row level security;
grant select, insert, update on core.media_item_tags to app, worker, cell_io;
grant select on core.media_item_tags to retention;

alter table core.media_item_texts force row level security;
grant select, insert, update on core.media_item_texts to app, worker, cell_io;
grant select on core.media_item_texts to retention;

alter table core.media_tags force row level security;
grant select, insert, update on core.media_tags to app, worker, cell_io;
grant select on core.media_tags to retention;

alter table core.message_contacts force row level security;
grant select, insert, update on core.message_contacts to app, worker, cell_io;
grant select on core.message_contacts to retention;
grant update (email, phone, phone_normalized, display_name, status, metadata) on
  core.message_contacts to retention;

alter table core.message_drafts force row level security;
grant select, insert, update on core.message_drafts to app, worker, cell_io;
grant select on core.message_drafts to retention;
grant update (recipient_ids, subject, body, status, metadata) on core.message_drafts to retention;

alter table core.message_threads force row level security;
grant select, insert, update on core.message_threads to app, worker, cell_io;
grant select on core.message_threads to retention;
grant update (subject, status, metadata) on core.message_threads to retention;

alter table core.messages force row level security;
grant select, insert, update on core.messages to app, worker, cell_io;
grant select on core.messages to retention;
grant update (body, details, redacted_at) on core.messages to retention;

alter table core.module_audiences force row level security;
grant select, insert, update on core.module_audiences to app, worker, cell_io;
grant select, delete on core.module_audiences to retention;
grant update (status, metadata) on core.module_audiences to retention;

alter table core.module_classes force row level security;
grant select, insert, update on core.module_classes to app, worker, cell_io;
grant select on core.module_classes to retention;

alter table core.module_discussions force row level security;
grant select, insert, update on core.module_discussions to app, worker, cell_io;
grant select on core.module_discussions to retention;

alter table core.module_templates force row level security;
grant select, insert, update on core.module_templates to app, worker, cell_io;
grant select on core.module_templates to retention;

alter table core.notification_deliveries force row level security;
grant select, insert, update on core.notification_deliveries to app, worker, cell_io;
grant select on core.notification_deliveries to retention;
grant update (address) on core.notification_deliveries to retention;

alter table core.notifications force row level security;
grant select, insert, update on core.notifications to app, worker, cell_io;
grant select on core.notifications to retention;

alter table core.org_features force row level security;
grant select, insert, update on core.org_features to app, worker, cell_io;
grant select on core.org_features to retention;

alter table core.orgs force row level security;
grant select, insert, update on core.orgs to worker, cell_io;
grant select, insert on core.orgs to app;
grant select on core.orgs to integration, retention;
grant select (tenant_id, id, type, parent_id, name_en, name_ar, time_zone, default_locale,
  country_code, address, phone, email, logo_file_id, brand_colour, lifecycle, status, digits) on
  core.orgs to site;
grant update (name_en, name_ar, identifier, time_zone, default_locale, week_start, weekend_days,
  country_code, address, phone, email, logo_file_id, brand_colour, status, metadata,
  secondary_calendar, digits, arabic_math, learners_decide_from, learners_are_adults) on core.orgs
  to app;

alter table core.paced_lessons force row level security;
grant select, insert, update on core.paced_lessons to app, worker, cell_io;
grant select on core.paced_lessons to retention;

alter table core.passkeys force row level security;
grant select, insert, update on core.passkeys to worker, cell_io;
grant select, insert on core.passkeys to app;
grant select, delete on core.passkeys to retention;
grant update (sign_count, nickname, last_used_at, revoked_at, revoked_reason, status, metadata) on
  core.passkeys to app;
grant update (status, metadata) on core.passkeys to retention;

alter table core.peer_review_comments force row level security;
grant select, insert, update on core.peer_review_comments to app, worker, cell_io;
grant select, delete on core.peer_review_comments to retention;
grant update (status, metadata) on core.peer_review_comments to retention;

alter table core.peer_review_settings force row level security;
grant select, insert, update on core.peer_review_settings to app, worker, cell_io;
grant select on core.peer_review_settings to retention;

alter table core.peer_reviews force row level security;
grant select, insert, update on core.peer_reviews to app, worker, cell_io;
grant select, delete on core.peer_reviews to retention;
grant update (status, metadata) on core.peer_reviews to retention;

alter table core.period_grades force row level security;
grant select, insert, update on core.period_grades to app, worker, cell_io;
grant select on core.period_grades to integration, retention;

alter table core.privacy_notices force row level security;
grant select, insert, update on core.privacy_notices to app, worker, cell_io;
grant select on core.privacy_notices to retention;

alter table core.program_remarks force row level security;
grant select, insert, update on core.program_remarks to app, worker, cell_io;
grant select on core.program_remarks to retention;

alter table core.programme_categories force row level security;
grant select, insert, update on core.programme_categories to app, worker, cell_io;
grant select on core.programme_categories to retention;

alter table core.programme_grade_levels force row level security;
grant select, insert, update on core.programme_grade_levels to app, worker, cell_io;
grant select on core.programme_grade_levels to retention;

alter table core.programmes force row level security;
grant select, insert, update on core.programmes to app, worker, cell_io;
grant select on core.programmes to retention;

alter table core.quiz_answers force row level security;
grant select, insert, update on core.quiz_answers to app, worker, cell_io;
grant select on core.quiz_answers to retention;
grant update (response, feedback, status, metadata, fluency) on core.quiz_answers to retention;

alter table core.quiz_draws force row level security;
grant select, insert, update on core.quiz_draws to app, worker, cell_io;
grant select, delete on core.quiz_draws to retention;
grant update (status, metadata) on core.quiz_draws to retention;

alter table core.quiz_sittings force row level security;
grant select, insert, update on core.quiz_sittings to app, worker, cell_io;
grant select, delete on core.quiz_sittings to retention;
grant update (status, metadata) on core.quiz_sittings to retention;

alter table core.reading_norms force row level security;
grant select, insert, update on core.reading_norms to app, worker, cell_io;
grant select on core.reading_norms to retention;

alter table core.records_requests force row level security;
grant select, insert, update on core.records_requests to app, worker, cell_io;
grant select on core.records_requests to retention;

alter table core.register_periods force row level security;
grant select, insert, update on core.register_periods to app, worker, cell_io;
grant select on core.register_periods to retention;

alter table core.relationship_restrictions force row level security;
grant select, insert, update on core.relationship_restrictions to app, worker, cell_io;
grant select, delete on core.relationship_restrictions to retention;
grant update (status, metadata) on core.relationship_restrictions to retention;

alter table core.retention_settings force row level security;
grant select, insert, update on core.retention_settings to app, worker, cell_io;
grant select on core.retention_settings to retention;

alter table core.rubrics force row level security;
grant select, insert, update on core.rubrics to app, worker, cell_io;
grant select on core.rubrics to retention;

alter table core.saved_views force row level security;
grant select, insert, update on core.saved_views to app, worker, cell_io;
grant select, delete on core.saved_views to retention;
grant update (status, metadata) on core.saved_views to retention;

alter table core.sessions force row level security;
grant select, insert, update on core.sessions to app, worker;
grant select, delete on core.sessions to retention;

alter table core.shared_blocks force row level security;
grant select, insert, update on core.shared_blocks to app, worker, cell_io;
grant select on core.shared_blocks to retention;

alter table core.site_categories force row level security;
grant select, insert, update on core.site_categories to app, worker, cell_io;
grant select on core.site_categories to site, retention;

alter table core.site_classes force row level security;
grant select, insert, update on core.site_classes to app, worker, cell_io;
grant select on core.site_classes to retention;

alter table core.site_enquiries force row level security;
grant select, insert, update on core.site_enquiries to app, worker, cell_io;
grant select on core.site_enquiries to retention;
grant insert on core.site_enquiries to site;
grant select (tenant_id, org_id, network_key, status, created_at, source) on core.site_enquiries to
  site;
grant update (name, email, phone, child_year, message, network_key, status, metadata, child_name,
  answers, phone_normalized) on core.site_enquiries to retention;

alter table core.site_pages force row level security;
grant select, insert, update on core.site_pages to app, worker, cell_io;
grant select on core.site_pages to retention;

alter table core.site_posts force row level security;
grant select, insert, update on core.site_posts to app, worker, cell_io;
grant select on core.site_posts to retention;

alter table core.site_published_pages force row level security;
grant select, insert, update on core.site_published_pages to app, worker, cell_io;
grant select on core.site_published_pages to site, retention;

alter table core.site_published_posts force row level security;
grant select, insert, update on core.site_published_posts to app, worker, cell_io;
grant select on core.site_published_posts to site, retention;

alter table core.site_redirects force row level security;
grant select, insert, update on core.site_redirects to app, worker, cell_io;
grant select on core.site_redirects to retention;
grant select (tenant_id, id, org_id, from_path, to_page_id, to_url, status) on core.site_redirects
  to site;

alter table core.site_settings force row level security;
grant select, insert, update on core.site_settings to app, worker, cell_io;
grant select on core.site_settings to site, retention;

alter table core.staff_absences force row level security;
grant select, insert, update on core.staff_absences to app, worker, cell_io;
grant select on core.staff_absences to retention;

alter table core.standard_evidence force row level security;
grant select, insert, update on core.standard_evidence to app, worker, cell_io;
grant select, delete on core.standard_evidence to retention;
grant update (status, metadata) on core.standard_evidence to retention;

alter table core.standard_frameworks force row level security;
grant select, insert, update on core.standard_frameworks to app, worker, cell_io;
grant select on core.standard_frameworks to retention;

alter table core.standard_observations force row level security;
grant select, insert, update on core.standard_observations to app, worker, cell_io;
grant select, delete on core.standard_observations to retention;
grant update (status, metadata) on core.standard_observations to retention;

alter table core.standard_sittings force row level security;
grant select, insert, update on core.standard_sittings to app, worker, cell_io;
grant select, delete on core.standard_sittings to retention;
grant update (status, metadata) on core.standard_sittings to retention;

alter table core.standards force row level security;
grant select, insert, update on core.standards to app, worker, cell_io;
grant select on core.standards to retention;

alter table core.student_departures force row level security;
grant select, insert, update on core.student_departures to app, worker, cell_io;
grant select on core.student_departures to retention;
grant update (status, metadata) on core.student_departures to retention;

alter table core.student_grades force row level security;
grant select, insert, update on core.student_grades to app, worker, cell_io;
grant select on core.student_grades to integration, retention;
grant update (status, metadata) on core.student_grades to retention;

alter table core.student_movements force row level security;
grant select, insert, update on core.student_movements to app, worker, cell_io;
grant select on core.student_movements to retention;

alter table core.student_school_years force row level security;
grant select, insert, update on core.student_school_years to app, worker, cell_io;
grant select on core.student_school_years to integration, retention;
grant update (status, metadata) on core.student_school_years to retention;

alter table core.submission_attempts force row level security;
grant select, insert, update on core.submission_attempts to cell_io;
grant select, insert on core.submission_attempts to app, worker;
grant select on core.submission_attempts to retention;
grant update (status, metadata) on core.submission_attempts to app, worker;

alter table core.submissions force row level security;
grant select, insert, update on core.submissions to app, worker, cell_io;
grant select on core.submissions to retention;

alter table core.tenant_keys force row level security;
grant select, insert, update on core.tenant_keys to worker;
grant select, insert on core.tenant_keys to cell_io;
grant select, update on core.tenant_keys to retention;
grant select on core.tenant_keys to app;

alter table core.tenants force row level security;
grant select, insert, update on core.tenants to cell_io;
grant select, update on core.tenants to worker;
grant select on core.tenants to app, integration, retention;
grant update (name_en, name_ar, default_locale, metadata) on core.tenants to app;

alter table core.thread_members force row level security;
grant select, insert, update on core.thread_members to app, worker, cell_io;
grant select on core.thread_members to retention;
grant update (status, metadata) on core.thread_members to retention;

alter table core.timetable_days force row level security;
grant select, insert, update on core.timetable_days to app, worker, cell_io;
grant select on core.timetable_days to retention;

alter table core.timetables force row level security;
grant select, insert, update on core.timetables to app, worker, cell_io;
grant select on core.timetables to retention;

alter table core.user_preferences force row level security;
grant select, insert, update on core.user_preferences to app, worker, cell_io;
grant select, delete on core.user_preferences to retention;
grant update (status, metadata) on core.user_preferences to retention;

alter table core.user_relationships force row level security;
grant select, insert, update on core.user_relationships to app, worker, cell_io;
grant select on core.user_relationships to integration, retention;
grant update (status, metadata) on core.user_relationships to retention;

alter table core.user_roles force row level security;
grant select, insert, update on core.user_roles to app, worker, cell_io;
grant select on core.user_roles to integration, retention;
grant update (status, metadata) on core.user_roles to retention;

alter table core.users force row level security;
grant select, insert, update on core.users to app, worker, cell_io;
grant select on core.users to integration, retention;
grant update (username, given_name_ar, middle_name_ar, family_name_ar, full_name_ar, given_name_en,
  middle_name_en, family_name_en, full_name_en, preferred_given_name, preferred_middle_name,
  preferred_family_name, birth_date, birth_date_source, sex_descriptor_id, photo_file_id,
  preferred_locale, primary_org_id, erased_at, status, metadata) on core.users to retention;

alter table core.work_comment_answers force row level security;
grant select, insert, update on core.work_comment_answers to app, worker, cell_io;
grant select, delete on core.work_comment_answers to retention;
grant update (status, metadata) on core.work_comment_answers to retention;

alter table core.work_comment_replies force row level security;
grant select, insert, update on core.work_comment_replies to app, worker, cell_io;
grant select, delete on core.work_comment_replies to retention;
grant update (status, metadata) on core.work_comment_replies to retention;

alter table core.work_comments force row level security;
grant select, insert, update on core.work_comments to app, worker, cell_io;
grant select on core.work_comments to retention;

alter table core.work_sittings force row level security;
grant select, insert, update on core.work_sittings to app, worker, cell_io;
grant select, delete on core.work_sittings to retention;
grant update (status, metadata) on core.work_sittings to retention;

alter table core.year_rollovers force row level security;
grant select, insert, update on core.year_rollovers to app, worker, cell_io;
grant select on core.year_rollovers to retention;

alter table core.young_classes force row level security;
grant select, insert, update on core.young_classes to app, worker, cell_io;
grant select on core.young_classes to retention;

alter table health.contact_changes force row level security;
grant select, insert on health.contact_changes to app, worker, cell_io;
grant select, delete on health.contact_changes to retention;

alter table health.records force row level security;
grant select, insert, update on health.records to app, worker, cell_io;
grant select, delete on health.records to retention;
grant update (status, metadata) on health.records to retention;

alter table health.requested_changes force row level security;
grant select, insert, update on health.requested_changes to app, worker, cell_io;
grant select, delete on health.requested_changes to retention;
grant update (status, metadata) on health.requested_changes to retention;

grant select, insert, delete on ops.sms_suppressions to worker;

grant select on ops.tenant_registry to worker;
