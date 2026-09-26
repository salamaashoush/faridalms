import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleCheck, Circle } from "lucide-react";
import * as v from "valibot";

import { ButtonLink } from "~/components/app/ButtonLink";
import { SubjectIcon } from "~/components/app/labels";
import { PageHeader, SectionCard, Value } from "~/components/app/primitives";
import { subjectLabel } from "~/components/family/format";
import { PersonLink } from "~/components/records/PersonLink";
import { Badge } from "~/components/ui/badge";
import * as m from "~/i18n/messages";
import { learnerModuleQuery, moduleAuthoringQuery } from "~/queries/learning";
import { formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/modules/$moduleId")({
  validateSearch: v.object({ studentId: v.optional(v.string(), "") }),
  loaderDeps: ({ search }) => ({ studentId: search.studentId }),
  loader: async ({ context, params, deps }) => {
    if (
      context.auth.workspace === "teach" ||
      context.auth.workspace === "admin"
    )
      await context.queryClient.ensureQueryData(
        moduleAuthoringQuery(params.moduleId),
      );
    else
      await context.queryClient.ensureQueryData(
        learnerModuleQuery(params.moduleId, deps.studentId),
      );
  },
  component: ModulePage,
});
function ModulePage() {
  const { auth } = Route.useRouteContext();
  return auth.workspace === "teach" || auth.workspace === "admin" ? (
    <TeacherModule />
  ) : (
    <LearnerModule />
  );
}
function TeacherModule() {
  const { moduleId } = Route.useParams();
  const { data } = useSuspenseQuery(moduleAuthoringQuery(moduleId));
  return (
    <>
      <PageHeader
        title={data.title}
        description={data.summary || undefined}
        actions={
          <ButtonLink
            variant="outline"
            to="/teach/module-editor"
            search={{ id: moduleId }}
          >
            {m.managementEdit()}
          </ButtonLink>
        }
      />
      <ModuleMeta
        subject={data.subject}
        schoolClass={data.class}
        author={data.author}
        status={data.status}
      />
      <SectionCard title={m.learningLessons()}>
        <ol className="divide-y">
          {data.lessons.map((lesson, index) => (
            <li key={lesson.id} className="flex items-center gap-4 py-3">
              <span className="grid size-7 place-items-center rounded-full bg-muted text-xs font-semibold">
                {formatNumber(index + 1)}
              </span>
              <Link
                to="/lessons/$lessonId"
                params={{ lessonId: lesson.id }}
                search={{}}
                className="min-w-0 flex-1 font-medium hover:text-primary hover:underline"
              >
                {lesson.title}
              </Link>
              <span className="text-xs text-muted-foreground">
                {m.learningLessonMeta({
                  blocks: formatNumber(lesson.blocks),
                  quizzes: formatNumber(lesson.quizzes),
                })}
              </span>
            </li>
          ))}
        </ol>
      </SectionCard>
    </>
  );
}
function LearnerModule() {
  const { moduleId } = Route.useParams();
  const { studentId } = Route.useSearch();
  const { data } = useSuspenseQuery(learnerModuleQuery(moduleId, studentId));
  const done = data.module.lessons.filter(
    (lesson) => lesson.completedAt,
  ).length;
  return (
    <>
      <PageHeader
        title={data.module.title}
        description={data.module.summary || undefined}
      />
      <ModuleMeta
        subject={data.module.subject}
        schoolClass={data.module.class}
        author={data.module.author}
        status="published"
      />
      <SectionCard
        title={m.learningLessons()}
        description={m.learningProgress({
          done: formatNumber(done),
          total: formatNumber(data.module.lessons.length),
        })}
      >
        <ol className="divide-y">
          {data.module.lessons.map((lesson, index) => (
            <li
              key={lesson.id}
              className="flex flex-wrap items-center gap-4 py-3"
            >
              {lesson.completedAt ? (
                <CircleCheck className="size-5 text-primary" aria-hidden />
              ) : (
                <Circle className="size-5 text-muted-foreground" aria-hidden />
              )}
              <Link
                to="/lessons/$lessonId"
                params={{ lessonId: lesson.id }}
                search={{ studentId: data.studentId }}
                className="min-w-0 flex-1 font-medium hover:text-primary hover:underline"
              >
                {m.learningLessonNumbered({
                  number: formatNumber(index + 1),
                  title: lesson.title,
                })}
              </Link>
              <span className="text-xs text-muted-foreground">
                {lesson.completedAt
                  ? m.learningLessonDone()
                  : lesson.quizzes > 0
                    ? m.learningQuizScore({
                        correct: formatNumber(lesson.correct),
                        total: formatNumber(lesson.quizzes),
                      })
                    : m.learningLessonOpen()}
              </span>
            </li>
          ))}
        </ol>
      </SectionCard>
    </>
  );
}
function ModuleMeta({
  subject,
  schoolClass,
  author,
  status,
}: {
  subject: { name: string; nameAr?: string; icon: string } | null;
  schoolClass: { id: string; name: string } | null;
  author: { id: string; name: string } | null;
  status: "draft" | "published";
}) {
  return (
    <p className="-mt-6 mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {subject ? <SubjectIcon icon={subject.icon} /> : null}
      <Value>{subjectLabel(subject)}</Value>
      <span aria-hidden>·</span>
      {schoolClass ? (
        <Link
          to="/classes/$classId"
          params={{ classId: schoolClass.id }}
          search={{}}
          className="font-medium text-foreground hover:text-primary hover:underline"
        >
          {schoolClass.name}
        </Link>
      ) : (
        <Value>{null}</Value>
      )}
      {author ? (
        <>
          <span aria-hidden>·</span>
          <PersonLink person={author} />
        </>
      ) : null}
      <Badge variant={status === "published" ? "default" : "outline"}>
        {status === "published" ? m.siteStatusPublished() : m.siteStatusDraft()}
      </Badge>
    </p>
  );
}
