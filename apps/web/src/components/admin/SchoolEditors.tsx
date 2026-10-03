import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { CheckboxRow } from "~/components/people/fields";
import { PictureField } from "~/components/site/PictureField";
import { ComboboxField } from "~/components/system/ComboboxField";
import { SelectField, TextField } from "~/components/system/field";
import {
  SettingsGroup,
  SettingsSection,
} from "~/components/system/SettingsSection";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { schoolProfileQuery } from "~/queries/school-settings";
import { saveSchoolProfile } from "~/server/school-settings";
import { getMessageFromError } from "~/utils/error";

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
  secondaryCalendar: "" | "islamic-umalqura" | "islamic-civil";
  phone: string;
  email: string;
  websiteUrl: string;
  logoFileId: string;
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
    secondaryCalendar: profile.secondaryCalendar ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    websiteUrl: profile.websiteUrl ?? "",
    logoFileId: profile.logoFileId ?? "",
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
      <SettingsGroup title={m.settingsGroupIdentity()}>
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
      </SettingsGroup>
      <SettingsGroup title={m.settingsGroupLanguageTime()}>
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
          <div className="grid grid-cols-2 gap-x-5 gap-y-2 @sm:grid-cols-4">
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
        <SelectField
          id="school-secondary-calendar"
          label={m.settingsSecondaryCalendar()}
          hint={m.settingsSecondaryCalendarHint()}
          value={draft.secondaryCalendar || "none"}
          options={[
            { value: "none", label: m.settingsSecondaryNone() },
            {
              value: "islamic-umalqura",
              label: m.settingsSecondaryUmmAlQura(),
            },
            { value: "islamic-civil", label: m.settingsSecondaryTabular() },
          ]}
          onChange={(value) =>
            set("secondaryCalendar", value === "none" ? "" : value)
          }
          width="name"
        />
      </SettingsGroup>
      <SettingsGroup title={m.settingsGroupContact()}>
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
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm leading-5 font-medium">
            {m.settingsSchoolLogo()}
          </legend>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {m.settingsSchoolLogoHint()}
          </p>
          <PictureField
            fileId={draft.logoFileId || null}
            label={m.settingsSchoolLogo()}
            onChange={(fileId) => set("logoFileId", fileId ?? "")}
          />
        </fieldset>
      </SettingsGroup>
    </SettingsSection>
  );
}
