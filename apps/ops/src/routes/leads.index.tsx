import type { LeadState } from "@faridalms/domain/leads";
import type { DemoSize } from "@faridalms/domain/product";

import { LEAD_STATES } from "@faridalms/domain/leads";
import { DEMO_SIZES } from "@faridalms/domain/product";
import { Badge } from "@faridalms/ui/badge";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import {
  formatDay,
  LEAD_SOURCE_NAMES,
  LEAD_STATE_NAMES,
  SIZE_NAMES,
} from "../format";
import { addLead, getLeads } from "../server/leads";

export const Route = createFileRoute("/leads/")({
  loader: () => getLeads(),
  component: Leads,
});

type Data = Awaited<ReturnType<typeof getLeads>>;
type LeadText = "organisation" | "name" | "email" | "phone" | "country";
type Lead = Data["leads"][number];

function LeadLine({ lead, names }: { lead: Lead; names: Data["names"] }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
      <span className="grid gap-0.5">
        <Link
          to="/leads/$leadId"
          params={{ leadId: lead.id }}
          className="font-medium underline"
        >
          {lead.organisation}
        </Link>
        <span className="text-muted-foreground">
          {lead.name} · {LEAD_SOURCE_NAMES[lead.source]}
          {lead.size ? ` · ${SIZE_NAMES[lead.size]}` : ""}
          {lead.country ? ` · ${lead.country}` : ""}
        </span>
      </span>
      <span className="text-muted-foreground">
        {lead.nextStep
          ? `${lead.nextStep}${lead.nextStepOn ? `, ${formatDay(lead.nextStepOn)}` : ""}`
          : "No next step"}
        {lead.ownerId ? ` · ${names[lead.ownerId] ?? "a former operator"}` : ""}
      </span>
    </li>
  );
}

function Leads() {
  const { leads, due, names } = Route.useLoaderData();
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const byState = (state: LeadState) =>
    leads.filter((lead) => lead.state === state);
  const shown = LEAD_STATES.filter(
    (state) => showClosed || (state !== "won" && state !== "lost"),
  );
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Who may buy, from first contact to won or lost, with what is done
            next and by whom.
          </p>
        </div>
        <Button variant="outline" onClick={() => setAdding((open) => !open)}>
          New lead
        </Button>
      </div>
      {adding ? <NewLead /> : null}
      <section aria-label="Next steps due" className="grid gap-3">
        <h2 className="text-base font-semibold">Next steps due</h2>
        {due.length ? (
          <ul className="divide-y rounded-lg border">
            {due.map((lead) => (
              <LeadLine key={lead.id} lead={lead} names={names} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing due today.</p>
        )}
      </section>
      <section aria-label="Pipeline" className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Pipeline</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowClosed((open) => !open)}
          >
            {showClosed ? "Hide won and lost" : "Show won and lost"}
          </Button>
        </div>
        {shown.map((state) => (
          <div key={state} className="grid gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {LEAD_STATE_NAMES[state]}
              <Badge variant="secondary">{byState(state).length}</Badge>
            </h3>
            {byState(state).length ? (
              <ul className="divide-y rounded-lg border">
                {byState(state).map((lead) => (
                  <LeadLine key={lead.id} lead={lead} names={names} />
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </section>
    </div>
  );
}

/** A lead entered by hand, such as one met at a fair. */
function NewLead() {
  const navigate = useNavigate();
  const add = useServerFn(addLead);
  const [fields, setFields] = useState<
    Record<LeadText, string> & { size: DemoSize | ""; locale: "en" | "ar" }
  >({
    organisation: "",
    name: "",
    email: "",
    phone: "",
    country: "EG",
    size: "",
    locale: "en",
  });
  const [saving, setSaving] = useState(false);
  const set = (key: LeadText) => (event: { target: { value: string } }) =>
    setFields((current) => ({ ...current, [key]: event.target.value }));
  const text = (
    key: LeadText,
    label: string,
    options: { required?: boolean; type?: string; dir?: "ltr"; max: number },
  ) => (
    <div className="grid gap-1.5 text-sm">
      <label htmlFor={`lead-${key}`} className="font-medium">
        {label}
      </label>
      <Input
        id={`lead-${key}`}
        required={options.required}
        type={options.type}
        dir={options.dir}
        maxLength={options.max}
        value={fields[key]}
        onChange={set(key)}
      />
    </div>
  );
  return (
    <form
      aria-label="New lead"
      className="grid max-w-2xl gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          const { id } = await add({
            data: {
              ...fields,
              size: fields.size || null,
              country: fields.country.trim() || null,
            },
          });
          toast.success("Lead added.");
          await navigate({ to: "/leads/$leadId", params: { leadId: id } });
        } catch (error) {
          const said = failure(
            error,
            "The lead could not be added. Give an organisation, a name, and a valid email if any.",
          );
          if (said) toast.error(said);
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2 className="text-base font-semibold">New lead</h2>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        {text("organisation", "School or group", { required: true, max: 160 })}
        {text("name", "Person", { required: true, max: 120 })}
        {text("email", "Email", { type: "email", dir: "ltr", max: 254 })}
        {text("phone", "Phone", { type: "tel", dir: "ltr", max: 40 })}
        {text("country", "Country", { dir: "ltr", max: 2 })}
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="lead-size" className="font-medium">
            Size
          </label>
          <select
            id="lead-size"
            value={fields.size}
            onChange={(event) =>
              setFields((current) => ({
                ...current,
                size: event.target.value as DemoSize | "",
              }))
            }
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Not known</option>
            {DEMO_SIZES.map((size) => (
              <option key={size} value={size}>
                {SIZE_NAMES[size]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" disabled={saving} className="justify-self-start">
        {saving ? "Adding…" : "Add lead"}
      </Button>
    </form>
  );
}
