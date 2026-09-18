import type {
  LessonDocument,
  SaveLessonInput,
} from "@faridalms/domain/learning";

import {
  lessonDocumentSchema,
  saveLessonSchema,
} from "@faridalms/domain/learning";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { ManagementInput } from "~/components/admin/ManagementDialog";
import { ManagementPage } from "~/components/admin/ManagementPage";
import * as m from "~/i18n/messages";
import { saveLesson } from "~/server/learning";
import { getMessageFromError } from "~/utils/error";

import { LessonDesigner } from "./LessonDesigner";

export function LessonWorkspace({
  initial,
  moduleTitle,
  onSaved,
  onClose,
}: {
  initial: SaveLessonInput;
  moduleTitle: string;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const [baseline, setBaseline] = useState(() => ({
    ...initial,
    document: v.parse(lessonDocumentSchema, initial.document),
  }));
  const [document, setDocument] = useState<LessonDocument>(
    () => baseline.document,
  );
  const [invalidBlocks, setInvalidBlocks] = useState<Set<string>>(new Set());
  const [failure, setFailure] = useState<string>();
  const queryClient = useQueryClient();
  const save = useServerFn(saveLesson);
  const leaving = useRef(false);
  const mutation = useMutation({
    mutationFn: (data: SaveLessonInput) => save({ data }),
  });
  const form = useForm({
    defaultValues: { title: baseline.title, position: baseline.position },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: v.object({
        title: saveLessonSchema.entries.title,
        position: saveLessonSchema.entries.position,
      }),
    },
    onSubmit: async ({ value }) => {
      setFailure(undefined);
      if (invalidBlocks.size) throw new Error("content.invalid");
      const parsed = v.safeParse(saveLessonSchema, {
        ...baseline,
        ...value,
        document,
      });
      if (!parsed.success) {
        setFailure(m.learningBlocksInvalid());
        return;
      }
      const saved = await mutation.mutateAsync(parsed.output);
      setBaseline({ ...parsed.output, expectedRevision: saved.revision });
      setDocument(parsed.output.document);
      form.reset(value);
      await queryClient.invalidateQueries({ queryKey: ["learning"] });
      toast.success(m.managementSaved());
      onSaved(saved.id);
    },
  });
  const dirty = () =>
    invalidBlocks.size > 0 ||
    form.state.values.title !== baseline.title ||
    form.state.values.position !== baseline.position ||
    JSON.stringify(document) !== JSON.stringify(baseline.document);
  return (
    <ManagementPage
      title={m.learningLessonDesign()}
      description={m.learningLessonDesignHint({ module: moduleTitle })}
      pending={mutation.isPending}
      onClose={() => {
        leaving.current = true;
        onClose();
      }}
      onSubmit={() => form.handleSubmit()}
      isDirty={() => !leaving.current && dirty()}
      sectioned
    >
      <section className="grid gap-5 rounded-xl border bg-card p-5 sm:grid-cols-[1fr_10rem] sm:p-7">
        <form.Field name="title">
          {(field) => (
            <ManagementInput
              label={m.learningLessonTitle()}
              value={field.state.value}
              maxLength={160}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <form.Field name="position">
          {(field) => (
            <ManagementInput
              label={m.learningLessonPosition()}
              type="number"
              min={1}
              max={1000}
              value={String(field.state.value + 1)}
              onChange={(event) =>
                field.handleChange(Number(event.target.value) - 1)
              }
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
      </section>
      <LessonDesigner
        document={document}
        onChange={setDocument}
        disabled={mutation.isPending}
        onValidityChange={(id, valid) =>
          setInvalidBlocks((current) => {
            const next = new Set(current);
            if (valid) next.delete(id);
            else next.add(id);
            return next;
          })
        }
      />
      {failure || mutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {failure ?? getMessageFromError(mutation.error)}
        </p>
      ) : null}
    </ManagementPage>
  );
}
