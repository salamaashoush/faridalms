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
import { ButtonLink } from "@faridalms/ui/system/button-link";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import {
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import { StatusBadge } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import { EventList } from "../components/EventList";
import {
  ACTIVITY_NAMES,
  formatMoney,
  formatWhen,
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

export const Route = createFileRoute("/leads/$leadId")({
  staticData: { title: "Lead" },
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

function LeadPage() {
  const data = Route.useLoaderData();
  const { lead, activities, quotes, history, names } = data;
  const open = lead.state !== "lost" && lead.state !== "won";
  return (
    <>
      <RecordHeader
        title={lead.organisation}
        status={{
          label: LEAD_STATE_NAMES[lead.state],
          tone: LEAD_STATE_TONE[lead.state],
        }}
        facts={[
          { label: "Source", value: LEAD_SOURCE_NAMES[lead.source] },
          { label: "Came in", value: formatWhen(lead.createdAt) },
          ...(lead.module
            ? [
                {
                  label: "Asked about",
                  value: `asked about ${MODULE_NAMES[lead.module]}`,
                },
              ]
            : []),
          ...(lead.role
            ? [{ label: "Role", value: ROLE_NAMES[lead.role] }]
            : []),
          ...(lead.customerId
            ? [
                {
                  label: "Won",
                  value: (
                    <Link
                      to="/customers/$customerId"
                      params={{ customerId: lead.customerId }}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Its customer
                    </Link>
                  ),
                },
              ]
            : []),
        ]}
      />
      <RecordColumns
        main={
          <>
            {lead.message ? (
              <RecordSection title="What they wrote">
                <p className="text-sm leading-6 whitespace-pre-line">
                  {lead.message}
                </p>
              </RecordSection>
            ) : null}
            <RecordSection title="Activity">
              {activities.length ? (
                <RecordList>
                  {activities.map((activity) => (
                    <li key={activity.id} className="grid gap-1 py-3">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <span className="text-sm leading-5 font-medium">
                          {ACTIVITY_NAMES[activity.kind]}
                        </span>
                        <span className="text-[13px] leading-[18px] text-muted-foreground">
                          {formatWhen(activity.occurredAt)} ·{" "}
                          {names[activity.createdBy] ?? "a former operator"}
                        </span>
                      </span>
                      <p className="text-sm leading-5 whitespace-pre-line">
                        {activity.note}
                      </p>
                    </li>
                  ))}
                </RecordList>
              ) : (
                <RecordEmpty>Nothing logged yet.</RecordEmpty>
              )}
            </RecordSection>
            <ActivityForm leadId={lead.id} />
            <RecordSection
              title="Quotes"
              action={
                open ? (
                  <ButtonLink
                    to="/quotes/new"
                    search={{ leadId: lead.id }}
                    variant="ghost"
                  >
                    <Plus aria-hidden />
                    New quote
                  </ButtonLink>
                ) : undefined
              }
            >
              {quotes.length ? (
                <RecordList>
                  {quotes.map((quote) => (
                    <li
                      key={quote.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <span className="grid gap-0.5">
                        <Link
                          to="/quotes/$quoteId"
                          params={{ quoteId: quote.id }}
                          className="text-sm leading-5 font-medium hover:text-primary hover:underline"
                        >
                          {quoteReference(quote.number, quote.version)}
                        </Link>
                        <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
                          {formatMoney(quote.totalMinor, quote.currency)}
                        </span>
                      </span>
                      <StatusBadge tone={QUOTE_STATE_TONE[quote.state]}>
                        {QUOTE_STATE_NAMES[quote.state]}
                      </StatusBadge>
                    </li>
                  ))}
                </RecordList>
              ) : (
                <RecordEmpty>No quotes yet.</RecordEmpty>
              )}
            </RecordSection>
            <Details data={data} key={lead.version} />
            <RecordSection title="History">
              <EventList events={history} names={names} />
            </RecordSection>
          </>
        }
        aside={
          <>
            <Standing data={data} />
            <NextStep data={data} />
          </>
        }
      />
    </>
  );
}

/** Where the lead stands in the pipeline, and why when it was lost. */
function Standing({ data }: LeadProps) {
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
    <SettingsSection
      title="Where it stands"
      submitLabel="Move"
      pending={pending}
      error={error}
      isDirty={() => !unchanged}
      onSubmit={async () => {
        setSubmitted(true);
        if (unchanged || (state === "lost" && !reason)) return;
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
        setSubmitted(false);
        toast.success("Moved.");
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
    </SettingsSection>
  );
}

/** Who works the lead, and what they do next by when. */
function NextStep({ data }: LeadProps) {
  const router = useRouter();
  const plan = useServerFn(planLeadStep);
  const [ownerId, setOwnerId] = useState(data.lead.ownerId ?? "");
  const [nextStep, setNextStep] = useState(data.lead.nextStep ?? "");
  const [nextStepOn, setNextStepOn] = useState(data.lead.nextStepOn ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SettingsSection
      title="Next step"
      submitLabel="Save next step"
      pending={pending}
      error={error}
      isDirty={() =>
        ownerId !== (data.lead.ownerId ?? "") ||
        nextStep !== (data.lead.nextStep ?? "") ||
        nextStepOn !== (data.lead.nextStepOn ?? "")
      }
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
    </SettingsSection>
  );
}

/** Who the lead is: the school, the person, how to reach them. */
function Details({ data }: LeadProps) {
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
    <SettingsSection
      title="Lead details"
      description="Who the lead is and how to reach them."
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
        await router.invalidate();
      }}
    >
      <div className="grid items-start gap-6 @md:grid-cols-2">
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
        <SelectField
          label="Writes in"
          value={fields.locale}
          options={LOCALE_OPTIONS}
          onChange={(locale) => set("locale", locale)}
        />
      </div>
    </SettingsSection>
  );
}

const ACTIVITY_OPTIONS = ACTIVITY_KINDS.map((choice) => ({
  value: choice,
  label: ACTIVITY_NAMES[choice],
}));

interface ActivityFormProps {
  leadId: string;
}

function ActivityForm({ leadId }: ActivityFormProps) {
  const router = useRouter();
  const log = useServerFn(logActivity);
  const [kind, setKind] = useState<ActivityKind>("call");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SettingsSection
      title="Log activity"
      submitLabel="Log it"
      pending={pending}
      error={error}
      isDirty={() => Boolean(note)}
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
        setNote("");
        setSubmitted(false);
        toast.success("Logged.");
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
    </SettingsSection>
  );
}
