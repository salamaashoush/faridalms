import { submitWorkSchema } from "@faridalms/domain/school-schema";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
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
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import { submitAssignment } from "~/server/school";

export function SubmitWork({
  assignmentId,
  title,
}: {
  assignmentId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: submitAssignment,
    onSuccess: () => {
      setOpen(false);
      toast.success(m.assignmentsSubmitted());
    },
  });
  const form = useForm({
    defaultValues: { assignmentId, content: "" },
    validators: { onSubmit: submitWorkSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ data: value });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        {m.courseworkWrite()}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{m.courseworkResponseHint()}</DialogDescription>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="content">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={`response-${assignmentId}`}>
                  {m.courseworkResponse()}
                </FieldLabel>
                <Textarea
                  id={`response-${assignmentId}`}
                  rows={9}
                  maxLength={20000}
                  required
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? m.meSubmitting() : m.assignmentsSubmit()}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
