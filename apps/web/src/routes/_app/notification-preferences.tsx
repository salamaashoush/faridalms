import type {
  ChoosableKind,
  EmailMode,
  Preferences,
  SmsMode,
} from "@faridalms/domain/notifications";
import type { Workspace } from "@faridalms/domain/workspace";

import {
  CHOOSABLE_KINDS,
  EMAIL_MODES,
  SMS_MODES,
} from "@faridalms/domain/notifications";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { KIND_ICON } from "~/components/notifications/format";
import { CheckboxRow } from "~/components/people/fields";
import { SelectField, TextField } from "~/components/system/field";
import { PageHeader } from "~/components/system/IndexPage";
import {
  SettingsPage,
  SettingsSection,
} from "~/components/system/SettingsSection";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { notificationPreferencesQuery } from "~/queries/notifications";
import { saveNotificationPreferences } from "~/server/notifications";
import { getMessageFromError } from "~/utils/error";

export const Route = createFileRoute("/_app/notification-preferences")({
  staticData: { breadcrumb: m.notifPreferences, section: "/notifications" },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(notificationPreferencesQuery),
  component: PreferencesPage,
});

const KIND_LABEL: Record<ChoosableKind, () => string> = {
  announcement: m.ntfKindAnnouncement,
  news: m.ntfKindNews,
  message: m.ntfKindMessage,
  absence: m.ntfKindAbsence,
  event: m.ntfKindEvent,
  reminder: m.ntfKindReminder,
  consent: m.ntfKindConsent,
  mention: m.ntfKindMention,
  library: m.ntfKindLibrary,
  reply: m.ntfKindReply,
};

const EMAIL_LABEL: Record<EmailMode, () => string> = {
  instant: m.ntfModeInstant,
  digest: m.ntfModeDigest,
  off: m.ntfModeOff,
};

const SMS_LABEL: Record<SmsMode, () => string> = {
  instant: m.ntfModeInstant,
  off: m.ntfModeOff,
};

/**
 * Absences and consent requests reach families, register reminders and
 * library reviews reach staff, and replies those who post in discussions;
 * nobody else gets them.
 */
function kindsFor(workspace: Workspace): readonly ChoosableKind[] {
  return CHOOSABLE_KINDS.filter(
    (kind) =>
      ((kind !== "absence" && kind !== "consent") || workspace === "family") &&
      ((kind !== "reminder" && kind !== "library") ||
        workspace === "teach" ||
        workspace === "admin") &&
      (kind !== "reply" || workspace === "teach" || workspace === "me"),
  );
}

interface Draft {
  preferences: Preferences;
  locale: "en" | "ar";
}

function PreferencesPage() {
  const data = useSuspenseQuery(notificationPreferencesQuery).data;
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>({
    preferences: data.preferences,
    locale: data.locale,
  });
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const save = useMutation({
    mutationFn: () => saveNotificationPreferences({ data: draft }),
    onSuccess: async () => {
      setBaseline(JSON.stringify(draft));
      await queryClient.invalidateQueries({
        queryKey: ["notifications", "preferences"],
      });
    },
  });
  const set = (next: Partial<Preferences>) =>
    setDraft((current) => ({
      ...current,
      preferences: { ...current.preferences, ...next },
    }));
  const dirty = () => JSON.stringify(draft) !== baseline;
  const common = {
    onSubmit: () => save.mutateAsync(),
    pending: save.isPending,
    error: save.error ? getMessageFromError(save.error) : null,
    saved: save.isSuccess && !dirty(),
    isDirty: dirty,
  };
  return (
    <>
      <PageHeader title={m.notifPreferences()} description={m.ntfPrefsHint()} />
      <SettingsPage>
        <SettingsSection
          title={m.ntfSectionChannels()}
          description={m.ntfSectionChannelsHint()}
          {...common}
        >
          <ul className="grid gap-5">
            <li className="grid gap-1">
              <p className="flex items-center gap-2 text-sm leading-5 font-medium">
                <KIND_ICON.urgent
                  className="size-4 text-destructive"
                  aria-hidden
                />
                {m.ntfKindUrgent()}
              </p>
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                {m.ntfUrgentLocked()}
              </p>
            </li>
            {kindsFor(user.workspace).map((kind) => {
              const Icon = KIND_ICON[kind];
              return (
                <li
                  key={kind}
                  className="grid gap-3 border-t pt-5 @min-[560px]:grid-cols-[minmax(0,1fr)_auto] @min-[560px]:items-end"
                >
                  <p className="flex items-center gap-2 text-sm leading-5 font-medium @min-[560px]:self-center">
                    <Icon
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                    {KIND_LABEL[kind]()}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <SelectField
                      id={`email-${kind}`}
                      label={m.ntfEmail()}
                      className="w-40"
                      value={draft.preferences.email[kind]}
                      options={EMAIL_MODES.map((mode) => ({
                        value: mode,
                        label: EMAIL_LABEL[mode](),
                      }))}
                      onChange={(mode) =>
                        set({
                          email: { ...draft.preferences.email, [kind]: mode },
                        })
                      }
                    />
                    <SelectField
                      id={`sms-${kind}`}
                      label={m.ntfSms()}
                      className="w-32"
                      value={draft.preferences.sms[kind]}
                      options={SMS_MODES.map((mode) => ({
                        value: mode,
                        label: SMS_LABEL[mode](),
                      }))}
                      onChange={(mode) =>
                        set({ sms: { ...draft.preferences.sms, [kind]: mode } })
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          {data.channels.email && data.channels.sms ? null : (
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {data.channels.email
                ? m.ntfNoSms()
                : data.channels.sms
                  ? m.ntfNoEmail()
                  : m.ntfNoChannels()}
            </p>
          )}
        </SettingsSection>
        <SettingsSection
          title={m.ntfSectionTiming()}
          description={m.ntfSectionTimingHint()}
          {...common}
        >
          <div className="flex flex-wrap items-start gap-4">
            <TextField
              id="quiet-from"
              label={m.ntfQuietFrom()}
              optional
              type="time"
              width="date"
              value={draft.preferences.quietFrom}
              onChange={(event) => set({ quietFrom: event.target.value })}
            />
            <TextField
              id="quiet-to"
              label={m.ntfQuietTo()}
              optional
              type="time"
              width="date"
              value={draft.preferences.quietTo}
              onChange={(event) => set({ quietTo: event.target.value })}
            />
          </div>
          <CheckboxRow
            label={m.ntfWeekendMute()}
            hint={m.ntfWeekendMuteHint()}
            checked={draft.preferences.weekendMute}
            onChange={(weekendMute) => set({ weekendMute })}
          />
          <TextField
            id="digest-at"
            label={m.ntfDigestAt()}
            hint={m.ntfDigestAtHint()}
            type="time"
            width="date"
            value={draft.preferences.digestAt}
            onChange={(event) =>
              event.target.value && set({ digestAt: event.target.value })
            }
          />
          <SelectField
            id="notify-language"
            label={m.ntfLanguage()}
            hint={m.ntfLanguageHint()}
            width="name"
            value={draft.locale}
            options={[
              { value: "en", label: m.languageOwnEn() },
              { value: "ar", label: m.languageOwnAr() },
            ]}
            onChange={(locale) =>
              setDraft((current) => ({ ...current, locale }))
            }
          />
        </SettingsSection>
      </SettingsPage>
    </>
  );
}
