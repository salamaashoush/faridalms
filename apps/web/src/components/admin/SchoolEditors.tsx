import type {
  SchoolProfileInput,
  SaveSubjectInput,
  PublishNewsletterInput,
} from "@faridalms/domain/administration-schema";

import {
  schoolProfileSchema,
  saveSubjectSchema,
  publishNewsletterSchema,
} from "@faridalms/domain/administration-schema";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Field, FieldLabel, FieldError } from "~/components/app/field";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import {
  saveSchoolProfile,
  saveSubject,
  publishNewsletter,
} from "~/server/school";

import { ManagementDialog, ManagementInput } from "./ManagementDialog";

export function SchoolProfileEditor({
  initial,
  onClose,
}: {
  initial: SchoolProfileInput;
  onClose: () => void;
}) {
  const mutation = useMutation({
    mutationFn: saveSchoolProfile,
    onSuccess: () => {
      toast.success(m.managementSaved());
      onClose();
    },
  });
  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: schoolProfileSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ data: value });
    },
  });
  return (
    <ManagementDialog
      title={m.settingsEditSchool()}
      description={m.settingsSchoolHint()}
      onClose={onClose}
      onSubmit={() => {
        void form.handleSubmit();
      }}
      pending={mutation.isPending}
    >
      {(["name", "timeZone"] as const).map((name) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <ManagementInput
              id={`school-${name}`}
              label={
                name === "name" ? m.settingsSchoolName() : m.settingsTimeZone()
              }
              value={field.state.value}
              required
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
      ))}
    </ManagementDialog>
  );
}
export function SubjectEditor({
  initial,
  onClose,
}: {
  initial?: SaveSubjectInput;
  onClose: () => void;
}) {
  const mutation = useMutation({
    mutationFn: saveSubject,
    onSuccess: () => {
      toast.success(m.managementSaved());
      onClose();
    },
  });
  const form = useForm({
    defaultValues: initial ?? { slug: "", name: "", nameAr: "" },
    validators: { onSubmit: saveSubjectSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ data: value });
    },
  });
  const labels = {
    slug: m.settingsSubjectCode(),
    name: m.adminSubjectNameEn(),
    nameAr: m.adminSubjectNameAr(),
  };
  return (
    <ManagementDialog
      title={initial ? m.settingsEditSubject() : m.settingsAddSubject()}
      description={m.settingsSubjectHint()}
      onClose={onClose}
      onSubmit={() => {
        void form.handleSubmit();
      }}
      pending={mutation.isPending}
    >
      {(["name", "nameAr", "slug"] as const).map((name) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <ManagementInput
              id={`subject-${name}`}
              label={labels[name]}
              value={field.state.value}
              required
              dir={name === "nameAr" ? "rtl" : undefined}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
      ))}
    </ManagementDialog>
  );
}
export function NewsletterEditor({
  today,
  onClose,
}: {
  today: string;
  onClose: () => void;
}) {
  const defaults: PublishNewsletterInput = {
    title: "",
    summary: "",
    url: "",
    publishedOn: today,
  };
  const mutation = useMutation({
    mutationFn: publishNewsletter,
    onSuccess: () => {
      toast.success(m.newsletterPublished());
      onClose();
    },
  });
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: publishNewsletterSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ data: value });
    },
  });
  const labels = {
    title: m.calendarEventTitle(),
    url: m.newsletterDocumentLink(),
    publishedOn: m.newslettersPublished(),
  };
  return (
    <ManagementDialog
      title={m.newsletterPublish()}
      description={m.newsletterPublishHint()}
      onClose={onClose}
      onSubmit={() => {
        void form.handleSubmit();
      }}
      pending={mutation.isPending}
    >
      {(["title", "url", "publishedOn"] as const).map((name) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <ManagementInput
              id={`newsletter-${name}`}
              label={labels[name]}
              value={field.state.value}
              type={
                name === "url"
                  ? "url"
                  : name === "publishedOn"
                    ? "date"
                    : "text"
              }
              required
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
      ))}
      <form.Field name="summary">
        {(field) => (
          <Field>
            <FieldLabel htmlFor="newsletter-summary">
              {m.newsletterSummary()}
            </FieldLabel>
            <Textarea
              id="newsletter-summary"
              rows={5}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
    </ManagementDialog>
  );
}
