-- What an approved erasure may change of a student's lessons and quizzes,
-- which the generated policies only admit: the grants themselves. Answers
-- are emptied and stay for the marks a class's figures are counted from;
-- runs, kept code, kept projects and offers to a class gallery are only
-- about the student, and go.

grant update (response, feedback, redacted_at) on core.lesson_responses to retention;
grant delete on core.lesson_runs to retention;
grant update (status, metadata) on core.lesson_code, core.lesson_projects, core.lesson_shares to retention;
grant delete on core.lesson_code, core.lesson_projects, core.lesson_shares to retention;
grant update (status, metadata, response, feedback) on core.quiz_answers to retention;
