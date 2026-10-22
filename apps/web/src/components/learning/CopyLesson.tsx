import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { SelectField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import * as m from "~/i18n/messages";
import { learningOptionsQuery } from "~/queries/learning";
import { copyLessonTo } from "~/server/learning";
import { getMessageFromError } from "~/utils/error";

/** Copies a lesson to the end of a module the teacher writes, this one or another. */
export function CopyLessonSheet({
  lesson,
  module,
  open,
  onClose,
}: {
  lesson: { id: string; title: string };
  module: { id: string; title: string };
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const options = useQuery(learningOptionsQuery).data;
  const modules = [
    module,
    ...(options?.modules ?? []).filter((row) => row.id !== module.id),
  ];
  const [target, setTarget] = useState(module.id);
  const copy = useMutation({
    mutationFn: () =>
      copyLessonTo({ data: { id: lesson.id, moduleId: target } }),
  });
  const title = modules.find((row) => row.id === target)?.title ?? "";
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.lrnCopyLessonTitle({ title: lesson.title })}
      submitLabel={m.lrnCopy()}
      pending={copy.isPending}
      error={copy.error ? getMessageFromError(copy.error) : null}
      onSubmit={async () => {
        await copy.mutateAsync().then(
          async (done) => {
            await queryClient.invalidateQueries({ queryKey: ["learning"] });
            toast.success(m.lrnLessonCopied({ module: title }), {
              action: {
                label: m.lrnOpenCopy(),
                onClick: () =>
                  void navigate({
                    to: "/teach/lesson-editor",
                    search: { id: done.id, moduleId: target },
                  }),
              },
            });
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <SelectField
        id="copy-lesson-module"
        label={m.lrnCopyTo()}
        hint={m.lrnCopyToHint()}
        value={target}
        options={modules.map((row) => ({ value: row.id, label: row.title }))}
        onChange={setTarget}
      />
    </SheetForm>
  );
}
