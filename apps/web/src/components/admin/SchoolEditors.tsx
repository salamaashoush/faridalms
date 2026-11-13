import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import {
  SettingsGroup,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import { TimeZoneField } from "@faridalms/ui/system/time-zone-field";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";

import { PictureField } from "~/components/media/PictureField";
import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { schoolProfileQuery } from "~/queries/school-settings";
import { saveSchoolProfile } from "~/server/school-settings";
import { formatNumber, formatWeekday } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

type Profile = Awaited<
  ReturnType<NonNullable<(typeof schoolProfileQuery)["queryFn"]>>
>;

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
  digits: "latn" | "arab";
  arabicMath: "ltr" | "rtl";
  phone: string;
  email: string;
  logoFileId: string;
  learnersDecideFrom: number;
  learnersAreAdults: boolean;
}

const DECIDING_AGES = Array.from({ length: 25 }, (_, index) => index + 1);

function draftOf(profile: Profile): ProfileDraft {
  return {
    nameEn: profile.nameEn ?? "",
    nameAr: profile.nameAr ?? "",
    identifier: profile.identifier ?? "",
    timeZone: profile.timeZone ?? "",
    defaultLocale: profile.defaultLocale,
    weekStart: profile.weekStart,
    weekendDays: [...profile.weekendDays],
    secondaryCalendar: profile.secondaryCalendar ?? "",
    digits: profile.digits,
    arabicMath: profile.arabicMath,
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    logoFileId: profile.logoFileId ?? "",
    learnersDecideFrom: profile.learnersDecideFrom,
    learnersAreAdults: profile.learnersAreAdults,
  };
}

export function SchoolProfileSection() {
  const words = useWords();
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
          label={m.settingsTimeZone()}
          hint={m.settingsTimeZoneHint()}
          searchLabel={m.settingsTimeZoneSearch()}
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
            label: formatWeekday(day),
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
                label={formatWeekday(day)}
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
        <SelectField
          id="school-digits"
          label={m.settingsDigits()}
          hint={m.settingsDigitsHint()}
          value={draft.digits}
          options={[
            // The samples are drawn outside the words, which would turn them
            // into the digits the school has now.
            { value: "latn", label: `${m.settingsDigitsLatin()} (0 1 2 3)` },
            { value: "arab", label: `${m.settingsDigitsArabic()} (٠ ١ ٢ ٣)` },
          ]}
          onChange={(value) => set("digits", value)}
          width="name"
        />
        <SelectField
          id="school-arabic-math"
          label={m.settingsArabicMath()}
          hint={m.settingsArabicMathHint()}
          value={draft.arabicMath}
          options={[
            { value: "ltr", label: m.settingsArabicMathLtr() },
            { value: "rtl", label: m.settingsArabicMathRtl() },
          ]}
          onChange={(value) => set("arabicMath", value)}
          width="name"
        />
      </SettingsGroup>
      <SettingsGroup title={m.settingsGroupLearners()}>
        <SelectField
          id="school-learners-decide"
          label={m.settingsLearnersDecide()}
          hint={words(m.settingsLearnersDecideHintCore)()}
          value={String(draft.learnersDecideFrom)}
          options={DECIDING_AGES.map((age) => ({
            value: String(age),
            label: m.settingsLearnersDecideAge({ age: formatNumber(age) }),
          }))}
          onChange={(value) => set("learnersDecideFrom", Number(value))}
          width="name"
        />
        <CheckboxRow
          label={m.settingsLearnersAdults()}
          hint={words(m.settingsLearnersAdultsHintCore)()}
          checked={draft.learnersAreAdults}
          onChange={(next) => set("learnersAreAdults", next)}
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
