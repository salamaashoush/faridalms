import type {
  ActivityKind,
  LeadState,
  LostReason,
} from "@faridalms/domain/leads";
import type { DemoSize } from "@faridalms/domain/product";
import type { AttentionItem } from "@faridalms/ui/system/attention-list";
import type { Column } from "@faridalms/ui/system/data-table";
import type { RecordTab } from "@faridalms/ui/system/record-page";

import {
  ACTIVITY_KINDS,
  LEAD_STATES,
  LOST_REASONS,
} from "@faridalms/domain/leads";
import { DEMO_SIZES } from "@faridalms/domain/product";
import { quoteReference } from "@faridalms/domain/quotes";
import { daysBetween, zonedLocal } from "@faridalms/domain/school";
import { BUSINESS_TIME_ZONE } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { AttentionList } from "@faridalms/ui/system/attention-list";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { Metric, MetricGrid } from "@faridalms/ui/system/metrics";
import { Page } from "@faridalms/ui/system/page";
import { RecordHeader, RecordTabs } from "@faridalms/ui/system/record-page";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { StagePath } from "@faridalms/ui/system/stage-path";
import { StatusBadge } from "@faridalms/ui/system/status";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import { Value } from "@faridalms/ui/system/value";
import { Textarea } from "@faridalms/ui/textarea";
import {
  createFileRoute,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRightLeft,
  CalendarCheck,
  FileText,
  MessageSquarePlus,
  Pencil,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { attempt } from "../actions";
import { EventList } from "../components/EventList";
import {
  ACTIVITY_NAMES,
  formatCountry,
  formatDay,
  formatMoney,
  formatWhen,
  formatWhenDay,
  LEAD_SOURCE_NAMES,
  LEAD_STATE_NAMES,
  LEAD_STATE_TONE,
  LOST_REASON_NAMES,
  MODULE_NAMES,
  QUOTE_STATE_NAMES,
  QUOTE_STATE_TONE,
  ROLE_NAMES,
  SIZE_NAMES,
} from "../format";
import {
  getLead,
  logActivity,
  moveLead,
  planLeadStep,
  saveLeadDetails,
} from "../server/leads";

const LEAD_TABS = ["about", "activity", "quotes", "history"] as const;
type LeadTab = (typeof LEAD_TABS)[number];

const TAB_NAMES: Record<LeadTab, string> = {
  about: "About",
  activity: "Activity",
  quotes: "Quotes",
  history: "History",
};

const search = v.object({
  tab: v.fallback(v.optional(v.picklist(LEAD_TABS), "about"), "about"),
});

export const Route = createFileRoute("/leads/$leadId")({
  staticData: { title: "Lead" },
  validateSearch: search,
  search: { middlewares: [stripSearchParams({ tab: "about" })] },
  loader: ({ params }) => getLead({ data: { id: params.leadId } }),
  component: LeadPage,
});

type Data = Awaited<ReturnType<typeof getLead>>;

type LeadText = "organisation" | "name" | "email" | "phone" | "country";

interface LeadFields extends Record<LeadText, string> {
  size: DemoSize | "";
  locale: "en" | "ar";
}

interface LeadProps {
  data: Data;
}

const SIZE_OPTIONS = [
  { value: "", label: "Not known" },
  ...DEMO_SIZES.map((size) => ({ value: size, label: SIZE_NAMES[size] })),
] as const;

const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
] as const;

type ActivityRow = Data["activities"][number];
type QuoteRow = Data["quotes"][number];

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en")} ${count === 1 ? one : many}`;

/** The stages a lead moves through on its way to being won. */
const PATH = LEAD_STATES.filter((state) => state !== "lost").map((state) => ({
  value: state,
  label: LEAD_STATE_NAMES[state],
}));

/**
 * One lead, as sales works it: where it stands in the pipeline, how long it
 * has been open and what was quoted, what is next, then a tab each for who
 * it is, what was done with it, its quotes and its history.
 */
function LeadPage() {
  const data = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const { lead, activities, quotes, history, names } = data;
  const open = lead.state !== "lost" && lead.state !== "won";
  const logging = useSheet();
  const moving = useSheet();
  const planning = useSheet();
  const editing = useSheet();
  const tabs: RecordTab<LeadTab>[] = LEAD_TABS.map((value) => ({
    value,
    label: TAB_NAMES[value],
    count:
      value === "activity"
        ? activities.length
        : value === "quotes"
          ? quotes.length
          : undefined,
  }));
  return (
    <Page width="record">
      <RecordHeader
        title={lead.organisation}
        status={{
          label: LEAD_STATE_NAMES[lead.state],
          tone: LEAD_STATE_TONE[lead.state],
        }}
        facts={[
          { label: "Person", value: <span dir="auto">{lead.name}</span> },
          ...(lead.email
            ? [
                {
                  label: "Email",
                  value: (
                    <a
                      dir="ltr"
                      href={`mailto:${lead.email}`}
                      className="hover:text-primary hover:underline"
                    >
                      {lead.email}
                    </a>
                  ),
                },
              ]
            : []),
          ...(lead.phone
            ? [
                {
                  label: "Phone",
                  value: (
                    <a
                      dir="ltr"
                      href={`tel:${lead.phone}`}
                      className="hover:text-primary hover:underline"
                    >
                      {lead.phone}
                    </a>
                  ),
                },
              ]
            : []),
        ]}
        action={{
          label: "Log activity",
          icon: MessageSquarePlus,
          onClick: logging.show,
        }}
        menu={[
          {
            label: "Move the lead",
            icon: ArrowRightLeft,
            onSelect: moving.show,
          },
          {
            label: "Plan the next step",
            icon: CalendarCheck,
            onSelect: planning.show,
          },
          ...(open
            ? [
                {
                  label: "New quote",
                  icon: FileText,
                  onSelect: () =>
                    void router.navigate({
                      to: "/quotes/new",
                      search: { leadId: lead.id },
                    }),
                },
              ]
            : []),
          {
            label: "Edit lead details",
            icon: Pencil,
            onSelect: editing.show,
          },
        ]}
      />
      <div className="grid gap-6">
        <StagePath
          label="Pipeline"
          stages={PATH}
          current={lead.state === "lost" ? null : lead.state}
          left={
            lead.state === "lost"
              ? {
                  label: lead.lostReason
                    ? `Lost: ${LOST_REASON_NAMES[lead.lostReason]}`
                    : "Lost",
                  at: null,
                }
              : undefined
          }
        />
        <Glance data={data} />
        <ToDo data={data} onPlan={planning.show} onLog={logging.show} />
        <RecordTabs
          label="The lead's records"
          tabs={tabs}
          value={tab}
          onChange={(next) =>
            void navigate({
              search: { tab: next },
              replace: true,
              resetScroll: false,
            })
          }
        >
          {tab === "about" ? (
            <AboutTab
              data={data}
              onEdit={editing.show}
              onPlan={planning.show}
            />
          ) : tab === "activity" ? (
            <ActivityTab data={data} onLog={logging.show} />
          ) : tab === "quotes" ? (
            <QuotesTab data={data} open={open} />
          ) : (
            <EventList events={history} names={names} />
          )}
        </RecordTabs>
      </div>
      <ActivitySheet
        key={`log-${logging.key}`}
        leadId={lead.id}
        open={logging.open}
        onOpenChange={logging.onOpenChange}
      />
      <MoveSheet
        key={`move-${moving.key}`}
        data={data}
        open={moving.open}
        onOpenChange={moving.onOpenChange}
      />
      <NextStepSheet
        key={`plan-${planning.key}`}
        data={data}
        open={planning.open}
        onOpenChange={planning.onOpenChange}
      />
      <DetailsSheet
        key={`edit-${editing.key}`}
        data={data}
        open={editing.open}
        onOpenChange={editing.onOpenChange}
      />
    </Page>
  );
}

interface LeadSheetProps extends LeadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The lead in three numbers: how long it has been open, how much was last
 * quoted, and when someone last did something with it.
 */
function Glance({ data }: LeadProps) {
  const { lead, quotes, activities, today } = data;
  const age = daysBetween(formatIso(lead.createdAt), today) - 1;
  const latest = quotes[0];
  const last = activities[0];
  const quiet = last ? daysBetween(formatIso(last.occurredAt), today) - 1 : age;
  return (
    <MetricGrid label="At a glance">
      <Metric
        label="Open for"
        value={plural(Math.max(age, 0), "day", "days")}
        detail={{
          text: `Came in ${formatWhenDay(lead.createdAt)}`,
        }}
      />
      <Metric
        label="Latest quote"
        value={
          latest ? formatMoney(latest.totalMinor, latest.currency) : "None yet"
        }
        detail={
          latest
            ? {
                text: `${quoteReference(latest.number, latest.version)}, ${QUOTE_STATE_NAMES[latest.state].toLowerCase()}`,
              }
            : undefined
        }
      />
      <Metric
        label="Last contact"
        value={last ? formatWhenDay(last.occurredAt) : "None yet"}
        detail={
          last
            ? {
                text: `${ACTIVITY_NAMES[last.kind]}, ${plural(Math.max(quiet, 0), "day", "days")} ago`,
                tone:
                  quiet > 14 && lead.state !== "won" && lead.state !== "lost"
                    ? "warning"
                    : undefined,
              }
            : { text: "Nothing logged" }
        }
      />
    </MetricGrid>
  );
}

const formatIso = (when: Date | string) =>
  zonedLocal(when, BUSINESS_TIME_ZONE).slice(0, 10);

interface ToDoProps extends LeadProps {
  onPlan: () => void;
  onLog: () => void;
}

/** The next step, when it is due or missing; a won lead's customer to set up. */
function ToDo({ data, onPlan, onLog }: ToDoProps) {
  const { lead, owners, today } = data;
  const owner = owners.find((one) => one.id === lead.ownerId);
  const items: AttentionItem[] = [];
  const open = lead.state !== "lost" && lead.state !== "won";
  if (open && !lead.nextStep)
    items.push({
      id: "plan",
      tone: "warning",
      title: "No next step planned",
      detail:
        "A lead without a next step is forgotten. Say what happens next and by when.",
      action: (
        <Button type="button" variant="outline" size="sm" onClick={onPlan}>
          Plan the next step
        </Button>
      ),
    });
  else if (open && lead.nextStep && lead.nextStepOn && lead.nextStepOn <= today)
    items.push({
      id: "next",
      tone: lead.nextStepOn < today ? "danger" : "warning",
      title: lead.nextStep,
      detail: `${lead.nextStepOn < today ? "Was due" : "Due today"}, ${formatDay(lead.nextStepOn)} · ${owner?.name ?? "Nobody owns it"}`,
      action: (
        <>
          <Button type="button" variant="outline" size="sm" onClick={onLog}>
            Log what happened
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onPlan}>
            Plan the next one
          </Button>
        </>
      ),
    });
  if (lead.state === "won" && lead.customerId)
    items.push({
      id: "won",
      tone: "info",
      title: "Won: its customer is ready",
      detail:
        "Its school is set up through New school from the accepted quote.",
      action: (
        <ButtonLink
          variant="outline"
          size="sm"
          to="/customers/$customerId"
          params={{ customerId: lead.customerId }}
        >
          Open the customer
        </ButtonLink>
      ),
    });
  return <AttentionList title="To do" items={items} />;
}

interface AboutTabProps extends LeadProps {
  onEdit: () => void;
  onPlan: () => void;
}

/** What they asked for in their own words, who they are, and who works it. */
function AboutTab({ data, onEdit, onPlan }: AboutTabProps) {
  const { lead, owners } = data;
  const owner = owners.find((one) => one.id === lead.ownerId);
  return (
    <div className="grid gap-6">
      {lead.message ? (
        <section
          aria-label="What they wrote"
          className="overflow-hidden rounded-lg border bg-card"
        >
          <h2 className="flex min-h-10 items-center border-b bg-muted/40 px-4 text-sm leading-5 font-semibold">
            What they wrote
          </h2>
          <p
            dir="auto"
            className="px-4 py-3 text-sm leading-6 whitespace-pre-line"
          >
            {lead.message}
          </p>
        </section>
      ) : null}
      <SummaryList
        title="Next step"
        align="start"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Change the next step"
            onClick={onPlan}
          >
            <Pencil aria-hidden />
            Edit
          </Button>
        }
        items={[
          {
            id: "what",
            label: "What",
            value: <Value>{lead.nextStep}</Value>,
          },
          {
            id: "by",
            label: "By",
            value: (
              <Value>
                {lead.nextStepOn ? formatDay(lead.nextStepOn) : null}
              </Value>
            ),
          },
          {
            id: "owner",
            label: "Owner",
            value: owner?.name ?? (
              <span className="text-muted-foreground">Nobody yet</span>
            ),
          },
        ]}
      />
      <SummaryList
        title="Lead details"
        align="start"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Edit lead details"
            onClick={onEdit}
          >
            <Pencil aria-hidden />
            Edit
          </Button>
        }
        items={[
          {
            id: "organisation",
            label: "School or group",
            value: <span dir="auto">{lead.organisation}</span>,
          },
          {
            id: "person",
            label: "Person",
            value: (
              <span dir="auto">
                {lead.name}
                {lead.role ? (
                  <span className="text-muted-foreground">
                    , {ROLE_NAMES[lead.role].toLowerCase()}
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            id: "email",
            label: "Email",
            value: (
              <Value>
                {lead.email ? <span dir="ltr">{lead.email}</span> : null}
              </Value>
            ),
          },
          {
            id: "phone",
            label: "Phone",
            value: (
              <Value>
                {lead.phone ? <span dir="ltr">{lead.phone}</span> : null}
              </Value>
            ),
          },
          {
            id: "country",
            label: "Country",
            value: (
              <Value>{lead.country ? formatCountry(lead.country) : null}</Value>
            ),
          },
          {
            id: "size",
            label: "Size",
            value: <Value>{lead.size ? SIZE_NAMES[lead.size] : null}</Value>,
          },
          {
            id: "locale",
            label: "Writes in",
            value: lead.locale === "ar" ? "Arabic" : "English",
          },
          {
            id: "source",
            label: "Came in",
            value: lead.module
              ? `Asked about ${MODULE_NAMES[lead.module]} from the school's portal, ${formatWhen(lead.createdAt)}`
              : `${LEAD_SOURCE_NAMES[lead.source]}, ${formatWhen(lead.createdAt)}`,
          },
          ...(lead.state === "lost" && lead.lostReason
            ? [
                {
                  id: "lost",
                  label: "Why it was lost",
                  value: LOST_REASON_NAMES[lead.lostReason],
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

function activityColumns(names: Record<string, string>): Column<ActivityRow>[] {
  return [
    {
      id: "what",
      header: "What happened",
      primary: true,
      cell: (activity) => (
        <span className="grid min-w-0 py-2.5">
          <span className="font-medium">{ACTIVITY_NAMES[activity.kind]}</span>
          <span
            dir="auto"
            className="text-sm leading-5 whitespace-pre-line text-muted-foreground"
          >
            {activity.note}
          </span>
        </span>
      ),
    },
    {
      id: "who",
      header: "By",
      cell: (activity) => names[activity.createdBy] ?? "A former operator",
    },
    {
      id: "when",
      header: "When",
      align: "end",
      cell: (activity) => (
        <span className="text-muted-foreground">
          {formatWhen(activity.occurredAt)}
        </span>
      ),
    },
  ];
}

interface ActivityTabProps extends LeadProps {
  onLog: () => void;
}

/** Calls, meetings, emails and notes with the lead, newest first. */
function ActivityTab({ data, onLog }: ActivityTabProps) {
  const log = (
    <Button type="button" variant="outline" size="sm" onClick={onLog}>
      <MessageSquarePlus aria-hidden />
      Log activity
    </Button>
  );
  return (
    <DataTable
      caption="Activity"
      rows={data.activities}
      columns={activityColumns(data.names)}
      rowLabel={(activity) => ACTIVITY_NAMES[activity.kind]}
      card={{
        title: (activity) => ACTIVITY_NAMES[activity.kind],
        fact: (activity) => formatWhen(activity.occurredAt),
      }}
      actions={log}
      empty={{
        icon: MessageSquarePlus,
        title: "Log the first call or meeting",
        description:
          "What was said and agreed, so whoever picks the lead up next knows where it stands.",
        action: log,
      }}
    />
  );
}

const QUOTE_COLUMNS: Column<QuoteRow>[] = [
  {
    id: "quote",
    header: "Quote",
    primary: true,
    cell: (quote) => (
      <RowLink to="/quotes/$quoteId" params={{ quoteId: quote.id }}>
        {quoteReference(quote.number, quote.version)}
      </RowLink>
    ),
  },
  {
    id: "state",
    header: "Status",
    cell: (quote) => (
      <StatusBadge tone={QUOTE_STATE_TONE[quote.state]}>
        {QUOTE_STATE_NAMES[quote.state]}
      </StatusBadge>
    ),
  },
  {
    id: "total",
    header: "Total",
    align: "end",
    cell: (quote) => formatMoney(quote.totalMinor, quote.currency),
  },
];

interface QuotesTabProps extends LeadProps {
  open: boolean;
}

/** Each quote and version sent, with its state and total. */
function QuotesTab({ data, open }: QuotesTabProps) {
  const add = open ? (
    <ButtonLink
      to="/quotes/new"
      search={{ leadId: data.lead.id }}
      variant="outline"
      size="sm"
    >
      <Plus aria-hidden />
      New quote
    </ButtonLink>
  ) : null;
  return (
    <DataTable
      caption="Quotes"
      rows={data.quotes}
      columns={QUOTE_COLUMNS}
      rowLabel={(quote) => quoteReference(quote.number, quote.version)}
      card={{
        title: (quote) => quoteReference(quote.number, quote.version),
        status: (quote) => QUOTE_STATE_NAMES[quote.state],
        fact: (quote) => formatMoney(quote.totalMinor, quote.currency),
      }}
      actions={add}
      empty={{
        icon: FileText,
        title: open ? "Send a quote" : "No quotes",
        description:
          "A quote prices a plan for the school, in English and Arabic; once accepted the school is ready to set up.",
        action: add,
      }}
    />
  );
}

/** Moves the lead to another stage, saying why when it was lost. */
function MoveSheet({ data, open, onOpenChange }: LeadSheetProps) {
  const router = useRouter();
  const move = useServerFn(moveLead);
  const [state, setState] = useState<LeadState>(data.lead.state);
  const [reason, setReason] = useState<LostReason | "">(
    data.lead.lostReason ?? "",
  );
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unchanged =
    state === data.lead.state && reason === (data.lead.lostReason ?? "");
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Move the lead"
      submitLabel="Move"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (unchanged) {
          onOpenChange(false);
          return;
        }
        if (state === "lost" && !reason) return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () =>
            move({
              data: {
                id: data.lead.id,
                state,
                lostReason: state === "lost" ? reason || null : null,
              },
            }),
          "It could not be moved.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Moved.");
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <SelectField
        label="Stage"
        value={state}
        options={LEAD_STATES.map((choice) => ({
          value: choice,
          label: LEAD_STATE_NAMES[choice],
        }))}
        onChange={setState}
      />
      {state === "lost" ? (
        <SelectField
          label="Why it was lost"
          value={reason}
          options={[
            { value: "", label: "Choose…" },
            ...LOST_REASONS.map((choice) => ({
              value: choice,
              label: LOST_REASON_NAMES[choice],
            })),
          ]}
          errors={submitted && !reason ? ["Say why it was lost."] : undefined}
          onChange={setReason}
        />
      ) : null}
    </SheetForm>
  );
}

/** Names who works the lead, and what they do next by when. */
function NextStepSheet({ data, open, onOpenChange }: LeadSheetProps) {
  const router = useRouter();
  const plan = useServerFn(planLeadStep);
  const [ownerId, setOwnerId] = useState(data.lead.ownerId ?? "");
  const [nextStep, setNextStep] = useState(data.lead.nextStep ?? "");
  const [nextStepOn, setNextStepOn] = useState(data.lead.nextStepOn ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Next step"
      submitLabel="Save next step"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setPending(true);
        setError(null);
        const failed = await attempt(
          () =>
            plan({
              data: {
                id: data.lead.id,
                ownerId: ownerId || null,
                nextStep,
                nextStepOn: nextStepOn || null,
              },
            }),
          "The next step could not be saved.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Next step saved.");
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <SelectField
        label="Owner"
        value={ownerId}
        options={[
          { value: "", label: "Nobody yet" },
          ...data.owners.map((owner) => ({
            value: owner.id,
            label: owner.name,
          })),
        ]}
        onChange={setOwnerId}
      />
      <TextField
        label="What"
        maxLength={300}
        value={nextStep}
        placeholder="For example: call to book the demonstration"
        onChange={(event) => setNextStep(event.target.value)}
      />
      <TextField
        label="By"
        type="date"
        width="date"
        value={nextStepOn}
        onChange={(event) => setNextStepOn(event.target.value)}
      />
    </SheetForm>
  );
}

/** Changes who the lead is, unless someone changed it first. */
function DetailsSheet({ data, open, onOpenChange }: LeadSheetProps) {
  const router = useRouter();
  const save = useServerFn(saveLeadDetails);
  const { lead } = data;
  const [fields, setFields] = useState<LeadFields>({
    organisation: lead.organisation,
    name: lead.name,
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    country: lead.country ?? "",
    size: lead.size ?? "",
    locale: lead.locale,
  });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof LeadFields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  const missing = (key: LeadText) => submitted && !fields[key].trim();
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Edit lead details"
      submitLabel="Save details"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!fields.organisation.trim() || !fields.name.trim()) return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () =>
            save({
              data: {
                ...fields,
                id: lead.id,
                expectedVersion: lead.version,
                size: fields.size || null,
                country: fields.country.trim() || null,
              },
            }),
          "The details could not be saved.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Details saved.");
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <TextField
        label="School or group"
        maxLength={160}
        value={fields.organisation}
        errors={
          missing("organisation") ? ["Enter the school or group."] : undefined
        }
        onChange={(event) => set("organisation", event.target.value)}
      />
      <TextField
        label="Person"
        maxLength={120}
        value={fields.name}
        errors={missing("name") ? ["Enter who you spoke to."] : undefined}
        onChange={(event) => set("name", event.target.value)}
      />
      <TextField
        label="Email"
        optional
        type="email"
        dir="ltr"
        maxLength={254}
        value={fields.email}
        onChange={(event) => set("email", event.target.value)}
      />
      <div className="grid items-start gap-6 sm:grid-cols-2">
        <TextField
          label="Phone"
          optional
          type="tel"
          dir="ltr"
          maxLength={40}
          value={fields.phone}
          onChange={(event) => set("phone", event.target.value)}
        />
        <TextField
          label="Country"
          optional
          dir="ltr"
          width="code"
          maxLength={2}
          value={fields.country}
          onChange={(event) => set("country", event.target.value)}
        />
        <SelectField
          label="Size"
          value={fields.size}
          options={SIZE_OPTIONS}
          onChange={(size) => set("size", size)}
        />
        <SelectField
          label="Writes in"
          value={fields.locale}
          options={LOCALE_OPTIONS}
          onChange={(locale) => set("locale", locale)}
        />
      </div>
    </SheetForm>
  );
}

const ACTIVITY_OPTIONS = ACTIVITY_KINDS.map((choice) => ({
  value: choice,
  label: ACTIVITY_NAMES[choice],
}));

interface ActivitySheetProps {
  leadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Logs a call, a meeting or a message with the lead. */
function ActivitySheet({ leadId, open, onOpenChange }: ActivitySheetProps) {
  const router = useRouter();
  const log = useServerFn(logActivity);
  const [kind, setKind] = useState<ActivityKind>("call");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Log activity"
      submitLabel="Log it"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!note.trim()) return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () => log({ data: { leadId, kind, note } }),
          "It could not be logged.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Logged.");
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <SelectField
        label="What happened"
        width="name"
        value={kind}
        options={ACTIVITY_OPTIONS}
        onChange={setKind}
      />
      <FormField
        label="Note"
        errors={
          submitted && !note.trim() ? ["Write what happened."] : undefined
        }
      >
        {(control) => (
          <Textarea
            {...control}
            maxLength={4000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}
