import type { SaveModuleInput } from "@faridalms/domain/learning";

import { saveModuleSchema } from "@faridalms/domain/learning";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Send, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { getAuthoringContext } from "~/server/assignments";

import { ManagementInput } from "~/components/admin/ManagementDialog";
import { ManagementPage } from "~/components/admin/ManagementPage";
import { SelectField } from "~/components/admin/SelectField";
import { ButtonLink } from "~/components/app/ButtonLink";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { moduleAuthoringQuery } from "~/queries/learning";
import {
  deleteLesson,
  publishModule,
  saveModule,
  unpublishModule,
} from "~/server/learning";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type AuthoringContext = Awaited<ReturnType<typeof getAuthoringContext>>;

const ISSUE_LABEL: Record<string, () => string> = {
  "learning.title_required": m.learningIssueTitle,
  "learning.lesson_required": m.learningIssueLesson,
  "learning.lesson_empty": m.learningIssueLessonEmpty,
};

export function ModuleWorkspace({
  initial,
  status,
  classes,
  onSaved,
  onClose,
}: {
  initial: SaveModuleInput;
  status: "draft" | "published";
  classes: AuthoringContext["classes"];
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const [baseline, setBaseline] = useState(initial);
  const [state, setState] = useState(status);
  const [confirming, setConfirming] = useState<string>();
  const queryClient = useQueryClient();
  const save = useServerFn(saveModule);
  const publish = useServerFn(publishModule);
  const unpublish = useServerFn(unpublishModule);
  const remove = useServerFn(deleteLesson);
  const leaving = useRef(false);
  const detail = useQuery({
    ...moduleAuthoringQuery(baseline.id),
    enabled: baseline.expectedRevision > 0,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["learning"] });
  const publication = useMutation({
    mutationFn: (kind: "publish" | "unpublish") =>
      (kind === "publish" ? publish : unpublish)({
        data: { id: baseline.id, expectedRevision: baseline.expectedRevision },
      }),
    onSuccess: async (saved, kind) => {
      setBaseline((current) => ({
        ...current,
        expectedRevision: saved.revision,
      }));
      setState(kind === "publish" ? "published" : "draft");
      await refresh();
      toast.success(
        kind === "publish"
          ? m.learningPublishedToast()
          : m.learningUnpublishedToast(),
      );
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const removal = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async () => {
      await refresh();
      toast.success(m.learningLessonDeleted());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const mutation = useMutation({
    mutationFn: (data: SaveModuleInput) => save({ data }),
  });
  const form = useForm({
    defaultValues: {
      classId: baseline.classId,
      subjectId: baseline.subjectId,
      title: baseline.title,
      summary: baseline.summary,
    },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: v.object({
        classId: saveModuleSchema.entries.classId,
        subjectId: saveModuleSchema.entries.subjectId,
        title: saveModuleSchema.entries.title,
        summary: saveModuleSchema.entries.summary,
      }),
    },
    onSubmit: async ({ value }) => {
      const input = v.parse(saveModuleSchema, { ...baseline, ...value });
      const saved = await mutation.mutateAsync(input);
      setBaseline({ ...input, expectedRevision: saved.revision });
      form.reset(value);
      await refresh();
      toast.success(m.managementSaved());
      onSaved(saved.id);
    },
  });
  const dirty = () =>
    form.state.values.classId !== baseline.classId ||
    form.state.values.subjectId !== baseline.subjectId ||
    form.state.values.title !== baseline.title ||
    form.state.values.summary !== baseline.summary;
  const busy = mutation.isPending || publication.isPending || removal.isPending;
  const issues = detail.data?.issues ?? [];
  return (
    <ManagementPage
      title={m.learningModuleDesign()}
      description={m.learningModuleDesignHint()}
      pending={mutation.isPending}
      onClose={() => {
        leaving.current = true;
        onClose();
      }}
      onSubmit={() => form.handleSubmit()}
      headerActions={
        <Badge variant={state === "published" ? "default" : "outline"}>
          {state === "published"
            ? m.siteStatusPublished()
            : m.siteStatusDraft()}
        </Badge>
      }
      actions={
        baseline.expectedRevision > 0 ? (
          state === "published" ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => publication.mutate("unpublish")}
            >
              <Undo2 className="size-4" aria-hidden />
              {m.siteUnpublish()}
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={busy || dirty() || issues.length > 0}
              onClick={() => publication.mutate("publish")}
            >
              <Send className="size-4" aria-hidden />
              {m.sitePublish()}
            </Button>
          )
        ) : undefined
      }
      isDirty={() => !leaving.current && dirty()}
      sectioned
    >
      <section className="grid gap-5 rounded-xl border bg-card p-5 sm:grid-cols-2 sm:p-7">
        <form.Field name="classId">
          {(field) => (
            <SelectField
              id="module-class"
              label={m.studentClass()}
              value={field.state.value}
              disabled={baseline.expectedRevision > 0}
              options={classes.map((row) => ({
                value: row.id,
                label: row.name,
              }))}
              onChange={(next) => {
                field.handleChange(next);
                const first = classes.find((row) => row.id === next)
                  ?.authoringSubjects[0];
                form.setFieldValue("subjectId", first?.id ?? "");
              }}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(formState) => formState.values.classId}>
          {(classId) => (
            <form.Field name="subjectId">
              {(field) => (
                <SelectField
                  id="module-subject"
                  label={m.assignmentsSubject()}
                  value={field.state.value}
                  options={(
                    classes.find((row) => row.id === classId)
                      ?.authoringSubjects ?? []
                  ).map((subject) => ({
                    value: subject.id,
                    label: subject.name,
                  }))}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          )}
        </form.Subscribe>
        <form.Field name="title">
          {(field) => (
            <ManagementInput
              label={m.learningModuleTitle()}
              value={field.state.value}
              maxLength={160}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <form.Field name="summary">
          {(field) => (
            <ManagementInput
              label={m.siteSummary()}
              value={field.state.value}
              maxLength={500}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
      </section>
      {baseline.expectedRevision > 0 ? (
        <section className="rounded-xl border bg-card p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{m.learningLessons()}</h2>
            <ButtonLink
              size="sm"
              to="/teach/lesson-editor"
              search={{ module: baseline.id }}
            >
              <Plus aria-hidden />
              {m.learningNewLesson()}
            </ButtonLink>
          </div>
          {issues.length > 0 ? (
            <ul className="mt-3 text-sm text-muted-foreground">
              {issues.map((issue) => (
                <li key={issue}>{ISSUE_LABEL[issue]?.() ?? issue}</li>
              ))}
            </ul>
          ) : null}
          {detail.data && detail.data.lessons.length > 0 ? (
            <ol className="mt-4 divide-y">
              {detail.data.lessons.map((lesson, index) => (
                <li
                  key={lesson.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                >
                  <span className="grid size-7 place-items-center rounded-full bg-muted text-xs font-semibold">
                    {formatNumber(index + 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/teach/lesson-editor"
                      search={{ id: lesson.id, module: baseline.id }}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {lesson.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {m.learningLessonMeta({
                        blocks: formatNumber(lesson.blocks),
                        quizzes: formatNumber(lesson.quizzes),
                      })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={confirming === lesson.id ? "destructive" : "ghost"}
                    disabled={busy}
                    onClick={() => {
                      if (confirming === lesson.id) {
                        setConfirming(undefined);
                        removal.mutate(lesson.id);
                      } else setConfirming(lesson.id);
                    }}
                  >
                    {confirming === lesson.id
                      ? m.siteConfirmDelete()
                      : m.siteDelete()}
                  </Button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {m.learningNoLessons()}
            </p>
          )}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">{m.learningSaveFirst()}</p>
      )}
      {mutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getMessageFromError(mutation.error)}
        </p>
      ) : null}
    </ManagementPage>
  );
}
