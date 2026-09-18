-- Existing rows predate the workspace model. Every seeded school so far keeps
-- Cairo time, so the calendar due date becomes 23:59 Cairo on that day.
UPDATE "assignments"
SET "due_at" = (("due_date" + time '23:59') AT TIME ZONE 'Africa/Cairo')
WHERE "due_at" IS NULL;--> statement-breakpoint
UPDATE "assignments"
SET "instructions" = jsonb_build_object('root', jsonb_build_object(
  'type', 'root', 'version', 1, 'format', '', 'indent', 0, 'direction', null,
  'children', jsonb_build_array(jsonb_build_object(
    'type', 'paragraph', 'version', 1, 'format', '', 'indent', 0, 'direction', null,
    'textFormat', 0, 'textStyle', '',
    'children', jsonb_build_array(jsonb_build_object(
      'type', 'text', 'version', 1, 'format', 0, 'detail', 0, 'mode', 'normal',
      'style', '', 'text', "description"))))))
WHERE "instructions" IS NULL AND "description" IS NOT NULL;--> statement-breakpoint
INSERT INTO "assignment_recipients" ("assignment_id", "student_id", "source")
SELECT a."id", e."student_id", 'class'
FROM "assignments" a
JOIN "enrolments" e ON e."class_id" = a."class_id" AND e."until" IS NULL
WHERE a."status" = 'published'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "submission_attempts" ("submission_id", "number", "source_revision", "content", "plain_text", "is_late", "submitted_at", "submitted_by_id")
SELECT s."id", 1, 1,
  CASE WHEN s."content" IS NULL THEN NULL ELSE jsonb_build_object('root', jsonb_build_object(
    'type', 'root', 'version', 1, 'format', '', 'indent', 0, 'direction', null,
    'children', jsonb_build_array(jsonb_build_object(
      'type', 'paragraph', 'version', 1, 'format', '', 'indent', 0, 'direction', null,
      'textFormat', 0, 'textStyle', '',
      'children', jsonb_build_array(jsonb_build_object(
        'type', 'text', 'version', 1, 'format', 0, 'detail', 0, 'mode', 'normal',
        'style', '', 'text', s."content")))))) END,
  s."content", false, COALESCE(s."submitted_at", s."updated_at"), st."user_id"
FROM "submissions" s
JOIN "students" st ON st."id" = s."student_id"
WHERE s."state" IN ('submitted', 'returned')
  AND NOT EXISTS (SELECT 1 FROM "submission_attempts" t WHERE t."submission_id" = s."id");--> statement-breakpoint
UPDATE "submissions" s
SET "current_attempt_id" = t."id", "revision" = 2
FROM "submission_attempts" t
WHERE t."submission_id" = s."id" AND s."current_attempt_id" IS NULL;--> statement-breakpoint
INSERT INTO "assessments" ("attempt_id", "score", "effective_score", "feedback_text", "graded_by_id", "graded_at", "released_at")
SELECT s."current_attempt_id", s."score", s."score", s."feedback", s."graded_by_id",
  COALESCE(s."graded_at", s."updated_at"), COALESCE(s."graded_at", s."updated_at")
FROM "submissions" s
WHERE s."state" = 'returned' AND s."score" IS NOT NULL AND s."current_attempt_id" IS NOT NULL
ON CONFLICT DO NOTHING;
