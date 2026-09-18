import type { InferInput } from "valibot";

import { replyMessageSchema } from "@faridalms/domain/school-schema";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Field, FieldLabel, FieldError } from "~/components/app/field";
import { MarkdownComposer } from "~/components/records/MarkdownComposer";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { replyMessage } from "~/server/school";

export function ReplyForm({ messageId }: { messageId: string }) {
  const mutation = useMutation({
    mutationFn: replyMessage,
    onSuccess: () => {
      form.reset();
      toast.success(m.messagesSentToast());
    },
  });
  const defaultValues: InferInput<typeof replyMessageSchema> = {
    id: messageId,
    body: "",
    bodyFormat: "markdown",
  };
  const form = useForm({
    defaultValues,
    validators: { onSubmit: replyMessageSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ data: value });
    },
  });
  return (
    <form
      className="space-y-3 border-t pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="body">
        {(field) => (
          <Field>
            <FieldLabel htmlFor="message-reply">
              {m.messagesWriteReply()}
            </FieldLabel>
            <MarkdownComposer
              id="message-reply"
              disabled={mutation.isPending}
              value={field.state.value}
              onChange={field.handleChange}
            />
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          <Send className="size-4" aria-hidden />
          {m.messagesSendReply()}
        </Button>
      </div>
    </form>
  );
}
