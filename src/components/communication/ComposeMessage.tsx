import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense } from "react";
import { toast } from "sonner";

import type { ComposeMessageInput } from "~/schema/school";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import { recipientsQuery, visibleStudentsQuery } from "~/queries/school";
import { MESSAGE_CATEGORIES, composeMessageSchema } from "~/schema/school";
import { sendMessage } from "~/server/school";

type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

const CATEGORY_LABEL: Record<MessageCategory, () => string> = {
  teachers: m.messagesRecipientTeachers,
  administration: m.messagesRecipientAdministration,
};

function RecipientSelect({
  category,
  value,
  invalid,
  onChange,
  onBlur,
}: {
  category: MessageCategory;
  value: string;
  invalid: boolean;
  onChange: (next: string) => void;
  onBlur: () => void;
}) {
  const recipients = useSuspenseQuery(recipientsQuery(category)).data;

  if (recipients.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {m.commComposeNoRecipients()}
      </p>
    );
  }

  const items = recipients.map((person) => ({
    value: person.id,
    label: person.title ? `${person.name} (${person.title})` : person.name,
  }));

  return (
    <Select
      items={items}
      value={value || null}
      onValueChange={(next) => onChange(next ?? "")}
    >
      <SelectTrigger
        id="compose-recipient"
        className="w-full"
        aria-invalid={invalid}
        onBlur={onBlur}
      >
        <SelectValue placeholder={m.commComposeRecipientPlaceholder()} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ComposeForm({ onSent }: { onSent: () => void }) {
  const queryClient = useQueryClient();
  const students = useSuspenseQuery(visibleStudentsQuery).data;

  const { mutateAsync } = useMutation({
    mutationFn: useServerFn(sendMessage),
    mutationKey: ["messages", "send"],
    onSuccess: async () => {
      toast.success(m.messagesSentToast());
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
      onSent();
    },
  });

  const defaultValues: ComposeMessageInput = {
    category: "teachers",
    recipientId: "",
    studentId: "",
    subject: "",
    body: "",
  };

  const form = useForm({
    defaultValues,
    validators: { onSubmit: composeMessageSchema },
    onSubmit: async ({ value }) => {
      await mutateAsync({ data: value });
      form.reset();
    },
  });

  const categoryItems = MESSAGE_CATEGORIES.map((value) => ({
    value,
    label: CATEGORY_LABEL[value](),
  }));

  const studentItems = [
    { value: "", label: m.commComposeAboutNone() },
    ...students.map((student) => ({
      value: student.id,
      label: student.fullName,
    })),
  ];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-6"
    >
      <FieldGroup>
        <form.Field name="category">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="compose-category">
                {m.commComposeCategory()}
              </FieldLabel>
              <Select
                items={categoryItems}
                value={field.state.value}
                onValueChange={(next) => {
                  if (!next) {
                    return;
                  }
                  field.handleChange(next);
                  // The old recipient belongs to the old group, so keeping it
                  // would send to somebody the reader can no longer see.
                  form.setFieldValue("recipientId", "");
                }}
              >
                <SelectTrigger id="compose-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.category}>
          {(category) => (
            <form.Field name="recipientId">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="compose-recipient">
                      {m.messagesRecipient()}
                    </FieldLabel>
                    <Suspense fallback={<Skeleton className="h-9 w-full" />}>
                      <RecipientSelect
                        category={category}
                        value={field.state.value}
                        invalid={invalid}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                      />
                    </Suspense>
                    {invalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>
          )}
        </form.Subscribe>

        {students.length > 0 ? (
          <form.Field name="studentId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="compose-student">
                  {m.messagesAbout()}
                </FieldLabel>
                <Select
                  items={studentItems}
                  value={field.state.value ?? ""}
                  onValueChange={(next) => field.handleChange(next ?? "")}
                >
                  <SelectTrigger id="compose-student" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {studentItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
        ) : null}

        <form.Field name="subject">
          {(field) => {
            const invalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor="compose-subject">
                  {m.messagesSubject()}
                </FieldLabel>
                <Input
                  id="compose-subject"
                  name={field.name}
                  value={field.state.value}
                  aria-invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                {invalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="body">
          {(field) => {
            const invalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor="compose-body">
                  {m.messagesBody()}
                </FieldLabel>
                <Textarea
                  id="compose-body"
                  name={field.name}
                  rows={6}
                  value={field.state.value}
                  aria-invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                {invalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          {m.commonCancel()}
        </DialogClose>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? m.commonSending() : m.commonSend()}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

export function ComposeMessage({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.messagesCompose()}</DialogTitle>
          <DialogDescription>{m.commComposeDescription()}</DialogDescription>
        </DialogHeader>
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <ComposeForm onSent={() => onOpenChange(false)} />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
