import type { LeadSource, LeadState } from "@faridalms/domain/leads";
import type { DemoSize } from "@faridalms/domain/product";
import type { Currency } from "@faridalms/domain/subscriptions";
import type { AttentionItem } from "@faridalms/ui/system/attention-list";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";
import type { Tone } from "@faridalms/ui/system/status";

import { LEAD_SOURCES, LEAD_STATES, leadOpen } from "@faridalms/domain/leads";
import { DEMO_SIZES } from "@faridalms/domain/product";
import { cn } from "@faridalms/ui/cn";
import { AttentionList } from "@faridalms/ui/system/attention-list";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { Segmented } from "@faridalms/ui/system/panel";
import { useDesignSystem } from "@faridalms/ui/system/provider";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { dotTone, StatusBadge, StatusText } from "@faridalms/ui/system/status";
import {
  createFileRoute,
  Link,
  stripSearchParams,
  useNavigate,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Columns3, List, Plus, Target } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { attemptWith } from "../actions";
import {
  formatCountry,
  formatDay,
  formatMoney,
  LEAD_SOURCE_NAMES,
  LEAD_STATE_NAMES,
  LEAD_STATE_TONE,
  SIZE_NAMES,
} from "../format";
import { addLead, getLeads } from "../server/leads";

const CLOSED = ["won", "lost"] as const;
const VIEWS = ["board", "list"] as const;
type View = (typeof VIEWS)[number];

/** The facet's value for a lead nobody owns. */
const NOBODY = "nobody";

const search = v.object({
  q: v.optional(v.string(), ""),
  view: v.fallback(v.optional(v.picklist(VIEWS), "board"), "board"),
  owner: v.optional(v.array(v.string()), []),
  source: v.optional(v.array(v.picklist(LEAD_SOURCES)), []),
  closed: v.optional(v.array(v.picklist(CLOSED)), []),
});

export const Route = createFileRoute("/leads/")({
  validateSearch: search,
  search: {
    middlewares: [
      stripSearchParams({
        q: "",
        view: "board",
        owner: [],
        source: [],
        closed: [],
      }),
    ],
  },
  loader: () => getLeads(),
  component: Leads,
});

type Data = Awaited<ReturnType<typeof getLeads>>;
type Lead = Data["leads"][number];

/** How pressing a lead's next step is: late, today, planned, or missing. */
type Urgency = "late" | "today" | "planned" | "none";

function urgencyOf(lead: Lead, today: string): Urgency {
  if (!lead.nextStep || !lead.nextStepOn) return "none";
  if (lead.nextStepOn < today) return "late";
  if (lead.nextStepOn === today) return "today";
  return "planned";
}

const URGENCY_ORDER: Record<Urgency, number> = {
  late: 0,
  today: 1,
  none: 2,
  planned: 3,
};

/** Most pressing first: late, due today, unplanned, then by the day planned. */
const byUrgency = (today: string) => (a: Lead, b: Lead) =>
  URGENCY_ORDER[urgencyOf(a, today)] - URGENCY_ORDER[urgencyOf(b, today)] ||
  (a.nextStepOn ?? "").localeCompare(b.nextStepOn ?? "");

interface NextStepProps {
  lead: Lead;
  today: string;
}

const URGENCY_TONE: Record<Urgency, Tone> = {
  late: "danger",
  today: "warning",
  planned: "neutral",
  none: "warning",
};

/**
 * A lead's next step and when, its dot coloured by how pressing it is. A
 * sentence, so it wraps to two lines rather than widening its column.
 */
function NextStep({ lead, today }: NextStepProps) {
  const urgency = urgencyOf(lead, today);
  return (
    <span className="flex min-w-0 items-start gap-2 text-[13px] leading-[18px] text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          "mt-[5px] size-2 shrink-0 rounded-full",
          dotTone[URGENCY_TONE[urgency]],
        )}
      />
      <span
        dir="auto"
        className={cn(
          "line-clamp-2 min-w-0",
          urgency === "late" && "text-destructive",
        )}
      >
        {urgency === "none"
          ? "No next step"
          : `${lead.nextStep ?? ""}, ${
              urgency === "today"
                ? "today"
                : lead.nextStepOn
                  ? formatDay(lead.nextStepOn)
                  : ""
            }`}
      </span>
    </span>
  );
}

interface LeadCardProps {
  lead: Lead;
  names: Data["names"];
  today: string;
}

/**
 * A lead on the board: who, what is done next and when, what was quoted,
 * and who works it. The whole card opens the lead.
 */
function LeadCard({ lead, names, today }: LeadCardProps) {
  const urgency = urgencyOf(lead, today);
  return (
    <li
      className={cn(
        "relative grid min-w-0 gap-2 rounded-lg border bg-card p-3 hover:bg-accent has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50",
        urgency === "late" && "border-s-2 border-s-destructive",
      )}
    >
      <div className="grid gap-0.5">
        <Link
          to="/leads/$leadId"
          params={{ leadId: lead.id }}
          dir="auto"
          className="line-clamp-2 text-sm leading-5 font-medium outline-none after:absolute after:inset-0"
        >
          {lead.organisation}
        </Link>
        <span
          dir="auto"
          className="truncate text-[13px] leading-[18px] text-muted-foreground"
        >
          {lead.name}
          {lead.size ? ` · ${SIZE_NAMES[lead.size]}` : ""}
        </span>
      </div>
      <NextStep lead={lead} today={today} />
      <div className="flex items-center justify-between gap-2 text-[13px] leading-[18px] text-muted-foreground">
        <span className="truncate">
          {lead.ownerId
            ? (names[lead.ownerId] ?? "A former operator")
            : "Unowned"}
        </span>
        {lead.quote ? (
          <span className="shrink-0 font-medium text-foreground tabular-nums">
            {formatMoney(lead.quote.totalMinor, lead.quote.currency)}
          </span>
        ) : null}
      </div>
    </li>
  );
}

/** What the quotes in front of some leads come to, in each currency. */
function quotedText(leads: readonly Lead[]): string | null {
  const sums = new Map<Currency, number>();
  for (const lead of leads)
    if (lead.quote)
      sums.set(
        lead.quote.currency,
        (sums.get(lead.quote.currency) ?? 0) + lead.quote.totalMinor,
      );
  return sums.size
    ? [...sums]
        .map(([currency, total]) => formatMoney(total, currency))
        .join(" · ")
    : null;
}

interface BoardProps {
  leads: Lead[];
  stages: readonly LeadState[];
  names: Data["names"];
  today: string;
}

/**
 * The pipeline as columns of stages (Pipedrive, HubSpot): each column its
 * count and what its leads were quoted, its cards most pressing first.
 */
function Board({ leads, stages, names, today }: BoardProps) {
  const { formatNumber } = useDesignSystem();
  return (
    <section
      aria-label="Pipeline"
      className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
    >
      <div className="grid min-w-full auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-3">
        {stages.map((stage) => {
          const rows = leads
            .filter((lead) => lead.state === stage)
            .toSorted(byUrgency(today));
          const quoted = quotedText(rows);
          return (
            <section
              key={stage}
              aria-label={LEAD_STATE_NAMES[stage]}
              className="grid min-h-40 min-w-0 content-start gap-2 rounded-lg bg-muted/50 p-2"
            >
              <header className="grid gap-0.5 px-1 pt-1 pb-1">
                <h2 className="flex items-center justify-between gap-2 text-sm leading-5 font-semibold">
                  <StatusText tone={LEAD_STATE_TONE[stage]}>
                    {LEAD_STATE_NAMES[stage]}
                  </StatusText>
                  <span className="text-[13px] font-medium text-muted-foreground tabular-nums">
                    {formatNumber(rows.length)}
                  </span>
                </h2>
                {quoted ? (
                  <p className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
                    {quoted} quoted
                  </p>
                ) : null}
              </header>
              {rows.length ? (
                <ul className="grid gap-2">
                  {rows.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      names={names}
                      today={today}
                    />
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function listColumns(names: Data["names"], today: string): Column<Lead>[] {
  return [
    {
      id: "lead",
      header: "Lead",
      primary: true,
      cell: (lead) => (
        <span className="grid min-w-0 py-2">
          <RowLink to="/leads/$leadId" params={{ leadId: lead.id }}>
            {lead.organisation}
          </RowLink>
          <span
            dir="auto"
            className="truncate text-[13px] leading-[18px] text-muted-foreground"
          >
            {lead.name}
            {lead.country ? ` · ${formatCountry(lead.country)}` : ""}
          </span>
        </span>
      ),
    },
    {
      id: "stage",
      header: "Stage",
      cell: (lead) => (
        <StatusBadge tone={LEAD_STATE_TONE[lead.state]}>
          {LEAD_STATE_NAMES[lead.state]}
        </StatusBadge>
      ),
    },
    {
      id: "next",
      header: "Next step",
      width: "wide",
      cell: (lead) =>
        leadOpen(lead.state) ? (
          <NextStep lead={lead} today={today} />
        ) : (
          <span className="text-muted-foreground">Closed</span>
        ),
    },
    {
      id: "owner",
      header: "Owner",
      cell: (lead) =>
        lead.ownerId ? (
          (names[lead.ownerId] ?? "A former operator")
        ) : (
          <span className="text-muted-foreground">Unowned</span>
        ),
    },
    {
      id: "source",
      header: "Came from",
      cell: (lead) => (
        <span className="text-muted-foreground">
          {LEAD_SOURCE_NAMES[lead.source]}
        </span>
      ),
    },
    {
      id: "quoted",
      header: "Quoted",
      align: "end",
      cell: (lead) =>
        lead.quote ? (
          formatMoney(lead.quote.totalMinor, lead.quote.currency)
        ) : (
          <span className="text-muted-foreground">Nothing</span>
        ),
    },
  ];
}

const LIST_CARD: DataTableCard<Lead> = {
  title: (lead) => (
    <RowLink to="/leads/$leadId" params={{ leadId: lead.id }}>
      {lead.organisation}
    </RowLink>
  ),
  status: (lead) => LEAD_STATE_NAMES[lead.state],
  fact: (lead) => lead.nextStep ?? "No next step",
};

/**
 * Who may buy, from first contact to won or lost. A sales rep comes here
 * for two things: the next steps due today, which lead the page when there
 * are any, and the pipeline, as a board of stages or a list to search.
 */
function Leads() {
  const { leads, due, names, today } = Route.useLoaderData();
  const { q, view, owner, source, closed } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [adding, setAdding] = useState(false);
  const go = (patch: Partial<v.InferOutput<typeof search>>) =>
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
      resetScroll: false,
    });
  const needle = q.trim().toLowerCase();
  const shownStages = LEAD_STATES.filter(
    (state) => leadOpen(state) || closed.some((one) => one === state),
  );
  const rows = leads.filter(
    (lead) =>
      shownStages.includes(lead.state) &&
      (!needle ||
        [lead.organisation, lead.name, lead.email]
          .filter((text) => text !== null)
          .some((text) => text.toLowerCase().includes(needle))) &&
      (owner.length === 0 || owner.includes(lead.ownerId ?? NOBODY)) &&
      (source.length === 0 || source.includes(lead.source)),
  );
  const owners = [
    ...new Set(leads.flatMap((lead) => (lead.ownerId ? [lead.ownerId] : []))),
  ];
  const facets: Facet[] = [
    {
      id: "owner",
      label: "Owner",
      options: [
        ...owners.map((id) => ({
          value: id,
          label: names[id] ?? "A former operator",
          count: leads.filter((lead) => lead.ownerId === id).length,
        })),
        {
          value: NOBODY,
          label: "Unowned",
          count: leads.filter((lead) => !lead.ownerId).length,
        },
      ],
      selected: owner,
      onChange: (selected) => go({ owner: selected }),
    },
    {
      id: "source",
      label: "Came from",
      options: LEAD_SOURCES.map((value: LeadSource) => ({
        value,
        label: LEAD_SOURCE_NAMES[value],
        count: leads.filter((lead) => lead.source === value).length,
      })),
      selected: source,
      onChange: (selected) =>
        go({
          source: LEAD_SOURCES.filter((value) => selected.includes(value)),
        }),
    },
    {
      id: "closed",
      label: "Include",
      options: CLOSED.map((value) => ({
        value,
        label: LEAD_STATE_NAMES[value],
        count: leads.filter((lead) => lead.state === value).length,
      })),
      selected: closed,
      onChange: (selected) =>
        go({ closed: CLOSED.filter((value) => selected.includes(value)) }),
    },
  ];
  const items: AttentionItem[] = due.map((lead) => ({
    id: lead.id,
    tone:
      lead.nextStepOn !== null && lead.nextStepOn < today
        ? "danger"
        : "warning",
    title: `${lead.organisation}: ${lead.nextStep ?? "next step"}`,
    detail: `${lead.nextStepOn !== null && lead.nextStepOn < today ? "Was due" : "Due today"}${lead.nextStepOn ? `, ${formatDay(lead.nextStepOn)}` : ""} · ${lead.ownerId ? (names[lead.ownerId] ?? "A former operator") : "Nobody owns it"}`,
    action: (
      <ButtonLink
        variant="outline"
        size="sm"
        to="/leads/$leadId"
        params={{ leadId: lead.id }}
      >
        Open lead
      </ButtonLink>
    ),
  }));
  const toolbar = {
    search: {
      value: q,
      onChange: (value: string) => go({ q: value }),
      label: "Search leads",
      placeholder: "Search by school, person or email",
    },
    facets,
    onReset: () => go({ q: "", owner: [], source: [], closed: [] }),
  };
  const open = leads.filter((lead) => leadOpen(lead.state)).length;
  return (
    <Page width="list">
      <PageHeader
        title="Leads"
        count={open}
        description="Schools and groups that may buy, from first contact to won or lost."
        action={{
          label: "New lead",
          icon: Plus,
          onClick: () => setAdding(true),
        }}
      />
      {leads.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Add the first lead"
          description="Requests from the product site's demo form and schools asking about a module arrive here on their own; a lead met in person is added by hand."
        />
      ) : (
        <div className="grid gap-6">
          <AttentionList title="Next steps due" items={items} />
          <div className="grid gap-3">
            <IndexToolbar
              {...toolbar}
              view={
                <Segmented<View>
                  label="Show as"
                  value={view}
                  onChange={(next) => go({ view: next })}
                  options={[
                    {
                      value: "board",
                      label: "Board",
                      icon: <Columns3 aria-hidden className="size-4" />,
                    },
                    {
                      value: "list",
                      label: "List",
                      icon: <List aria-hidden className="size-4" />,
                    },
                  ]}
                />
              }
            />
            {view === "board" ? (
              <Board
                leads={rows}
                stages={shownStages}
                names={names}
                today={today}
              />
            ) : (
              <DataTable
                caption="Leads"
                rows={rows.toSorted(byUrgency(today))}
                columns={listColumns(names, today)}
                rowLabel={(lead) => lead.organisation}
                card={LIST_CARD}
                empty={{ icon: Target, title: "No leads match" }}
              />
            )}
          </div>
        </div>
      )}
      <NewLead open={adding} onOpenChange={setAdding} />
    </Page>
  );
}

type LeadText = "organisation" | "name" | "email" | "phone" | "country";

interface LeadDraft extends Record<LeadText, string> {
  size: DemoSize | "";
}

const SIZE_OPTIONS = [
  { value: "", label: "Not known" },
  ...DEMO_SIZES.map((size) => ({ value: size, label: SIZE_NAMES[size] })),
] as const;

interface NewLeadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A lead entered by hand, such as one met at a fair. */
function NewLead({ open, onOpenChange }: NewLeadProps) {
  const navigate = useNavigate();
  const add = useServerFn(addLead);
  const [fields, setFields] = useState<LeadDraft>({
    organisation: "",
    name: "",
    email: "",
    phone: "",
    country: "EG",
    size: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof LeadDraft, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  const missing = (key: LeadText) => submitted && !fields[key].trim();
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="New lead"
      submitLabel="Add lead"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!fields.organisation.trim() || !fields.name.trim()) return;
        setPending(true);
        setError(null);
        const out = await attemptWith(
          () =>
            add({
              data: {
                ...fields,
                locale: "en",
                size: fields.size || null,
                country: fields.country.trim() || null,
              },
            }),
          "The lead could not be added. Check the email address.",
        );
        setPending(false);
        if (!out.ok) {
          setError(out.message);
          return;
        }
        toast.success("Lead added.");
        onOpenChange(false);
        await navigate({
          to: "/leads/$leadId",
          params: { leadId: out.value.id },
        });
      }}
    >
      <TextField
        label="School or group"
        width="name"
        maxLength={160}
        value={fields.organisation}
        errors={
          missing("organisation") ? ["Enter the school or group."] : undefined
        }
        onChange={(event) => set("organisation", event.target.value)}
      />
      <TextField
        label="Person"
        width="name"
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
        width="name"
        maxLength={254}
        value={fields.email}
        onChange={(event) => set("email", event.target.value)}
      />
      <TextField
        label="Phone"
        optional
        type="tel"
        dir="ltr"
        width="phone"
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
    </SheetForm>
  );
}
