import type { AssistantProviderId } from "@faridalms/domain/assistant";

import {
  ASSISTANT_PROVIDERS,
  DEFAULT_DAILY_LIMIT,
  PROVIDER_NAMES,
} from "@faridalms/domain/assistant";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import {
  SettingsPage,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { assistantSettingsQuery } from "~/queries/assistant";
import { saveAssistantSettings } from "~/server/assistant";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

/**
 * Whether the school lets its teachers ask a language model for help with
 * what they write, through which provider, and how many requests a day.
 * The provider's key is the deployment's; the page never sees it.
 */
export function AssistantSettings() {
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(assistantSettingsQuery).data;
  const save = useServerFn(saveAssistantSettings);
  const offered = data.providers.length > 0;
  const [enabled, setEnabled] = useState(data.settings?.enabled ?? false);
  const [provider, setProvider] = useState<AssistantProviderId>(
    data.settings?.provider ?? data.providers[0] ?? ASSISTANT_PROVIDERS[0],
  );
  const [limit, setLimit] = useState(
    String(
      data.settings?.dailyLimit ?? Math.min(DEFAULT_DAILY_LIMIT, data.ceiling),
    ),
  );
  const [saved, setSaved] = useState(false);
  const dailyLimit = Number(limit);
  const limitIssue =
    Number.isInteger(dailyLimit) &&
    dailyLimit >= 1 &&
    dailyLimit <= data.ceiling
      ? null
      : m.assistantLimitIssue({ most: formatNumber(data.ceiling) });
  const saving = useMutation({
    mutationFn: () =>
      save({
        data: {
          expectedVersion: data.settings?.version ?? 0,
          enabled,
          provider,
          dailyLimit,
        },
      }),
    meta: { inlineError: true },
  });
  const dirty =
    JSON.stringify({ enabled, provider, limit }) !==
    JSON.stringify({
      enabled: data.settings?.enabled ?? false,
      provider: data.settings?.provider ?? provider,
      limit: String(data.settings?.dailyLimit ?? limit),
    });
  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      setSaved(false);
      set(value);
    };
  return (
    <SettingsPage>
      <SettingsSection
        title={m.assistantSettings()}
        description={m.assistantSettingsHint()}
        onSubmit={async () => {
          if (limitIssue) return;
          await saving.mutateAsync().then(
            async () => {
              setSaved(true);
              await queryClient.invalidateQueries({ queryKey: ["assistant"] });
            },
            () => undefined,
          );
        }}
        pending={saving.isPending}
        error={saving.error ? getMessageFromError(saving.error) : null}
        saved={saved && !dirty}
        isDirty={() => dirty}
      >
        {offered ? null : (
          <p className="text-sm leading-5 text-muted-foreground">
            {m.assistantNoProvider()}
          </p>
        )}
        <CheckboxRow
          label={m.assistantEnabled()}
          hint={m.assistantEnabledHint()}
          checked={enabled}
          disabled={!offered && !enabled}
          onChange={change(setEnabled)}
        />
        <SelectField
          id="assistant-provider"
          label={m.assistantProvider()}
          hint={m.assistantProviderHint()}
          value={provider}
          disabled={!offered}
          options={(offered ? data.providers : [provider]).map((id) => ({
            value: id,
            label: PROVIDER_NAMES[id],
          }))}
          onChange={change(setProvider)}
        />
        <TextField
          id="assistant-limit"
          label={m.assistantLimit()}
          hint={m.assistantLimitHint({ most: formatNumber(data.ceiling) })}
          type="number"
          inputMode="numeric"
          min={1}
          max={data.ceiling}
          width="score"
          value={limit}
          errors={limitIssue ? [limitIssue] : undefined}
          onChange={(event) => change(setLimit)(event.target.value)}
        />
      </SettingsSection>
      <SettingsSection
        title={m.assistantToday()}
        description={m.assistantTodayHint()}
      >
        <SummaryList
          items={[
            {
              id: "used",
              label: m.assistantUsed(),
              value: m.assistantUsedOf({
                used: formatNumber(data.usedToday),
                limit: formatNumber(
                  Math.min(
                    data.settings?.dailyLimit ?? DEFAULT_DAILY_LIMIT,
                    data.ceiling,
                  ),
                ),
              }),
            },
          ]}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
