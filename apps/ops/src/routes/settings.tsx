import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { Tone } from "@faridalms/ui/system/status";

import { rateOn } from "@faridalms/domain/business";
import { businessToday } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import { DataTable } from "@faridalms/ui/system/data-table";
import {
  ChoiceField,
  FormField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import {
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusBadge } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Percent, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { attempt, attemptWith } from "../actions";
import { EventList } from "../components/EventList";
import { WhyField } from "../components/Why";
import { COUNTRY_OPTIONS, formatCountry, formatDay } from "../format";
import { addRate, getSettings, saveBusinessProfile } from "../server/settings";

export const Route = createFileRoute("/settings")({
  loader: () => getSettings(),
  component: Settings,
});

type Data = Awaited<ReturnType<typeof getSettings>>;

interface SettingsProps {
  data: Data;
}

/**
 * The business's own legal details and the VAT its customers are charged,
 * as every quote and invoice prints them, and who changed either and why.
 */
function Settings() {
  const data = Route.useLoaderData();
  return (
    <Page width="form">
      <PageHeader
        title="Settings"
        description="The business as its quotes and invoices print it."
      />
      <SettingsPage>
        <Profile data={data} key={data.profile?.version ?? 0} />
        <Rates data={data} />
        {data.events.length ? (
          <SettingsSection title="History">
            <EventList events={data.events} names={data.names} />
          </SettingsSection>
        ) : null}
      </SettingsPage>
    </Page>
  );
}

interface ProfileFields {
  legalNameEn: string;
  legalNameAr: string;
  addressEn: string;
  addressAr: string;
  taxNumber: string;
  commercialRegistry: string;
  email: string;
  phone: string;
  website: string;
  bankDetailsEn: string;
  bankDetailsAr: string;
}

/** What a required field says when it is left empty. */
const REQUIRED: Partial<Record<keyof ProfileFields, string>> = {
  legalNameEn: "Enter the legal name in English.",
  legalNameAr: "Enter the legal name in Arabic.",
  addressEn: "Enter the address in English.",
  addressAr: "Enter the address in Arabic.",
  taxNumber: "Enter the tax registration number.",
  email: "Enter the email address invoices give.",
};

const emailSchema = v.pipe(v.string(), v.trim(), v.email());

function profileIssue(
  fields: ProfileFields,
  key: keyof ProfileFields,
): string | null {
  const required = REQUIRED[key];
  if (required && !fields[key].trim()) return required;
  if (key === "email" && !v.is(emailSchema, fields.email))
    return "Enter an email address such as billing@example.com.";
  return null;
}

const CHECKED = Object.keys(REQUIRED) as (keyof ProfileFields)[];

function Profile({ data }: SettingsProps) {
  const router = useRouter();
  const save = useServerFn(saveBusinessProfile);
  const held = data.profile;
  const initial: ProfileFields = {
    legalNameEn: held?.legalNameEn ?? "",
    legalNameAr: held?.legalNameAr ?? "",
    addressEn: held?.addressEn ?? "",
    addressAr: held?.addressAr ?? "",
    taxNumber: held?.taxNumber ?? "",
    commercialRegistry: held?.commercialRegistry ?? "",
    email: held?.email ?? "",
    phone: held?.phone ?? "",
    website: held?.website ?? "",
    bankDetailsEn: held?.bankDetailsEn ?? "",
    bankDetailsAr: held?.bankDetailsAr ?? "",
  };
  const [fields, setFields] = useState<ProfileFields>(initial);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (key: keyof ProfileFields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  const issue = (key: keyof ProfileFields) => {
    const found = submitted ? profileIssue(fields, key) : null;
    return found ? [found] : undefined;
  };
  const area = (
    key: "addressEn" | "addressAr" | "bankDetailsEn" | "bankDetailsAr",
    label: string,
    options: { arabic: boolean; optional: boolean; max: number; hint?: string },
  ) => (
    <FormField
      label={label}
      optional={options.optional}
      hint={options.hint}
      errors={issue(key)}
    >
      {(control) => (
        <Textarea
          {...control}
          dir={options.arabic ? "rtl" : "auto"}
          lang={options.arabic ? "ar" : undefined}
          maxLength={options.max}
          value={fields[key]}
          onChange={(event) => set(key, event.target.value)}
        />
      )}
    </FormField>
  );
  return (
    <SettingsSection
      title="Legal details"
      description={
        held
          ? "Printed at the top of every quote and invoice."
          : "Printed at the top of every quote and invoice; none can be issued until these are saved."
      }
      submitLabel="Save legal details"
      pending={pending}
      error={error}
      saved={saved}
      isDirty={() =>
        Boolean(reason) ||
        (Object.keys(fields) as (keyof ProfileFields)[]).some(
          (key) => fields[key] !== initial[key],
        )
      }
      onSubmit={async () => {
        setSubmitted(true);
        setSaved(false);
        if (CHECKED.some((key) => profileIssue(fields, key)) || !reason.trim())
          return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () =>
            save({
              data: {
                ...fields,
                reason,
                expectedVersion: held?.version ?? null,
              },
            }),
          "The legal details could not be saved.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Legal details saved.");
        setReason("");
        setSubmitted(false);
        setSaved(true);
        await router.invalidate();
      }}
    >
      <SettingsGroup title="Name and address">
        <div className="grid items-start gap-6 @md:grid-cols-2">
          <TextField
            label="Legal name in English"
            maxLength={200}
            value={fields.legalNameEn}
            errors={issue("legalNameEn")}
            onChange={(event) => set("legalNameEn", event.target.value)}
          />
          <TextField
            label="Legal name in Arabic"
            dir="rtl"
            lang="ar"
            maxLength={200}
            value={fields.legalNameAr}
            errors={issue("legalNameAr")}
            onChange={(event) => set("legalNameAr", event.target.value)}
          />
          {area("addressEn", "Address in English", {
            arabic: false,
            optional: false,
            max: 500,
          })}
          {area("addressAr", "Address in Arabic", {
            arabic: true,
            optional: false,
            max: 500,
          })}
        </div>
      </SettingsGroup>
      <SettingsGroup title="Registration">
        <div className="grid items-start gap-6 @md:grid-cols-2">
          <TextField
            label="Tax registration number"
            dir="ltr"
            maxLength={40}
            value={fields.taxNumber}
            errors={issue("taxNumber")}
            onChange={(event) => set("taxNumber", event.target.value)}
          />
          <TextField
            label="Commercial registry"
            optional
            dir="ltr"
            maxLength={40}
            value={fields.commercialRegistry}
            onChange={(event) => set("commercialRegistry", event.target.value)}
          />
        </div>
      </SettingsGroup>
      <SettingsGroup title="Contact">
        <div className="grid items-start gap-6 @md:grid-cols-2">
          <TextField
            label="Email"
            type="email"
            dir="ltr"
            maxLength={200}
            value={fields.email}
            errors={issue("email")}
            onChange={(event) => set("email", event.target.value)}
          />
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
            label="Website"
            optional
            dir="ltr"
            maxLength={200}
            value={fields.website}
            onChange={(event) => set("website", event.target.value)}
          />
        </div>
      </SettingsGroup>
      <SettingsGroup title="Bank details">
        <div className="grid items-start gap-6 @md:grid-cols-2">
          {area("bankDetailsEn", "Bank details in English", {
            arabic: false,
            optional: true,
            max: 1000,
            hint: "Bank, account name, IBAN and SWIFT, as transfers need them.",
          })}
          {area("bankDetailsAr", "Bank details in Arabic", {
            arabic: true,
            optional: true,
            max: 1000,
          })}
        </div>
      </SettingsGroup>
      <WhyField value={reason} onChange={setReason} submitted={submitted} />
    </SettingsSection>
  );
}

type Rate = Data["rates"][number];

/** Where a rate stands today: charged now, waiting for its day, or followed by another. */
type Standing = "current" | "later" | "replaced";

interface RateRow extends Rate {
  standing: Standing;
}

const STANDING_NAMES: Record<Standing, string> = {
  current: "In force",
  later: "Scheduled",
  replaced: "Replaced",
};

const STANDING_TONE: Record<Standing, Tone> = {
  current: "success",
  later: "info",
  replaced: "neutral",
};

/** Each rate with where it stands today, by country name, newest first. */
function rateRows(rates: readonly Rate[], today: string): RateRow[] {
  return rates
    .map((rate) => ({
      ...rate,
      standing:
        rate.validFrom > today
          ? ("later" as const)
          : rateOn(rates, rate.country, today)?.id === rate.id
            ? ("current" as const)
            : ("replaced" as const),
    }))
    .toSorted(
      (a, b) =>
        formatCountry(a.country).localeCompare(
          formatCountry(b.country),
          "en",
        ) || b.validFrom.localeCompare(a.validFrom),
    );
}

const percentOf = (rate: Rate) => `${Number(rate.percent)}%`;

const RATE_COLUMNS: Column<RateRow>[] = [
  {
    id: "country",
    header: "Country",
    primary: true,
    cell: (rate) => (
      <span className="grid min-w-0 py-2">
        <span className="truncate font-medium">
          {formatCountry(rate.country)}
        </span>
        <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
          {rate.nameEn} ·{" "}
          <span dir="rtl" lang="ar">
            {rate.nameAr}
          </span>
          {rate.reverseCharge ? " · reverse charge" : ""}
        </span>
      </span>
    ),
  },
  {
    id: "rate",
    header: "Rate",
    align: "end",
    cell: percentOf,
  },
  { id: "from", header: "From", cell: (rate) => formatDay(rate.validFrom) },
  {
    id: "standing",
    header: "Status",
    cell: (rate) => (
      <StatusBadge tone={STANDING_TONE[rate.standing]}>
        {STANDING_NAMES[rate.standing]}
      </StatusBadge>
    ),
  },
];

const RATE_CARD: DataTableCard<RateRow> = {
  title: (rate) => `${formatCountry(rate.country)} · ${percentOf(rate)}`,
  status: (rate) => (
    <StatusBadge tone={STANDING_TONE[rate.standing]}>
      {STANDING_NAMES[rate.standing]}
    </StatusBadge>
  ),
  fact: (rate) => `From ${formatDay(rate.validFrom)}`,
};

/** A country's rate as a new one starts from: its names and who accounts for it. */
interface RateStart {
  country: string;
  nameEn: string;
  nameAr: string;
  reverseCharge: boolean;
}

const NEW_RATE: RateStart = {
  country: "EG",
  nameEn: "VAT",
  nameAr: "ضريبة القيمة المضافة",
  reverseCharge: false,
};

/** The VAT each customer's country is charged, from a day. */
function Rates({ data }: SettingsProps) {
  const adding = useSheet();
  const [start, setStart] = useState<RateStart | null>(null);
  const rows = rateRows(data.rates, businessToday());
  const add = (from: RateStart | null) => {
    setStart(from);
    adding.show();
  };
  return (
    <SettingsSection
      title="VAT rates"
      description="Charged by the customer's country from the day given; a later rate replaces the one before. A country with no rate is charged none, and its quotes say so."
    >
      <DataTable
        caption="VAT rates"
        rows={rows}
        columns={RATE_COLUMNS}
        rowLabel={(rate) =>
          `${formatCountry(rate.country)} from ${formatDay(rate.validFrom)}`
        }
        rowActions={(rate) =>
          rate.standing === "replaced"
            ? []
            : [
                {
                  label: "Change rate",
                  icon: Pencil,
                  inline: true,
                  onSelect: () => add(rate),
                },
              ]
        }
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:h-10"
            onClick={() => add(null)}
          >
            <Plus aria-hidden />
            Add rate
          </Button>
        }
        card={RATE_CARD}
        empty={{
          icon: Percent,
          title: "Set the VAT you charge",
          description:
            "Until a country has a rate its customers are charged none, and their quotes say so.",
          action: (
            <Button
              type="button"
              className="max-md:h-10"
              onClick={() => add(null)}
            >
              <Plus aria-hidden />
              Add rate
            </Button>
          ),
        }}
      />
      <AddRateSheet
        key={adding.key}
        open={adding.open}
        onOpenChange={adding.onOpenChange}
        start={start}
      />
    </SettingsSection>
  );
}

const WHO_ACCOUNTS = [
  { value: "us", label: "We do", hint: "The VAT is added to its invoices." },
  {
    value: "customer",
    label: "The customer (reverse charge)",
    hint: "A registered business abroad accounts for it; invoices say so.",
  },
] as const;

interface RateFields {
  country: string;
  percent: string;
  nameEn: string;
  nameAr: string;
  validFrom: string;
}

const percentIssue = (value: string): string | null => {
  if (!value) return "Enter the rate, such as 14.";
  const percent = Number(value);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100
    ? null
    : "Enter a rate from 0 to 100.";
};

/** What each field of a rate says when it is wrong, or null when it is fine. */
const RATE_CHECKS: Record<keyof RateFields, (value: string) => string | null> =
  {
    country: (value) => (value ? null : "Choose the country."),
    percent: percentIssue,
    nameEn: (value) =>
      value ? null : "Enter how invoices in English name the tax.",
    nameAr: (value) =>
      value ? null : "Enter how invoices in Arabic name the tax.",
    validFrom: (value) => (value ? null : "Enter the day it starts."),
  };

function rateIssue(fields: RateFields, key: keyof RateFields): string | null {
  return RATE_CHECKS[key](fields[key].trim());
}

const RATE_KEYS: (keyof RateFields)[] = [
  "country",
  "percent",
  "nameEn",
  "nameAr",
  "validFrom",
];

interface AddRateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The country whose rate changes, or null for a rate from scratch. */
  start: RateStart | null;
}

/** Sets a country's VAT from a day, with why. */
function AddRateSheet({ open, onOpenChange, start }: AddRateSheetProps) {
  const router = useRouter();
  const add = useServerFn(addRate);
  const from = start ?? NEW_RATE;
  const [fields, setFields] = useState<RateFields>({
    country: from.country,
    percent: "",
    nameEn: from.nameEn,
    nameAr: from.nameAr,
    validFrom: businessToday(),
  });
  const [who, setWho] = useState<"us" | "customer">(
    from.reverseCharge ? "customer" : "us",
  );
  const [countrySearch, setCountrySearch] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState<string | null>(null);
  const set = (key: keyof RateFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    if (key === "country" || key === "validFrom") setTaken(null);
  };
  const issue = (key: keyof RateFields) => {
    const found = submitted ? rateIssue(fields, key) : null;
    return found ? [found] : undefined;
  };
  const needle = countrySearch.trim().toLowerCase();
  const countries = needle
    ? COUNTRY_OPTIONS.filter(
        (option) =>
          option.label.toLowerCase().includes(needle) ||
          option.value.toLowerCase() === needle,
      )
    : COUNTRY_OPTIONS;
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={
        start ? `Change ${formatCountry(start.country)}'s rate` : "Add a rate"
      }
      submitLabel="Add rate"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (RATE_KEYS.some((key) => rateIssue(fields, key)) || !reason.trim())
          return;
        setPending(true);
        setError(null);
        setTaken(null);
        const answer = await attemptWith(
          () =>
            add({
              data: {
                ...fields,
                reason,
                percent: Number(fields.percent),
                reverseCharge: who === "customer",
              },
            }),
          "The rate could not be added.",
        );
        setPending(false);
        if (answer.ok) {
          toast.success("Rate added.");
          onOpenChange(false);
          await router.invalidate();
        } else if (answer.field === "validFrom") setTaken(answer.message);
        else setError(answer.message);
      }}
    >
      {start ? null : (
        <ComboboxField
          label="Country"
          options={countries}
          value={fields.country ? [fields.country] : []}
          onChange={(value) => set("country", value[0] ?? "")}
          search={countrySearch}
          onSearchChange={setCountrySearch}
          errors={issue("country")}
        />
      )}
      <div className="grid items-start gap-6 sm:grid-cols-2">
        <TextField
          label="Percentage"
          inputMode="decimal"
          dir="ltr"
          width="score"
          value={fields.percent}
          errors={issue("percent")}
          onChange={(event) => set("percent", event.target.value)}
        />
        <TextField
          label="From"
          type="date"
          value={fields.validFrom}
          errors={taken ? [taken] : issue("validFrom")}
          onChange={(event) => set("validFrom", event.target.value)}
        />
      </div>
      <div className="grid items-start gap-6 sm:grid-cols-2">
        <TextField
          label="Printed in English as"
          maxLength={60}
          value={fields.nameEn}
          errors={issue("nameEn")}
          onChange={(event) => set("nameEn", event.target.value)}
        />
        <TextField
          label="Printed in Arabic as"
          dir="rtl"
          lang="ar"
          maxLength={60}
          value={fields.nameAr}
          errors={issue("nameAr")}
          onChange={(event) => set("nameAr", event.target.value)}
        />
      </div>
      <ChoiceField
        label="Who accounts for it"
        value={who}
        options={WHO_ACCOUNTS}
        onChange={setWho}
      />
      <WhyField value={reason} onChange={setReason} submitted={submitted} />
    </SheetForm>
  );
}
