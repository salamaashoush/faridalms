import type {
  AddOnVersionRow,
  PlanVersionRow,
} from "@faridalms/database/business/catalogue";
import type { ModuleId } from "@faridalms/domain/modules";
import type { AddOnKind, LimitKey } from "@faridalms/domain/subscriptions";

import { MODULE_IDS } from "@faridalms/domain/modules";
import { BASIC_ENTITLEMENTS, settableOf } from "@faridalms/domain/plans";
import {
  ADD_ON_KINDS,
  businessToday,
  LIMIT_KEYS,
  pickLimits,
} from "@faridalms/domain/subscriptions";
import { Badge } from "@faridalms/ui/badge";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import {
  CountFields,
  draftOf,
  limitsOf,
  StorageFields,
} from "../components/LimitFields";
import { ModuleFields } from "../components/ModuleFields";
import {
  formatPrice,
  PriceFields,
  priceDraftOf,
  pricesOf,
} from "../components/PriceFields";
import {
  formatDay,
  formatLimit,
  formatWhen,
  isStorageKey,
  LIMIT_NAMES,
  MODULE_NAMES,
} from "../format";
import { getCatalogue, retire, saveAddOn, savePlan } from "../server/catalogue";

export const Route = createFileRoute("/catalogue")({
  loader: () => getCatalogue(),
  component: Catalogue,
});

const KIND_NAMES: Record<AddOnKind, string> = {
  module: "Module",
  limit_pack: "Limit pack",
  service: "Service",
};

const GIB = 1024 ** 3;

/** Versions grouped under the plan or add-on they belong to, newest first. */
function grouped<T>(versions: T[], owner: (version: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const version of versions)
    groups.set(owner(version), [
      ...(groups.get(owner(version)) ?? []),
      version,
    ]);
  return [...groups.values()];
}

type Editing =
  | { kind: "plan"; from: PlanVersionRow | null }
  | { kind: "add_on"; from: AddOnVersionRow | null };

function Catalogue() {
  const { plans, addOns } = Route.useLoaderData();
  const [editing, setEditing] = useState<Editing | null>(null);
  const done = () => setEditing(null);
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Catalogue</h1>
        <p className="text-sm text-muted-foreground">
          The plans and add-ons the business sells. A version never changes: a
          new price, module or limit is a new version, and a contract keeps the
          version it bought. A retired version is no longer sold.
        </p>
      </div>
      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Plans</h2>
          <Button
            variant="outline"
            onClick={() => setEditing({ kind: "plan", from: null })}
          >
            New plan
          </Button>
        </div>
        {editing?.kind === "plan" && !editing.from ? (
          <PlanForm from={null} onDone={done} />
        ) : null}
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No plans yet.</p>
        ) : null}
        {grouped(plans, (plan) => plan.planId).map((versions) => {
          const [latest] = versions;
          if (!latest) return null;
          return (
            <article
              key={latest.planId}
              aria-label={latest.nameEn}
              className="grid gap-4 rounded-lg border p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  {latest.nameEn}
                  <span className="text-sm font-normal text-muted-foreground">
                    {latest.nameAr} · {latest.code}
                  </span>
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing({ kind: "plan", from: latest })}
                >
                  New version
                </Button>
              </div>
              {editing?.kind === "plan" &&
              editing.from?.planId === latest.planId ? (
                <PlanForm from={latest} onDone={done} />
              ) : null}
              <ol className="grid gap-3">
                {versions.map((version) => (
                  <li key={version.id} className="grid gap-2 border-t pt-3">
                    <VersionLine
                      kind="plan"
                      id={version.id}
                      version={version.version}
                      validFrom={version.validFrom}
                      retiredAt={version.retiredAt}
                    />
                    <span className="flex flex-wrap gap-1">
                      {version.modules.map((module) => (
                        <Badge key={module} variant="secondary">
                          {MODULE_NAMES[module]}
                        </Badge>
                      ))}
                    </span>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                      {LIMIT_KEYS.map((key) => (
                        <div key={key} className="grid">
                          <dt className="text-xs text-muted-foreground">
                            {LIMIT_NAMES[key]}
                          </dt>
                          <dd className="tabular-nums">
                            {formatLimit(key, version[key])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <Prices prices={version.prices} />
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </section>
      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Add-ons</h2>
          <Button
            variant="outline"
            onClick={() => setEditing({ kind: "add_on", from: null })}
          >
            New add-on
          </Button>
        </div>
        {editing?.kind === "add_on" && !editing.from ? (
          <AddOnForm from={null} onDone={done} />
        ) : null}
        {addOns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No add-ons yet.</p>
        ) : null}
        {grouped(addOns, (addOn) => addOn.addOnId).map((versions) => {
          const [latest] = versions;
          if (!latest) return null;
          return (
            <article
              key={latest.addOnId}
              aria-label={latest.nameEn}
              className="grid gap-4 rounded-lg border p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  {latest.nameEn}
                  <span className="text-sm font-normal text-muted-foreground">
                    {latest.nameAr} · {latest.code} · {KIND_NAMES[latest.kind]}
                  </span>
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing({ kind: "add_on", from: latest })}
                >
                  New version
                </Button>
              </div>
              {editing?.kind === "add_on" &&
              editing.from?.addOnId === latest.addOnId ? (
                <AddOnForm from={latest} onDone={done} />
              ) : null}
              <ol className="grid gap-3">
                {versions.map((version) => (
                  <li key={version.id} className="grid gap-2 border-t pt-3">
                    <VersionLine
                      kind="add_on"
                      id={version.id}
                      version={version.version}
                      validFrom={version.validFrom}
                      retiredAt={version.retiredAt}
                    />
                    <p className="text-sm">{addOnGives(version)}</p>
                    <Prices prices={version.prices} />
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function addOnGives(version: AddOnVersionRow): string {
  if (version.kind === "module" && version.module)
    return `Gives ${MODULE_NAMES[version.module]}.`;
  if (version.kind === "limit_pack" && version.limitKey)
    return `Adds ${formatLimit(version.limitKey, version.amount)} to ${LIMIT_NAMES[version.limitKey].toLowerCase()}, for each one bought.`;
  return "A service: nothing changes in the schools.";
}

function Prices({ prices }: { prices: PlanVersionRow["prices"] }) {
  return (
    <p className="text-sm text-muted-foreground">
      {prices.length
        ? prices.map(formatPrice).join(" · ")
        : "No list price: each contract sets its own."}
    </p>
  );
}

/** A version's number and dates, and retiring it while it is sold. */
function VersionLine({
  kind,
  id,
  version,
  validFrom,
  retiredAt,
}: {
  kind: "plan" | "add_on";
  id: string;
  version: number;
  validFrom: string;
  retiredAt: Date | null;
}) {
  const router = useRouter();
  const send = useServerFn(retire);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Version {version}</span>
        <span className="text-muted-foreground">
          from {formatDay(validFrom)}
        </span>
        {retiredAt ? (
          <Badge variant="outline">Retired {formatWhen(retiredAt)}</Badge>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            Retire
          </Button>
        )}
      </div>
      {open && !retiredAt ? (
        <form
          aria-label={`Retire version ${version}`}
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              const out = await send({
                data: { kind, id, reason: reason.trim() },
              });
              if (out.ok) {
                toast.success("Retired. Contracts that hold it keep it.");
                setOpen(false);
                await router.invalidate();
              } else toast.error(out.message);
            } catch (error) {
              const said = failure(error, "The version could not be retired.");
              if (said) toast.error(said);
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="grid min-w-48 flex-1 gap-1 text-sm">
            <label htmlFor={`retire-${id}`} className="font-medium">
              Why
            </label>
            <Input
              id={`retire-${id}`}
              required
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: replaced by version 3"
            />
          </div>
          <Button type="submit" disabled={saving || !reason.trim()}>
            {saving ? "Retiring…" : "Retire this version"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/** The fields every version has: its names, when it is sold from, why. */
function useVersionBasics(from: { nameEn: string; nameAr: string } | null) {
  const [code, setCode] = useState("");
  const [nameEn, setNameEn] = useState(from?.nameEn ?? "");
  const [nameAr, setNameAr] = useState(from?.nameAr ?? "");
  const [validFrom, setValidFrom] = useState(businessToday());
  const [reason, setReason] = useState("");
  return {
    code,
    setCode,
    nameEn,
    setNameEn,
    nameAr,
    setNameAr,
    validFrom,
    setValidFrom,
    reason,
    setReason,
  };
}

function BasicsFields({
  prefix,
  basics,
  newOne,
}: {
  prefix: string;
  basics: ReturnType<typeof useVersionBasics>;
  newOne: boolean;
}) {
  return (
    <div className="grid items-start gap-4 sm:grid-cols-2">
      {newOne ? (
        <div className="grid gap-1.5 text-sm">
          <label htmlFor={`${prefix}-code`} className="font-medium">
            Code
          </label>
          <Input
            id={`${prefix}-code`}
            required
            dir="ltr"
            maxLength={40}
            value={basics.code}
            onChange={(event) => basics.setCode(event.target.value)}
            placeholder="standard"
          />
          <span className="text-xs text-muted-foreground">
            Lowercase letters, digits and underscores; never changes.
          </span>
        </div>
      ) : null}
      <div className="grid gap-1.5 text-sm">
        <label htmlFor={`${prefix}-valid`} className="font-medium">
          Sold from
        </label>
        <Input
          id={`${prefix}-valid`}
          type="date"
          required
          value={basics.validFrom}
          onChange={(event) => basics.setValidFrom(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5 text-sm">
        <label htmlFor={`${prefix}-name-en`} className="font-medium">
          Name in English
        </label>
        <Input
          id={`${prefix}-name-en`}
          required
          maxLength={80}
          value={basics.nameEn}
          onChange={(event) => basics.setNameEn(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5 text-sm">
        <label htmlFor={`${prefix}-name-ar`} className="font-medium">
          Name in Arabic
        </label>
        <Input
          id={`${prefix}-name-ar`}
          required
          dir="rtl"
          lang="ar"
          maxLength={80}
          value={basics.nameAr}
          onChange={(event) => basics.setNameAr(event.target.value)}
        />
      </div>
    </div>
  );
}

function ReasonField({
  prefix,
  basics,
}: {
  prefix: string;
  basics: ReturnType<typeof useVersionBasics>;
}) {
  return (
    <div className="grid gap-1.5 text-sm">
      <label htmlFor={`${prefix}-reason`} className="font-medium">
        Why
      </label>
      <Textarea
        id={`${prefix}-reason`}
        required
        maxLength={500}
        value={basics.reason}
        onChange={(event) => basics.setReason(event.target.value)}
        placeholder="For example: the price for the 2027 school year"
      />
    </div>
  );
}

/** A new plan, or a new version of one starting from its latest. */
function PlanForm({
  from,
  onDone,
}: {
  from: PlanVersionRow | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const save = useServerFn(savePlan);
  const basics = useVersionBasics(from);
  const [modules, setModules] = useState<ModuleId[]>(
    from?.modules ?? settableOf(BASIC_ENTITLEMENTS).modules,
  );
  const [limits, setLimits] = useState(() =>
    draftOf(pickLimits(from ?? settableOf(BASIC_ENTITLEMENTS))),
  );
  const [prices, setPrices] = useState(() =>
    (from?.prices ?? []).map(priceDraftOf),
  );
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const prefix = from ? `plan-${from.planId}` : "plan-new";
  return (
    <form
      aria-label={from ? `New version of ${from.nameEn}` : "New plan"}
      className="grid gap-6 rounded-lg border bg-muted/30 p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const priced = pricesOf(prices);
        if (!priced) {
          setAnswer("Give each price an amount, or remove it.");
          return;
        }
        setSaving(true);
        setAnswer(null);
        try {
          const out = await save({
            data: {
              planId: from?.planId,
              code: from?.code ?? basics.code,
              nameEn: basics.nameEn,
              nameAr: basics.nameAr,
              modules,
              limits: limitsOf(limits),
              prices: priced,
              validFrom: basics.validFrom,
              reason: basics.reason,
            },
          });
          if (out.ok) {
            toast.success(from ? "New version saved." : "Plan saved.");
            onDone();
            await router.invalidate();
          } else setAnswer(out.message);
        } catch (error) {
          setAnswer(failure(error, "The plan could not be saved."));
        } finally {
          setSaving(false);
        }
      }}
    >
      <h4 className="text-base font-semibold">
        {from ? `Version ${from.version + 1} of ${from.nameEn}` : "New plan"}
      </h4>
      <BasicsFields prefix={prefix} basics={basics} newOne={!from} />
      <ModuleFields prefix={prefix} modules={modules} onChange={setModules} />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <StorageFields prefix={prefix} draft={limits} onChange={setLimits} />
        <CountFields prefix={prefix} draft={limits} onChange={setLimits} />
      </div>
      <PriceFields prefix={prefix} drafts={prices} onChange={setPrices} />
      <ReasonField prefix={prefix} basics={basics} />
      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <span className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </span>
    </form>
  );
}

/** A new add-on, or a new version of one of the same kind. */
function AddOnForm({
  from,
  onDone,
}: {
  from: AddOnVersionRow | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const save = useServerFn(saveAddOn);
  const basics = useVersionBasics(from);
  const [kind, setKind] = useState<AddOnKind>(from?.kind ?? "module");
  const [module, setModule] = useState<ModuleId>(from?.module ?? "coding");
  const [limitKey, setLimitKey] = useState<LimitKey>(
    from?.limitKey ?? "poolBytes",
  );
  const [amount, setAmount] = useState(() =>
    from?.amount && from.limitKey
      ? String(isStorageKey(from.limitKey) ? from.amount / GIB : from.amount)
      : "",
  );
  const [prices, setPrices] = useState(() =>
    (from?.prices ?? []).map(priceDraftOf),
  );
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const prefix = from ? `add-on-${from.addOnId}` : "add-on-new";
  const storage = isStorageKey(limitKey);
  return (
    <form
      aria-label={from ? `New version of ${from.nameEn}` : "New add-on"}
      className="grid gap-6 rounded-lg border bg-muted/30 p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const priced = pricesOf(prices);
        if (!priced) {
          setAnswer("Give each price an amount, or remove it.");
          return;
        }
        const typed = Number(amount);
        const packed =
          kind === "limit_pack" && Number.isFinite(typed) && typed > 0
            ? Math.round(storage ? typed * GIB : typed)
            : null;
        if (kind === "limit_pack" && packed === null) {
          setAnswer("Say how much one pack adds.");
          return;
        }
        setSaving(true);
        setAnswer(null);
        try {
          const out = await save({
            data: {
              addOnId: from?.addOnId,
              code: from?.code ?? basics.code,
              nameEn: basics.nameEn,
              nameAr: basics.nameAr,
              kind,
              module: kind === "module" ? module : null,
              limitKey: kind === "limit_pack" ? limitKey : null,
              amount: packed,
              prices: priced,
              validFrom: basics.validFrom,
              reason: basics.reason,
            },
          });
          if (out.ok) {
            toast.success(from ? "New version saved." : "Add-on saved.");
            onDone();
            await router.invalidate();
          } else setAnswer(out.message);
        } catch (error) {
          setAnswer(failure(error, "The add-on could not be saved."));
        } finally {
          setSaving(false);
        }
      }}
    >
      <h4 className="text-base font-semibold">
        {from ? `Version ${from.version + 1} of ${from.nameEn}` : "New add-on"}
      </h4>
      <BasicsFields prefix={prefix} basics={basics} newOne={!from} />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 text-sm">
          <label htmlFor={`${prefix}-kind`} className="font-medium">
            Kind
          </label>
          <select
            id={`${prefix}-kind`}
            value={kind}
            disabled={Boolean(from)}
            onChange={(event) => setKind(event.target.value as AddOnKind)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {ADD_ON_KINDS.map((choice) => (
              <option key={choice} value={choice}>
                {KIND_NAMES[choice]}
              </option>
            ))}
          </select>
          {from ? (
            <span className="text-xs text-muted-foreground">
              A new version keeps its kind.
            </span>
          ) : null}
        </div>
        {kind === "module" ? (
          <div className="grid gap-1.5 text-sm">
            <label htmlFor={`${prefix}-module`} className="font-medium">
              Module
            </label>
            <select
              id={`${prefix}-module`}
              value={module}
              onChange={(event) => setModule(event.target.value as ModuleId)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {MODULE_IDS.map((choice) => (
                <option key={choice} value={choice}>
                  {MODULE_NAMES[choice]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {kind === "limit_pack" ? (
          <>
            <div className="grid gap-1.5 text-sm">
              <label htmlFor={`${prefix}-limit`} className="font-medium">
                Limit
              </label>
              <select
                id={`${prefix}-limit`}
                value={limitKey}
                onChange={(event) =>
                  setLimitKey(event.target.value as LimitKey)
                }
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {LIMIT_KEYS.map((choice) => (
                  <option key={choice} value={choice}>
                    {LIMIT_NAMES[choice]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5 text-sm">
              <label htmlFor={`${prefix}-amount`} className="font-medium">
                One pack adds{storage ? " (GB)" : ""}
              </label>
              <Input
                id={`${prefix}-amount`}
                inputMode={storage ? "decimal" : "numeric"}
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </>
        ) : null}
      </div>
      <PriceFields prefix={prefix} drafts={prices} onChange={setPrices} />
      <ReasonField prefix={prefix} basics={basics} />
      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <span className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </span>
    </form>
  );
}
