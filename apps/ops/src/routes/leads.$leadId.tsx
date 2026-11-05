import type {
  ActivityKind,
  LeadState,
  LostReason,
} from "@faridalms/domain/leads";
import type { DemoSize } from "@faridalms/domain/product";

import {
  ACTIVITY_KINDS,
  LEAD_STATES,
  LOST_REASONS,
} from "@faridalms/domain/leads";
import { DEMO_SIZES } from "@faridalms/domain/product";
import { quoteReference } from "@faridalms/domain/quotes";
import { Badge } from "@faridalms/ui/badge";
import { Button, buttonVariants } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import { EventList } from "../components/EventList";
import {
  ACTIVITY_NAMES,
  formatMoney,
  formatWhen,
  LEAD_SOURCE_NAMES,
  LEAD_STATE_NAMES,
  LOST_REASON_NAMES,
  MODULE_NAMES,
  QUOTE_STATE_NAMES,
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

export const Route = createFileRoute("/leads/$leadId")({
  loader: ({ params }) => getLead({ data: { id: params.leadId } }),
  component: LeadPage,
});

type Data = Awaited<ReturnType<typeof getLead>>;

const SELECT = "h-9 rounded-md border bg-background px-2 text-sm";

type LeadText = "organisation" | "name" | "email" | "phone" | "country";
type LeadFields = Record<LeadText, string> & {
  size: DemoSize | "";
  locale: "en" | "ar";
};

function LeadPage() {
  const data = Route.useLoaderData();
  const { lead, activities, quotes, history, names } = data;
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <Link
          to="/leads"
          className="text-sm text-muted-foreground hover:underline"
        >
          Leads
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {lead.organisation}
          <Badge variant="secondary">{LEAD_STATE_NAMES[lead.state]}</Badge>
        </h1>
        <p className="text-sm text-muted-foreground">
          {LEAD_SOURCE_NAMES[lead.source]} · {formatWhen(lead.createdAt)}
          {lead.module ? ` · asked about ${MODULE_NAMES[lead.module]}` : ""}
          {lead.role ? ` · ${ROLE_NAMES[lead.role]}` : ""}
        </p>
        {lead.customerId ? (
          <p className="text-sm">
            Won:{" "}
            <Link
              to="/customers/$customerId"
              params={{ customerId: lead.customerId }}
              className="underline"
            >
              its customer
            </Link>
          </p>
        ) : null}
        {lead.message ? (
          <p className="max-w-2xl rounded-lg border p-4 text-sm whitespace-pre-line">
            {lead.message}
          </p>
        ) : null}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Standing data={data} />
        <NextStep data={data} />
      </div>
      <Details data={data} key={lead.version} />
      <section className="grid max-w-2xl gap-3">
        <h2 className="text-base font-semibold">Activity</h2>
        <ActivityForm leadId={lead.id} />
        {activities.length ? (
          <ol className="divide-y rounded-lg border">
            {activities.map((activity) => (
              <li key={activity.id} className="grid gap-1 px-4 py-3 text-sm">
                <span className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    {ACTIVITY_NAMES[activity.kind]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatWhen(activity.occurredAt)} ·{" "}
                    {names[activity.createdBy] ?? "a former operator"}
                  </span>
                </span>
                <p className="whitespace-pre-line">{activity.note}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
        )}
      </section>
      <section className="grid max-w-2xl gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Quotes</h2>
          {lead.state === "lost" || lead.state === "won" ? null : (
            <Link
              to="/quotes/new"
              search={{ leadId: lead.id }}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              New quote
            </Link>
          )}
        </div>
        {quotes.length ? (
          <ul className="divide-y rounded-lg border">
            {quotes.map((quote) => (
              <li
                key={quote.id}
                className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"
              >
                <Link
                  to="/quotes/$quoteId"
                  params={{ quoteId: quote.id }}
                  className="font-medium underline"
                >
                  {quoteReference(quote.number, quote.version)}
                </Link>
                <Badge variant="outline">
                  {QUOTE_STATE_NAMES[quote.state]}
                </Badge>
                <span className="text-muted-foreground">
                  {formatMoney(quote.totalMinor, quote.currency)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No quotes yet.</p>
        )}
      </section>
      <section className="grid gap-3">
        <h2 className="text-base font-semibold">History</h2>
        <EventList events={history} names={names} />
      </section>
    </div>
  );
}

/** Where the lead stands in the pipeline, and why when it was lost. */
function Standing({ data }: { data: Data }) {
  const router = useRouter();
  const move = useServerFn(moveLead);
  const [state, setState] = useState<LeadState>(data.lead.state);
  const [reason, setReason] = useState<LostReason | "">(
    data.lead.lostReason ?? "",
  );
  const [saving, setSaving] = useState(false);
  return (
    <form
      aria-label="Where it stands"
      className="grid gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await move({
            data: {
              id: data.lead.id,
              state,
              lostReason: state === "lost" ? reason || null : null,
            },
          });
          toast.success("Moved.");
          await router.invalidate();
        } catch (error) {
          const said = failure(
            error,
            "It could not be moved. A lost lead says why it was lost.",
          );
          if (said) toast.error(said);
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2 className="text-base font-semibold">Where it stands</h2>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="lead-state" className="font-medium">
            Stage
          </label>
          <select
            id="lead-state"
            value={state}
            onChange={(event) => setState(event.target.value as LeadState)}
            className={SELECT}
          >
            {LEAD_STATES.map((choice) => (
              <option key={choice} value={choice}>
                {LEAD_STATE_NAMES[choice]}
              </option>
            ))}
          </select>
        </div>
        {state === "lost" ? (
          <div className="grid gap-1.5 text-sm">
            <label htmlFor="lead-lost" className="font-medium">
              Why it was lost
            </label>
            <select
              id="lead-lost"
              required
              value={reason}
              onChange={(event) =>
                setReason(event.target.value as LostReason | "")
              }
              className={SELECT}
            >
              <option value="">Choose…</option>
              {LOST_REASONS.map((choice) => (
                <option key={choice} value={choice}>
                  {LOST_REASON_NAMES[choice]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <Button
        type="submit"
        disabled={
          saving ||
          (state === data.lead.state && reason === (data.lead.lostReason ?? ""))
        }
        className="justify-self-start"
      >
        {saving ? "Moving…" : "Move"}
      </Button>
    </form>
  );
}

/** Who works the lead, and what they do next by when. */
function NextStep({ data }: { data: Data }) {
  const router = useRouter();
  const plan = useServerFn(planLeadStep);
  const [ownerId, setOwnerId] = useState(data.lead.ownerId ?? "");
  const [nextStep, setNextStep] = useState(data.lead.nextStep ?? "");
  const [nextStepOn, setNextStepOn] = useState(data.lead.nextStepOn ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <form
      aria-label="Next step"
      className="grid gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          const out = await plan({
            data: {
              id: data.lead.id,
              ownerId: ownerId || null,
              nextStep,
              nextStepOn: nextStepOn || null,
            },
          });
          if (out.ok) {
            toast.success("Next step saved.");
            await router.invalidate();
          } else toast.error(out.message);
        } catch (error) {
          const said = failure(error, "The next step could not be saved.");
          if (said) toast.error(said);
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2 className="text-base font-semibold">Next step</h2>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="lead-owner" className="font-medium">
            Owner
          </label>
          <select
            id="lead-owner"
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            className={SELECT}
          >
            <option value="">Nobody yet</option>
            {data.owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="lead-next-on" className="font-medium">
            By
          </label>
          <Input
            id="lead-next-on"
            type="date"
            value={nextStepOn}
            onChange={(event) => setNextStepOn(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5 text-sm sm:col-span-2">
          <label htmlFor="lead-next" className="font-medium">
            What
          </label>
          <Input
            id="lead-next"
            maxLength={300}
            value={nextStep}
            onChange={(event) => setNextStep(event.target.value)}
            placeholder="For example: call to book the demonstration"
          />
        </div>
      </div>
      <Button type="submit" disabled={saving} className="justify-self-start">
        {saving ? "Saving…" : "Save next step"}
      </Button>
    </form>
  );
}

/** Who the lead is: the school, the person, how to reach them. */
function Details({ data }: { data: Data }) {
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
  const [answer, setAnswer] = useState<string | null>(null);
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
      aria-label="Lead details"
      className="grid max-w-2xl gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setAnswer(null);
        try {
          const out = await save({
            data: {
              ...fields,
              id: lead.id,
              expectedVersion: lead.version,
              size: fields.size || null,
              country: fields.country.trim() || null,
            },
          });
          if (out.ok) {
            toast.success("Details saved.");
            await router.invalidate();
          } else setAnswer(out.message);
        } catch (error) {
          setAnswer(failure(error, "The details could not be saved."));
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2 className="text-base font-semibold">Details</h2>
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
            className={SELECT}
          >
            <option value="">Not known</option>
            {DEMO_SIZES.map((size) => (
              <option key={size} value={size}>
                {SIZE_NAMES[size]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="lead-locale" className="font-medium">
            Writes in
          </label>
          <select
            id="lead-locale"
            value={fields.locale}
            onChange={(event) =>
              setFields((current) => ({
                ...current,
                locale: event.target.value === "ar" ? "ar" : "en",
              }))
            }
            className={SELECT}
          >
            <option value="en">English</option>
            <option value="ar">Arabic</option>
          </select>
        </div>
      </div>
      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <Button type="submit" disabled={saving} className="justify-self-start">
        {saving ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}

function ActivityForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const log = useServerFn(logActivity);
  const [kind, setKind] = useState<ActivityKind>("call");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      aria-label="Log activity"
      className="grid gap-3 rounded-lg border p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await log({ data: { leadId, kind, note } });
          setNote("");
          toast.success("Logged.");
          await router.invalidate();
        } catch (error) {
          const said = failure(error, "It could not be logged.");
          if (said) toast.error(said);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid gap-1.5 text-sm sm:max-w-xs">
        <label htmlFor="activity-kind" className="font-medium">
          What happened
        </label>
        <select
          id="activity-kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as ActivityKind)}
          className={SELECT}
        >
          {ACTIVITY_KINDS.map((choice) => (
            <option key={choice} value={choice}>
              {ACTIVITY_NAMES[choice]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="activity-note" className="font-medium">
          Note
        </label>
        <Textarea
          id="activity-note"
          required
          maxLength={4000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <Button
        type="submit"
        disabled={saving || !note.trim()}
        className="justify-self-start"
      >
        {saving ? "Logging…" : "Log it"}
      </Button>
    </form>
  );
}
