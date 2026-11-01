import type { DirectoryTenantState } from "@faridalms/database/directory/schema";
import type { SchoolModule, SchoolPlan } from "@faridalms/domain/plans";

import {
  DEFAULT_LIMITS,
  limitsOf,
  SCHOOL_MODULES,
} from "@faridalms/domain/plans";
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
import { getSchool, resendInvite, savePlan } from "../server/directory";

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

const TENANT_STATES: Record<DirectoryTenantState, string> = {
  provisioning: "Provisioning",
  importing: "Importing",
  active: "Active",
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

function asBytes(field: { value: string; unit: Unit }): number | null {
  const amount = Number(field.value);
  if (field.value.trim() === "" || !Number.isFinite(amount) || amount <= 0)
    return null;
  return Math.round(amount * (field.unit === "GB" ? GIB : MIB));
}

function SchoolPage() {
  const { school, changes, hosts, platform } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(savePlan);
  const plan: SchoolPlan | null = school.plan;
  const [caps, setCaps] = useState(
    () =>
      Object.fromEntries(
        CAPS.map(({ key }) => [key, asField(plan?.[key] ?? null)]),
      ) as Record<Cap, { value: string; unit: Unit }>,
  );
  const [everyModule, setEveryModule] = useState(plan?.modules == null);
  const [modules, setModules] = useState<SchoolModule[]>(
    (plan?.modules ?? [...SCHOOL_MODULES]) as SchoolModule[],
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const name = school.nameEn ?? school.nameAr ?? school.slug;
  const limits = limitsOf(plan);
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
          limitBytes={limits.poolBytes}
        />
        {school.usage ? (
          <p className="text-xs text-muted-foreground">
            {school.usage.fileCount.toLocaleString("en")} stored objects,
            measured {formatWhen(school.usage.measuredAt)}
          </p>
        ) : null}
      </section>
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
                poolBytes: asBytes(caps.poolBytes),
                classBytes: asBytes(caps.classBytes),
                moduleBytes: asBytes(caps.moduleBytes),
                personBytes: asBytes(caps.personBytes),
                modules: everyModule ? null : modules,
                reason: reason.trim(),
              },
            });
            setReason("");
            toast.success("Plan saved. Cells apply it within a minute.");
            await router.invalidate();
          } catch {
            toast.error("The plan could not be saved.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">Plan</h2>
          <p className="text-sm text-muted-foreground">
            Leave a limit empty for the platform's default.
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
          <span className="flex items-center gap-2">
            <Checkbox
              id="plan-every-module"
              checked={everyModule}
              onCheckedChange={(checked) => setEveryModule(checked)}
            />
            <label htmlFor="plan-every-module">
              Every module, including ones added later
            </label>
          </span>
          {everyModule
            ? null
            : SCHOOL_MODULES.map((module) => (
                <span key={module} className="flex items-center gap-2 ps-6">
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
          {saving ? "Saving…" : "Save plan"}
        </Button>
      </form>
      <Hosts schoolId={school.id} platform={platform} hosts={hosts} />
      {school.tenantState === "active" ? (
        <AdministratorLink schoolId={school.id} />
      ) : null}
      <section className="grid gap-3">
        <h2 className="text-base font-semibold">History</h2>
        <ChangeList changes={changes} />
      </section>
    </div>
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
