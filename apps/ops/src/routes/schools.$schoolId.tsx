import type { DirectoryTenantState } from "@faridalms/database/directory/schema";
import type { ModuleId } from "@faridalms/domain/modules";
import type { SchoolNotice } from "@faridalms/domain/plans";

import { BASIC_MODULES, MODULE_IDS } from "@faridalms/domain/modules";
import { DEFAULT_LIMITS, SCHOOL_NOTICES } from "@faridalms/domain/plans";
import { TENANT_LIFECYCLES } from "@faridalms/domain/provisioning";
import { Badge } from "@faridalms/ui/badge";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { ChangeList } from "../components/ChangeList";
import { Hosts } from "../components/Hosts";
import { Usage } from "../components/Usage";
import { formatBytes, formatWhen, MODULE_NAMES } from "../format";
import {
  getSchool,
  resendInvite,
  saveEntitlements,
  setSchoolLifecycle,
} from "../server/directory";

export const Route = createFileRoute("/schools/$schoolId")({
  loader: ({ params }) => getSchool({ data: { id: params.schoolId } }),
  component: SchoolPage,
});

type Cap = "poolBytes" | "classBytes" | "moduleBytes" | "personBytes";
type Unit = "MB" | "GB";

const CAPS: { key: Cap; label: string; hint: string }[] = [
  {
    key: "poolBytes",
    label: "School pool",
    hint: "Everything the school stores.",
  },
  {
    key: "classBytes",
    label: "Each class",
    hint: "A class's files, kept for its assignments.",
  },
  {
    key: "moduleBytes",
    label: "Each module",
    hint: "A module's files, kept for its lessons.",
  },
  {
    key: "personBytes",
    label: "Each person",
    hint: "One person's own work: answers, hand-ins, messages.",
  },
];

type Count =
  | "students"
  | "staffAccounts"
  | "videoHours"
  | "customDomains"
  | "emailPerMonth"
  | "captionMinutes";

const COUNTS: { key: Count; label: string; hint: string }[] = [
  {
    key: "students",
    label: "Students",
    hint: "Soft: past it the administrators are told; enrolling is never refused.",
  },
  {
    key: "staffAccounts",
    label: "Staff accounts",
    hint: "Soft, as students.",
  },
  {
    key: "videoHours",
    label: "Video hours",
    hint: "Streamed video kept. A video past it plays as uploaded.",
  },
  {
    key: "customDomains",
    label: "Custom domains",
    hint: "Hosts of its own the school may add.",
  },
  {
    key: "emailPerMonth",
    label: "Emails a month",
    hint: "Soft: catches a runaway sender.",
  },
  {
    key: "captionMinutes",
    label: "Caption minutes a year",
    hint: "Minutes of caption drafting.",
  },
];

const NOTICES: Record<SchoolNotice, string> = {
  payment_overdue: "Payment overdue",
  plan_ends_soon: "Plan ends soon",
};

const ACCESS = {
  full: "Full",
  restricted: "Restricted",
  read_only: "Read only",
} as const;

const TENANT_STATES: Record<DirectoryTenantState, string> = {
  provisioning: "Provisioning",
  importing: "Importing",
  active: "Active",
  read_only: "Paused (read only)",
  frozen: "Frozen",
  suspended: "Suspended",
  offboarding: "Offboarding",
  offboarded: "Offboarded",
};

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

function asField(bytes: number | null): { value: string; unit: Unit } {
  if (bytes === null) return { value: "", unit: "GB" };
  return bytes % GIB === 0
    ? { value: String(bytes / GIB), unit: "GB" }
    : { value: String(Math.round(bytes / MIB)), unit: "MB" };
}

function asCount(value: string): number | null {
  const amount = Number(value);
  return value.trim() === "" || !Number.isInteger(amount) || amount < 0
    ? null
    : amount;
}

function asBytes(field: { value: string; unit: Unit }): number | null {
  const amount = Number(field.value);
  if (field.value.trim() === "" || !Number.isFinite(amount) || amount <= 0)
    return null;
  return Math.round(amount * (field.unit === "GB" ? GIB : MIB));
}

function SchoolPage() {
  const { school, changes, hosts, platform } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(saveEntitlements);
  const entitled = school.entitlements;
  const [caps, setCaps] = useState(
    () =>
      Object.fromEntries(
        CAPS.map(({ key }) => [key, asField(entitled[key])]),
      ) as Record<Cap, { value: string; unit: Unit }>,
  );
  const [counts, setCounts] = useState(
    () =>
      Object.fromEntries(
        COUNTS.map(({ key }) => [key, entitled[key]?.toString() ?? ""]),
      ) as Record<Count, string>,
  );
  const [modules, setModules] = useState<ModuleId[]>(entitled.modules);
  const [trialEndsOn, setTrialEndsOn] = useState(entitled.trialEndsOn ?? "");
  const [notice, setNotice] = useState<SchoolNotice | "">(
    entitled.notice ?? "",
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const name = school.nameEn ?? school.nameAr ?? school.slug;
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          Schools
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {name}
          <Badge
            variant={school.tenantState === "active" ? "secondary" : "outline"}
          >
            {TENANT_STATES[school.tenantState]}
          </Badge>
        </h1>
        <p className="text-sm text-muted-foreground">
          {school.slug} · {school.tenantNameEn ?? school.tenantNameAr} ·{" "}
          {school.cellId} ({school.region})
        </p>
        {school.tenantState === "provisioning" ? (
          <p className="text-sm">
            Its cell has not finished creating it. Submit{" "}
            <Link to="/schools/new" className="underline">
              New school
            </Link>{" "}
            again with the same addresses to finish.
          </p>
        ) : null}
      </div>
      <section className="grid gap-2">
        <h2 className="text-base font-semibold">Storage</h2>
        <Usage
          usedBytes={school.usage?.usedBytes ?? null}
          limitBytes={entitled.poolBytes}
        />
        {school.usage ? (
          <p className="text-xs text-muted-foreground">
            {school.usage.fileCount.toLocaleString("en")} stored objects,
            measured {formatWhen(school.usage.measuredAt)}
          </p>
        ) : null}
      </section>
      {school.usage ? (
        <section className="grid gap-2">
          <h2 className="text-base font-semibold">Use</h2>
          <dl className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {[
              ["Students", school.usage.students, entitled.students],
              [
                "Staff accounts",
                school.usage.staffAccounts,
                entitled.staffAccounts,
              ],
              ["Signed in this week", school.usage.signedIn7d, null],
              ["Signed in this month", school.usage.signedIn30d, null],
              [
                "Video hours",
                Math.round(school.usage.videoMinutes / 6) / 10,
                entitled.videoHours,
              ],
            ].map(([label, count, limit]) => (
              <div key={String(label)} className="grid gap-0.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular-nums">
                  {Number(count).toLocaleString("en")}
                  {limit === null
                    ? ""
                    : ` of ${Number(limit).toLocaleString("en")}`}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <form
        className="grid max-w-2xl gap-6 rounded-lg border p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!reason.trim()) {
            toast.error("Say why, for the change log.");
            return;
          }
          setSaving(true);
          try {
            await save({
              data: {
                schoolId: school.id,
                poolBytes: asBytes(caps.poolBytes) ?? DEFAULT_LIMITS.poolBytes,
                classBytes:
                  asBytes(caps.classBytes) ?? DEFAULT_LIMITS.classBytes,
                moduleBytes:
                  asBytes(caps.moduleBytes) ?? DEFAULT_LIMITS.moduleBytes,
                personBytes:
                  asBytes(caps.personBytes) ?? DEFAULT_LIMITS.personBytes,
                students: asCount(counts.students),
                staffAccounts: asCount(counts.staffAccounts),
                videoHours: asCount(counts.videoHours),
                customDomains: asCount(counts.customDomains),
                emailPerMonth: asCount(counts.emailPerMonth),
                captionMinutes: asCount(counts.captionMinutes),
                trialEndsOn: trialEndsOn || null,
                notice: notice || null,
                modules,
                reason: reason.trim(),
              },
            });
            setReason("");
            toast.success(
              "Entitlements saved. Cells apply them within a minute.",
            );
            await router.invalidate();
          } catch {
            toast.error("The entitlements could not be saved.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">Entitlements</h2>
          <p className="text-sm text-muted-foreground">
            Revision {entitled.revision} · access {ACCESS[entitled.access]}. An
            empty storage limit takes the platform's default; any other empty
            limit is unlimited.
          </p>
        </div>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          {CAPS.map(({ key, label, hint }) => (
            <div key={key} className="grid gap-1.5 text-sm">
              <label htmlFor={`plan-${key}`} className="font-medium">
                {label}
              </label>
              <span className="flex gap-2">
                <Input
                  id={`plan-${key}`}
                  inputMode="decimal"
                  value={caps[key].value}
                  placeholder={`Default: ${formatBytes(DEFAULT_LIMITS[key])}`}
                  onChange={(event) =>
                    setCaps((current) => ({
                      ...current,
                      [key]: { ...current[key], value: event.target.value },
                    }))
                  }
                />
                <select
                  aria-label={`${label} unit`}
                  value={caps[key].unit}
                  onChange={(event) =>
                    setCaps((current) => ({
                      ...current,
                      [key]: {
                        ...current[key],
                        unit: event.target.value as Unit,
                      },
                    }))
                  }
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="MB">MB</option>
                  <option value="GB">GB</option>
                </select>
              </span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </div>
          ))}
        </div>
        <fieldset className="grid gap-3 text-sm">
          <legend className="mb-1 font-medium">Modules</legend>
          <span className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModules([...BASIC_MODULES])}
            >
              Basic
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModules([...MODULE_IDS])}
            >
              Every module
            </Button>
          </span>
          {MODULE_IDS.map((module) => (
            <span key={module} className="flex items-center gap-2">
              <Checkbox
                id={`plan-module-${module}`}
                checked={modules.includes(module)}
                onCheckedChange={(checked) =>
                  setModules((current) =>
                    checked
                      ? [...current, module]
                      : current.filter((item) => item !== module),
                  )
                }
              />
              <label htmlFor={`plan-module-${module}`}>
                {MODULE_NAMES[module]}
              </label>
            </span>
          ))}
          <p className="text-xs text-muted-foreground">
            The school's administrators turn available modules on or off in
            their settings.
          </p>
        </fieldset>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          {COUNTS.map(({ key, label, hint }) => (
            <div key={key} className="grid gap-1.5 text-sm">
              <label htmlFor={`plan-${key}`} className="font-medium">
                {label}
              </label>
              <Input
                id={`plan-${key}`}
                inputMode="numeric"
                value={counts[key]}
                placeholder="Unlimited"
                onChange={(event) =>
                  setCounts((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
              <span className="text-xs text-muted-foreground">{hint}</span>
            </div>
          ))}
          <div className="grid gap-1.5 text-sm">
            <label htmlFor="plan-trial" className="font-medium">
              Trial ends on
            </label>
            <Input
              id="plan-trial"
              type="date"
              value={trialEndsOn}
              onChange={(event) => setTrialEndsOn(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Empty for a school that is not on trial.
            </span>
          </div>
          <div className="grid gap-1.5 text-sm">
            <label htmlFor="plan-notice" className="font-medium">
              Notice
            </label>
            <select
              id="plan-notice"
              value={notice}
              onChange={(event) =>
                setNotice(event.target.value as SchoolNotice | "")
              }
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">None</option>
              {SCHOOL_NOTICES.map((code) => (
                <option key={code} value={code}>
                  {NOTICES[code]}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              What the school's administrators are shown.
            </span>
          </div>
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="plan-reason" className="font-medium">
            Why
          </label>
          <Textarea
            id="plan-reason"
            required
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example: moved to the larger plan from 1 November"
          />
        </div>
        <Button type="submit" disabled={saving} className="justify-self-start">
          {saving ? "Saving…" : "Save entitlements"}
        </Button>
      </form>
      <Hosts schoolId={school.id} platform={platform} hosts={hosts} />
      {school.tenantState === "active" ? (
        <AdministratorLink schoolId={school.id} />
      ) : null}
      {isMove(school.tenantState) ? (
        <Lifecycle
          tenantId={school.tenantId}
          state={school.tenantState}
          group={school.tenantKind === "school_group"}
        />
      ) : null}
      <section className="grid gap-3">
        <h2 className="text-base font-semibold">History</h2>
        <ChangeList changes={changes} />
      </section>
    </div>
  );
}

type TenantLifecycleMove = (typeof TENANT_LIFECYCLES)[number];

const isMove = (state: DirectoryTenantState): state is TenantLifecycleMove =>
  (TENANT_LIFECYCLES as readonly string[]).includes(state);

const LIFECYCLE_HINT: Record<TenantLifecycleMove, string> = {
  active: "Everyone uses the school as normal.",
  read_only:
    "Everyone signs in and reads; nothing can be changed, and everyone is told the account is paused. Administrators can still export.",
  suspended:
    "Nobody signs in. The school's own portal says it is paused; the bare domain says nothing.",
};

/**
 * Pauses, suspends or reopens the school's tenant, every school of a group
 * with it, with the reason the change log keeps.
 */
function Lifecycle({
  tenantId,
  state,
  group,
}: {
  tenantId: string;
  state: TenantLifecycleMove;
  group: boolean;
}) {
  const router = useRouter();
  const set = useServerFn(setSchoolLifecycle);
  const [lifecycle, setLifecycle] = useState(state);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  return (
    <form
      className="grid max-w-2xl gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!reason.trim()) {
          toast.error("Say why, for the change log.");
          return;
        }
        setSaving(true);
        setAnswer(null);
        try {
          const out = await set({
            data: { tenantId, lifecycle, reason: reason.trim() },
          });
          if (out.ok) {
            toast.success("Access changed.");
            setReason("");
            await router.invalidate();
          } else setAnswer(out.message);
        } catch {
          setAnswer("Access could not be changed.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">Access</h2>
        <p className="text-sm text-muted-foreground">
          {group
            ? "Applies to every school of the group."
            : "Applies to the school."}{" "}
          The cell enforces it at once.
        </p>
      </div>
      <fieldset className="grid gap-2 text-sm">
        <legend className="sr-only">Access</legend>
        {TENANT_LIFECYCLES.map((choice) => (
          <div key={choice} className="flex items-start gap-2">
            <input
              id={`lifecycle-${choice}`}
              type="radio"
              name="lifecycle"
              value={choice}
              checked={lifecycle === choice}
              onChange={() => setLifecycle(choice)}
              className="mt-1"
            />
            <label htmlFor={`lifecycle-${choice}`} className="grid gap-0.5">
              <span className="font-medium">{TENANT_STATES[choice]}</span>
              <span className="text-xs text-muted-foreground">
                {LIFECYCLE_HINT[choice]}
              </span>
            </label>
          </div>
        ))}
      </fieldset>
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="lifecycle-reason" className="font-medium">
          Why
        </label>
        <Textarea
          id="lifecycle-reason"
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="For example: invoice 2026-014 unpaid for 60 days"
        />
      </div>
      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={saving || lifecycle === state}
        className="justify-self-start"
      >
        {saving ? "Saving…" : "Change access"}
      </Button>
    </form>
  );
}

/**
 * Sends the school's administrator a new link to choose a password, for
 * when the first one expired or was lost. Without an email it goes to the
 * school's first administrator.
 */
function AdministratorLink({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const resend = useServerFn(resendInvite);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState<Awaited<
    ReturnType<typeof resendInvite>
  > | null>(null);
  return (
    <form
      className="grid max-w-2xl gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setSending(true);
        setAnswer(null);
        try {
          setAnswer(
            await resend({
              data: { schoolId, email: email.trim() === "" ? null : email },
            }),
          );
          await router.invalidate();
        } catch {
          setAnswer({ ok: false, message: "The link could not be sent." });
        } finally {
          setSending(false);
        }
      }}
    >
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">Administrator</h2>
        <p className="text-sm text-muted-foreground">
          Sends a new link to choose a password, which replaces any link sent
          before. Someone who already has a password chooses a new one.
        </p>
      </div>
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="admin-email" className="font-medium">
          Administrator's email
        </label>
        <Input
          id="admin-email"
          type="email"
          dir="ltr"
          value={email}
          placeholder="Empty for the school's first administrator"
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      {answer ? (
        <p
          role={answer.ok ? "status" : "alert"}
          className={answer.ok ? "text-sm" : "text-sm text-destructive"}
        >
          {answer.ok
            ? `Sent to ${answer.sentTo}${answer.reset ? ", replacing the password they had" : ""}.`
            : answer.message}
        </p>
      ) : null}
      <Button type="submit" disabled={sending} className="justify-self-start">
        {sending ? "Sending…" : "Send the administrator a new link"}
      </Button>
    </form>
  );
}
