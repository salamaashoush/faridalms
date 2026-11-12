import type { ModuleId } from "@faridalms/domain/modules";
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
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import {
  SettingsPage,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { KIND_ICON } from "~/components/notifications/format";
import { CheckboxRow } from "~/components/people/fields";
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
  message: m.ntfKindMessage,
  absence: m.ntfKindAbsence,
  event: m.ntfKindEvent,
  reminder: m.ntfKindReminder,
  consent: m.ntfKindConsent,
  mention: m.ntfKindMention,
  library: m.ntfKindTemplates,
  reply: m.ntfKindReply,
  enquiry: m.ntfKindEnquiry,
  application: m.ntfKindApplication,
  assignment: m.ntfKindAssignment,
  feedback: m.ntfKindFeedback,
  grades: m.ntfKindGrades,
  correction: m.ntfKindCorrection,
  reenrolment: m.ntfKindReenrolment,
  admission_event: m.ntfKindAdmissionEvent,
  peer_review: m.ntfKindPeerReview,
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
 * Absences, consent requests and answers to the changes a family asked for
 * reach families, register reminders and template reviews reach staff,
 * replies those who post in discussions, work set, returned and graded
 * reaches students and their families, classmates' work to review reaches
 * students where the school has peer review, and enquiries those who work
 * them; nobody else gets them.
 */
function kindsFor(
  workspace: Workspace,
  capabilities: readonly string[],
  modules: Readonly<Record<ModuleId, boolean>>,
): readonly ChoosableKind[] {
  return CHOOSABLE_KINDS.filter(
    (kind) =>
      (kind !== "peer_review" || (workspace === "me" && modules.peer_review)) &&
      ((kind !== "absence" && kind !== "consent" && kind !== "correction") ||
        workspace === "family") &&
      ((kind !== "reminder" && kind !== "library") || workspace === "staff") &&
      (kind !== "reply" ||
        workspace === "me" ||
        capabilities.includes("submissions:grade")) &&
      ((kind !== "assignment" && kind !== "feedback" && kind !== "grades") ||
        workspace === "me" ||
        workspace === "family") &&
      (kind !== "enquiry" || capabilities.includes("admissions:manage")) &&
      (kind !== "application" ||
        capabilities.includes("admissions:manage") ||
        capabilities.includes("applications:submit")),
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
    <Page width="form">
      <PageHeader
        title={m.notifPreferences()}
        description={data.texts ? m.ntfPrefsHint() : m.ntfPrefsHintEmail()}
      />
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
                {data.texts ? m.ntfUrgentLocked() : m.ntfUrgentLockedEmail()}
              </p>
            </li>
            {kindsFor(user.workspace, user.capabilities, user.modules).map(
              (kind) => {
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
                      {data.texts ? (
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
                            set({
                              sms: { ...draft.preferences.sms, [kind]: mode },
                            })
                          }
                        />
                      ) : null}
                    </div>
                  </li>
                );
              },
            )}
          </ul>
          {!data.texts ? (
            data.channels.email ? null : (
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                {m.ntfNoEmail()}
              </p>
            )
          ) : data.channels.email && data.channels.sms ? null : (
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
            label={data.texts ? m.ntfLanguage() : m.ntfLanguageEmail()}
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
    </Page>
  );
}
