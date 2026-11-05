import type { DirectoryTenantState } from "@faridalms/database/directory/schema";
import type { ModuleId } from "@faridalms/domain/modules";
import type { SchoolAccess, SchoolNotice } from "@faridalms/domain/plans";
import type { SchoolStanding } from "@faridalms/domain/provisioning";

import { availableModules, SCHOOL_NOTICES } from "@faridalms/domain/plans";
import { SCHOOL_STANDINGS } from "@faridalms/domain/provisioning";
import { LIMIT_KEYS } from "@faridalms/domain/subscriptions";
import { Badge } from "@faridalms/ui/badge";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import { ChangeList } from "../components/ChangeList";
import { Hosts } from "../components/Hosts";
import {
  CountFields,
  draftOf,
  limitsOf,
  StorageFields,
} from "../components/LimitFields";
import { ModuleFields } from "../components/ModuleFields";
import { Usage } from "../components/Usage";
import {
  formatDay,
  formatLimit,
  formatWhen,
  LIMIT_NAMES,
  MODULE_NAMES,
  NOTICE_NAMES,
} from "../format";
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

type School = Awaited<ReturnType<typeof getSchool>>["school"];

function SchoolPage() {
  const { school, changes, hosts, platform, sold } = Route.useLoaderData();
  const entitled = school.entitlements;
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
      {sold ? (
        <SoldEntitlements
          school={school}
          subscriptionId={sold.subscriptionId}
        />
      ) : (
        <EntitlementsForm school={school} />
      )}
      <Hosts schoolId={school.id} platform={platform} hosts={hosts} />
      {school.tenantState === "active" ? (
        <AdministratorLink schoolId={school.id} />
      ) : null}
      {standingOf(school.tenantState, entitled.access) ? (
        <Lifecycle
          tenantId={school.tenantId}
          state={standingOf(school.tenantState, entitled.access) ?? "full"}
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

/**
 * What the school is entitled to where its subscription sets it: shown
 * here, changed on the subscription, published from there.
 */
function SoldEntitlements({
  school,
  subscriptionId,
}: {
  school: School;
  subscriptionId: string | null;
}) {
  const entitled = school.entitlements;
  return (
    <section
      aria-label="Entitlements"
      className="grid max-w-2xl gap-4 rounded-lg border p-6"
    >
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">Entitlements</h2>
        <p className="text-sm text-muted-foreground">
          Revision {entitled.revision} · access {ACCESS[entitled.access]}
          {entitled.trialEndsOn
            ? ` · trial ends ${formatDay(entitled.trialEndsOn)}`
            : ""}
          {entitled.notice ? ` · ${NOTICE_NAMES[entitled.notice]}` : ""}.{" "}
          {subscriptionId ? (
            <>
              Its{" "}
              <Link
                to="/subscriptions/$subscriptionId"
                params={{ subscriptionId }}
                className="text-foreground underline"
              >
                subscription
              </Link>{" "}
              sets them.
            </>
          ) : (
            "It has no subscription yet; the daily round gives it one that keeps what it has."
          )}
        </p>
      </div>
      <span className="flex flex-wrap gap-1">
        {availableModules(entitled).map((module) => (
          <Badge key={module} variant="secondary">
            {MODULE_NAMES[module]}
          </Badge>
        ))}
      </span>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        {LIMIT_KEYS.map((key) => (
          <div key={key} className="grid gap-0.5">
            <dt className="text-muted-foreground">{LIMIT_NAMES[key]}</dt>
            <dd className="tabular-nums">{formatLimit(key, entitled[key])}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Sets the school's entitlements by hand, where no subscription sets them. */
function EntitlementsForm({ school }: { school: School }) {
  const router = useRouter();
  const save = useServerFn(saveEntitlements);
  const entitled = school.entitlements;
  const [limits, setLimits] = useState(() => draftOf(entitled));
  const [modules, setModules] = useState<ModuleId[]>(entitled.modules);
  const [trialEndsOn, setTrialEndsOn] = useState(entitled.trialEndsOn ?? "");
  const [notice, setNotice] = useState<SchoolNotice | "">(
    entitled.notice ?? "",
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  return (
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
          const out = await save({
            data: {
              schoolId: school.id,
              ...limitsOf(limits),
              trialEndsOn: trialEndsOn || null,
              notice: notice || null,
              modules,
              reason: reason.trim(),
            },
          });
          setReason("");
          toast.success(
            out.atOnce
              ? "Entitlements saved. The school has them now."
              : "Entitlements saved. Its cell could not be told, so the school has them within a minute.",
          );
          await router.invalidate();
        } catch (error) {
          const said = failure(error, "The entitlements could not be saved.");
          if (said) toast.error(said);
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
        <StorageFields prefix="plan" draft={limits} onChange={setLimits} />
      </div>
      <ModuleFields
        prefix="plan"
        modules={modules}
        onChange={setModules}
        hint="The school's administrators turn available modules on or off in their settings."
      />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <CountFields prefix="plan" draft={limits} onChange={setLimits} />
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
                {NOTICE_NAMES[code]}
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
  );
}

type TenantLifecycleMove = SchoolStanding;

/** Where the school stands, when it is one an operator may move it from. */
function standingOf(
  state: DirectoryTenantState,
  access: SchoolAccess,
): SchoolStanding | null {
  if (state === "read_only" || state === "suspended") return state;
  if (state !== "active") return null;
  return access === "restricted" ? "restricted" : "full";
}

const STANDING_LABEL: Record<SchoolStanding, string> = {
  full: "Active",
  restricted: "Restricted",
  read_only: "Paused (read only)",
  suspended: "Suspended",
};

const LIFECYCLE_HINT: Record<TenantLifecycleMove, string> = {
  full: "Everyone uses the school as normal.",
  restricted:
    "Everything works, but the school cannot switch on modules or add custom domains; its administrators are told why.",
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
            data: { tenantId, standing: lifecycle, reason: reason.trim() },
          });
          if (out.ok) {
            toast.success("Access changed.");
            setReason("");
            await router.invalidate();
          } else setAnswer(out.message);
        } catch (error) {
          setAnswer(failure(error, "Access could not be changed."));
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
        {SCHOOL_STANDINGS.map((choice) => (
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
              <span className="font-medium">{STANDING_LABEL[choice]}</span>
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
        } catch (error) {
          const said = failure(error, "The link could not be sent.");
          if (said) setAnswer({ ok: false, message: said });
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
