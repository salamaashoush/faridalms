import type { HostRole } from "@faridalms/domain/hosts";
import type {
  Column,
  DataTableCard,
  RowAction,
} from "@faridalms/ui/system/data-table";
import type { DnsRecord } from "@faridalms/ui/system/dns-records";

import { Button } from "@faridalms/ui/button";
import { DataTable } from "@faridalms/ui/system/data-table";
import { DnsRecords } from "@faridalms/ui/system/dns-records";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { RecordEmpty, RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Globe, Plus } from "lucide-react";
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

type Data = Awaited<ReturnType<typeof getSchool>>;
type Host = Data["hosts"][number];

const PROBLEMS: Record<string, string> = {
  "hosts.txt_missing": "The TXT record is missing.",
  "hosts.route_missing":
    "The CNAME or A record does not point at the platform.",
  "hosts.lookup_failed": "DNS did not answer; the next pass tries again.",
  "hosts.tls_pending":
    "Records found; the edge has not served it over TLS yet.",
};

/** One address the school answers on: a platform name, or a host of its own. */
interface Address {
  id: string;
  hostname: string;
  role: HostRole;
  /** The school's own host; null for a platform name, always served. */
  own: Host | null;
  main: boolean;
}

function addressesOf(platform: PlatformHosts, hosts: Host[]): Address[] {
  const mainOwn = (role: HostRole) =>
    hosts.some(
      (host) => host.role === role && host.canonical && host.state === "active",
    );
  const platformRow = (role: HostRole): Address => ({
    id: `platform-${role}`,
    hostname: role === "portal" ? platform.portal : platform.site,
    role,
    own: null,
    main: !mainOwn(role),
  });
  return [
    platformRow("portal"),
    platformRow("site"),
    ...hosts.map((host) => ({
      id: host.hostname,
      hostname: host.hostname,
      role: host.role,
      own: host,
      main: host.canonical && host.state === "active",
    })),
  ];
}

function statusOf(address: Address) {
  const host = address.own;
  if (!host) return <StatusText tone="success">Always served</StatusText>;
  return (
    <span className="grid gap-0.5">
      <StatusText tone={HOST_STATE_TONE[host.state]}>
        {HOST_STATE_NAMES[host.state]}
      </StatusText>
      {host.lastError ? (
        <span className="text-[13px] leading-[18px] whitespace-normal text-muted-foreground">
          {PROBLEMS[host.lastError] ?? host.lastError}
        </span>
      ) : null}
    </span>
  );
}

const COLUMNS: Column<Address>[] = [
  {
    id: "address",
    header: "Address",
    primary: true,
    cell: (address) => (
      <span className="flex min-w-0 items-center gap-2">
        <span dir="ltr" className="truncate font-mono text-[13px]">
          {address.hostname}
        </span>
        {address.main ? <StatusBadge tone="accent">Main</StatusBadge> : null}
      </span>
    ),
  },
  {
    id: "serves",
    header: "Serves",
    cell: (address) => HOST_ROLE_NAMES[address.role],
  },
  {
    id: "kind",
    header: "Kind",
    cell: (address) => (
      <span className="text-muted-foreground">
        {address.own ? "Its own" : "Platform name"}
      </span>
    ),
  },
  { id: "status", header: "Status", cell: statusOf },
  {
    id: "checked",
    header: "Checked",
    cell: (address) =>
      address.own ? (
        <span className="text-muted-foreground">
          {address.own.checkedAt
            ? formatWhen(address.own.checkedAt)
            : "Due on the next pass"}
        </span>
      ) : null,
  },
];

const CARD: DataTableCard<Address> = {
  title: (address) => (
    <span dir="ltr" className="font-mono text-[13px]">
      {address.hostname}
    </span>
  ),
  status: statusOf,
  fact: (address) =>
    `${HOST_ROLE_NAMES[address.role]} · ${address.own ? "Its own" : "Platform name"}${address.main ? " · Main" : ""}`,
};

const RECORD_LABELS = {
  type: "Type",
  name: "Name",
  value: "Value",
  copy: (part: string, type: string) =>
    `Copy the ${part.toLowerCase()} of the ${type} record`,
};

/** What the school's DNS must hold for a host of its own to route. */
function recordsOf(host: Host): DnsRecord[] {
  const { txt, cname, a } = host.records;
  return [
    { type: "TXT", name: txt.name, value: txt.value },
    { type: "CNAME", name: cname.name, value: cname.target },
    ...(a.address ? [{ type: "A", name: a.name, value: a.address }] : []),
  ];
}

type HostChange = "main" | "remove";

interface Changing {
  host: Host;
  change: HostChange;
}

interface AddHostSheetProps {
  schoolId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Adds a host of the school's own; it routes once its records are found. */
function AddHostSheet({ schoolId, open, onOpenChange }: AddHostSheetProps) {
  const router = useRouter();
  const add = useServerFn(addHost);
  const [hostname, setHostname] = useState("");
  const [role, setRole] = useState<HostRole>("site");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Add a host"
      submitLabel="Add host"
      pending={pending}
      error={error}
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
        toast.success("Added as pending.");
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        A host of the school's own. It routes once its records are found and the
        edge has served it over TLS.
      </p>
      <div className="grid gap-6">
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
    </SheetForm>
  );
}

/** The platform's names for a school, always served. */
export interface PlatformHosts {
  site: string;
  portal: string;
}

/** A domain the tenant's people sign in with through its own identity provider. */
export interface SignInDomain {
  domain: string;
  verifiedAt: Date | string | null;
}

export interface SchoolAddressesProps {
  schoolId: string;
  platform: PlatformHosts;
  hosts: Host[];
  signInDomains: readonly SignInDomain[];
}

/**
 * Every address the school answers on, the platform's names and its own,
 * with where each stands; the DNS records any of its own still waits for;
 * and the domains its people sign in with.
 */
export function SchoolAddresses({
  schoolId,
  platform,
  hosts,
  signInDomains,
}: SchoolAddressesProps) {
  const router = useRouter();
  const check = useServerFn(checkHost);
  const canonical = useServerFn(makeHostCanonical);
  const remove = useServerFn(removeHost);
  const adding = useSheet();
  const [changing, setChanging] = useState<Changing | null>(null);
  const waiting = hosts.filter((host) => host.state !== "active");
  const actionsOf = (address: Address): RowAction[] => {
    const host = address.own;
    if (!host) return [];
    return [
      {
        label: "Check now",
        inline: host.state !== "active",
        onSelect: async () => {
          await check({ data: { schoolId, hostname: host.hostname } });
          toast.success("Queued. The cell checks it within a minute.");
          await router.invalidate();
        },
      },
      ...(host.canonical
        ? []
        : [
            {
              label: "Make main",
              onSelect: () => setChanging({ host, change: "main" }),
            },
          ]),
      {
        label: "Remove",
        onSelect: () => setChanging({ host, change: "remove" }),
      },
    ];
  };
  const change = async (reason: string) => {
    if (!changing) return null;
    const { host } = changing;
    const failed = await attempt(
      () =>
        changing.change === "main"
          ? canonical({ data: { schoolId, hostname: host.hostname, reason } })
          : remove({ data: { schoolId, hostname: host.hostname, reason } }),
      "That did not work.",
    );
    if (failed) return failed;
    toast.success(
      changing.change === "main" ? "It is the main host now." : "Removed.",
    );
    await router.invalidate();
    return null;
  };
  return (
    <>
      <RecordSection
        variant="page"
        title="Web addresses"
        description="Its portal and website answer on the platform's names always; a host of its own becomes the main address once it routes."
        action={
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={adding.show}
          >
            <Plus aria-hidden />
            Add host
          </Button>
        }
      >
        <DataTable
          caption="Web addresses"
          rows={addressesOf(platform, hosts)}
          columns={COLUMNS}
          rowLabel={(address) => address.hostname}
          rowActions={actionsOf}
          card={CARD}
          empty={{ icon: Globe, title: "No addresses" }}
        />
      </RecordSection>
      {waiting.map((host) => (
        <RecordSection
          key={host.hostname}
          variant="page"
          title={`Records for ${host.hostname}`}
          description="Create these at the domain's DNS provider. The cell looks for them every few minutes."
        >
          <div className="grid gap-2">
            <DnsRecords records={recordsOf(host)} labels={RECORD_LABELS} />
            {host.records.a.address ? null : (
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                The platform has no address set for a domain's apex (EDGE_IPV4),
                so only subdomains such as www can be bound.
              </p>
            )}
          </div>
        </RecordSection>
      ))}
      <RecordSection
        variant="page"
        title="Sign-in domains"
        description="Email domains whose people sign in through the school's own identity provider, for its whole group."
      >
        {signInDomains.length ? (
          <ul className="divide-y rounded-lg border">
            {signInDomains.map((domain) => (
              <li
                key={domain.domain}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span dir="ltr" className="font-mono text-[13px]">
                  {domain.domain}
                </span>
                <StatusText tone={domain.verifiedAt ? "success" : "warning"}>
                  {domain.verifiedAt
                    ? `Verified ${formatWhen(domain.verifiedAt)}`
                    : "Not verified"}
                </StatusText>
              </li>
            ))}
          </ul>
        ) : (
          <RecordEmpty>
            None. Its people sign in with accounts on the platform.
          </RecordEmpty>
        )}
      </RecordSection>
      <AddHostSheet
        key={adding.key}
        schoolId={schoolId}
        open={adding.open}
        onOpenChange={adding.onOpenChange}
      />
      <ReasonSheet
        open={changing !== null}
        onOpenChange={(open) => {
          if (!open) setChanging(null);
        }}
        title={
          changing?.change === "main"
            ? `Make ${changing.host.hostname} the main host`
            : `Remove ${changing?.host.hostname ?? ""}`
        }
        submitLabel={changing?.change === "main" ? "Make main" : "Remove"}
        destructive={changing?.change === "remove"}
        onSubmit={change}
      />
    </>
  );
}
