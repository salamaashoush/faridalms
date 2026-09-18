import type { SaveClassInput } from "@faridalms/domain/administration-schema";

import { saveClassSchema } from "@faridalms/domain/administration-schema";
import { useForm, revalidateLogic } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ClassPicker } from "~/components/teach/ClassPicker";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { saveClass } from "~/server/school";

import { STAGE_LABEL } from "./labels";
import { ManagementInput } from "./ManagementDialog";
import { ManagementPage } from "./ManagementPage";
import { RecordPicker } from "./RecordPicker";

export function ClassEditor({
  initial,
  onClose,
}: {
  initial?: SaveClassInput;
  onClose: () => void;
}) {
  const [rowKeys, setRowKeys] = useState(() =>
    (initial?.subjects ?? []).map(() => crypto.randomUUID()),
  );
  const mutation = useMutation({
    mutationFn: saveClass,
    onSuccess: () => {
      form.reset(form.state.values);
      toast.success(m.managementSaved());
      onClose();
    },
  });
  const defaults: SaveClassInput = initial ?? {
    name: "",
    grade: "",
    stage: "primary",
    room: "",
    homeroomTeacherId: "",
    subjects: [],
  };
  const form = useForm({
    defaultValues: defaults,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: saveClassSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ data: value });
    },
  });
  const labels = {
    name: m.managementClassName(),
    grade: m.studentGrade(),
    room: m.adminRoom(),
  };
  return (
    <ManagementPage
      title={initial ? m.managementEditClass() : m.managementAddClass()}
      description={m.managementClassHint()}
      onClose={onClose}
      pending={mutation.isPending}
      isDirty={() => form.state.isDirty}
      sectioned
      onSubmit={() => form.handleSubmit()}
    >
      <section className="space-y-6 rounded-xl border bg-card p-5 sm:p-7">
        <div>
          <h2 className="font-semibold">{m.classDetailsTitle()}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {m.classDetailsHint()}
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {(["name", "grade", "room"] as const).map((name) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <ManagementInput
                  id={`class-${name}`}
                  label={labels[name]}
                  value={field.state.value}
                  required={name !== "room"}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>
          ))}
          <form.Field name="stage">
            {(field) => (
              <ClassPicker
                id="class-stage"
                label={m.managementStage()}
                value={field.state.value}
                classes={(["early_years", "primary", "middle"] as const).map(
                  (id) => ({ id, name: STAGE_LABEL[id]() }),
                )}
                onChange={(value) => {
                  const stage = (
                    ["early_years", "primary", "middle"] as const
                  ).find((item) => item === value);
                  if (stage) field.handleChange(stage);
                }}
              />
            )}
          </form.Field>
        </div>
        <form.Field name="homeroomTeacherId">
          {(field) => (
            <RecordPicker
              kind="teachers"
              label={m.adminHomeroom()}
              value={field.state.value ?? ""}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
      </section>
      <form.Field name="subjects" mode="array">
        {(field) => (
          <section className="space-y-4 rounded-xl border bg-card p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">
                {m.adminSubjectsTaught()}
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRowKeys((keys) => [...keys, crypto.randomUUID()]);
                  field.pushValue({ subjectId: "", teacherId: "" });
                }}
              >
                <Plus aria-hidden />
                {m.managementAddSubject()}
              </Button>
            </div>
            {field.state.value.map((_, index) => (
              <div
                key={rowKeys[index]}
                className="grid items-end gap-3 rounded-lg border bg-background p-4 sm:grid-cols-[1fr_1fr_auto]"
              >
                <form.Field name={`subjects[${index}].subjectId`}>
                  {(subjectField) => (
                    <RecordPicker
                      kind="subjects"
                      label={m.assignmentsSubject()}
                      value={subjectField.state.value}
                      onChange={subjectField.handleChange}
                      errors={subjectField.state.meta.errors}
                    />
                  )}
                </form.Field>
                <form.Field name={`subjects[${index}].teacherId`}>
                  {(teacherField) => (
                    <RecordPicker
                      kind="teachers"
                      label={m.classSubjectTeacher()}
                      value={teacherField.state.value}
                      onChange={teacherField.handleChange}
                      errors={teacherField.state.meta.errors}
                    />
                  )}
                </form.Field>
                <div className="order-last flex justify-end pb-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={m.managementRemoveSubject()}
                    onClick={() => {
                      setRowKeys((keys) =>
                        keys.filter((key, position) => position !== index),
                      );
                      field.removeValue(index);
                    }}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
          </section>
        )}
      </form.Field>
    </ManagementPage>
  );
}
