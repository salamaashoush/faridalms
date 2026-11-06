import type { LeadState } from "@faridalms/domain/leads";
import type { DemoSize } from "@faridalms/domain/product";

import { LEAD_STATES, leadOpen } from "@faridalms/domain/leads";
import { DEMO_SIZES } from "@faridalms/domain/product";
import { Button } from "@faridalms/ui/button";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { PageHeader } from "@faridalms/ui/system/page-header";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attemptWith } from "../actions";
import {
  formatDay,
  LEAD_SOURCE_NAMES,
  LEAD_STATE_NAMES,
  LEAD_STATE_TONE,
  SIZE_NAMES,
} from "../format";
import { addLead, getLeads } from "../server/leads";

export const Route = createFileRoute("/leads/")({
  loader: () => getLeads(),
  component: Leads,
});

type Data = Awaited<ReturnType<typeof getLeads>>;
type Lead = Data["leads"][number];

interface LeadCardProps {
  lead: Lead;
  names: Data["names"];
  today: string;
}

/** A lead as a card: who, where from, and what is done next by whom. */
function LeadCard({ lead, names, today }: LeadCardProps) {
  const late = lead.nextStepOn !== null && lead.nextStepOn <= today;
  return (
    <li className="relative grid gap-1.5 rounded-lg border bg-card p-3 hover:bg-accent has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <Link
        to="/leads/$leadId"
        params={{ leadId: lead.id }}
        className="text-sm leading-5 font-medium outline-none after:absolute after:inset-0"
      >
        {lead.organisation}
      </Link>
      <span className="text-[13px] leading-[18px] text-muted-foreground">
        {lead.name} · {LEAD_SOURCE_NAMES[lead.source]}
        {lead.size ? ` · ${SIZE_NAMES[lead.size]}` : ""}
        {lead.country ? ` · ${lead.country}` : ""}
      </span>
      {lead.nextStep ? (
        <StatusText tone={late ? "warning" : "neutral"}>
          {lead.nextStep}
          {lead.nextStepOn ? `, ${formatDay(lead.nextStepOn)}` : ""}
        </StatusText>
      ) : (
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          No next step
        </span>
      )}
      {lead.ownerId ? (
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {names[lead.ownerId] ?? "A former operator"}
        </span>
      ) : null}
    </li>
  );
}

/**
 * Who may buy, from first contact to won or lost, as a board of stages,
 * with the next steps due today first.
 */
function Leads() {
  const { leads, due, names, today } = Route.useLoaderData();
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const byState = (state: LeadState) =>
    leads.filter((lead) => lead.state === state);
  const shown = LEAD_STATES.filter((state) => showClosed || leadOpen(state));
  return (
    <>
      <PageHeader
        title="Leads"
        count={leads.filter((lead) => leadOpen(lead.state)).length}
        description="From first contact to won or lost, with what is done next and by whom."
        action={{
          label: "New lead",
          icon: Plus,
          onClick: () => setAdding(true),
        }}
      />
      <div className="grid gap-6">
        <RecordSection
          title="Next steps due"
          description="Due today or earlier."
        >
          {due.length ? (
            <RecordList>
              {due.map((lead) => (
                <li
                  key={lead.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-3"
                >
                  <Link
                    to="/leads/$leadId"
                    params={{ leadId: lead.id }}
                    className="text-sm leading-5 font-medium hover:text-primary hover:underline"
                  >
                    {lead.organisation}
                  </Link>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {lead.nextStep}
                    {lead.nextStepOn ? `, ${formatDay(lead.nextStepOn)}` : ""}
                    {lead.ownerId
                      ? ` · ${names[lead.ownerId] ?? "a former operator"}`
                      : ""}
                  </span>
                </li>
              ))}
            </RecordList>
          ) : (
            <RecordEmpty>Nothing due today.</RecordEmpty>
          )}
        </RecordSection>
        <section aria-label="Pipeline" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base leading-6 font-semibold">Pipeline</h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowClosed((open) => !open)}
            >
              {showClosed ? "Hide won and lost" : "Show won and lost"}
            </Button>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="flex w-max gap-3">
              {shown.map((state) => {
                const rows = byState(state);
                return (
                  <div
                    key={state}
                    className="grid w-64 content-start gap-2 rounded-lg bg-muted/50 p-2"
                  >
                    <h3 className="flex items-center justify-between gap-2 px-1 py-1 text-sm leading-5 font-semibold">
                      <StatusText tone={LEAD_STATE_TONE[state]}>
                        {LEAD_STATE_NAMES[state]}
                      </StatusText>
                      <span className="text-[13px] font-medium text-muted-foreground tabular-nums">
                        {rows.length}
                      </span>
                    </h3>
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
                    ) : (
                      <p className="px-1 pb-2 text-[13px] leading-[18px] text-muted-foreground">
                        None
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
      <NewLead open={adding} onOpenChange={setAdding} />
    </>
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
