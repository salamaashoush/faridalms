import { createAssignmentSchema } from "@faridalms/domain/school-schema";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "~/components/app/dialog";
import { Field, FieldError, FieldLabel } from "~/components/app/field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import { createAssignment } from "~/server/school";

import { ClassPicker } from "./ClassPicker";

interface TeachingClass {
  id: string;
  name: string;
  authoringSubjects: { id: string; name: string }[];
}

export function CreateAssignment({
  classes: availableClasses,
  today,
}: {
  classes: TeachingClass[];
  today: string;
}) {
  const classes = availableClasses.filter(
    (item) => item.authoringSubjects.length > 0,
  );
  const [open, setOpen] = useState(false);
  const first = classes[0];
  const mutation = useMutation({
    mutationFn: createAssignment,
    onSuccess: () => {
      setOpen(false);
      toast.success(m.courseworkPublished());
      form.reset();
    },
  });
  const form = useForm({
    defaultValues: {
      classId: first?.id ?? "",
      subjectId: first?.authoringSubjects[0]?.id ?? "",
      title: "",
      description: "",
      dueDate: today,
      maxScore: 10,
    },
    validators: { onSubmit: createAssignmentSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ data: value });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={classes.length === 0} />}>
        <Plus className="size-4" aria-hidden />
        {m.courseworkCreate()}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>{m.courseworkCreate()}</DialogTitle>
        <DialogDescription>{m.courseworkCreateBody()}</DialogDescription>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="classId">
              {(field) => (
                <ClassPicker
                  id="create-class"
                  label={m.studentClass()}
                  classes={classes}
                  value={field.state.value}
                  onChange={(value) => {
                    field.handleChange(value);
                    form.setFieldValue(
                      "subjectId",
                      classes.find((item) => item.id === value)
                        ?.authoringSubjects[0]?.id ?? "",
                    );
                  }}
                />
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.values.classId}>
              {(classId) => (
                <form.Field name="subjectId">
                  {(field) => (
                    <ClassPicker
                      id="create-subject"
                      label={m.assignmentsSubject()}
                      value={field.state.value}
                      onChange={field.handleChange}
                      classes={
                        classes.find((item) => item.id === classId)
                          ?.authoringSubjects ?? []
                      }
                    />
                  )}
                </form.Field>
              )}
            </form.Subscribe>
          </div>
          <form.Field name="title">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="assignment-title">
                  {m.courseworkTitle()}
                </FieldLabel>
                <Input
                  id="assignment-title"
                  value={field.state.value}
                  maxLength={255}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field name="description">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="assignment-instructions">
                  {m.courseworkInstructions()}
                </FieldLabel>
                <Textarea
                  id="assignment-instructions"
                  rows={5}
                  value={field.state.value}
                  maxLength={20000}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <div className="grid grid-cols-2 gap-4">
            <form.Field name="dueDate">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="assignment-due">
                    {m.meDueDate()}
                  </FieldLabel>
                  <Input
                    id="assignment-due"
                    type="date"
                    min={today}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.Field name="maxScore">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="assignment-max">
                    {m.courseworkMaxScore()}
                  </FieldLabel>
                  <Input
                    id="assignment-max"
                    type="number"
                    min={1}
                    max={1000}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(event.target.valueAsNumber)
                    }
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            {m.courseworkCreate()}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
