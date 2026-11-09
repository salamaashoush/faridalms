import type { HostRole, HostState } from "@faridalms/domain/hosts";
import type { Tone } from "@faridalms/ui/system/status";

import { Button } from "@faridalms/ui/button";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import {
  SettingsPage,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import { StatusBadge } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { LoaderCircle, RefreshCw, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { siteHostsQuery } from "~/queries/site";
import {
  addSiteHost,
  checkSiteHost,
  makeSiteHostCanonical,
  removeSiteHost,
} from "~/server/site";
import { formatInstant } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { hostHref } from "~/utils/host";

type Listing = Awaited<
  ReturnType<NonNullable<(typeof siteHostsQuery)["queryFn"]>>
>;
type Host = Listing["hosts"][number];

const ROLE_LABEL: Record<HostRole, () => string> = {
  site: m.siteAddressesWebsite,
  portal: m.siteAddressesPortal,
};

const STATE: Record<
  Exclude<HostState, "removed">,
  { label: () => string; tone: Tone }
> = {
  pending: { label: m.siteAddressesStatePending, tone: "neutral" },
  verified: { label: m.siteAddressesStateVerified, tone: "info" },
  active: { label: m.siteAddressesStateActive, tone: "success" },
  failing: { label: m.siteAddressesStateFailing, tone: "danger" },
};

const PROBLEM: Record<string, () => string> = {
  "hosts.txt_missing": m.siteAddressesTxtMissing,
  "hosts.route_missing": m.siteAddressesRouteMissing,
  "hosts.lookup_failed": m.siteAddressesLookupFailed,
  "hosts.tls_pending": m.siteAddressesTlsPending,
};

interface DnsRecordProps {
  type: string;
  name: string;
  value: string;
}

/** One DNS record to create, as a provider's form asks for it. */
function DnsRecord({ type, name, value }: DnsRecordProps) {
  return (
    <div className="grid gap-1 rounded-md border bg-muted/40 px-3 py-2 text-[13px] leading-[18px] sm:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
      <div>
        <span className="sr-only">{m.siteAddressesRecordType()}: </span>
        <span className="font-mono font-semibold" dir="ltr">
          {type}
        </span>
      </div>
      <div className="min-w-0">
        <span className="text-muted-foreground sm:sr-only">
          {m.siteAddressesRecordName()}:{" "}
        </span>
        <span className="font-mono break-all select-all" dir="ltr">
          {name}
        </span>
      </div>
      <div className="min-w-0">
        <span className="text-muted-foreground sm:sr-only">
          {m.siteAddressesRecordValue()}:{" "}
        </span>
        <span className="font-mono break-all select-all" dir="ltr">
          {value}
        </span>
      </div>
    </div>
  );
}

interface HostCardProps {
  host: Host;
}

function HostCard({ host }: HostCardProps) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["site", "hosts"] });
  const check = useMutation({
    mutationFn: () => checkSiteHost({ data: { hostname: host.hostname } }),
    onSuccess: async () => {
      await refresh();
      toast.success(m.siteAddressesChecked());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const main = useMutation({
    mutationFn: () =>
      makeSiteHostCanonical({ data: { hostname: host.hostname } }),
    onSuccess: async () => {
      await refresh();
      toast.success(m.siteAddressesMainSet());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const remove = useMutation({
    mutationFn: () => removeSiteHost({ data: { hostname: host.hostname } }),
    onSuccess: async () => {
      setConfirming(false);
      await refresh();
      toast.success(m.siteAddressesRemoved());
    },
  });
  const state = host.state === "removed" ? null : STATE[host.state];
  const problem = host.lastError ? PROBLEM[host.lastError] : undefined;
  const { txt, cname, a } = host.records;
  return (
    <li className="grid gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <span className="font-mono text-sm font-semibold break-all" dir="ltr">
            {host.hostname}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {ROLE_LABEL[host.role]()}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {host.canonical ? (
            <StatusBadge tone="accent">{m.siteAddressesMain()}</StatusBadge>
          ) : null}
          {state ? (
            <StatusBadge tone={state.tone}>{state.label()}</StatusBadge>
          ) : null}
        </div>
      </div>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {host.checkedAt
          ? m.siteAddressesLastCheck({
              when: formatInstant(host.checkedAt),
            })
          : m.siteAddressesNotChecked()}
        {problem ? ` ${problem()}` : null}
      </p>
      {host.state === "active" ? null : (
        <div className="grid gap-2">
          <h3 className="text-[13px] font-medium">
            {m.siteAddressesRecords()}
          </h3>
          <DnsRecord type="TXT" name={txt.name} value={txt.value} />
          <DnsRecord type="CNAME" name={cname.name} value={cname.target} />
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {a.address ? m.siteAddressesApexHint() : m.siteAddressesNoApex()}
          </p>
          {a.address ? (
            <DnsRecord type="A" name={a.name} value={a.address} />
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          disabled={check.isPending}
          onClick={() => check.mutate()}
        >
          {check.isPending ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <RefreshCw aria-hidden />
          )}
          {m.siteAddressesCheck()}
        </Button>
        {host.canonical ? null : (
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            disabled={main.isPending}
            onClick={() => main.mutate()}
          >
            <Star aria-hidden />
            {m.siteAddressesMakeMain()}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          className="max-md:h-10"
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden />
          {m.siteAddressesRemove()}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={m.siteAddressesRemoveTitle({ hostname: host.hostname })}
        body={m.siteAddressesRemoveBody()}
        confirmLabel={m.siteAddressesRemove()}
        pending={remove.isPending}
        error={remove.error ? getMessageFromError(remove.error) : undefined}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </li>
  );
}

/**
 * Where the school's website and portal answer: the platform's names, and
 * names of the school's own with the records each needs and how far along
 * its verification is.
 */
export function SiteAddresses() {
  const queryClient = useQueryClient();
  const listing = useSuspenseQuery(siteHostsQuery).data;
  const [hostname, setHostname] = useState("");
  const [role, setRole] = useState<HostRole>("site");
  const add = useMutation({
    mutationFn: () => addSiteHost({ data: { hostname, role } }),
    onSuccess: async () => {
      setHostname("");
      await queryClient.invalidateQueries({ queryKey: ["site", "hosts"] });
      toast.success(m.siteAddressesAdded());
    },
  });
  const roles = (["site", "portal"] as const).map((value) => ({
    value,
    label: ROLE_LABEL[value](),
  }));
  return (
    <SettingsPage>
      <SettingsSection
        title={m.siteAddressesPlatformTitle()}
        description={m.siteAddressesPlatformBody()}
      >
        <dl className="grid gap-3 text-sm">
          {(["site", "portal"] as const).map((key) => (
            <div key={key} className="grid gap-0.5">
              <dt className="text-[13px] text-muted-foreground">
                {ROLE_LABEL[key]()}
              </dt>
              <dd>
                <a
                  href={hostHref(listing.platform[key], "/")}
                  dir="ltr"
                  className="font-mono break-all text-primary hover:underline"
                >
                  {listing.platform[key]}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      </SettingsSection>
      <SettingsSection
        title={m.siteAddressesOwnTitle()}
        description={m.siteAddressesOwnBody()}
      >
        {!listing.available ? (
          <EmptyState
            placement="section"
            kind="restricted"
            title={m.siteAddressesUnavailable()}
          />
        ) : listing.hosts.length === 0 ? (
          <EmptyState placement="section" title={m.siteAddressesEmpty()} />
        ) : (
          <ul className="grid gap-4">
            {listing.hosts.map((host) => (
              <HostCard key={host.hostname} host={host} />
            ))}
          </ul>
        )}
      </SettingsSection>
      {listing.available ? (
        <SettingsSection
          title={m.siteAddressesAddTitle()}
          onSubmit={() => add.mutateAsync().catch(() => undefined)}
          pending={add.isPending}
          error={add.error ? getMessageFromError(add.error) : null}
          submitLabel={m.siteAddressesAdd()}
        >
          <TextField
            id="site-host-name"
            label={m.siteAddressesHostname()}
            hint={m.siteAddressesHostnameHint()}
            width="name"
            dir="ltr"
            inputMode="url"
            autoComplete="off"
            maxLength={253}
            value={hostname}
            onChange={(event) => setHostname(event.target.value)}
          />
          <SelectField
            id="site-host-role"
            label={m.siteAddressesRole()}
            width="name"
            value={role}
            options={roles}
            onChange={setRole}
          />
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}
