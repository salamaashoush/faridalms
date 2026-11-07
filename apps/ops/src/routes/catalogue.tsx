import type {
  AddOnVersionRow,
  PlanVersionRow,
} from "@faridalms/database/business/catalogue";
import type { ModuleId } from "@faridalms/domain/modules";
import type { AddOnKind, LimitKey } from "@faridalms/domain/subscriptions";
import type { ReactNode } from "react";

import { MODULE_IDS } from "@faridalms/domain/modules";
import { BASIC_ENTITLEMENTS, settableOf } from "@faridalms/domain/plans";
import {
  ADD_ON_KINDS,
  businessToday,
  LIMIT_KEYS,
  pickLimits,
} from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import {
  Fact,
  Facts,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
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
import { ReasonSheet } from "../components/ReasonSheet";
import { WhyField } from "../components/Why";
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

interface VersionCardProps {
  name: string;
  detail: string;
  onNewVersion: () => void;
  children: ReactNode;
}

/** A plan or add-on, its latest name and the versions sold under it. */
function VersionCard({
  name,
  detail,
  onNewVersion,
  children,
}: VersionCardProps) {
  return (
    <article aria-label={name} className="grid gap-1 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h3 className="text-sm leading-5 font-semibold">{name}</h3>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {detail}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNewVersion}
        >
          New version
        </Button>
      </div>
      <RecordList>{children}</RecordList>
    </article>
  );
}

/**
 * The plans and add-ons the business sells. A version never changes: a new
 * price, module or limit is a new version, and a contract keeps the version
 * it bought. A retired version is no longer sold.
 */
function Catalogue() {
  const { plans, addOns } = Route.useLoaderData();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [opened, setOpened] = useState(0);
  const edit = (next: Editing) => {
    setOpened((count) => count + 1);
    setEditing(next);
  };
  const done = () => setEditing(null);
  return (
    <Page width="list">
      <PageHeader
        title="Catalogue"
        description="A version never changes: a new price, module or limit is a new version, and a contract keeps the version it bought."
      />
      <div className="grid gap-6">
        <RecordSection
          title="Plans"
          action={
            <Button
              type="button"
              variant="ghost"
              onClick={() => edit({ kind: "plan", from: null })}
            >
              <Plus aria-hidden />
              New plan
            </Button>
          }
        >
          {plans.length === 0 ? (
            <RecordEmpty>No plans yet.</RecordEmpty>
          ) : (
            <div className="grid gap-3">
              {grouped(plans, (plan) => plan.planId).map((versions) => {
                const [latest] = versions;
                if (!latest) return null;
                return (
                  <VersionCard
                    key={latest.planId}
                    name={latest.nameEn}
                    detail={`${latest.nameAr} · ${latest.code}`}
                    onNewVersion={() => edit({ kind: "plan", from: latest })}
                  >
                    {versions.map((version) => (
                      <li key={version.id} className="grid gap-3 py-3">
                        <VersionLine
                          kind="plan"
                          id={version.id}
                          version={version.version}
                          validFrom={version.validFrom}
                          retiredAt={version.retiredAt}
                        />
                        <span className="flex flex-wrap gap-1.5">
                          {version.modules.map((module) => (
                            <StatusBadge key={module} tone="neutral">
                              {MODULE_NAMES[module]}
                            </StatusBadge>
                          ))}
                        </span>
                        <Facts short>
                          {LIMIT_KEYS.map((key) => (
                            <Fact key={key} label={LIMIT_NAMES[key]}>
                              {formatLimit(key, version[key])}
                            </Fact>
                          ))}
                        </Facts>
                        <Prices prices={version.prices} />
                      </li>
                    ))}
                  </VersionCard>
                );
              })}
            </div>
          )}
        </RecordSection>
        <RecordSection
          title="Add-ons"
          action={
            <Button
              type="button"
              variant="ghost"
              onClick={() => edit({ kind: "add_on", from: null })}
            >
              <Plus aria-hidden />
              New add-on
            </Button>
          }
        >
          {addOns.length === 0 ? (
            <RecordEmpty>No add-ons yet.</RecordEmpty>
          ) : (
            <div className="grid gap-3">
              {grouped(addOns, (addOn) => addOn.addOnId).map((versions) => {
                const [latest] = versions;
                if (!latest) return null;
                return (
                  <VersionCard
                    key={latest.addOnId}
                    name={latest.nameEn}
                    detail={`${latest.nameAr} · ${latest.code} · ${KIND_NAMES[latest.kind]}`}
                    onNewVersion={() => edit({ kind: "add_on", from: latest })}
                  >
                    {versions.map((version) => (
                      <li key={version.id} className="grid gap-2 py-3">
                        <VersionLine
                          kind="add_on"
                          id={version.id}
                          version={version.version}
                          validFrom={version.validFrom}
                          retiredAt={version.retiredAt}
                        />
                        <p className="text-sm leading-5">
                          {addOnGives(version)}
                        </p>
                        <Prices prices={version.prices} />
                      </li>
                    ))}
                  </VersionCard>
                );
              })}
            </div>
          )}
        </RecordSection>
      </div>
      {editing?.kind === "plan" ? (
        <PlanForm key={opened} from={editing.from} onDone={done} />
      ) : null}
      {editing?.kind === "add_on" ? (
        <AddOnForm key={opened} from={editing.from} onDone={done} />
      ) : null}
    </Page>
  );
}

function addOnGives(version: AddOnVersionRow): string {
  if (version.kind === "module" && version.module)
    return `Gives ${MODULE_NAMES[version.module]}.`;
  if (version.kind === "limit_pack" && version.limitKey)
    return `Adds ${formatLimit(version.limitKey, version.amount)} to ${LIMIT_NAMES[version.limitKey].toLowerCase()}, for each one bought.`;
  return "A service: nothing changes in the schools.";
}

interface PricesProps {
  prices: PlanVersionRow["prices"];
}

function Prices({ prices }: PricesProps) {
  return (
    <p className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
      {prices.length
        ? prices.map(formatPrice).join(" · ")
        : "No list price: each contract sets its own."}
    </p>
  );
}

interface VersionLineProps {
  kind: "plan" | "add_on";
  id: string;
  version: number;
  validFrom: string;
  retiredAt: Date | null;
}

/** A version's number and dates, and retiring it while it is sold. */
function VersionLine({
  kind,
  id,
  version,
  validFrom,
  retiredAt,
}: VersionLineProps) {
  const router = useRouter();
  const send = useServerFn(retire);
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-sm leading-5 font-medium">Version {version}</span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          from {formatDay(validFrom)}
        </span>
        {retiredAt ? (
          <StatusText tone="neutral">
            Retired {formatWhen(retiredAt)}
          </StatusText>
        ) : (
          <StatusText tone="success">Sold</StatusText>
        )}
      </span>
      {retiredAt ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
        >
          Retire
        </Button>
      )}
      <ReasonSheet
        open={open}
        onOpenChange={setOpen}
        title={`Retire version ${version}`}
        submitLabel="Retire this version"
        destructive
        placeholder="For example: replaced by version 3"
        onSubmit={async (reason) => {
          const failed = await attempt(
            () => send({ data: { kind, id, reason } }),
            "The version could not be retired.",
          );
          if (failed) return failed;
          toast.success("Retired. Contracts that hold it keep it.");
          await router.invalidate();
          return null;
        }}
      />
    </div>
  );
}

/** The names a version starts from. */
interface Named {
  nameEn: string;
  nameAr: string;
}

/** The fields every version has: its names, when it is sold from, why. */
function useVersionBasics(from: Named | null) {
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

type VersionBasics = ReturnType<typeof useVersionBasics>;

interface BasicsFieldsProps {
  basics: VersionBasics;
  newOne: boolean;
  submitted: boolean;
}

function BasicsFields({ basics, newOne, submitted }: BasicsFieldsProps) {
  const missing = (value: string) => submitted && !value.trim();
  return (
    <>
      {newOne ? (
        <TextField
          label="Code"
          hint="Lowercase letters, digits and underscores; never changes."
          dir="ltr"
          width="reference"
          maxLength={40}
          value={basics.code}
          placeholder="standard"
          errors={missing(basics.code) ? ["Give it a code."] : undefined}
          onChange={(event) => basics.setCode(event.target.value)}
        />
      ) : null}
      <TextField
        label="Name in English"
        maxLength={80}
        value={basics.nameEn}
        errors={missing(basics.nameEn) ? ["Name it in English."] : undefined}
        onChange={(event) => basics.setNameEn(event.target.value)}
      />
      <TextField
        label="Name in Arabic"
        dir="rtl"
        lang="ar"
        maxLength={80}
        value={basics.nameAr}
        errors={missing(basics.nameAr) ? ["Name it in Arabic."] : undefined}
        onChange={(event) => basics.setNameAr(event.target.value)}
      />
      <TextField
        label="Sold from"
        type="date"
        width="date"
        value={basics.validFrom}
        onChange={(event) => basics.setValidFrom(event.target.value)}
      />
    </>
  );
}

const basicsMissing = (basics: VersionBasics, newOne: boolean) =>
  (newOne && !basics.code.trim()) ||
  !basics.nameEn.trim() ||
  !basics.nameAr.trim() ||
  !basics.reason.trim();

interface VersionFormProps<T> {
  from: T | null;
  onDone: () => void;
}

/** A new plan, or a new version of one starting from its latest. */
function PlanForm({ from, onDone }: VersionFormProps<PlanVersionRow>) {
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
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onDone();
      }}
      title={from ? `New version of ${from.nameEn}` : "New plan"}
      pending={saving}
      error={answer}
      onSubmit={async () => {
        setSubmitted(true);
        const priced = pricesOf(prices);
        if (!priced) {
          setAnswer("Give each price an amount, or remove it.");
          return;
        }
        if (basicsMissing(basics, !from)) return;
        setSaving(true);
        setAnswer(null);
        const failed = await attempt(
          () =>
            save({
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
            }),
          "The plan could not be saved.",
        );
        setSaving(false);
        if (failed) {
          setAnswer(failed);
          return;
        }
        toast.success(from ? "New version saved." : "Plan saved.");
        onDone();
        await router.invalidate();
      }}
    >
      {from ? (
        <p className="text-sm leading-5 text-muted-foreground">
          Version {from.version + 1}, starting from version {from.version}.
        </p>
      ) : null}
      <BasicsFields basics={basics} newOne={!from} submitted={submitted} />
      <ModuleFields modules={modules} onChange={setModules} />
      <StorageFields draft={limits} onChange={setLimits} />
      <CountFields draft={limits} onChange={setLimits} />
      <PriceFields drafts={prices} onChange={setPrices} />
      <WhyField
        value={basics.reason}
        onChange={basics.setReason}
        submitted={submitted}
        placeholder="For example: the price for the 2027 school year"
      />
    </SheetForm>
  );
}

const KIND_OPTIONS = ADD_ON_KINDS.map((choice) => ({
  value: choice,
  label: KIND_NAMES[choice],
}));

const MODULE_OPTIONS = MODULE_IDS.map((choice) => ({
  value: choice,
  label: MODULE_NAMES[choice],
}));

const LIMIT_OPTIONS = LIMIT_KEYS.map((choice) => ({
  value: choice,
  label: LIMIT_NAMES[choice],
}));

/** A new add-on, or a new version of one of the same kind. */
function AddOnForm({ from, onDone }: VersionFormProps<AddOnVersionRow>) {
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
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const storage = isStorageKey(limitKey);
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onDone();
      }}
      title={from ? `New version of ${from.nameEn}` : "New add-on"}
      pending={saving}
      error={answer}
      onSubmit={async () => {
        setSubmitted(true);
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
        if (basicsMissing(basics, !from)) return;
        setSaving(true);
        setAnswer(null);
        const failed = await attempt(
          () =>
            save({
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
            }),
          "The add-on could not be saved.",
        );
        setSaving(false);
        if (failed) {
          setAnswer(failed);
          return;
        }
        toast.success(from ? "New version saved." : "Add-on saved.");
        onDone();
        await router.invalidate();
      }}
    >
      <BasicsFields basics={basics} newOne={!from} submitted={submitted} />
      <SelectField
        label="Kind"
        hint={from ? "A new version keeps its kind." : undefined}
        value={kind}
        disabled={Boolean(from)}
        options={KIND_OPTIONS}
        onChange={setKind}
      />
      {kind === "module" ? (
        <SelectField
          label="Module"
          value={module}
          options={MODULE_OPTIONS}
          onChange={setModule}
        />
      ) : null}
      {kind === "limit_pack" ? (
        <>
          <SelectField
            label="Limit"
            value={limitKey}
            options={LIMIT_OPTIONS}
            onChange={setLimitKey}
          />
          <TextField
            label={`One pack adds${storage ? " (GB)" : ""}`}
            inputMode={storage ? "decimal" : "numeric"}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </>
      ) : null}
      <PriceFields drafts={prices} onChange={setPrices} />
      <WhyField
        value={basics.reason}
        onChange={basics.setReason}
        submitted={submitted}
        placeholder="For example: the price for the 2027 school year"
      />
    </SheetForm>
  );
}
