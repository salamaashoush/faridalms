import type { HostRole } from "@faridalms/domain/hosts";
import type { ModuleId } from "@faridalms/domain/modules";
import type {
  DraftAddresses,
  DraftPlan,
  DraftStep,
} from "@faridalms/domain/provisioning-draft";
import type { Currency } from "@faridalms/domain/subscriptions";

import { HOST_ROLES } from "@faridalms/domain/hosts";
import { DRAFT_STEPS } from "@faridalms/domain/provisioning-draft";
import {
  entitlementsFor,
  pickLimits,
  usableModules,
} from "@faridalms/domain/subscriptions";
import { Badge } from "@faridalms/ui/badge";
import { Button, buttonVariants } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { SaveStepInput } from "../server/provisioning";

import { failure } from "../actions";
import { Agreements } from "../components/Agreements";
import { ContactCard, ContactForm } from "../components/Contacts";
import { CustomerForm } from "../components/CustomerForm";
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

const SELECT = "h-9 rounded-md border bg-background px-2 text-sm";

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
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <Link
          to="/schools/new"
          className="text-sm text-muted-foreground hover:underline"
        >
          New school
        </Link>
        <h1 className="text-2xl font-semibold">{names}</h1>
        <p className="text-sm text-muted-foreground">
          {data.customer?.customer.legalNameEn ?? "No customer yet"} · a draft,
          kept as each step is left
        </p>
      </div>
      <nav aria-label="Steps">
        <ol className="flex flex-wrap gap-1 text-sm">
          {DRAFT_STEPS.map((name, index) => (
            <li key={name}>
              <Link
                to="/provisioning/$draftId"
                params={{ draftId: data.draft.id }}
                search={{ step: name }}
                aria-current={name === step ? "step" : undefined}
                className={
                  name === step
                    ? "block rounded-md bg-muted px-2.5 py-1.5 font-medium text-foreground"
                    : "block rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-muted"
                }
              >
                {index + 1}. {DRAFT_STEP_NAMES[name]}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      {step === "customer" ? <CustomerStep data={data} /> : null}
      {step === "schools" ? <SchoolsStep data={data} /> : null}
      {step === "plan" ? <PlanStep data={data} /> : null}
      {step === "addresses" ? <AddressesStep data={data} /> : null}
      {step === "people" ? <PeopleStep data={data} /> : null}
      {step === "review" ? <ReviewStep data={data} /> : null}
    </div>
  );
}

function BackLink({ data, step }: { data: Data; step: DraftStep }) {
  return (
    <Link
      to="/provisioning/$draftId"
      params={{ draftId: data.draft.id }}
      search={{ step: before(step) }}
      className={buttonVariants({ variant: "ghost" })}
    >
      Back
    </Link>
  );
}

function Answer({ answer }: { answer: string | null }) {
  return answer ? (
    <p role="alert" className="text-sm text-destructive">
      {answer}
    </p>
  ) : null;
}

/** Who the school is sold to: a customer that runs no tenant yet. */
function CustomerStep({ data }: { data: Data }) {
  const router = useRouter();
  const go = useStepSaver(data);
  const [customerId, setCustomerId] = useState(data.draft.customerId ?? "");
  const [adding, setAdding] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <section className="grid max-w-2xl gap-4">
      <form
        aria-label="Customer"
        className="grid gap-4 rounded-lg border p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setAnswer(await go({ step: "customer", customerId }, "schools"));
          setSaving(false);
        }}
      >
        <h2 className="text-base font-semibold">Customer</h2>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="draft-customer" className="font-medium">
            Sold to
          </label>
          <select
            id="draft-customer"
            required
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            className={SELECT}
          >
            <option value="">Choose…</option>
            {data.customers.map((customer) => (
              <option
                key={customer.id}
                value={customer.id}
                disabled={customer.runsTenant}
              >
                {customer.legalNameEn}
                {customer.runsTenant ? " (runs a tenant already)" : ""}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            A customer runs one tenant: a school, or a group of schools.
          </span>
        </div>
        <Answer answer={answer} />
        <span className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving || !customerId}>
            {saving ? "Saving…" : "Save and continue"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAdding((open) => !open)}
          >
            New customer
          </Button>
        </span>
      </form>
      {adding ? (
        <CustomerForm
          customer={null}
          onSaved={async (id) => {
            toast.success("Customer created.");
            setAdding(false);
            setCustomerId(id);
            await router.invalidate();
          }}
        />
      ) : null}
    </section>
  );
}

/** The school or group, its addresses and where it runs. */
function SchoolsStep({ data }: { data: Data }) {
  const go = useStepSaver(data);
  const [answer, setAnswer] = useState<string | null>(null);
  const { tenant, people } = data.draft.spec;
  if (data.draft.tenantId)
    return (
      <section className="grid max-w-2xl gap-3 rounded-lg border p-6 text-sm">
        <h2 className="text-base font-semibold">Schools</h2>
        <p>
          Creating it has begun, so its schools are in the directory and their
          addresses no longer change here.
        </p>
        <ul className="grid gap-1">
          {tenant.schools.map((school, index) => (
            <li key={school.slug}>
              {schoolLabel(school, index)} · {school.slug}
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <SchoolSpecForm
      label="Schools"
      sections={{ tenant: true, people: false }}
      cells={data.cells}
      initial={{ ...tenant, ...people }}
      submitLabel="Save and continue"
      submittingLabel="Saving…"
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

/** The plan, add-ons and the trial or contract the tenant is sold. */
function PlanStep({ data }: { data: Data }) {
  const go = useStepSaver(data);
  const saved = data.draft.spec.plan;
  const currency = data.customer?.customer.currency ?? "EGP";
  const [planVersionId, setPlanVersionId] = useState(saved.planVersionId ?? "");
  const [quantity, setQuantity] = useState(String(saved.quantity));
  const [price, setPrice] = useState((saved.unitPriceMinor / 100).toFixed(2));
  const [discount, setDiscount] = useState(String(saved.discountPercent));
  const [addOns, setAddOns] = useState(
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

  return (
    <form
      aria-label="Plan"
      className="grid max-w-3xl gap-6"
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
      <section className="grid gap-4 rounded-lg border p-6">
        <h2 className="text-base font-semibold">Plan</h2>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 text-sm sm:col-span-2">
            <label htmlFor="draft-plan" className="font-medium">
              Plan
            </label>
            <select
              id="draft-plan"
              value={planVersionId}
              onChange={(event) => {
                setPlanVersionId(event.target.value);
                const version = data.selling.plans.find(
                  (row) => row.id === event.target.value,
                );
                setPrice(
                  (
                    (version ? listPrice(version.prices, currency) : 0) / 100
                  ).toFixed(2),
                );
              }}
              className={SELECT}
            >
              <option value="">Basic, with no plan sold</option>
              {data.selling.plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.nameEn} version {plan.version}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5 text-sm">
            <label htmlFor="draft-quantity" className="font-medium">
              Quantity
            </label>
            <Input
              id="draft-quantity"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Students, for a plan priced per student.
            </span>
          </div>
          <div className="grid gap-1.5 text-sm">
            <label htmlFor="draft-price" className="font-medium">
              Unit price ({currency})
            </label>
            <Input
              id="draft-price"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5 text-sm">
            <label htmlFor="draft-discount" className="font-medium">
              Discount (%)
            </label>
            <Input
              id="draft-discount"
              inputMode="decimal"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border p-6">
        <h2 className="text-base font-semibold">Add-ons</h2>
        {addOns.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : null}
        {addOns.map((addOn, index) => {
          const row = data.selling.addOns.find(
            (candidate) => candidate.id === addOn.addOnVersionId,
          );
          const set = (change: Partial<(typeof addOns)[number]>) =>
            setAddOns((current) =>
              current.map((item, at) =>
                at === index ? { ...item, ...change } : item,
              ),
            );
          return (
            <div
              key={`${addOn.addOnVersionId}-${index}`}
              className="grid gap-3 border-t pt-3 text-sm"
            >
              <span className="flex flex-wrap items-center justify-between gap-2 font-medium">
                {row ? `${row.nameEn} version ${row.version}` : "Retired"}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setAddOns((current) =>
                      current.filter((_, at) => at !== index),
                    )
                  }
                >
                  Remove
                </Button>
              </span>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label
                    htmlFor={`add-on-${index}-count`}
                    className="font-medium"
                  >
                    Quantity
                  </label>
                  <Input
                    id={`add-on-${index}-count`}
                    inputMode="numeric"
                    value={addOn.count}
                    onChange={(event) => set({ count: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label
                    htmlFor={`add-on-${index}-price`}
                    className="font-medium"
                  >
                    Unit price ({currency})
                  </label>
                  <Input
                    id={`add-on-${index}-price`}
                    inputMode="decimal"
                    value={addOn.price}
                    onChange={(event) => set({ price: event.target.value })}
                  />
                </div>
              </div>
              {schools.length > 1 ? (
                <fieldset className="flex flex-wrap gap-4">
                  <legend className="mb-1 font-medium">
                    Schools (none chosen covers every school)
                  </legend>
                  {schools.map((school, schoolIndex) => (
                    <span
                      key={school.slug || schoolIndex}
                      className="flex items-center gap-2"
                    >
                      <Checkbox
                        id={`add-on-${index}-school-${schoolIndex}`}
                        checked={addOn.schoolIndexes.includes(schoolIndex)}
                        onCheckedChange={(checked) =>
                          set({
                            schoolIndexes: checked
                              ? [...addOn.schoolIndexes, schoolIndex]
                              : addOn.schoolIndexes.filter(
                                  (at) => at !== schoolIndex,
                                ),
                          })
                        }
                      />
                      <label htmlFor={`add-on-${index}-school-${schoolIndex}`}>
                        {schoolLabel(school, schoolIndex)}
                      </label>
                    </span>
                  ))}
                </fieldset>
              ) : null}
            </div>
          );
        })}
        {data.selling.addOns.length ? (
          <div className="grid max-w-sm gap-1.5 text-sm">
            <label htmlFor="draft-add-on" className="font-medium">
              Add an add-on
            </label>
            <select
              id="draft-add-on"
              value=""
              onChange={(event) => {
                const row = data.selling.addOns.find(
                  (candidate) => candidate.id === event.target.value,
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
              className={SELECT}
            >
              <option value="">Choose…</option>
              {data.selling.addOns.map((addOn) => (
                <option key={addOn.id} value={addOn.id}>
                  {addOn.nameEn} version {addOn.version}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-lg border p-6">
        <h2 className="text-base font-semibold">Trial or contract</h2>
        <TermsFields draft={terms} onChange={setTerms} />
      </section>

      {preview.ok ? (
        <section aria-label="What it gives" className="grid gap-3">
          <h2 className="text-base font-semibold">What it gives</h2>
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
                  className="grid content-start gap-2 rounded-lg border p-4 text-sm"
                >
                  <span className="font-medium">
                    {schoolLabel(school, index)}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {usable.map((id) => (
                      <Badge key={id} variant="secondary">
                        {MODULE_NAMES[id]}
                      </Badge>
                    ))}
                  </span>
                  {unusable.length ? (
                    <p className="text-xs text-muted-foreground">
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

      <Answer answer={answer} />
      <span className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save and continue"}
        </Button>
        <BackLink data={data} step="plan" />
      </span>
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

/** Hosts of the schools' own, and the domains their people sign in with. */
function AddressesStep({ data }: { data: Data }) {
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
      className="grid max-w-3xl gap-6"
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
      <section className="grid gap-4 rounded-lg border p-6">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">Hosts of their own</h2>
          <p className="text-sm text-muted-foreground">
            Optional. Each is added pending, with the records to publish on the
            school's page; the platform's own addresses work from the start.
          </p>
        </div>
        {hosts.map((host, index) => (
          <div
            key={`host-${index}`}
            className="grid items-end gap-3 text-sm sm:grid-cols-[1fr_auto_auto_auto]"
          >
            <div className="grid gap-1.5">
              <label htmlFor={`host-${index}-name`} className="font-medium">
                Hostname
              </label>
              <Input
                id={`host-${index}-name`}
                dir="ltr"
                value={host.hostname}
                placeholder="www.example.com"
                onChange={(event) =>
                  setHost(index, { hostname: event.target.value })
                }
              />
            </div>
            {schools.length > 1 ? (
              <div className="grid gap-1.5">
                <label htmlFor={`host-${index}-school`} className="font-medium">
                  School
                </label>
                <select
                  id={`host-${index}-school`}
                  value={host.schoolIndex}
                  onChange={(event) =>
                    setHost(index, { schoolIndex: Number(event.target.value) })
                  }
                  className={SELECT}
                >
                  {schools.map((school, schoolIndex) => (
                    <option
                      key={school.slug || schoolIndex}
                      value={schoolIndex}
                    >
                      {schoolLabel(school, schoolIndex)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <label htmlFor={`host-${index}-role`} className="font-medium">
                Serves
              </label>
              <select
                id={`host-${index}-role`}
                value={host.role}
                onChange={(event) =>
                  setHost(index, { role: event.target.value as HostRole })
                }
                className={SELECT}
              >
                {HOST_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role === "site" ? "Website" : "Portal"}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setHosts((current) => current.filter((_, at) => at !== index))
              }
            >
              Remove
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
          Add a host
        </Button>
      </section>

      <section className="grid gap-4 rounded-lg border p-6">
        <h2 className="text-base font-semibold">Single sign-on domains</h2>
        {offersSso ? (
          <div className="grid gap-1.5 text-sm">
            <label htmlFor="draft-sso" className="font-medium">
              Domains, one a line
            </label>
            <Textarea
              id="draft-sso"
              dir="ltr"
              value={sso}
              placeholder="example.com"
              onChange={(event) => setSso(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Recorded unverified, until the school publishes the record that
              proves it holds each domain.
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Its plan does not include single sign-on.
          </p>
        )}
      </section>

      <Answer answer={answer} />
      <span className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save and continue"}
        </Button>
        <BackLink data={data} step="addresses" />
      </span>
    </form>
  );
}

/** Each school's first administrator, a group's own, and the customer's contacts. */
function PeopleStep({ data }: { data: Data }) {
  const go = useStepSaver(data);
  const [answer, setAnswer] = useState<string | null>(null);
  const { tenant, people } = data.draft.spec;
  return (
    <div className="grid gap-8">
      <SchoolSpecForm
        label="People"
        sections={{ tenant: false, people: true }}
        cells={data.cells}
        initial={{ ...tenant, ...people }}
        submitLabel="Save and continue"
        submittingLabel="Saving…"
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
        <section className="grid max-w-2xl gap-3">
          <div className="grid gap-1">
            <h2 className="text-base font-semibold">The customer's contacts</h2>
            <p className="text-sm text-muted-foreground">
              Who the business writes to about billing and the contract. They
              are not accounts at the school.
            </p>
          </div>
          {data.customer.contacts.map((contact) => (
            <ContactCard
              key={contact.id}
              customerId={data.customer?.customer.id ?? ""}
              contact={contact}
            />
          ))}
          <ContactForm customerId={data.customer.customer.id} contact={null} />
        </section>
      ) : null}
    </div>
  );
}

/** Everything the draft says, the customer's agreement, and creating it. */
function ReviewStep({ data }: { data: Data }) {
  const router = useRouter();
  const create = useServerFn(createFromDraft);
  const abandon = useServerFn(abandonNewSchool);
  const navigate = useNavigate();
  const [answer, setAnswer] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reason, setReason] = useState("");
  const { tenant, plan, addresses, people } = data.draft.spec;
  const customer = data.customer?.customer ?? null;
  const currency = customer?.currency ?? "EGP";
  const version = data.selling.plans.find(
    (row) => row.id === plan.planVersionId,
  );
  return (
    <div className="grid max-w-3xl gap-6">
      <section
        aria-label="Review"
        className="grid gap-4 rounded-lg border p-6 text-sm"
      >
        <h2 className="text-base font-semibold">Review</h2>
        <dl className="grid gap-3">
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">Customer</dt>
            <dd>{customer?.legalNameEn ?? "None chosen"}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">
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
            <dt className="text-muted-foreground">Sold</dt>
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
            <dt className="text-muted-foreground">Addresses</dt>
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
            <dt className="text-muted-foreground">Administrators</dt>
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
      {customer && !customer.dpaVersion ? (
        <p className="text-sm">
          The customer must accept the data processing agreement before the
          school is created: no school's data is held without it.
        </p>
      ) : null}

      <Answer answer={answer} />
      <span className="flex flex-wrap gap-2">
        <Button
          disabled={creating || !customer?.dpaVersion}
          onClick={async () => {
            setCreating(true);
            setAnswer(null);
            try {
              const out = await create({ data: { id: data.draft.id } });
              if (out.ok) {
                toast.success("School created.");
                await router.invalidate();
              } else {
                setAnswer(out.message);
                await router.invalidate();
              }
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
          {creating
            ? "Creating the school…"
            : data.draft.tenantId
              ? "Finish creating the school"
              : "Create the school"}
        </Button>
        <BackLink data={data} step="review" />
      </span>

      {data.draft.tenantId ? null : (
        <form
          aria-label="Set this draft aside"
          className="flex flex-wrap items-end gap-2 border-t pt-6"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const out = await abandon({
                data: { id: data.draft.id, reason: reason.trim() },
              });
              if (out.ok) {
                toast.success("Draft set aside.");
                await navigate({ to: "/schools/new" });
              } else toast.error(out.message);
            } catch (error) {
              const said = failure(error, "The draft could not be set aside.");
              if (said) toast.error(said);
            }
          }}
        >
          <div className="grid min-w-48 flex-1 gap-1 text-sm">
            <label htmlFor="draft-abandon-reason" className="font-medium">
              Why set it aside
            </label>
            <Input
              id="draft-abandon-reason"
              required
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: the school chose another platform"
            />
          </div>
          <Button type="submit" variant="outline" disabled={!reason.trim()}>
            Set this draft aside
          </Button>
        </form>
      )}
    </div>
  );
}

/** A draft that became a school: who was sent links, and where it now lives. */
function Created({ data }: { data: Data }) {
  const [schoolId] = data.draft.progress.schoolIds ?? [];
  const names = data.draft.spec.tenant.schools
    .map((school, index) => schoolLabel(school, index))
    .join(", ");
  return (
    <div className="grid max-w-2xl gap-6" aria-live="polite">
      <div className="grid gap-2">
        <Link
          to="/schools/new"
          className="text-sm text-muted-foreground hover:underline"
        >
          New school
        </Link>
        <h1 className="text-2xl font-semibold">{names} created</h1>
        <Sent sent={data.draft.progress.provisioned?.sent ?? []} />
      </div>
      <div className="flex flex-wrap gap-2">
        {schoolId ? (
          <Link
            to="/schools/$schoolId"
            params={{ schoolId }}
            className={buttonVariants()}
          >
            Open the school
          </Link>
        ) : null}
        {data.subscriptionId ? (
          <Link
            to="/subscriptions/$subscriptionId"
            params={{ subscriptionId: data.subscriptionId }}
            className={buttonVariants({ variant: "outline" })}
          >
            Open its subscription
          </Link>
        ) : null}
      </div>
    </div>
  );
}
