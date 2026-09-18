import { NOTIFICATION_TYPES } from "@faridalms/domain/notification";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { ManagementPage } from "~/components/admin/ManagementPage";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "~/components/app/field";
import { NOTIFICATION_TYPE_LABEL } from "~/components/app/notification-labels";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import * as m from "~/i18n/messages";
import { notificationPreferencesQuery } from "~/queries/notifications";
import { saveNotificationPreferences } from "~/server/notifications";

export const Route = createFileRoute("/_app/notification-preferences")({
  staticData: { breadcrumb: m.notifPreferences },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(notificationPreferencesQuery),
  component: PreferencesPage,
});

function Toggle({
  label,
  hint,
  id,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      </FieldContent>
    </Field>
  );
}

function PreferencesPage() {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const save = useServerFn(saveNotificationPreferences);
  const { data } = useSuspenseQuery(notificationPreferencesQuery);
  const [baseline, setBaseline] = useState(data);
  const [values, setValues] = useState(data);
  const mutation = useMutation({
    mutationFn: () => save({ data: values }),
    onSuccess: async (saved) => {
      setBaseline(saved);
      setValues(saved);
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(m.managementSaved());
    },
  });
  return (
    <ManagementPage
      title={m.notifPreferences()}
      description={m.notifPreferencesHint()}
      pending={mutation.isPending}
      onClose={() =>
        void navigate({
          to: "/notifications",
          search: { page: 1, unread: false },
        })
      }
      onSubmit={() => mutation.mutateAsync().then(() => undefined)}
      isDirty={() => JSON.stringify(values) !== JSON.stringify(baseline)}
    >
      <fieldset className="min-w-0 space-y-4">
        <legend className="text-sm font-semibold">{m.notifChannels()}</legend>
        <Toggle
          label={m.notifChannelEmail()}
          hint={m.notifChannelEmailHint()}
          id="pref-email"
          checked={values.email}
          onChange={(email) => setValues((current) => ({ ...current, email }))}
        />
        <Toggle
          label={m.notifChannelSms()}
          hint={m.notifChannelSmsHint()}
          id="pref-sms"
          checked={values.sms}
          onChange={(sms) => setValues((current) => ({ ...current, sms }))}
        />
      </fieldset>
      <fieldset className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold">{m.notifLanguage()}</legend>
        <div className="flex gap-2">
          {(["en", "ar"] as const).map((locale) => (
            <Button
              key={locale}
              type="button"
              variant={values.locale === locale ? "secondary" : "outline"}
              aria-pressed={values.locale === locale}
              onClick={() => setValues((current) => ({ ...current, locale }))}
            >
              {locale === "en" ? m.newsletterEnglish() : m.newsletterArabic()}
            </Button>
          ))}
        </div>
      </fieldset>
      <fieldset className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold">{m.notifMuted()}</legend>
        <FieldDescription>{m.notifMutedHint()}</FieldDescription>
        {NOTIFICATION_TYPES.map((type) => (
          <Toggle
            key={type}
            label={NOTIFICATION_TYPE_LABEL[type]()}
            hint=""
            id={`mute-${type}`}
            checked={values.mutedTypes.includes(type)}
            onChange={(muted) =>
              setValues((current) => ({
                ...current,
                mutedTypes: muted
                  ? [...current.mutedTypes, type]
                  : current.mutedTypes.filter((item) => item !== type),
              }))
            }
          />
        ))}
      </fieldset>
    </ManagementPage>
  );
}
