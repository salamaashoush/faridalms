import type { LessonAnswers } from "@faridalms/domain/learning";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CircleCheck } from "lucide-react";
import { toast } from "sonner";
import * as v from "valibot";

import { ButtonLink } from "~/components/app/ButtonLink";
import { PageHeader } from "~/components/app/primitives";
import { LessonBlocks } from "~/components/learning/LessonView";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { learnerLessonQuery, lessonAuthoringQuery } from "~/queries/learning";
import { answerQuiz, completeLesson } from "~/server/learning";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

export const Route = createFileRoute("/_app/lessons/$lessonId")({
  validateSearch: v.object({ studentId: v.optional(v.string(), "") }),
  loaderDeps: ({ search }) => ({ studentId: search.studentId }),
  loader: async ({ context, params, deps }) => {
    if (context.auth.role === "teacher" || context.auth.role === "admin")
      await context.queryClient.ensureQueryData(
        lessonAuthoringQuery(params.lessonId),
      );
    else
      await context.queryClient.ensureQueryData(
        learnerLessonQuery(params.lessonId, deps.studentId),
      );
  },
  component: LessonPage,
});
function LessonPage() {
  const { auth } = Route.useRouteContext();
  return auth.role === "teacher" || auth.role === "admin" ? (
    <TeacherLesson />
  ) : (
    <LearnerLesson />
  );
}
function TeacherLesson() {
  const { lessonId } = Route.useParams();
  const { data } = useSuspenseQuery(lessonAuthoringQuery(lessonId));
  const answers: LessonAnswers = Object.fromEntries(
    data.document.blocks.flatMap((block) =>
      block.type === "quiz"
        ? [
            [
              block.id,
              {
                optionIds: block.correctOptionIds,
                correct: true,
                answeredAt: "",
              },
            ],
          ]
        : [],
    ),
  );
  return (
    <>
      <PageHeader
        title={data.title}
        description={m.learningPreviewHint({
          module: data.module?.title ?? "",
        })}
        actions={
          <>
            {data.module ? (
              <ButtonLink
                variant="outline"
                to="/modules/$moduleId"
                params={{ moduleId: data.module.id }}
                search={{}}
              >
                {m.learningBackToModule()}
              </ButtonLink>
            ) : null}
            <ButtonLink
              to="/teach/lesson-editor"
              search={{ id: data.id, module: data.moduleId }}
            >
              {m.managementEdit()}
            </ButtonLink>
          </>
        }
      />
      <LessonBlocks
        blocks={data.document.blocks}
        answers={answers}
        canWork={false}
        pending={false}
        onAnswer={() => undefined}
      />
    </>
  );
}
function LearnerLesson() {
  const { lessonId } = Route.useParams();
  const { studentId } = Route.useSearch();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(learnerLessonQuery(lessonId, studentId));
  const answer = useServerFn(answerQuiz);
  const complete = useServerFn(completeLesson);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["learning"] });
  const answering = useMutation({
    mutationFn: (input: { blockId: string; optionIds: string[] }) =>
      answer({ data: { lessonId, ...input } }),
    onSuccess: refresh,
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const completing = useMutation({
    mutationFn: () => complete({ data: { lessonId } }),
    onSuccess: async () => {
      await refresh();
      toast.success(m.learningLessonCompleted());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const lesson = data.lesson;
  return (
    <>
      <PageHeader
        title={lesson.title}
        description={m.learningLessonOf({
          number: formatNumber(lesson.position + 1),
          total: formatNumber(lesson.module.lessons),
          module: lesson.module.title,
        })}
        actions={
          <ButtonLink
            variant="outline"
            to="/modules/$moduleId"
            params={{ moduleId: lesson.module.id }}
            search={{ studentId: data.studentId }}
          >
            {m.learningBackToModule()}
          </ButtonLink>
        }
      />
      <LessonBlocks
        blocks={lesson.blocks}
        answers={lesson.answers}
        canWork={data.canWork}
        pending={answering.isPending}
        onAnswer={(blockId, optionIds) =>
          answering.mutate({ blockId, optionIds })
        }
      />
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5">
        <div>
          {lesson.previous ? (
            <ButtonLink
              variant="ghost"
              to="/lessons/$lessonId"
              params={{ lessonId: lesson.previous }}
              search={{ studentId: data.studentId }}
            >
              {m.learningPreviousLesson()}
            </ButtonLink>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {lesson.completedAt ? (
            <span className="flex items-center gap-2 text-sm font-medium text-primary">
              <CircleCheck className="size-4" aria-hidden />
              {m.learningLessonDone()}
            </span>
          ) : data.canWork ? (
            <Button
              type="button"
              disabled={!lesson.canComplete || completing.isPending}
              onClick={() => completing.mutate()}
            >
              {m.learningMarkComplete()}
            </Button>
          ) : null}
          {lesson.next ? (
            <ButtonLink
              variant="outline"
              to="/lessons/$lessonId"
              params={{ lessonId: lesson.next }}
              search={{ studentId: data.studentId }}
            >
              {m.learningNextLesson()}
            </ButtonLink>
          ) : null}
        </div>
      </div>
      {!lesson.canComplete && data.canWork && !lesson.completedAt ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {m.learningAnswerFirst()}
        </p>
      ) : null}
    </>
  );
}
