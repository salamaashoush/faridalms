import type { HostRole } from "@faridalms/domain/hosts";
import type { ModuleId } from "@faridalms/domain/modules";
import type {
  DraftAddresses,
  DraftPlan,
  DraftStep,
} from "@faridalms/domain/provisioning-draft";
import type { Currency } from "@faridalms/domain/subscriptions";
import type { StepNavItem } from "@faridalms/ui/system/step-nav";

import { HOST_ROLES } from "@faridalms/domain/hosts";
import { DRAFT_STEPS } from "@faridalms/domain/provisioning-draft";
import {
  entitlementsFor,
  pickLimits,
  usableModules,
} from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import {
  CheckboxGroupField,
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { FormFooter } from "@faridalms/ui/system/form-footer";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { FormSection } from "@faridalms/ui/system/record-form";
import {
  Fact,
  Facts,
  RecordHeader,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusBadge } from "@faridalms/ui/system/status";
import { StepNav } from "@faridalms/ui/system/step-nav";
import { Textarea } from "@faridalms/ui/textarea";
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { SaveStepInput } from "../server/provisioning";

import { attempt, failure } from "../actions";
import { Agreements } from "../components/Agreements";
import { Contacts } from "../components/Contacts";
import { NewCustomerSheet } from "../components/CustomerForm";
import { ReasonSheet } from "../components/ReasonSheet";
import { SchoolSpecForm } from "../components/SchoolSpecForm";
import { Sent } from "../components/Sent";
import {
  SCHEDULE_NAMES,
  TermsFields,
  termsDraftOf,
  termsOf,
} from "../components/TermsFields";
import {
  DRAFT_STEP_NAMES,
  formatDay,
  formatMoney,
  minorOf,
  MODULE_NAMES,
} from "../format";
import {
  abandonNewSchool,
  createFromDraft,
  getDraft,
  saveDraftStep,
} from "../server/provisioning";

export const Route = createFileRoute("/provisioning/$draftId")({
  validateSearch: v.object({ step: v.optional(v.picklist(DRAFT_STEPS)) }),
  staticData: { section: "/schools", title: "New school" },
  loader: ({ params }) => getDraft({ data: { id: params.draftId } }),
  component: DraftPage,
});

type Data = Awaited<ReturnType<typeof getDraft>>;
/** One step's own fields, as the step saves them. */
type StepPart = SaveStepInput extends infer U
  ? U extends SaveStepInput
    ? Omit<U, "id" | "expectedVersion" | "next">
    : never
  : never;

const schoolLabel = (
  school: { nameEn?: string | null; nameAr?: string | null; slug: string },
  index: number,
) => school.nameEn || school.nameAr || school.slug || `School ${index + 1}`;

/** Saves the step being left and opens the next. */
function useStepSaver(data: Data) {
  const router = useRouter();
  const navigate = useNavigate();
  const save = useServerFn(saveDraftStep);
  return async (part: StepPart, next: DraftStep): Promise<string | null> => {
    try {
      const out = await save({
        data: {
          ...part,
          id: data.draft.id,
          expectedVersion: data.draft.version,
          next,
        },
      });
      if (!out.ok) return out.message;
      await navigate({
        to: "/provisioning/$draftId",
        params: { draftId: data.draft.id },
        search: { step: next },
      });
      await router.invalidate();
      return null;
    } catch (error) {
      return failure(error, "The draft could not be saved.");
    }
  };
}

const before = (step: DraftStep): DraftStep =>
  DRAFT_STEPS[Math.max(DRAFT_STEPS.indexOf(step) - 1, 0)] ?? "customer";

function DraftPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const step = search.step ?? data.draft.step;
  const names = data.draft.spec.tenant.schools
    .map((school, index) => schoolLabel(school, index))
    .join(", ");
  if (data.draft.state === "created") return <Created data={data} />;
  const reached = DRAFT_STEPS.indexOf(data.draft.step);
  const steps: StepNavItem[] = DRAFT_STEPS.map((name, index) => ({
    id: name,
    label: DRAFT_STEP_NAMES[name],
    state: name === step ? "current" : index < reached ? "done" : "upcoming",
    render: (
      <Link
        to="/provisioning/$draftId"
        params={{ draftId: data.draft.id }}
        search={{ step: name }}
      />
    ),
  }));
  return (
    <Page width="form">
      <RecordHeader
        title={names}
        status={{ label: "Draft", tone: "neutral" }}
        facts={[
          {
            label: "Customer",
            value: data.customer?.customer.legalNameEn ?? "No customer yet",
          },
        ]}
      />
      <div className="grid gap-8">
        <StepNav label="Steps" steps={steps} />
        {step === "customer" ? <CustomerStep data={data} /> : null}
        {step === "schools" ? <SchoolsStep data={data} /> : null}
        {step === "plan" ? <PlanStep data={data} /> : null}
        {step === "addresses" ? <AddressesStep data={data} /> : null}
        {step === "people" ? <PeopleStep data={data} /> : null}
        {step === "review" ? <ReviewStep data={data} /> : null}
      </div>
    </Page>
  );
}

interface StepProps {
  data: Data;
}

interface BackLinkProps extends StepProps {
  step: DraftStep;
}

function BackLink({ data, step }: BackLinkProps) {
  return (
    <ButtonLink
      to="/provisioning/$draftId"
      params={{ draftId: data.draft.id }}
      search={{ step: before(step) }}
      variant="ghost"
    >
      Back
    </ButtonLink>
  );
}

/** Who the school is sold to: a customer that runs no tenant yet. */
function CustomerStep({ data }: StepProps) {
  const router = useRouter();
  const go = useStepSaver(data);
  const [customerId, setCustomerId] = useState(data.draft.customerId ?? "");
  const [adding, setAdding] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <form
      aria-label="Customer"
      noValidate
      className="grid gap-10"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitted(true);
        if (!customerId) return;
        setSaving(true);
        setAnswer(await go({ step: "customer", customerId }, "schools"));
        setSaving(false);
      }}
    >
      <FormSection
        title="Customer"
        description="A customer runs one tenant: a school, or a group of schools."
      >
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="Sold to"
            width="name"
            className="max-w-[30rem] min-w-64 flex-1"
            value={customerId}
            options={[
              { value: "", label: "Choose…" },
              ...data.customers
                .filter((customer) => !customer.runsTenant)
                .map((customer) => ({
                  value: customer.id,
                  label: customer.legalNameEn,
                })),
            ]}
            errors={
              submitted && !customerId ? ["Choose the customer."] : undefined
            }
            onChange={setCustomerId}
          />
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => setAdding(true)}
          >
            <Plus aria-hidden />
            New customer
          </Button>
        </div>
      </FormSection>
      <FormFooter
        submitLabel="Save and continue"
        pending={saving}
        error={answer}
      />
      <NewCustomerSheet
        open={adding}
        onOpenChange={setAdding}
        onCreated={async (id) => {
          toast.success("Customer created.");
          setCustomerId(id);
          await router.invalidate();
        }}
      />
    </form>
  );
}

/** The school or group, its addresses and where it runs. */
function SchoolsStep({ data }: StepProps) {
  const go = useStepSaver(data);
  const [answer, setAnswer] = useState<string | null>(null);
  const { tenant, people } = data.draft.spec;
  if (data.draft.tenantId)
    return (
      <div className="max-w-3xl">
        <RecordSection
          title="Schools"
          description="Creating it has begun, so its schools are in the directory and their addresses no longer change here."
        >
          <Facts>
            {tenant.schools.map((school, index) => (
              <Fact key={school.slug} label={schoolLabel(school, index)}>
                {school.slug}
              </Fact>
            ))}
          </Facts>
        </RecordSection>
      </div>
    );
  return (
    <SchoolSpecForm
      label="Schools"
      sections={{ tenant: true, people: false }}
      cells={data.cells}
      initial={{ ...tenant, ...people }}
      submitLabel="Save and continue"
      answer={answer}
      actions={<BackLink data={data} step="schools" />}
      onSubmit={async (value) => {
        const {
          administrators: _people,
          groupAdministrator: _group,
          ...rest
        } = value;
        setAnswer(await go({ step: "schools", tenant: rest }, "plan"));
      }}
    />
  );
}

/** What each school would be entitled to under the plan being chosen. */
function entitledUnder(data: Data, plan: DraftPlan, schoolIndex: number) {
  const version = data.selling.plans.find(
    (row) => row.id === plan.planVersionId,
  );
  return entitlementsFor({
    schoolId: String(schoolIndex),
    day: plan.terms.termStartsOn ?? data.today,
    items: [
      ...(version
        ? [
            {
              plan: { modules: version.modules, limits: pickLimits(version) },
              addOn: null,
              quantity: plan.quantity,
              schoolIds: [],
              startsOn: plan.terms.termStartsOn ?? data.today,
              endsOn: null,
            },
          ]
        : []),
      ...plan.addOns.flatMap((addOn) => {
        const row = data.selling.addOns.find(
          (candidate) => candidate.id === addOn.addOnVersionId,
        );
        return row
          ? [
              {
                plan: null,
                addOn: {
                  kind: row.kind,
                  module: row.module,
                  limitKey: row.limitKey,
                  amount: row.amount,
                },
                quantity: addOn.quantity,
                schoolIds: addOn.schoolIndexes.map(String),
                startsOn: plan.terms.termStartsOn ?? data.today,
                endsOn: null,
              },
            ]
          : [];
      }),
    ],
    overrides: [],
    trialEndsOn: plan.terms.trialEndsOn,
    notice: plan.terms.notice,
  });
}

const listPrice = (
  prices: { currency: Currency; amountMinor: number }[],
  currency: Currency,
) => prices.find((price) => price.currency === currency)?.amountMinor ?? 0;

interface AddOnDraft {
  addOnVersionId: string;
  quantity: number;
  unitPriceMinor: number;
  schoolIndexes: number[];
  /** The unit price and quantity as typed. */
  price: string;
  count: string;
}

/** The plan, add-ons and the trial or contract the tenant is sold. */
function PlanStep({ data }: StepProps) {
  const go = useStepSaver(data);
  const saved = data.draft.spec.plan;
  const currency = data.customer?.customer.currency ?? "EGP";
  const [planVersionId, setPlanVersionId] = useState(saved.planVersionId ?? "");
  const [quantity, setQuantity] = useState(String(saved.quantity));
  const [price, setPrice] = useState((saved.unitPriceMinor / 100).toFixed(2));
  const [discount, setDiscount] = useState(String(saved.discountPercent));
  const [addOns, setAddOns] = useState<AddOnDraft[]>(
    saved.addOns.map((addOn) => ({
      ...addOn,
      price: (addOn.unitPriceMinor / 100).toFixed(2),
      count: String(addOn.quantity),
    })),
  );
  const [terms, setTerms] = useState(() =>
    termsDraftOf(saved.terms, data.today),
  );
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const schools = data.draft.spec.tenant.schools;

  const read = ():
    | { ok: true; plan: DraftPlan }
    | { ok: false; message: string } => {
    const readTerms = termsOf(terms);
    if (!readTerms.ok) return readTerms;
    const count = Number(quantity);
    const unitPriceMinor = minorOf(price);
    const off = Number(discount || "0");
    if (!Number.isInteger(count) || count < 1 || unitPriceMinor === null)
      return {
        ok: false,
        message: "Give the plan a quantity and a unit price.",
      };
    if (!Number.isFinite(off) || off < 0 || off > 100)
      return {
        ok: false,
        message: "A discount is between 0 and 100 per cent.",
      };
    const added: DraftPlan["addOns"] = [];
    for (const addOn of addOns) {
      const addOnPrice = minorOf(addOn.price);
      const addOnCount = Number(addOn.count);
      if (
        addOnPrice === null ||
        !Number.isInteger(addOnCount) ||
        addOnCount < 1
      )
        return {
          ok: false,
          message: "Give each add-on a quantity and a unit price.",
        };
      added.push({
        addOnVersionId: addOn.addOnVersionId,
        quantity: addOnCount,
        unitPriceMinor: addOnPrice,
        schoolIndexes: addOn.schoolIndexes,
      });
    }
    return {
      ok: true,
      plan: {
        planVersionId: planVersionId || null,
        quantity: count,
        unitPriceMinor,
        discountPercent: off,
        addOns: added,
        terms: readTerms.terms,
      },
    };
  };
  const preview = read();
  const addOnOptions = [
    { value: "", label: "Choose…" },
    ...data.selling.addOns.map((addOn) => ({
      value: addOn.id,
      label: `${addOn.nameEn} version ${addOn.version}`,
    })),
  ];

  return (
    <form
      aria-label="Plan"
      noValidate
      className="grid gap-10"
      onSubmit={async (event) => {
        event.preventDefault();
        const out = read();
        if (!out.ok) {
          setAnswer(out.message);
          return;
        }
        setSaving(true);
        setAnswer(await go({ step: "plan", plan: out.plan }, "addresses"));
        setSaving(false);
      }}
    >
      <FormSection title="Plan">
        <SelectField
          label="Plan"
          value={planVersionId}
          options={[
            { value: "", label: "Basic, with no plan sold" },
            ...data.selling.plans.map((plan) => ({
              value: plan.id,
              label: `${plan.nameEn} version ${plan.version}`,
            })),
          ]}
          onChange={(chosen) => {
            setPlanVersionId(chosen);
            const version = data.selling.plans.find((row) => row.id === chosen);
            setPrice(
              (
                (version ? listPrice(version.prices, currency) : 0) / 100
              ).toFixed(2),
            );
          }}
        />
        <div className="grid items-start gap-6 sm:grid-cols-3">
          <TextField
            label="Quantity"
            hint="Students, for a plan priced per student."
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <TextField
            label={`Unit price (${currency})`}
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
          <TextField
            label="Discount (%)"
            inputMode="decimal"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
          />
        </div>
      </FormSection>

      <FormSection title="Add-ons">
        {addOns.length === 0 ? (
          <p className="text-sm leading-5 text-muted-foreground">None.</p>
        ) : null}
        {addOns.map((addOn, index) => {
          const row = data.selling.addOns.find(
            (candidate) => candidate.id === addOn.addOnVersionId,
          );
          const name = row ? `${row.nameEn} version ${row.version}` : "Retired";
          const set = (change: Partial<AddOnDraft>) =>
            setAddOns((current) =>
              current.map((item, at) =>
                at === index ? { ...item, ...change } : item,
              ),
            );
          return (
            <div
              key={`${addOn.addOnVersionId}-${index}`}
              className="grid gap-5 rounded-lg border bg-card p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm leading-5 font-semibold">{name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${name}`}
                  onClick={() =>
                    setAddOns((current) =>
                      current.filter((_, at) => at !== index),
                    )
                  }
                >
                  <X aria-hidden />
                </Button>
              </div>
              <div className="grid items-start gap-6 sm:grid-cols-2">
                <TextField
                  label="Quantity"
                  inputMode="numeric"
                  value={addOn.count}
                  onChange={(event) => set({ count: event.target.value })}
                />
                <TextField
                  label={`Unit price (${currency})`}
                  inputMode="decimal"
                  value={addOn.price}
                  onChange={(event) => set({ price: event.target.value })}
                />
              </div>
              {schools.length > 1 ? (
                <CheckboxGroupField
                  label="Schools"
                  hint="None chosen covers every school."
                  value={addOn.schoolIndexes.map(String)}
                  options={schools.map((school, schoolIndex) => ({
                    value: String(schoolIndex),
                    label: schoolLabel(school, schoolIndex),
                  }))}
                  onChange={(value) =>
                    set({ schoolIndexes: value.map(Number) })
                  }
                />
              ) : null}
            </div>
          );
        })}
        {data.selling.addOns.length ? (
          <SelectField
            label="Add an add-on"
            width="name"
            value=""
            options={addOnOptions}
            onChange={(chosen) => {
              const row = data.selling.addOns.find(
                (candidate) => candidate.id === chosen,
              );
              if (!row) return;
              setAddOns((current) => [
                ...current,
                {
                  addOnVersionId: row.id,
                  quantity: 1,
                  unitPriceMinor: listPrice(row.prices, currency),
                  schoolIndexes: [],
                  price: (listPrice(row.prices, currency) / 100).toFixed(2),
                  count: "1",
                },
              ]);
            }}
          />
        ) : null}
      </FormSection>

      <FormSection title="Trial or contract">
        <TermsFields draft={terms} onChange={setTerms} />
      </FormSection>

      {preview.ok ? (
        <section aria-label="What it gives" className="grid gap-4">
          <h2 className="text-base leading-6 font-semibold">What it gives</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {schools.map((school, index) => {
              const entitled = entitledUnder(data, preview.plan, index);
              const usable = usableModules(entitled.modules);
              const unusable = entitled.modules.filter(
                (id) => !usable.includes(id),
              );
              return (
                <li
                  key={school.slug || index}
                  className="grid content-start gap-3 rounded-lg border bg-card p-4"
                >
                  <span className="text-sm leading-5 font-semibold">
                    {schoolLabel(school, index)}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {usable.map((id) => (
                      <StatusBadge key={id} tone="neutral">
                        {MODULE_NAMES[id]}
                      </StatusBadge>
                    ))}
                  </span>
                  {unusable.length ? (
                    <p className="text-[13px] leading-[18px] text-muted-foreground">
                      Entitled but unusable without the modules they need:{" "}
                      {unusable.map((id) => MODULE_NAMES[id]).join(", ")}.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <FormFooter
        submitLabel="Save and continue"
        pending={saving}
        error={answer}
        secondary={<BackLink data={data} step="plan" />}
      />
    </form>
  );
}

/** Whether the plan being sold gives any school single sign-on. */
function sellsSso(data: Data): boolean {
  return data.draft.spec.tenant.schools.some((_, index) =>
    entitledUnder(data, data.draft.spec.plan, index).modules.includes(
      "sso" satisfies ModuleId,
    ),
  );
}

const ROLE_OPTIONS = HOST_ROLES.map((role) => ({
  value: role,
  label: role === "site" ? "Website" : "Portal",
}));

/** Hosts of the schools' own, and the domains their people sign in with. */
function AddressesStep({ data }: StepProps) {
  const go = useStepSaver(data);
  const schools = data.draft.spec.tenant.schools;
  const [hosts, setHosts] = useState(data.draft.spec.addresses.hosts);
  const [sso, setSso] = useState(
    data.draft.spec.addresses.ssoDomains.join("\n"),
  );
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const offersSso = sellsSso(data);
  const setHost = (
    index: number,
    change: Partial<DraftAddresses["hosts"][number]>,
  ) =>
    setHosts((current) =>
      current.map((host, at) => (at === index ? { ...host, ...change } : host)),
    );
  return (
    <form
      aria-label="Addresses"
      noValidate
      className="grid gap-10"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setAnswer(
          await go(
            {
              step: "addresses",
              addresses: {
                hosts: hosts.filter((host) => host.hostname.trim() !== ""),
                ssoDomains: offersSso
                  ? sso
                      .split(/\s+/)
                      .map((domain) => domain.trim())
                      .filter(Boolean)
                  : [],
              },
            },
            "people",
          ),
        );
        setSaving(false);
      }}
    >
      <FormSection
        title="Hosts of their own"
        description="Optional. Each is added pending, with the records to publish on the school's page; the platform's own addresses work from the start."
      >
        {hosts.map((host, index) => (
          <div
            key={`host-${index}`}
            className="grid items-start gap-4 rounded-lg border bg-card p-5 sm:grid-cols-[1fr_auto]"
          >
            <div
              className={
                schools.length > 1
                  ? "grid items-start gap-4 sm:grid-cols-[1fr_10rem_9rem]"
                  : "grid items-start gap-4 sm:grid-cols-[1fr_9rem]"
              }
            >
              <TextField
                label="Hostname"
                dir="ltr"
                value={host.hostname}
                placeholder="www.example.com"
                onChange={(event) =>
                  setHost(index, { hostname: event.target.value })
                }
              />
              {schools.length > 1 ? (
                <SelectField
                  label="School"
                  value={String(host.schoolIndex)}
                  options={schools.map((school, schoolIndex) => ({
                    value: String(schoolIndex),
                    label: schoolLabel(school, schoolIndex),
                  }))}
                  onChange={(chosen) =>
                    setHost(index, { schoolIndex: Number(chosen) })
                  }
                />
              ) : null}
              <SelectField
                label="Serves"
                value={host.role}
                options={ROLE_OPTIONS}
                onChange={(role: HostRole) => setHost(index, { role })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="sm:mt-7"
              aria-label={`Remove ${host.hostname || "this host"}`}
              onClick={() =>
                setHosts((current) => current.filter((_, at) => at !== index))
              }
            >
              <X aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={() =>
            setHosts((current) => [
              ...current,
              { schoolIndex: 0, hostname: "", role: "site" },
            ])
          }
        >
          <Plus aria-hidden />
          Add a host
        </Button>
      </FormSection>

      <FormSection title="Single sign-on domains">
        {offersSso ? (
          <FormField
            label="Domains, one a line"
            hint="Recorded unverified, until the school publishes the record that proves it holds each domain."
          >
            {(control) => (
              <Textarea
                {...control}
                dir="ltr"
                value={sso}
                placeholder="example.com"
                onChange={(event) => setSso(event.target.value)}
              />
            )}
          </FormField>
        ) : (
          <p className="text-sm leading-5 text-muted-foreground">
            Its plan does not include single sign-on.
          </p>
        )}
      </FormSection>

      <FormFooter
        submitLabel="Save and continue"
        pending={saving}
        error={answer}
        secondary={<BackLink data={data} step="addresses" />}
      />
    </form>
  );
}

/** Each school's first administrator, a group's own, and the customer's contacts. */
function PeopleStep({ data }: StepProps) {
  const go = useStepSaver(data);
  const [answer, setAnswer] = useState<string | null>(null);
  const { tenant, people } = data.draft.spec;
  return (
    <div className="grid gap-10">
      <SchoolSpecForm
        label="People"
        sections={{ tenant: false, people: true }}
        cells={data.cells}
        initial={{ ...tenant, ...people }}
        submitLabel="Save and continue"
        answer={answer}
        actions={<BackLink data={data} step="people" />}
        onSubmit={async (value) => {
          setAnswer(
            await go(
              {
                step: "people",
                people: {
                  administrators: value.administrators,
                  groupAdministrator: value.groupAdministrator ?? null,
                },
              },
              "review",
            ),
          );
        }}
      />
      {data.customer ? (
        <div className="grid gap-2">
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            The customer's contacts are who the business writes to about billing
            and the contract. They are not accounts at the school.
          </p>
          <Contacts
            customerId={data.customer.customer.id}
            contacts={data.customer.contacts}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Everything the draft says, the customer's agreement, and creating it. */
function ReviewStep({ data }: StepProps) {
  const router = useRouter();
  const create = useServerFn(createFromDraft);
  const abandon = useServerFn(abandonNewSchool);
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const settingAside = useSheet();
  const { tenant, plan, addresses, people } = data.draft.spec;
  const customer = data.customer?.customer ?? null;
  const currency = customer?.currency ?? "EGP";
  const version = data.selling.plans.find(
    (row) => row.id === plan.planVersionId,
  );
  return (
    <div className="grid gap-6">
      <section aria-label="Review">
        <RecordSection title="Review">
          <dl className="grid gap-4 text-sm leading-5">
            <div className="grid gap-0.5">
              <dt className="text-[13px] leading-[18px] text-muted-foreground">
                Customer
              </dt>
              <dd>{customer?.legalNameEn ?? "None chosen"}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-[13px] leading-[18px] text-muted-foreground">
                {tenant.kind === "school_group" ? "Group" : "School"}
              </dt>
              <dd>
                {tenant.kind === "school_group"
                  ? `${tenant.nameEn || tenant.nameAr || "Unnamed group"}: `
                  : ""}
                {tenant.schools
                  .map(
                    (school, index) =>
                      `${schoolLabel(school, index)} (${school.slug})`,
                  )
                  .join(", ")}{" "}
                in {tenant.cellId}
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-[13px] leading-[18px] text-muted-foreground">
                Sold
              </dt>
              <dd>
                {version
                  ? `${version.nameEn} version ${version.version}, ${plan.quantity.toLocaleString("en")} at ${formatMoney(plan.unitPriceMinor, currency)}${plan.discountPercent ? `, ${plan.discountPercent}% off` : ""}`
                  : "Basic, with no plan sold"}
                {plan.addOns.length
                  ? `; ${plan.addOns.length} ${plan.addOns.length === 1 ? "add-on" : "add-ons"}`
                  : ""}
                .{" "}
                {plan.terms.state === "trial" && plan.terms.trialEndsOn
                  ? `A trial until ${formatDay(plan.terms.trialEndsOn)}.`
                  : plan.terms.termStartsOn && plan.terms.termEndsOn
                    ? `A contract from ${formatDay(plan.terms.termStartsOn)} until ${formatDay(plan.terms.termEndsOn)}, billed ${SCHEDULE_NAMES[plan.terms.schedule].toLowerCase()}.`
                    : ""}
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-[13px] leading-[18px] text-muted-foreground">
                Addresses
              </dt>
              <dd>
                {[
                  ...addresses.hosts.map((host) => host.hostname),
                  ...addresses.ssoDomains.map(
                    (domain) => `${domain} for sign-in`,
                  ),
                ].join(", ") || "The platform's own"}
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-[13px] leading-[18px] text-muted-foreground">
                Administrators
              </dt>
              <dd>
                {[
                  ...people.administrators.map((person) => person.email),
                  ...(people.groupAdministrator
                    ? [`${people.groupAdministrator.email} for the group`]
                    : []),
                ]
                  .filter(Boolean)
                  .join(", ") || "None yet"}
              </dd>
            </div>
          </dl>
        </RecordSection>
      </section>

      {customer ? (
        <Agreements
          customerId={customer.id}
          terms={{
            version: customer.termsVersion,
            at: customer.termsAcceptedAt,
          }}
          dpa={{ version: customer.dpaVersion, at: customer.dpaAcceptedAt }}
        />
      ) : null}

      <form
        aria-label="Create"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          setCreating(true);
          setAnswer(null);
          try {
            const out = await create({ data: { id: data.draft.id } });
            if (out.ok) toast.success("School created.");
            else setAnswer(out.message);
            await router.invalidate();
          } catch (error) {
            setAnswer(
              failure(
                error,
                "It could not be created. Create again: it resumes where it stopped.",
              ),
            );
          } finally {
            setCreating(false);
          }
        }}
      >
        {customer && !customer.dpaVersion ? (
          <p className="mb-4 text-sm leading-5 text-muted-foreground">
            The customer must accept the data processing agreement before the
            school is created: no school's data is held without it.
          </p>
        ) : null}
        <FormFooter
          submitLabel={
            creating
              ? "Creating the school…"
              : data.draft.tenantId
                ? "Finish creating the school"
                : "Create the school"
          }
          pending={creating}
          disabled={!customer?.dpaVersion}
          error={answer}
          secondary={<BackLink data={data} step="review" />}
        />
      </form>

      {data.draft.tenantId ? null : (
        <>
          <p className="mt-6 text-sm leading-5 text-muted-foreground">
            Not going ahead?{" "}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-destructive"
              onClick={settingAside.show}
            >
              Set this draft aside
            </Button>
            ; it leaves the list of drafts and nothing is created.
          </p>
          <ReasonSheet
            key={settingAside.key}
            open={settingAside.open}
            onOpenChange={settingAside.onOpenChange}
            title="Set this draft aside"
            submitLabel="Set this draft aside"
            destructive
            placeholder="For example: the school chose another platform"
            onSubmit={async (reason) => {
              const failed = await attempt(
                () => abandon({ data: { id: data.draft.id, reason } }),
                "The draft could not be set aside.",
              );
              if (failed) return failed;
              toast.success("Draft set aside.");
              await navigate({ to: "/schools/new" });
              return null;
            }}
          />
        </>
      )}
    </div>
  );
}

/** A draft that became a school: who was sent links, and where it now lives. */
function Created({ data }: StepProps) {
  const [schoolId] = data.draft.progress.schoolIds ?? [];
  const names = data.draft.spec.tenant.schools
    .map((school, index) => schoolLabel(school, index))
    .join(", ");
  return (
    <div className="grid" aria-live="polite">
      <PageHeader title={`${names} created`} />
      <RecordSection title="Links sent">
        <Sent sent={data.draft.progress.provisioned?.sent ?? []} />
      </RecordSection>
      <div className="mt-6 flex flex-wrap gap-2">
        {schoolId ? (
          <ButtonLink to="/schools/$schoolId" params={{ schoolId }}>
            Open the school
          </ButtonLink>
        ) : null}
        {data.subscriptionId ? (
          <ButtonLink
            to="/subscriptions/$subscriptionId"
            params={{ subscriptionId: data.subscriptionId }}
            variant="outline"
          >
            Open its subscription
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
