import type { ModuleId } from "@faridalms/domain/modules";
import type { HealthReason } from "@faridalms/domain/onboarding";
import type { SchoolNotice } from "@faridalms/domain/plans";
import type { SchoolStanding } from "@faridalms/domain/provisioning";
import type { LimitKey } from "@faridalms/domain/subscriptions";
import type { AttentionItem } from "@faridalms/ui/system/attention-list";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { RecordTab } from "@faridalms/ui/system/record-page";
import type { SummaryItem } from "@faridalms/ui/system/summary-list";
import type { UsageItem } from "@faridalms/ui/system/usage-list";

import { MODULES } from "@faridalms/domain/modules";
import { availableModules, SCHOOL_NOTICES } from "@faridalms/domain/plans";
import { SCHOOL_STANDINGS, standingOf } from "@faridalms/domain/provisioning";
import { daysBetween } from "@faridalms/domain/school";
import { LIMIT_KEYS, usableModules } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { AttentionList } from "@faridalms/ui/system/attention-list";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable } from "@faridalms/ui/system/data-table";
import {
  ChoiceField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { Metric, MetricGrid } from "@faridalms/ui/system/metrics";
import { Page } from "@faridalms/ui/system/page";
import { useDesignSystem } from "@faridalms/ui/system/provider";
import {
  RecordEmpty,
  RecordHeader,
  RecordStack,
  RecordTabs,
} from "@faridalms/ui/system/record-page";
import { SettingsGroup } from "@faridalms/ui/system/settings-section";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import { UsageList } from "@faridalms/ui/system/usage-list";
import { Value } from "@faridalms/ui/system/value";
import {
  createFileRoute,
  Link,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Blocks, Globe, Pencil, Repeat, Send, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { attempt, attemptWith, failure } from "../actions";
import { ChangeList } from "../components/ChangeList";
import { HEALTH_TONE } from "../components/Health";
import {
  AddHostSheet,
  SchoolAddresses,
  SignInDomains,
} from "../components/Hosts";
import {
  CountFields,
  draftOf,
  limitsOf,
  StorageFields,
} from "../components/LimitFields";
import { ModuleFields } from "../components/ModuleFields";
import { OnboardingSteps } from "../components/Onboarding";
import { WhyField } from "../components/Why";
import {
  formatBytes,
  formatCountry,
  formatDay,
  formatLimit,
  formatWhen,
  formatWhenDay,
  HEALTH_LEVEL_NAMES,
  HEALTH_REASON_NAMES,
  LIMIT_NAMES,
  MODULE_GROUPS,
  MODULE_HINTS,
  MODULE_NAMES,
  NOTICE_NAMES,
  ONBOARDING_ITEM_NAMES,
  STANDING_NAMES,
  STANDING_TONE,
  TENANT_STATE_NAMES,
  TENANT_STATE_TONE,
} from "../format";
import { useMay } from "../may";
import {
  getSchool,
  resendInvite,
  saveEntitlements,
  setSchoolLifecycle,
} from "../server/directory";

const SCHOOL_TABS = [
  "about",
  "onboarding",
  "limits",
  "modules",
  "addresses",
  "sign-in",
  "history",
] as const;
type SchoolTab = (typeof SCHOOL_TABS)[number];

const TAB_NAMES: Record<SchoolTab, string> = {
  about: "About",
  onboarding: "Onboarding",
  limits: "Limits",
  modules: "Modules",
  addresses: "Addresses",
  "sign-in": "Sign-in domains",
  history: "History",
};

const search = v.object({
  tab: v.fallback(v.optional(v.picklist(SCHOOL_TABS), "about"), "about"),
  modules: v.fallback(
    v.optional(v.picklist(["included", "missing"] as const)),
    undefined,
  ),
});

export const Route = createFileRoute("/schools/$schoolId")({
  staticData: { title: "School" },
  validateSearch: search,
  search: { middlewares: [stripSearchParams({ tab: "about" })] },
  loader: ({ params }) => getSchool({ data: { id: params.schoolId } }),
  component: SchoolPage,
});

type Data = Awaited<ReturnType<typeof getSchool>>;
type School = Data["school"];

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en")} ${count === 1 ? one : many}`;

/**
 * One school, as support works with it: how it is doing in figures, what
 * needs doing about it, then a tab for each thing it has: its details,
 * onboarding, limits, modules, addresses, sign-in domains and history.
 */
function SchoolPage() {
  const data = Route.useLoaderData();
  const { tab, modules: moduleView } = Route.useSearch();
  const navigate = Route.useNavigate();
  const mayChange = useMay("tenants");
  const { school, health, changes, names, hosts, platform, sold, ssoDomains } =
    data;
  const name = school.nameEn ?? school.nameAr ?? school.slug;
  const standing = standingOf(school.tenantState, school.entitlements.access);
  const sending = useSheet();
  const changingAccess = useSheet();
  const editing = useSheet();
  const addingHost = useSheet();
  const modules = availableModules(school.entitlements);
  const signIn = ssoDomains.length > 0 || modules.includes("sso");
  const counts: Partial<Record<SchoolTab, number>> = {
    modules: modules.length,
    addresses: hosts.length + 2,
    "sign-in": ssoDomains.length,
  };
  const tabs: RecordTab<SchoolTab>[] = SCHOOL_TABS.filter(
    (value) => value !== "sign-in" || signIn,
  ).map((value) => ({ value, label: TAB_NAMES[value], count: counts[value] }));
  const shown = tabs.some((one) => one.value === tab) ? tab : "about";
  const go = (next: SchoolTab) =>
    void navigate({
      resetScroll: false,
      search: { tab: next },
      replace: true,
    });
  const showModules = (view: ModuleView | undefined) =>
    void navigate({
      resetScroll: false,
      search: { tab: "modules", modules: view },
      replace: true,
    });
  return (
    <Page width="record">
      <RecordHeader
        title={name}
        status={
          standing
            ? { label: STANDING_NAMES[standing], tone: STANDING_TONE[standing] }
            : {
                label: TENANT_STATE_NAMES[school.tenantState],
                tone: TENANT_STATE_TONE[school.tenantState],
              }
        }
        facts={[
          ...(school.nameAr && school.nameEn
            ? [
                {
                  label: "Name in Arabic",
                  value: (
                    <span dir="rtl" lang="ar">
                      {school.nameAr}
                    </span>
                  ),
                },
              ]
            : []),
          {
            label: "Address",
            value: <span dir="ltr">{platform.portal}</span>,
          },
          ...(data.customer
            ? [
                {
                  label: "Customer",
                  value: (
                    <Link
                      to="/customers/$customerId"
                      params={{ customerId: data.customer.id }}
                      className="hover:text-primary hover:underline"
                    >
                      {data.customer.name}
                    </Link>
                  ),
                },
              ]
            : []),
        ]}
        menu={[
          ...(standing && mayChange
            ? [
                {
                  label: "Change access",
                  icon: ShieldAlert,
                  onSelect: changingAccess.show,
                },
              ]
            : []),
          ...(school.tenantState === "active" && mayChange
            ? [
                {
                  label: "Send the administrator a new link",
                  icon: Send,
                  onSelect: sending.show,
                },
              ]
            : []),
          ...(mayChange
            ? [{ label: "Add host", icon: Globe, onSelect: addingHost.show }]
            : []),
          ...(sold === null && mayChange
            ? [
                {
                  label: "Edit limits and modules",
                  icon: Pencil,
                  onSelect: editing.show,
                },
              ]
            : []),
        ]}
      />
      <RecordStack>
        <Glance school={school} health={health} />
        <ToDo data={data} onSend={sending.show} onTab={go} />
        <RecordTabs
          label="The school's records"
          tabs={tabs}
          value={shown}
          onChange={go}
        >
          {shown === "about" ? (
            <AboutTab data={data} standing={standing} />
          ) : shown === "onboarding" ? (
            health ? (
              <OnboardingSteps
                schoolId={school.id}
                health={health}
                measuredAt={school.usage?.measuredAt ?? null}
              />
            ) : (
              <RecordEmpty>
                Its onboarding shows once its cell first reports.
              </RecordEmpty>
            )
          ) : shown === "limits" ? (
            <LimitsTab data={data} onEdit={editing.show} />
          ) : shown === "modules" ? (
            <ModulesTab
              data={data}
              view={moduleView}
              onView={showModules}
              onEdit={editing.show}
            />
          ) : shown === "addresses" ? (
            <SchoolAddresses
              schoolId={school.id}
              platform={platform}
              hosts={hosts}
              onAdd={addingHost.show}
            />
          ) : shown === "sign-in" ? (
            <SignInDomains domains={ssoDomains} />
          ) : (
            <ChangeList changes={changes} names={names} />
          )}
        </RecordTabs>
      </RecordStack>
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
      {mayChange ? (
        <AddHostSheet
          key={`host-${addingHost.key}`}
          schoolId={school.id}
          open={addingHost.open}
          onOpenChange={addingHost.onOpenChange}
        />
      ) : null}
      {sold === null ? (
        <EntitlementsSheet
          key={editing.key}
          school={school}
          open={editing.open}
          onOpenChange={editing.onOpenChange}
        />
      ) : null}
    </Page>
  );
}

interface GlanceProps {
  school: School;
  health: Data["health"];
}

/**
 * How the school is doing in four numbers: whether people use it, how many
 * students against its limit, how full its storage is, and how far its
 * onboarding has come.
 */
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
      <Metric
        label="Signed in this week"
        value={usage ? formatNumber(usage.signedIn7d) : "Not reported"}
        detail={
          usage
            ? {
                text: `${formatNumber(usage.signedIn30d)} this month`,
                tone:
                  health?.reasons.includes("quiet_in_term") === true
                    ? "danger"
                    : undefined,
              }
            : { text: "Its cell has not reported yet" }
        }
      />
      <Metric
        label="Students"
        value={usage ? formatNumber(usage.students) : "Not reported"}
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
          tone:
            usage &&
            entitled.students !== null &&
            usage.students > entitled.students
              ? "danger"
              : undefined,
        }}
      />
      <Metric
        label="Storage"
        value={usage ? formatBytes(usage.usedBytes) : "Not measured"}
        meter={usage ? usage.usedBytes / entitled.poolBytes : undefined}
        detail={{ text: `Of ${formatBytes(entitled.poolBytes)}` }}
      />
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
      ) : (
        <Metric
          label="Health"
          value={health ? HEALTH_LEVEL_NAMES[health.level] : "Not known"}
          detail={
            health
              ? {
                  text: health.reasons.length
                    ? plural(health.reasons.length, "reason", "reasons")
                    : "Nothing wrong",
                  tone: HEALTH_TONE[health.level],
                }
              : undefined
          }
        />
      )}
    </MetricGrid>
  );
}

const REASON_HELP: Record<HealthReason, string> = {
  quiet_in_term:
    "Check that its administrator can sign in and that its classes and students exist.",
  invoice_overdue:
    "The reminders restrict the school 30 days after the due day, make it read only at 60 and suspend it at 90.",
  onboarding_stalled: "No step was taken in the last fortnight.",
  host_failing:
    "Its DNS records changed or its certificate failed; the address no longer routes.",
  deliveries_failing:
    "Emails or messages it sent in the last day did not arrive; check its contacts' addresses.",
};

interface ToDoProps {
  data: Data;
  onSend: () => void;
  onTab: (tab: SchoolTab) => void;
}

/** Why the school needs help, and what the cell or a trial is waiting on. */
function ToDo({ data, onSend, onTab }: ToDoProps) {
  const { school, health, hosts, today } = data;
  const items: AttentionItem[] = [];
  if (school.tenantState === "provisioning")
    items.push({
      id: "provisioning",
      tone: "info",
      title: "Its cell has not finished creating it",
      detail: "Submit New school again with the same addresses to finish it.",
    });
  for (const reason of health?.reasons ?? [])
    items.push({
      id: reason,
      tone:
        reason === "quiet_in_term" || reason === "invoice_overdue"
          ? "danger"
          : "warning",
      title:
        reason === "invoice_overdue" && health
          ? `Its customer's invoice is ${plural(health.daysOverdue, "day", "days")} overdue`
          : HEALTH_REASON_NAMES[reason],
      detail: REASON_HELP[reason],
      action:
        reason === "quiet_in_term" && school.tenantState === "active" ? (
          <Button type="button" variant="outline" size="sm" onClick={onSend}>
            Send a new sign-in link
          </Button>
        ) : reason === "invoice_overdue" && data.customer ? (
          <ButtonLink
            variant="outline"
            size="sm"
            to="/customers/$customerId"
            params={{ customerId: data.customer.id }}
            search={{ tab: "invoices" }}
          >
            Open its invoices
          </ButtonLink>
        ) : reason === "onboarding_stalled" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onTab("onboarding")}
          >
            Open onboarding
          </Button>
        ) : reason === "host_failing" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onTab("addresses")}
          >
            Open addresses
          </Button>
        ) : undefined,
    });
  for (const host of hosts)
    if (host.state === "pending")
      items.push({
        id: `host-${host.hostname}`,
        tone: "info",
        title: `${host.hostname} waits for its DNS records`,
        detail: "It routes once the school's DNS holds the records shown.",
        action: (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onTab("addresses")}
          >
            Show the records
          </Button>
        ),
      });
  const trialEnds = school.entitlements.trialEndsOn;
  if (trialEnds) {
    const left = daysBetween(today, trialEnds) - 1;
    if (left <= 14)
      items.push({
        id: "trial",
        tone: left < 0 ? "danger" : "warning",
        title:
          left < 0
            ? `Its trial ended ${formatDay(trialEnds)}`
            : `Its trial ends in ${plural(left, "day", "days")}`,
        detail: "A contract on its subscription keeps it going.",
        action: data.sold?.subscriptionId ? (
          <ButtonLink
            variant="outline"
            size="sm"
            to="/subscriptions/$subscriptionId"
            params={{ subscriptionId: data.sold.subscriptionId }}
          >
            Open subscription
          </ButtonLink>
        ) : undefined,
      });
  }
  return <AttentionList title="To do" items={items} />;
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

interface AboutTabProps {
  data: Data;
  standing: SchoolStanding | null;
}

/** Who the school is, who it belongs to and pays for it, and where it lives. */
function AboutTab({ data, standing }: AboutTabProps) {
  const { school, platform, sold } = data;
  const group = school.tenantKind === "school_group";
  return (
    <RecordStack>
      <SummaryList
        title="School"
        align="start"
        items={[
          {
            id: "nameEn",
            label: "Name in English",
            value: <span dir="auto">{school.nameEn ?? "Not recorded"}</span>,
          },
          {
            id: "nameAr",
            label: "Name in Arabic",
            value: school.nameAr ? (
              <span dir="rtl" lang="ar">
                {school.nameAr}
              </span>
            ) : (
              <span className="text-muted-foreground italic">Not recorded</span>
            ),
          },
          {
            id: "portal",
            label: "Portal",
            value: <span dir="ltr">{platform.portal}</span>,
          },
          {
            id: "site",
            label: "Website",
            value: <span dir="ltr">{platform.site}</span>,
          },
          {
            id: "created",
            label: "Created",
            value: formatWhenDay(school.createdAt),
          },
        ]}
      />
      <SummaryList
        title="Account"
        align="start"
        items={[
          {
            id: "customer",
            label: "Customer",
            value: data.customer ? (
              <Link
                to="/customers/$customerId"
                params={{ customerId: data.customer.id }}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {data.customer.name}
              </Link>
            ) : (
              <Value absent="None: it came before the console sold anything" />
            ),
          },
          ...(group
            ? [
                {
                  id: "group",
                  label: "Group",
                  value:
                    school.tenantNameEn ?? school.tenantNameAr ?? "Unnamed",
                },
              ]
            : []),
          {
            id: "plan",
            label: "Plan",
            value:
              sold === null ? (
                "Limits and modules set here by an operator"
              ) : sold.subscriptionId ? (
                (data.plan ?? "No plan: its schools keep what they had")
              ) : (
                <Value absent="No subscription yet; the daily round opens one" />
              ),
            action: sold?.subscriptionId ? (
              <ButtonLink
                variant="ghost"
                size="sm"
                to="/subscriptions/$subscriptionId"
                params={{ subscriptionId: sold.subscriptionId }}
              >
                Open subscription
              </ButtonLink>
            ) : undefined,
          },
          ...(standing
            ? [
                {
                  id: "access",
                  label: "Access",
                  value: (
                    <span className="grid gap-0.5">
                      <span>{STANDING_NAMES[standing]}</span>
                      <span className="text-[13px] leading-[18px] text-muted-foreground">
                        {ACCESS_HINT[standing]}
                      </span>
                    </span>
                  ),
                },
              ]
            : []),
          ...(school.entitlements.trialEndsOn
            ? [
                {
                  id: "trial",
                  label: "Trial ends",
                  value: formatDay(school.entitlements.trialEndsOn),
                },
              ]
            : []),
        ]}
      />
      <SummaryList
        title="Where its data lives"
        align="start"
        items={[
          {
            id: "cell",
            label: "Cell",
            value: `${school.cellId}, ${school.region}`,
          },
          {
            id: "jurisdictions",
            label: "Held under the law of",
            value:
              school.tenantJurisdictions.map(formatCountry).join(", ") ||
              "Not recorded",
          },
          {
            id: "measured",
            label: "Last reported",
            value: school.usage ? (
              formatWhen(school.usage.measuredAt)
            ) : (
              <StatusText tone="warning">Not yet</StatusText>
            ),
          },
        ]}
      />
    </RecordStack>
  );
}

/** Limits held against use, in the order the tab lists them. */
const METERED = [
  "students",
  "staffAccounts",
  "videoHours",
  "poolBytes",
] as const;
type MeteredKey = (typeof METERED)[number];
const isMetered = (key: LimitKey): key is MeteredKey =>
  (METERED as readonly LimitKey[]).includes(key);

interface SetByProps {
  data: Data;
  onEdit: () => void;
}

/** Where the school's limits and modules come from, and the way to change them. */
function SetBy({ data, onEdit }: SetByProps) {
  const mayChange = useMay("tenants");
  if (data.sold === null)
    return mayChange ? (
      <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
        <Pencil aria-hidden />
        Edit
      </Button>
    ) : null;
  return data.sold.subscriptionId ? (
    <ButtonLink
      variant="ghost"
      size="sm"
      to="/subscriptions/$subscriptionId"
      params={{ subscriptionId: data.sold.subscriptionId }}
    >
      <Repeat aria-hidden />
      Change on its subscription
    </ButtonLink>
  ) : null;
}

interface LimitsTabProps {
  data: Data;
  onEdit: () => void;
}

/**
 * What the school may hold against how much it does, as its cell last
 * reported, and the storage each part of it may use.
 */
function LimitsTab({ data, onEdit }: LimitsTabProps) {
  const { formatNumber } = useDesignSystem();
  const { school } = data;
  const entitled = school.entitlements;
  const usage = school.usage;
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
  return (
    <RecordStack>
      <UsageList
        titled
        label="Use against its limits"
        items={usageItems}
        action={<SetBy data={data} onEdit={onEdit} />}
      />
      <SummaryList title="Allowances" items={allowances} />
    </RecordStack>
  );
}

/** A module as the school has it: included, usable, and how it is turned on. */
interface ModuleRow {
  id: ModuleId;
  area: string;
  included: boolean;
  /** Included, but useless until a module it needs is included too. */
  needs: ModuleId[];
}

const MODULE_VIEWS = ["included", "missing"] as const;
type ModuleView = (typeof MODULE_VIEWS)[number];

const AREA_OF = new Map(
  MODULE_GROUPS.flatMap((group) =>
    group.modules.map((module) => [module, group.title] as const),
  ),
);

const MODULE_COLUMNS: Column<ModuleRow>[] = [
  {
    id: "module",
    header: "Module",
    primary: true,
    cell: (row) => (
      <span className="grid min-w-0 py-2.5">
        <span
          className={cn(
            "truncate font-medium",
            !row.included && "text-muted-foreground",
          )}
        >
          {MODULE_NAMES[row.id]}
        </span>
        <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
          {MODULE_HINTS[row.id]}
        </span>
      </span>
    ),
  },
  {
    id: "area",
    header: "Area",
    cell: (row) => <span className="text-muted-foreground">{row.area}</span>,
  },
  {
    id: "status",
    header: "Status",
    cell: (row) =>
      !row.included ? (
        <StatusBadge tone="neutral">Not included</StatusBadge>
      ) : row.needs.length ? (
        <StatusBadge tone="warning">
          Needs {row.needs.map((id) => MODULE_NAMES[id]).join(" or ")}
        </StatusBadge>
      ) : (
        <StatusBadge tone="success">Included</StatusBadge>
      ),
  },
  {
    id: "on",
    header: "Turned on",
    cell: (row) => (
      <span className="text-muted-foreground">
        {MODULES[row.id].schoolSwitch ? "By the school" : "When included"}
      </span>
    ),
  },
];

const MODULE_CARD: DataTableCard<ModuleRow> = {
  title: (row) => MODULE_NAMES[row.id],
  status: (row) => (row.included ? "Included" : "Not included"),
  fact: (row) => MODULE_HINTS[row.id],
};

interface ModulesTabProps {
  data: Data;
  view: ModuleView | undefined;
  onView: (view: ModuleView | undefined) => void;
  onEdit: () => void;
}

/**
 * Every module with what it gives, whether the school has it and, for one
 * it has, whether it can be used and who turns it on. Those it lacks are
 * what could be sold to it.
 */
function ModulesTab({ data, view, onView, onEdit }: ModulesTabProps) {
  const entitled = availableModules(data.school.entitlements);
  const usable = new Set(usableModules(entitled));
  const all: ModuleRow[] = MODULE_GROUPS.flatMap((group) =>
    group.modules.map((id) => ({
      id,
      area: AREA_OF.get(id) ?? group.title,
      included: entitled.includes(id),
      needs:
        entitled.includes(id) && !usable.has(id)
          ? MODULES[id].requires.flat()
          : [],
    })),
  );
  const rows = all.filter((row) =>
    view === "included"
      ? row.included
      : view === "missing"
        ? !row.included
        : true,
  );
  const included = all.filter((row) => row.included).length;
  return (
    <DataTable
      caption="Modules"
      rows={rows}
      columns={MODULE_COLUMNS}
      rowLabel={(row) => MODULE_NAMES[row.id]}
      card={MODULE_CARD}
      toolbar={{
        facets: [
          {
            id: "show",
            label: "Show",
            single: true,
            selected: view ? [view] : [],
            options: [
              { value: "included", label: "Included", count: included },
              {
                value: "missing",
                label: "Not included",
                count: all.length - included,
              },
            ],
            onChange: (selected) =>
              onView(MODULE_VIEWS.find((one) => one === selected[0])),
          },
        ],
        onReset: () => onView(undefined),
      }}
      actions={<SetBy data={data} onEdit={onEdit} />}
      empty={{ icon: Blocks, title: "No modules" }}
    />
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
      title="Edit limits and modules"
      submitLabel="Save"
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
