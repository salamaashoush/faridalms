import type { PublishNewsletterInput } from "@faridalms/domain/administration-schema";

import { publishNewsletterSchema } from "@faridalms/domain/administration-schema";
import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Field, FieldLabel, FieldError } from "~/components/app/field";
import { CheckboxRow } from "~/components/people/fields";
import { ComboboxField } from "~/components/system/ComboboxField";
import { SelectField, TextField } from "~/components/system/field";
import { SettingsSection } from "~/components/system/SettingsSection";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { schoolProfileQuery } from "~/queries/school-settings";
import { publishNewsletter } from "~/server/school";
import { saveSchoolProfile } from "~/server/school-settings";
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

type Profile = Awaited<
  ReturnType<NonNullable<(typeof schoolProfileQuery)["queryFn"]>>
>;

/** ISO weekdays, 1 for Monday, named in the reader's language. */
function dayName(day: number) {
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, 0, day)));
}

const DAYS = [7, 1, 2, 3, 4, 5, 6];

interface ProfileDraft {
  nameEn: string;
  nameAr: string;
  identifier: string;
  timeZone: string;
  defaultLocale: "ar" | "en";
  weekStart: number;
  weekendDays: number[];
  phone: string;
  email: string;
  websiteUrl: string;
}

function draftOf(profile: Profile): ProfileDraft {
  return {
    nameEn: profile.nameEn ?? "",
    nameAr: profile.nameAr ?? "",
    identifier: profile.identifier ?? "",
    timeZone: profile.timeZone ?? "",
    defaultLocale: profile.defaultLocale ?? "ar",
    weekStart: profile.weekStart,
    weekendDays: [...profile.weekendDays],
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    websiteUrl: profile.websiteUrl ?? "",
  };
}

export function SchoolProfileSection() {
  const queryClient = useQueryClient();
  const profile = useSuspenseQuery(schoolProfileQuery).data;
  const [initial, setInitial] = useState(() => draftOf(profile));
  const [draft, setDraft] = useState(initial);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      saveSchoolProfile({
        data: { expectedVersion: profile.version, ...draft },
      }),
    meta: { inlineError: true },
  });
  const set = <K extends keyof ProfileDraft>(
    key: K,
    value: ProfileDraft[K],
  ) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  return (
    <SettingsSection
      title={m.settingsProfileTitle()}
      description={m.settingsSchoolHint()}
      onSubmit={async () => {
        if (!draft.nameEn.trim() && !draft.nameAr.trim()) {
          setNameError(m.validationNameRequired());
          return;
        }
        await mutation.mutateAsync().then(
          async () => {
            await queryClient.invalidateQueries({ queryKey: ["school"] });
            await queryClient.invalidateQueries({ queryKey: ["user"] });
            setInitial(draft);
            setSaved(true);
          },
          () => undefined,
        );
      }}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      saved={saved && !dirty}
      isDirty={() => dirty}
    >
      <TextField
        id="school-name-ar"
        label={m.settingsSchoolNameArabic()}
        dir="rtl"
        width="name"
        autoComplete="organization"
        value={draft.nameAr}
        onChange={(event) => {
          setNameError(null);
          set("nameAr", event.target.value);
        }}
        errors={nameError ? [nameError] : undefined}
      />
      <TextField
        id="school-name-en"
        label={m.settingsSchoolNameEnglish()}
        dir="ltr"
        width="name"
        autoComplete="organization"
        value={draft.nameEn}
        onChange={(event) => {
          setNameError(null);
          set("nameEn", event.target.value);
        }}
      />
      <TextField
        id="school-identifier"
        label={m.settingsSchoolIdentifier()}
        hint={m.settingsSchoolIdentifierHint()}
        optional
        dir="ltr"
        width="reference"
        autoComplete="off"
        value={draft.identifier}
        onChange={(event) => set("identifier", event.target.value)}
      />
      <TimeZoneField
        value={draft.timeZone}
        onChange={(value) => set("timeZone", value)}
      />
      <SelectField
        id="school-locale"
        label={m.settingsDefaultLanguage()}
        hint={m.settingsDefaultLanguageHint()}
        value={draft.defaultLocale}
        options={[
          { value: "ar", label: m.languageArabic() },
          { value: "en", label: m.languageEnglish() },
        ]}
        onChange={(value) => set("defaultLocale", value)}
        width="name"
      />
      <SelectField
        id="school-week-start"
        label={m.settingsWeekStart()}
        value={String(draft.weekStart)}
        options={DAYS.map((day) => ({
          value: String(day),
          label: dayName(day),
        }))}
        onChange={(value) => set("weekStart", Number(value))}
        width="name"
      />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm leading-5 font-medium">
          {m.settingsWeekend()}
        </legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {DAYS.map((day) => (
            <CheckboxRow
              key={day}
              label={dayName(day)}
              checked={draft.weekendDays.includes(day)}
              onChange={(checked) =>
                set(
                  "weekendDays",
                  checked
                    ? [...draft.weekendDays, day]
                    : draft.weekendDays.filter((held) => held !== day),
                )
              }
            />
          ))}
        </div>
      </fieldset>
      <TextField
        id="school-phone"
        label={m.settingsSchoolPhone()}
        optional
        type="tel"
        dir="ltr"
        width="phone"
        autoComplete="off"
        value={draft.phone}
        onChange={(event) => set("phone", event.target.value)}
      />
      <TextField
        id="school-email"
        label={m.settingsSchoolEmail()}
        optional
        type="email"
        dir="ltr"
        width="name"
        autoComplete="off"
        value={draft.email}
        onChange={(event) => set("email", event.target.value)}
      />
      <TextField
        id="school-website"
        label={m.settingsSchoolWebsite()}
        optional
        type="url"
        dir="ltr"
        width="name"
        autoComplete="off"
        value={draft.websiteUrl}
        onChange={(event) => set("websiteUrl", event.target.value)}
      />
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
