-- What an approved erasure may change of the rows that are only about a
-- person, which the generated policies only admit: the grants themselves.
-- Each is tombstoned and then removed: notices they were sent, roles they
-- held, their learning activity, their answers and replies to comments on
-- work, comments they wrote while writing a document, and what their family
-- shared or reported of them.

grant select on core.access_role_assignments, core.assignment_recipients, core.class_group_members,
  core.family_shares, core.lesson_progress, core.lesson_releases, core.lesson_watches
  to retention;
grant update (status, metadata) on core.absence_reports, core.access_role_assignments,
  core.assignment_recipients, core.broadcast_recipients, core.class_group_members,
  core.document_comments, core.family_shares, core.lesson_openings, core.lesson_progress,
  core.lesson_releases, core.lesson_watches, core.work_comment_answers, core.work_comment_replies
  to retention;
grant delete on core.absence_reports, core.access_role_assignments, core.assignment_recipients,
  core.broadcast_recipients, core.class_group_members, core.document_comments, core.family_shares,
  core.lesson_openings, core.lesson_progress, core.lesson_releases, core.lesson_watches,
  core.work_comment_answers, core.work_comment_replies
  to retention;
