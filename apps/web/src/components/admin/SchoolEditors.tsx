import type {
  SchoolProfileInput,
  PublishNewsletterInput,
} from "@faridalms/domain/administration-schema";

import {
  schoolProfileSchema,
  publishNewsletterSchema,
} from "@faridalms/domain/administration-schema";
import { revalidateLogic, useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Field, FieldLabel, FieldError } from "~/components/app/field";
import { ComboboxField } from "~/components/system/ComboboxField";
import { TextField } from "~/components/system/field";
import { SettingsSection } from "~/components/system/SettingsSection";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import { saveSchoolProfile, publishNewsletter } from "~/server/school";
import { getMessageFromError } from "~/utils/error";

import { ManagementDialog, ManagementInput } from "./ManagementDialog";

function TimeZoneField({
  value,
  onChange,
  errors,
}: {
  value: string;
  onChange: (value: string) => void;
  errors?: (string | { message?: string } | undefined)[];
}) {
  const [search, setSearch] = useState("");
  const zones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const needle = search.trim().toLocaleLowerCase().replaceAll(" ", "_");
  const matches = zones.filter((zone) =>
    zone.toLocaleLowerCase().includes(needle),
  );
  // The saved zone is always an option, so the trigger can name it even
  // when a search leaves it out or this browser does not list it.
  const options = (
    value && !matches.includes(value) ? [value, ...matches] : matches
  ).map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }));
  return (
    <div className="max-w-80">
      <ComboboxField
        label={m.settingsTimeZone()}
        hint={m.settingsTimeZoneHint()}
        searchLabel={m.settingsTimeZoneSearch()}
        options={options}
        value={value ? [value] : []}
        onChange={(next) => onChange(next[0] ?? value)}
        search={search}
        onSearchChange={setSearch}
        errors={errors}
      />
    </div>
  );
}

export function SchoolProfileSection({
  initial,
}: {
  initial: SchoolProfileInput;
}) {
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: (data: SchoolProfileInput) => saveSchoolProfile({ data }),
    meta: { inlineError: true },
  });
  const form = useForm({
    defaultValues: { name: initial.name, timeZone: initial.timeZone },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: schoolProfileSchema },
    onSubmit: async ({ value, formApi }) => {
      setSaved(false);
      try {
        await mutation.mutateAsync(value);
      } catch {
        return;
      }
      formApi.reset(value);
      setSaved(true);
    },
  });
  const dirty = useStore(form.store, (state) => state.isDirty);
  return (
    <SettingsSection
      title={m.settingsProfileTitle()}
      description={m.settingsSchoolHint()}
      onSubmit={() => form.handleSubmit()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      saved={saved && !dirty}
      isDirty={() => form.state.isDirty}
    >
      <form.Field name="name">
        {(field) => (
          <TextField
            id="school-name"
            label={m.settingsSchoolName()}
            width="name"
            autoComplete="organization"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
          />
        )}
      </form.Field>
      <form.Field name="timeZone">
        {(field) => (
          <TimeZoneField
            value={field.state.value}
            onChange={field.handleChange}
            errors={field.state.meta.errors}
          />
        )}
      </form.Field>
    </SettingsSection>
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
