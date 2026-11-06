import type { ModuleId } from "@faridalms/domain/modules";
import type { SchoolNotice } from "@faridalms/domain/plans";
import type { SchoolStanding } from "@faridalms/domain/provisioning";

import { availableModules, SCHOOL_NOTICES } from "@faridalms/domain/plans";
import { SCHOOL_STANDINGS, standingOf } from "@faridalms/domain/provisioning";
import { LIMIT_KEYS } from "@faridalms/domain/subscriptions";
import {
  ChoiceField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import {
  Fact,
  Facts,
  RecordColumns,
  RecordHeader,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import {
  SettingsGroup,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Info, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt, failure } from "../actions";
import { ChangeList } from "../components/ChangeList";
import { Hosts } from "../components/Hosts";
import {
  CountFields,
  draftOf,
  limitsOf,
  StorageFields,
} from "../components/LimitFields";
import { ModuleFields } from "../components/ModuleFields";
import { HealthSection, OnboardingSection } from "../components/Onboarding";
import { Usage } from "../components/Usage";
import { WhyField } from "../components/Why";
import {
  formatDay,
  formatLimit,
  formatWhen,
  LIMIT_NAMES,
  MODULE_NAMES,
  NOTICE_NAMES,
  STANDING_NAMES,
  TENANT_STATE_NAMES,
  TENANT_STATE_TONE,
} from "../format";
import {
  getSchool,
  resendInvite,
  saveEntitlements,
  setSchoolLifecycle,
} from "../server/directory";

export const Route = createFileRoute("/schools/$schoolId")({
  staticData: { title: "School" },
  loader: ({ params }) => getSchool({ data: { id: params.schoolId } }),
  component: SchoolPage,
});

const ACCESS = {
  full: "Full",
  restricted: "Restricted",
  read_only: "Read only",
} as const;

type School = Awaited<ReturnType<typeof getSchool>>["school"];

function SchoolPage() {
  const { school, health, changes, names, hosts, platform, sold, ssoDomains } =
    Route.useLoaderData();
  const entitled = school.entitlements;
  const name = school.nameEn ?? school.nameAr ?? school.slug;
  const standing = standingOf(school.tenantState, entitled.access);
  const [sending, setSending] = useState(false);
  return (
    <>
      <RecordHeader
        title={name}
        status={{
          label: TENANT_STATE_NAMES[school.tenantState],
          tone: TENANT_STATE_TONE[school.tenantState],
        }}
        facts={[
          { label: "Address", value: school.slug },
          {
            label: "Group",
            value: school.tenantNameEn ?? school.tenantNameAr ?? "None",
          },
          { label: "Cell", value: `${school.cellId} (${school.region})` },
        ]}
        alerts={
          school.tenantState === "provisioning"
            ? [
                {
                  label:
                    "Its cell has not finished creating it. Submit New school again with the same addresses to finish.",
                  tone: "info",
                  icon: Info,
                },
              ]
            : []
        }
        menu={
          school.tenantState === "active"
            ? [
                {
                  label: "Send the administrator a new link",
                  icon: Send,
                  onSelect: () => setSending(true),
                },
              ]
            : []
        }
      />
      <RecordColumns
        main={
          <>
            {health ? (
              <OnboardingSection
                schoolId={school.id}
                health={health}
                measuredAt={school.usage?.measuredAt ?? null}
              />
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
            {ssoDomains.length ? (
              <RecordSection
                title="Sign-in domains"
                description="The domains its people sign in with through its own identity provider, for the whole tenant."
              >
                <RecordList>
                  {ssoDomains.map((domain) => (
                    <li
                      key={domain.domain}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <span className="font-mono text-sm" dir="ltr">
                        {domain.domain}
                      </span>
                      <StatusText
                        tone={domain.verifiedAt ? "success" : "warning"}
                      >
                        {domain.verifiedAt
                          ? `Verified ${formatWhen(domain.verifiedAt)}`
                          : "Not verified"}
                      </StatusText>
                    </li>
                  ))}
                </RecordList>
              </RecordSection>
            ) : null}
            <RecordSection title="History">
              <ChangeList changes={changes} names={names} />
            </RecordSection>
          </>
        }
        aside={
          <>
            {health ? <HealthSection health={health} /> : null}
            <UseSection school={school} />
            {standing ? (
              <Lifecycle
                tenantId={school.tenantId}
                state={standing}
                group={school.tenantKind === "school_group"}
              />
            ) : null}
          </>
        }
      />
      {school.tenantState === "active" ? (
        <AdministratorLink
          schoolId={school.id}
          open={sending}
          onOpenChange={setSending}
        />
      ) : null}
    </>
  );
}

interface SchoolProps {
  school: School;
}

/** A count, and the limit it is held to when there is one. */
const of = (count: number, limit: number | null) =>
  `${count.toLocaleString("en")}${limit === null ? "" : ` of ${limit.toLocaleString("en")}`}`;

/** What the school uses against what it is entitled to, as its cell last said. */
function UseSection({ school }: SchoolProps) {
  const entitled = school.entitlements;
  const usage = school.usage;
  return (
    <RecordSection
      title="Use"
      description={
        usage
          ? `${usage.fileCount.toLocaleString("en")} stored objects, measured ${formatWhen(usage.measuredAt)}.`
          : "Its cell has not reported yet."
      }
    >
      <div className="grid gap-4">
        <Facts short>
          <Fact label="Storage">
            <Usage
              usedBytes={usage?.usedBytes ?? null}
              limitBytes={entitled.poolBytes}
            />
          </Fact>
        </Facts>
        {usage ? (
          <Facts short>
            <Fact label="Students">
              {of(usage.students, entitled.students)}
            </Fact>
            <Fact label="Staff accounts">
              {of(usage.staffAccounts, entitled.staffAccounts)}
            </Fact>
            <Fact label="Signed in this week">
              {usage.signedIn7d.toLocaleString("en")}
            </Fact>
            <Fact label="Signed in this month">
              {usage.signedIn30d.toLocaleString("en")}
            </Fact>
            <Fact label="Video hours">
              {of(Math.round(usage.videoMinutes / 6) / 10, entitled.videoHours)}
            </Fact>
          </Facts>
        ) : null}
      </div>
    </RecordSection>
  );
}

interface SoldEntitlementsProps {
  school: School;
  subscriptionId: string | null;
}

/**
 * What the school is entitled to where its subscription sets it: shown
 * here, changed on the subscription, published from there.
 */
function SoldEntitlements({ school, subscriptionId }: SoldEntitlementsProps) {
  const entitled = school.entitlements;
  return (
    <RecordSection
      title="Entitlements"
      description={
        <>
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
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                subscription
              </Link>{" "}
              sets them.
            </>
          ) : (
            "It has no subscription yet; the daily round gives it one that keeps what it has."
          )}
        </>
      }
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap gap-1.5">
          {availableModules(entitled).map((module) => (
            <StatusBadge key={module} tone="neutral">
              {MODULE_NAMES[module]}
            </StatusBadge>
          ))}
        </div>
        <Facts short>
          {LIMIT_KEYS.map((key) => (
            <Fact key={key} label={LIMIT_NAMES[key]}>
              {formatLimit(key, entitled[key])}
            </Fact>
          ))}
        </Facts>
      </div>
    </RecordSection>
  );
}

const NOTICE_OPTIONS = [
  { value: "", label: "None" },
  ...SCHOOL_NOTICES.map((code) => ({ value: code, label: NOTICE_NAMES[code] })),
] as const;

/** Sets the school's entitlements by hand, where no subscription sets them. */
function EntitlementsForm({ school }: SchoolProps) {
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
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <SettingsSection
      title="Entitlements"
      description={`Revision ${entitled.revision} · access ${ACCESS[entitled.access]}. An empty storage limit takes the platform's default; any other empty limit is unlimited.`}
      submitLabel="Save entitlements"
      pending={pending}
      error={error}
      saved={saved}
      isDirty={() => Boolean(reason)}
      onSubmit={async () => {
        setSubmitted(true);
        setSaved(false);
        if (!reason.trim()) return;
        setPending(true);
        setError(null);
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
          setSubmitted(false);
          setSaved(true);
          toast.success(
            out.atOnce
              ? "Entitlements saved. The school has them now."
              : "Entitlements saved. Its cell could not be told, so the school has them within a minute.",
          );
          await router.invalidate();
        } catch (thrown) {
          setError(failure(thrown, "The entitlements could not be saved."));
        } finally {
          setPending(false);
        }
      }}
    >
      <SettingsGroup title="Storage">
        <div className="grid items-start gap-6 @md:grid-cols-2">
          <StorageFields draft={limits} onChange={setLimits} />
        </div>
      </SettingsGroup>
      <SettingsGroup title="Modules">
        <ModuleFields
          modules={modules}
          onChange={setModules}
          hint="The school's administrators turn available modules on or off in their settings."
        />
      </SettingsGroup>
      <SettingsGroup title="Limits and trial">
        <div className="grid items-start gap-6 @md:grid-cols-2">
          <CountFields draft={limits} onChange={setLimits} />
          <TextField
            label="Trial ends on"
            optional
            type="date"
            width="date"
            hint="Empty for a school that is not on trial."
            value={trialEndsOn}
            onChange={(event) => setTrialEndsOn(event.target.value)}
          />
          <SelectField
            label="Notice"
            hint="What the school's administrators are shown."
            value={notice}
            options={NOTICE_OPTIONS}
            onChange={setNotice}
          />
        </div>
      </SettingsGroup>
      <WhyField
        value={reason}
        onChange={setReason}
        submitted={submitted}
        placeholder="For example: moved to the larger plan from 1 November"
      />
    </SettingsSection>
  );
}

type TenantLifecycleMove = SchoolStanding;

const LIFECYCLE_HINT: Record<TenantLifecycleMove, string> = {
  full: "Everyone uses the school as normal.",
  restricted:
    "Everything works, but the school cannot switch on modules or add custom domains; its administrators are told why.",
  read_only:
    "Everyone signs in and reads; nothing can be changed, and everyone is told the account is paused. Administrators can still export.",
  suspended:
    "Nobody signs in. The school's own portal says it is paused; the bare domain says nothing.",
};

interface LifecycleProps {
  tenantId: string;
  state: TenantLifecycleMove;
  group: boolean;
}

/**
 * Pauses, suspends or reopens the school's tenant, every school of a group
 * with it, with the reason the change log keeps.
 */
function Lifecycle({ tenantId, state, group }: LifecycleProps) {
  const router = useRouter();
  const set = useServerFn(setSchoolLifecycle);
  const [lifecycle, setLifecycle] = useState(state);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SettingsSection
      title="Access"
      description={`${group ? "Applies to every school of the group." : "Applies to the school."} The cell enforces it at once.`}
      submitLabel="Change access"
      pending={pending}
      error={error}
      isDirty={() => lifecycle !== state || Boolean(reason)}
      onSubmit={async () => {
        setSubmitted(true);
        if (lifecycle === state || !reason.trim()) return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () =>
            set({
              data: { tenantId, standing: lifecycle, reason: reason.trim() },
            }),
          "Access could not be changed.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Access changed.");
        setReason("");
        setSubmitted(false);
        await router.invalidate();
      }}
    >
      <ChoiceField
        label="Access"
        value={lifecycle}
        options={SCHOOL_STANDINGS.map((choice) => ({
          value: choice,
          label: STANDING_NAMES[choice],
          hint: LIFECYCLE_HINT[choice],
        }))}
        onChange={setLifecycle}
        errors={
          submitted && lifecycle === state
            ? ["Choose a different access to change it."]
            : undefined
        }
      />
      <WhyField
        value={reason}
        onChange={setReason}
        submitted={submitted}
        placeholder="For example: invoice 2026-014 unpaid for 60 days"
      />
    </SettingsSection>
  );
}

interface AdministratorLinkProps {
  schoolId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Sends the school's administrator a new link to choose a password, for
 * when the first one expired or was lost. Without an email it goes to the
 * school's first administrator.
 */
function AdministratorLink({
  schoolId,
  open,
  onOpenChange,
}: AdministratorLinkProps) {
  const router = useRouter();
  const resend = useServerFn(resendInvite);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Send the administrator a new link"
      submitLabel="Send link"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setPending(true);
        setError(null);
        try {
          const answer = await resend({
            data: { schoolId, email: email.trim() === "" ? null : email },
          });
          if (answer.ok) {
            toast.success(
              `Sent to ${answer.sentTo}${answer.reset ? ", replacing the password they had" : ""}.`,
            );
            setEmail("");
            onOpenChange(false);
            await router.invalidate();
          } else setError(answer.message);
        } catch (thrown) {
          setError(failure(thrown, "The link could not be sent."));
        } finally {
          setPending(false);
        }
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        A new link to choose a password replaces any link sent before. Someone
        who already has a password chooses a new one.
      </p>
      <TextField
        label="Administrator's email"
        optional
        type="email"
        dir="ltr"
        width="name"
        hint="Empty for the school's first administrator."
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
    </SheetForm>
  );
}
