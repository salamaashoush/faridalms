import type { HostRole } from "@faridalms/domain/hosts";
import type { ActionItem } from "@faridalms/ui/system/action-menu";

import { ActionMenu } from "@faridalms/ui/system/action-menu";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import { StatusBadge } from "@faridalms/ui/system/status";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import type { getSchool } from "../server/directory";

import { attempt } from "../actions";
import {
  formatWhen,
  HOST_ROLE_NAMES,
  HOST_ROLE_OPTIONS,
  HOST_STATE_NAMES,
  HOST_STATE_TONE,
} from "../format";
import {
  addHost,
  checkHost,
  makeHostCanonical,
  removeHost,
} from "../server/directory";
import { ReasonSheet } from "./ReasonSheet";
import { WhyField } from "./Why";

type Host = Awaited<ReturnType<typeof getSchool>>["hosts"][number];

const PROBLEMS: Record<string, string> = {
  "hosts.txt_missing": "The TXT record is missing.",
  "hosts.route_missing":
    "The CNAME or A record does not point at the platform.",
  "hosts.lookup_failed": "DNS did not answer; the next pass tries again.",
  "hosts.tls_pending":
    "Records found; the edge has not served it over TLS yet.",
};

interface RecordsProps {
  host: Host;
}

/** What the school's DNS must hold for the host to route. */
function Records({ host }: RecordsProps) {
  const { txt, cname, a } = host.records;
  const rows: [string, string, string][] = [
    ["TXT", txt.name, txt.value],
    ["CNAME", cname.name, cname.target],
    ...(a.address
      ? ([["A (apex only)", a.name, a.address]] as [string, string, string][])
      : []),
  ];
  return (
    <dl className="grid gap-1.5 text-xs">
      {rows.map(([type, name, value]) => (
        <div
          key={type}
          className="grid gap-1 rounded-md bg-muted/60 px-3 py-2 sm:grid-cols-[7rem_1fr_1fr] sm:gap-3"
        >
          <dt className="font-semibold">{type}</dt>
          <dd className="font-mono break-all" dir="ltr">
            {name}
          </dd>
          <dd className="font-mono break-all" dir="ltr">
            {value}
          </dd>
        </div>
      ))}
      {a.address ? null : (
        <p className="text-muted-foreground">
          EDGE_IPV4 is not set, so only subdomains can be bound.
        </p>
      )}
    </dl>
  );
}

type HostChange = "main" | "remove";

interface HostItemProps {
  schoolId: string;
  host: Host;
}

function HostItem({ schoolId, host }: HostItemProps) {
  const router = useRouter();
  const check = useServerFn(checkHost);
  const canonical = useServerFn(makeHostCanonical);
  const remove = useServerFn(removeHost);
  const [changing, setChanging] = useState<HostChange | null>(null);
  const actions: ActionItem[] = [
    {
      label: "Check now",
      onSelect: async () => {
        await check({ data: { schoolId, hostname: host.hostname } });
        toast.success("Queued. The cell checks it within a minute.");
        await router.invalidate();
      },
    },
    ...(host.canonical
      ? []
      : [{ label: "Make main", onSelect: () => setChanging("main") }]),
    { label: "Remove", onSelect: () => setChanging("remove") },
  ];
  const change = async (reason: string) => {
    const failed = await attempt(
      () =>
        changing === "main"
          ? canonical({ data: { schoolId, hostname: host.hostname, reason } })
          : remove({ data: { schoolId, hostname: host.hostname, reason } }),
      "That did not work.",
    );
    if (failed) return failed;
    toast.success(
      changing === "main" ? "It is the main host now." : "Removed.",
    );
    await router.invalidate();
    return null;
  };
  return (
    <li aria-label={host.hostname} className="grid gap-3 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1.5">
          <span dir="ltr" className="font-mono text-sm font-semibold break-all">
            {host.hostname}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={HOST_STATE_TONE[host.state]}>
              {HOST_STATE_NAMES[host.state]}
            </StatusBadge>
            <StatusBadge tone="neutral">
              {HOST_ROLE_NAMES[host.role]}
            </StatusBadge>
            {host.canonical ? (
              <StatusBadge tone="accent">Main</StatusBadge>
            ) : null}
          </div>
        </div>
        <ActionMenu label={`Actions for ${host.hostname}`} actions={actions} />
      </div>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {host.checkedAt
          ? `Checked ${formatWhen(host.checkedAt)}`
          : "Due a check on the cell's next pass"}
        {host.failures > 0 ? ` · ${host.failures} failed in a row` : ""}
        {host.lastError
          ? ` · ${PROBLEMS[host.lastError] ?? host.lastError}`
          : ""}
      </p>
      <Records host={host} />
      <ReasonSheet
        open={changing !== null}
        onOpenChange={(open) => {
          if (!open) setChanging(null);
        }}
        title={
          changing === "main"
            ? `Make ${host.hostname} the main host`
            : `Remove ${host.hostname}`
        }
        submitLabel={changing === "main" ? "Make main" : "Remove"}
        destructive={changing === "remove"}
        onSubmit={change}
      />
    </li>
  );
}

interface AddHostProps {
  schoolId: string;
}

function AddHost({ schoolId }: AddHostProps) {
  const router = useRouter();
  const add = useServerFn(addHost);
  const [hostname, setHostname] = useState("");
  const [role, setRole] = useState<HostRole>("site");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SettingsSection
      title="Add a host"
      description="A host of the school's own. It routes once its records are found and the edge has served it over TLS."
      submitLabel="Add host"
      pending={pending}
      error={error}
      isDirty={() => Boolean(hostname || reason)}
      onSubmit={async () => {
        setSubmitted(true);
        if (!hostname.trim() || !reason.trim()) return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () =>
            add({
              data: { schoolId, hostname, role, reason: reason.trim() },
            }),
          "The host could not be added.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        setHostname("");
        setReason("");
        setSubmitted(false);
        toast.success("Added as pending.");
        await router.invalidate();
      }}
    >
      <div className="grid gap-6 @md:grid-cols-[1fr_12rem]">
        <TextField
          label="Hostname"
          dir="ltr"
          value={hostname}
          placeholder="www.school.example.com"
          errors={
            submitted && !hostname.trim() ? ["Enter the hostname."] : undefined
          }
          onChange={(event) => setHostname(event.target.value)}
        />
        <SelectField
          label="Serves"
          value={role}
          options={HOST_ROLE_OPTIONS}
          onChange={setRole}
        />
      </div>
      <WhyField
        value={reason}
        onChange={setReason}
        submitted={submitted}
        placeholder="For example: the school asked to use its own domain"
      />
    </SettingsSection>
  );
}

/** The platform's names for a school, always served. */
export interface PlatformHosts {
  site: string;
  portal: string;
}

export interface HostsProps {
  schoolId: string;
  platform: PlatformHosts;
  hosts: Host[];
}

/** The school's own hosts, with what DNS must hold for each and where it stands. */
export function Hosts({ schoolId, platform, hosts }: HostsProps) {
  return (
    <>
      <RecordSection
        title="Hosts"
        description={
          <>
            Platform names, always served: website{" "}
            <span className="font-mono" dir="ltr">
              {platform.site}
            </span>
            , portal{" "}
            <span className="font-mono" dir="ltr">
              {platform.portal}
            </span>
            . The main host of its own takes over from the platform name once it
            routes.
          </>
        }
      >
        {hosts.length ? (
          <RecordList>
            {hosts.map((host) => (
              <HostItem key={host.hostname} schoolId={schoolId} host={host} />
            ))}
          </RecordList>
        ) : (
          <RecordEmpty>No hosts of its own.</RecordEmpty>
        )}
      </RecordSection>
      <AddHost schoolId={schoolId} />
    </>
  );
}
