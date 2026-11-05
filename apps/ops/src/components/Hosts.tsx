import type { HostRole, HostState } from "@faridalms/domain/hosts";

import { Badge } from "@faridalms/ui/badge";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import type { getSchool } from "../server/directory";

import { failure } from "../actions";
import { formatWhen } from "../format";
import {
  addHost,
  checkHost,
  makeHostCanonical,
  removeHost,
} from "../server/directory";

type Host = Awaited<ReturnType<typeof getSchool>>["hosts"][number];

const ROLES: Record<HostRole, string> = {
  site: "Website",
  portal: "Portal",
};

const STATES: Record<HostState, string> = {
  pending: "Pending",
  verified: "Verified, waiting for its certificate",
  active: "Active",
  failing: "Failing: not routed",
  removed: "Removed",
};

const PROBLEMS: Record<string, string> = {
  "hosts.txt_missing": "The TXT record is missing.",
  "hosts.route_missing":
    "The CNAME or A record does not point at the platform.",
  "hosts.lookup_failed": "DNS did not answer; the next pass tries again.",
  "hosts.tls_pending":
    "Records found; the edge has not served it over TLS yet.",
};

function Records({ host }: { host: Host }) {
  const { txt, cname, a } = host.records;
  const rows: [string, string, string][] = [
    ["TXT", txt.name, txt.value],
    ["CNAME", cname.name, cname.target],
    ...(a.address
      ? ([["A (apex only)", a.name, a.address]] as [string, string, string][])
      : []),
  ];
  return (
    <dl className="grid gap-2 text-xs">
      {rows.map(([type, name, value]) => (
        <div
          key={type}
          className="grid gap-1 rounded-md bg-muted/50 p-2 sm:grid-cols-[7rem_1fr_1fr] sm:gap-3"
        >
          <dt className="font-semibold">{type}</dt>
          <dd className="font-mono break-all">{name}</dd>
          <dd className="font-mono break-all">{value}</dd>
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

/** Asks the operator why, for the change log; null when they cancel. */
function askWhy(what: string) {
  const reason = window.prompt(`Why ${what}? For the change log.`)?.trim();
  return reason ? reason : null;
}

function HostRow({ schoolId, host }: { schoolId: string; host: Host }) {
  const router = useRouter();
  const check = useServerFn(checkHost);
  const canonical = useServerFn(makeHostCanonical);
  const remove = useServerFn(removeHost);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await router.invalidate();
    } catch (error) {
      const said = failure(error, "That did not work.");
      if (said) toast.error(said);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="grid gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold break-all">
          {host.hostname}
        </span>
        <Badge variant="outline">{ROLES[host.role]}</Badge>
        <Badge variant={host.state === "active" ? "secondary" : "outline"}>
          {STATES[host.state]}
        </Badge>
        {host.canonical ? <Badge>Main</Badge> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {host.checkedAt
          ? `Checked ${formatWhen(host.checkedAt)}`
          : "Due a check on the cell's next pass"}
        {host.failures > 0 ? ` · ${host.failures} failed in a row` : ""}
        {host.lastError
          ? ` · ${PROBLEMS[host.lastError] ?? host.lastError}`
          : ""}
      </p>
      <Records host={host} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(
              () => check({ data: { schoolId, hostname: host.hostname } }),
              "Queued. The cell checks it within a minute.",
            )
          }
        >
          Check now
        </Button>
        {host.canonical ? null : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              const reason = askWhy("make it the main host");
              if (reason)
                void run(
                  () =>
                    canonical({
                      data: { schoolId, hostname: host.hostname, reason },
                    }),
                  "It is the main host now.",
                );
            }}
          >
            Make main
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            const reason = askWhy("remove it");
            if (reason)
              void run(
                () =>
                  remove({
                    data: { schoolId, hostname: host.hostname, reason },
                  }),
                "Removed.",
              );
          }}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}

/** The school's own hosts, with what DNS must hold for each and where it stands. */
export function Hosts({
  schoolId,
  platform,
  hosts,
}: {
  schoolId: string;
  platform: { site: string; portal: string };
  hosts: Host[];
}) {
  const router = useRouter();
  const add = useServerFn(addHost);
  const [hostname, setHostname] = useState("");
  const [role, setRole] = useState<HostRole>("site");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <section className="grid max-w-3xl gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">Hosts</h2>
        <p className="text-sm text-muted-foreground">
          Platform names, always served: website{" "}
          <span className="font-mono">{platform.site}</span>, portal{" "}
          <span className="font-mono">{platform.portal}</span>. A school's own
          host routes once its records are found and the edge has served it over
          TLS; the main one then takes over from the platform name.
        </p>
      </div>
      {hosts.length ? (
        <ul className="grid gap-3">
          {hosts.map((host) => (
            <HostRow key={host.hostname} schoolId={schoolId} host={host} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No hosts of its own.</p>
      )}
      <form
        className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_auto]"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!reason.trim()) {
            toast.error("Say why, for the change log.");
            return;
          }
          setSaving(true);
          try {
            const answer = await add({
              data: { schoolId, hostname, role, reason: reason.trim() },
            });
            if (!answer.ok) toast.error(answer.message);
            else {
              setHostname("");
              setReason("");
              toast.success("Added as pending.");
              await router.invalidate();
            }
          } catch (error) {
            const said = failure(error, "The host could not be added.");
            if (said) toast.error(said);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="host-name" className="font-medium">
            Hostname
          </label>
          <Input
            id="host-name"
            dir="ltr"
            value={hostname}
            placeholder="www.school.example.com"
            onChange={(event) => setHostname(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="host-role" className="font-medium">
            Serves
          </label>
          <select
            id="host-role"
            value={role}
            onChange={(event) =>
              setRole(event.target.value === "portal" ? "portal" : "site")
            }
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="site">Website</option>
            <option value="portal">Portal</option>
          </select>
        </div>
        <div className="grid gap-1.5 text-sm sm:col-span-2">
          <label htmlFor="host-reason" className="font-medium">
            Why
          </label>
          <Input
            id="host-reason"
            maxLength={500}
            value={reason}
            placeholder="For example: the school asked to use its own domain"
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={saving} className="justify-self-start">
          {saving ? "Adding…" : "Add host"}
        </Button>
      </form>
    </section>
  );
}
