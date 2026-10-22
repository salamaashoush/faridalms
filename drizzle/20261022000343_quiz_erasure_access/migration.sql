-- What an approved erasure may change of a student's quiz draws and timed
-- sittings, which the generated policies only admit: the grants
-- themselves. Both are only about the student, and go.

grant update (status, metadata) on core.quiz_draws, core.quiz_sittings to retention;
grant delete on core.quiz_draws, core.quiz_sittings to retention;
