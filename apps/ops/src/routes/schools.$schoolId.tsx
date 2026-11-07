import type { ModuleId } from "@faridalms/domain/modules";
import type { SchoolNotice } from "@faridalms/domain/plans";
import type { SchoolStanding } from "@faridalms/domain/provisioning";
import type { LimitKey } from "@faridalms/domain/subscriptions";
import type { RecordTab } from "@faridalms/ui/system/record-page";
import type { Tone } from "@faridalms/ui/system/status";
import type { SummaryItem } from "@faridalms/ui/system/summary-list";
import type { UsageItem } from "@faridalms/ui/system/usage-list";

import { MODULE_IDS } from "@faridalms/domain/modules";
import { availableModules, SCHOOL_NOTICES } from "@faridalms/domain/plans";
import { SCHOOL_STANDINGS, standingOf } from "@faridalms/domain/provisioning";
import { LIMIT_KEYS } from "@faridalms/domain/subscriptions";
import { cn } from "@faridalms/ui/cn";
import {
  ChoiceField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { Metric, MetricGrid } from "@faridalms/ui/system/metrics";
import { Page } from "@faridalms/ui/system/page";
import { useDesignSystem } from "@faridalms/ui/system/provider";
import {
  Fact,
  Facts,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordSection,
  RecordTabs,
} from "@faridalms/ui/system/record-page";
import { SettingsGroup } from "@faridalms/ui/system/settings-section";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import { UsageList } from "@faridalms/ui/system/usage-list";
import {
  createFileRoute,
  Link,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Info, Minus, Send, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { attempt, attemptWith, failure } from "../actions";
import { ChangeList } from "../components/ChangeList";
import { HEALTH_TONE } from "../components/Health";
import { SchoolAddresses } from "../components/Hosts";
import {
  CountFields,
  draftOf,
  limitsOf,
  StorageFields,
} from "../components/LimitFields";
import { ModuleFields } from "../components/ModuleFields";
import { OnboardingSection } from "../components/Onboarding";
import { WhyField } from "../components/Why";
import {
  formatBytes,
  formatDay,
  formatLimit,
  formatWhen,
  HEALTH_LEVEL_NAMES,
  HEALTH_REASON_NAMES,
  LIMIT_NAMES,
  MODULE_GROUPS,
  MODULE_NAMES,
  NOTICE_NAMES,
  ONBOARDING_ITEM_NAMES,
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

const SCHOOL_TABS = [
  "onboarding",
  "entitlements",
  "addresses",
  "history",
] as const;
type SchoolTab = (typeof SCHOOL_TABS)[number];

const TABS: RecordTab<SchoolTab>[] = [
  { value: "onboarding", label: "Onboarding" },
  { value: "entitlements", label: "Entitlements" },
  { value: "addresses", label: "Addresses" },
  { value: "history", label: "History" },
];

const search = v.object({
  tab: v.fallback(
    v.optional(v.picklist(SCHOOL_TABS), "onboarding"),
    "onboarding",
  ),
});

export const Route = createFileRoute("/schools/$schoolId")({
  staticData: { title: "School" },
  validateSearch: search,
  search: { middlewares: [stripSearchParams({ tab: "onboarding" })] },
  loader: ({ params }) => getSchool({ data: { id: params.schoolId } }),
  component: SchoolPage,
});

type Data = Awaited<ReturnType<typeof getSchool>>;
type School = Data["school"];

/**
 * One school: what an operator must see at once in a strip under its name,
 * and the rest in tabs, each one job.
 */
function SchoolPage() {
  const data = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { school, health, changes, names, hosts, platform, sold, ssoDomains } =
    data;
  const name = school.nameEn ?? school.nameAr ?? school.slug;
  const standing = standingOf(school.tenantState, school.entitlements.access);
  const sending = useSheet();
  const changingAccess = useSheet();
  return (
    <Page width="record">
      <RecordHeader
        title={name}
        status={
          standing
            ? { label: STANDING_NAMES[standing], tone: ACCESS_TONE[standing] }
            : {
                label: TENANT_STATE_NAMES[school.tenantState],
                tone: TENANT_STATE_TONE[school.tenantState],
              }
        }
        facts={[
          { label: "Address", value: school.slug },
          {
            label: "Group",
            value: school.tenantNameEn ?? school.tenantNameAr ?? "None",
          },
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
        menu={[
          ...(standing
            ? [
                {
                  label: "Change access",
                  icon: ShieldAlert,
                  onSelect: changingAccess.show,
                },
              ]
            : []),
          ...(school.tenantState === "active"
            ? [
                {
                  label: "Send the administrator a new link",
                  icon: Send,
                  onSelect: sending.show,
                },
              ]
            : []),
        ]}
      />
      <RecordColumns
        stickyAside
        main={
          <>
            <Glance school={school} health={health} />
            <RecordTabs
              label="The school's sections"
              tabs={TABS}
              value={tab}
              onChange={(next) =>
                void navigate({
                  resetScroll: false,
                  search: { tab: next },
                  replace: true,
                })
              }
            >
              {tab === "onboarding" ? (
                health ? (
                  <OnboardingSection
                    schoolId={school.id}
                    health={health}
                    measuredAt={school.usage?.measuredAt ?? null}
                  />
                ) : (
                  <RecordEmpty>
                    Its onboarding shows once its cell first reports.
                  </RecordEmpty>
                )
              ) : tab === "entitlements" ? (
                <EntitlementsSection school={school} sold={sold} />
              ) : tab === "addresses" ? (
                <SchoolAddresses
                  schoolId={school.id}
                  platform={platform}
                  hosts={hosts}
                  signInDomains={ssoDomains}
                />
              ) : (
                <RecordSection variant="page" title="Changes">
                  <ChangeList changes={changes} names={names} />
                </RecordSection>
              )}
            </RecordTabs>
          </>
        }
        aside={<About school={school} sold={sold} standing={standing} />}
      />
      {standing ? (
        <AccessSheet
          key={changingAccess.key}
          tenantId={school.tenantId}
          standing={standing}
          group={school.tenantKind === "school_group"}
          open={changingAccess.open}
          onOpenChange={changingAccess.onOpenChange}
        />
      ) : null}
      {school.tenantState === "active" ? (
        <AdministratorLink
          key={sending.key}
          schoolId={school.id}
          open={sending.open}
          onOpenChange={sending.onOpenChange}
        />
      ) : null}
    </Page>
  );
}

interface GlanceProps {
  school: School;
  health: Data["health"];
}

/** What an operator should read before anything else: how the school is doing. */
function Glance({ school, health }: GlanceProps) {
  const { formatNumber } = useDesignSystem();
  const entitled = school.entitlements;
  const usage = school.usage;
  const onboarding = health?.onboarding;
  const done = onboarding
    ? onboarding.applies.filter((item) => onboarding.reached[item]).length
    : 0;
  const next = onboarding?.applies.find((item) => !onboarding.reached[item]);
  return (
    <MetricGrid label="At a glance">
      {health ? (
        <Metric
          label="Health"
          value={HEALTH_LEVEL_NAMES[health.level]}
          detail={{
            text: health.reasons.length
              ? health.reasons
                  .map((reason) => HEALTH_REASON_NAMES[reason])
                  .join("; ")
              : "Busy through the week, paid and under way.",
            tone: HEALTH_TONE[health.level],
          }}
        />
      ) : null}
      {onboarding ? (
        <Metric
          label="Onboarding"
          value={`${formatNumber(done)} of ${formatNumber(onboarding.applies.length)}`}
          meter={
            onboarding.applies.length ? done / onboarding.applies.length : 0
          }
          detail={
            onboarding.stalled
              ? { text: "No step in the last fortnight", tone: "warning" }
              : next
                ? { text: `Next: ${ONBOARDING_ITEM_NAMES[next]}` }
                : { text: "Every step taken", tone: "success" }
          }
        />
      ) : null}
      <Metric
        label="Signed in this week"
        value={usage ? formatNumber(usage.signedIn7d) : "Not yet reported"}
        detail={
          usage
            ? { text: `${formatNumber(usage.signedIn30d)} this month` }
            : undefined
        }
      />
      <Metric
        label="Students"
        value={usage ? formatNumber(usage.students) : "Not yet reported"}
        meter={
          usage && entitled.students
            ? usage.students / entitled.students
            : undefined
        }
        detail={{
          text:
            entitled.students === null
              ? "No limit"
              : `Of ${formatNumber(entitled.students)} allowed`,
        }}
      />
    </MetricGrid>
  );
}

interface AboutProps {
  school: School;
  sold: Data["sold"];
  standing: SchoolStanding | null;
}

/** The school's facts that hold on every tab: where it lives and what it may do. */
function About({ school, sold, standing }: AboutProps) {
  const entitled = school.entitlements;
  const usage = school.usage;
  return (
    <RecordSection title="About">
      <Facts>
        <Fact label="Cell" wide>
          {`${school.cellId} · ${school.region}`}
        </Fact>
        {standing ? (
          <Fact label="Access" wide>
            {ACCESS_HINT[standing]}
          </Fact>
        ) : null}
        <Fact label="Storage" wide>
          {usage
            ? `${formatBytes(usage.usedBytes)} of ${formatBytes(entitled.poolBytes)}`
            : `${formatBytes(entitled.poolBytes)}; not measured yet`}
        </Fact>
        {entitled.trialEndsOn ? (
          <Fact label="Trial ends" wide>
            {formatDay(entitled.trialEndsOn)}
          </Fact>
        ) : null}
        {sold?.subscriptionId ? (
          <Fact label="Subscription" wide>
            <Link
              to="/subscriptions/$subscriptionId"
              params={{ subscriptionId: sold.subscriptionId }}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Open its subscription
            </Link>
          </Fact>
        ) : null}
      </Facts>
    </RecordSection>
  );
}

interface EntitlementsSectionProps {
  school: School;
  /** Where a subscription sets them; null where an operator does, by hand. */
  sold: { subscriptionId: string | null } | null;
}

/** Limits held against use, as the tab lists them. */
const METERED = [
  "students",
  "staffAccounts",
  "videoHours",
  "poolBytes",
] as const;
type MeteredKey = (typeof METERED)[number];
const isMetered = (key: LimitKey): key is MeteredKey =>
  (METERED as readonly LimitKey[]).includes(key);

/**
 * What the school may use and how much of it it does: its metered limits
 * with their use, its other allowances, and every module, included or not.
 * A subscription sets them where there is a business database; without one
 * an operator edits them here.
 */
function EntitlementsSection({ school, sold }: EntitlementsSectionProps) {
  const { formatNumber } = useDesignSystem();
  const entitled = school.entitlements;
  const usage = school.usage;
  const sheet = useSheet();
  const usedOf: Record<MeteredKey, number | null> = {
    students: usage?.students ?? null,
    staffAccounts: usage?.staffAccounts ?? null,
    videoHours: usage ? Math.round(usage.videoMinutes / 6) / 10 : null,
    poolBytes: usage?.usedBytes ?? null,
  };
  const usageItems: UsageItem[] = METERED.map((key) => {
    const used = usedOf[key];
    const limit = entitled[key];
    return {
      id: key,
      label: LIMIT_NAMES[key],
      used:
        used === null
          ? "Not reported"
          : key === "poolBytes"
            ? formatBytes(used)
            : formatNumber(used),
      allowed: limit === null ? "No limit" : formatLimit(key, limit),
      share:
        used === null || limit === null || limit === 0 ? null : used / limit,
    };
  });
  const allowances: SummaryItem[] = LIMIT_KEYS.filter(
    (key) => !isMetered(key),
  ).map((key) => ({
    id: key,
    label: LIMIT_NAMES[key],
    value: formatLimit(key, entitled[key]),
  }));
  const included = new Set(availableModules(entitled));
  return (
    <>
      <RecordSection
        variant="page"
        title="Use"
        description={
          usage
            ? `As its cell last reported, ${formatWhen(usage.measuredAt)}.`
            : "Its cell has not reported its use yet."
        }
        edit={
          sold === null
            ? { label: "Edit entitlements", onClick: sheet.show }
            : undefined
        }
      >
        <UsageList label="Use against its limits" items={usageItems} />
      </RecordSection>
      <RecordSection
        variant="page"
        title="Allowances"
        description="Storage each part of the school may hold, and what it may send."
      >
        <SummaryList items={allowances} />
      </RecordSection>
      <RecordSection
        variant="page"
        title="Modules"
        description={
          <>
            {`${formatNumber(included.size)} of ${formatNumber(MODULE_IDS.length)} included, revision ${entitled.revision}. `}
            {sold === null ? (
              "Set here by an operator."
            ) : sold.subscriptionId ? (
              <>
                Set by its{" "}
                <Link
                  to="/subscriptions/$subscriptionId"
                  params={{ subscriptionId: sold.subscriptionId }}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  subscription
                </Link>
                .
              </>
            ) : (
              "It has no subscription yet; the daily round gives it one that keeps what it has."
            )}
          </>
        }
      >
        <div className="grid gap-x-10 gap-y-6 @2xl:grid-cols-2">
          {MODULE_GROUPS.map((group) => (
            <div key={group.title} className="grid content-start gap-2">
              <h3 className="text-[13px] leading-[18px] font-medium text-muted-foreground">
                {group.title}
              </h3>
              <ul className="grid gap-1.5">
                {group.modules.map((module) => (
                  <li
                    key={module}
                    className={cn(
                      "flex items-center gap-2.5 text-sm leading-5",
                      !included.has(module) && "text-muted-foreground",
                    )}
                  >
                    {included.has(module) ? (
                      <Check
                        className="size-4 shrink-0 text-success"
                        aria-label="Included"
                      />
                    ) : (
                      <Minus
                        className="size-4 shrink-0 text-muted-foreground/60"
                        aria-label="Not included"
                      />
                    )}
                    {MODULE_NAMES[module]}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </RecordSection>
      {sold === null ? (
        <EntitlementsSheet
          key={sheet.key}
          school={school}
          open={sheet.open}
          onOpenChange={sheet.onOpenChange}
        />
      ) : null}
    </>
  );
}

const NOTICE_OPTIONS = [
  { value: "", label: "None" },
  ...SCHOOL_NOTICES.map((code) => ({ value: code, label: NOTICE_NAMES[code] })),
] as const;

interface EntitlementsSheetProps {
  school: School;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Sets the school's entitlements by hand, where no subscription sets them. */
function EntitlementsSheet({
  school,
  open,
  onOpenChange,
}: EntitlementsSheetProps) {
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
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Edit entitlements"
      submitLabel="Save entitlements"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!reason.trim()) return;
        setPending(true);
        setError(null);
        const out = await attemptWith(
          () =>
            save({
              data: {
                schoolId: school.id,
                ...limitsOf(limits),
                trialEndsOn: trialEndsOn || null,
                notice: notice || null,
                modules,
                reason: reason.trim(),
              },
            }),
          "The entitlements could not be saved.",
        );
        setPending(false);
        if (!out.ok) {
          setError(out.message);
          return;
        }
        toast.success(
          out.value.atOnce
            ? "Entitlements saved. The school has them now."
            : "Entitlements saved. Its cell could not be told, so the school has them within a minute.",
        );
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        An empty storage limit takes the platform's default; any other empty
        limit is unlimited.
      </p>
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
    </SheetForm>
  );
}

const ACCESS_HINT: Record<SchoolStanding, string> = {
  full: "Everyone uses the school as normal.",
  restricted:
    "Everything works, but the school cannot switch on modules or add custom domains; its administrators are told why.",
  read_only:
    "Everyone signs in and reads; nothing can be changed, and everyone is told the account is paused. Administrators can still export.",
  suspended:
    "Nobody signs in. The school's own portal says it is paused; the bare domain says nothing.",
};

const ACCESS_TONE: Record<SchoolStanding, Tone> = {
  full: "success",
  restricted: "warning",
  read_only: "warning",
  suspended: "danger",
};

interface AccessSheetProps {
  tenantId: string;
  standing: SchoolStanding;
  /** A group's access changes for every one of its schools. */
  group: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Pauses, suspends or reopens the school's tenant, every school of a group
 * with it, with the reason the change log keeps.
 */
function AccessSheet({
  tenantId,
  standing,
  group,
  open,
  onOpenChange,
}: AccessSheetProps) {
  const router = useRouter();
  const set = useServerFn(setSchoolLifecycle);
  const [chosen, setChosen] = useState(standing);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Change access"
      submitLabel="Change access"
      destructive={chosen === "suspended"}
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (chosen === standing || !reason.trim()) return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () =>
            set({
              data: { tenantId, standing: chosen, reason: reason.trim() },
            }),
          "Access could not be changed.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Access changed.");
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {group
          ? "It applies to every school of the group."
          : "It applies to the school."}{" "}
        The cell enforces it at once.
      </p>
      <ChoiceField
        label="Access"
        value={chosen}
        options={SCHOOL_STANDINGS.map((choice) => ({
          value: choice,
          label: STANDING_NAMES[choice],
          hint: ACCESS_HINT[choice],
        }))}
        onChange={setChosen}
        errors={
          submitted && chosen === standing
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
    </SheetForm>
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
