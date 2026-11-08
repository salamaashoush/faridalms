import { Button } from "@faridalms/ui/button";
import { TextField } from "@faridalms/ui/system/form-field";
import {
  SettingsPage,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import { Value } from "@faridalms/ui/system/value";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { recordStoreQuery } from "~/queries/xapi";
import { retryRecordStore, saveRecordStore } from "~/server/xapi";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

/** The sender's own words for why a statement did not go; a store's are its HTTP status. */
const STORE_ERRORS: Record<string, (() => string) | undefined> = {
  store_off: m.xapiErrorOff,
  secret_unreadable: m.xapiErrorSecret,
};

/**
 * The school's own learning record store: where learning is sent as xAPI
 * statements as it happens, the key and secret it gave the school, and how
 * the sending stands. The secret is never shown, only whether one is kept.
 */
export function RecordStore() {
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(recordStoreQuery).data;
  const save = useServerFn(saveRecordStore);
  const retry = useServerFn(retryRecordStore);
  const [endpoint, setEndpoint] = useState(data.store?.endpoint ?? "");
  const [username, setUsername] = useState(data.store?.username ?? "");
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(data.store?.enabled ?? false);
  const [saved, setSaved] = useState(false);
  const saving = useMutation({
    mutationFn: () =>
      save({
        data: {
          expectedVersion: data.store?.version ?? 0,
          endpoint,
          username,
          secret,
          enabled,
        },
      }),
    meta: { inlineError: true },
  });
  const retrying = useMutation({
    mutationFn: () => retry(),
    onSuccess: async ({ queued }) => {
      toast.success(m.xapiRetried({ count: formatNumber(queued) }));
      await queryClient.invalidateQueries({ queryKey: ["xapi"] });
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const dirty =
    secret !== "" ||
    endpoint !== (data.store?.endpoint ?? "") ||
    username !== (data.store?.username ?? "") ||
    enabled !== (data.store?.enabled ?? false);
  const { sending } = data;
  return (
    <SettingsPage>
      <SettingsSection
        title={m.xapiStore()}
        description={m.xapiStoreHint()}
        onSubmit={async () => {
          await saving.mutateAsync().then(
            async () => {
              setSecret("");
              setSaved(true);
              await queryClient.invalidateQueries({ queryKey: ["xapi"] });
            },
            () => undefined,
          );
        }}
        pending={saving.isPending}
        error={saving.error ? getMessageFromError(saving.error) : null}
        saved={saved && !dirty}
        isDirty={() => dirty}
      >
        <TextField
          id="xapi-endpoint"
          label={m.xapiEndpoint()}
          hint={m.xapiEndpointHint()}
          type="url"
          dir="ltr"
          value={endpoint}
          onChange={(event) => {
            setSaved(false);
            setEndpoint(event.target.value);
          }}
        />
        <TextField
          id="xapi-key"
          label={m.xapiKey()}
          dir="ltr"
          autoComplete="off"
          value={username}
          onChange={(event) => {
            setSaved(false);
            setUsername(event.target.value);
          }}
        />
        <TextField
          id="xapi-secret"
          label={m.xapiSecret()}
          hint={
            data.store?.secretKept ? m.xapiSecretKept() : m.xapiSecretHint()
          }
          optional={data.store?.secretKept ?? false}
          type="password"
          dir="ltr"
          autoComplete="new-password"
          value={secret}
          onChange={(event) => {
            setSaved(false);
            setSecret(event.target.value);
          }}
        />
        <CheckboxRow
          label={m.xapiEnabled()}
          hint={m.xapiEnabledHint()}
          checked={enabled}
          onChange={(next) => {
            setSaved(false);
            setEnabled(next);
          }}
        />
      </SettingsSection>
      <SettingsSection
        title={m.xapiSending()}
        description={m.xapiSendingHint()}
        footer={
          sending.failed > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              disabled={retrying.isPending}
              onClick={() => retrying.mutate()}
            >
              <RotateCcw aria-hidden />
              {m.xapiRetry()}
            </Button>
          ) : undefined
        }
      >
        <SummaryList
          items={[
            {
              id: "queued",
              label: m.xapiQueued(),
              value: formatNumber(sending.queued),
            },
            {
              id: "sent",
              label: m.xapiSent(),
              value: formatNumber(sending.sent),
            },
            {
              id: "failed",
              label: m.xapiFailed(),
              value: formatNumber(sending.failed),
            },
            {
              id: "last",
              label: m.xapiLastSent(),
              value: (
                <Value>
                  {sending.lastSentAt
                    ? formatInstant(sending.lastSentAt, "medium")
                    : null}
                </Value>
              ),
            },
            {
              id: "error",
              label: m.xapiLastError(),
              value: (
                <Value>
                  {sending.lastError ? (
                    <span dir="auto">
                      {STORE_ERRORS[sending.lastError]?.() ?? sending.lastError}
                    </span>
                  ) : null}
                </Value>
              ),
            },
          ]}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
