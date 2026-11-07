import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";

import { businessToday } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { DataTable } from "@faridalms/ui/system/data-table";
import {
  ChoiceField,
  FormField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordEmpty, RecordSection } from "@faridalms/ui/system/record-page";
import {
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Percent, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import { WhyField } from "../components/Why";
import { formatDay } from "../format";
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
 * as every quote and invoice prints them.
 */
function Settings() {
  const data = Route.useLoaderData();
  return (
    <Page width="form">
      <PageHeader
        title="Settings"
        description="As every quote and invoice prints them."
      />
      <SettingsPage>
        <Profile data={data} key={data.profile?.version ?? 0} />
        <Rates data={data} />
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

const REQUIRED: (keyof ProfileFields)[] = [
  "legalNameEn",
  "legalNameAr",
  "addressEn",
  "addressAr",
  "taxNumber",
  "email",
];

function Profile({ data }: SettingsProps) {
  const router = useRouter();
  const save = useServerFn(saveBusinessProfile);
  const held = data.profile;
  const [fields, setFields] = useState<ProfileFields>({
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
  });
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (key: keyof ProfileFields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  const missing = (key: keyof ProfileFields) =>
    submitted && !fields[key].trim() ? ["Fill this in."] : undefined;
  const area = (
    key: "addressEn" | "addressAr" | "bankDetailsEn" | "bankDetailsAr",
    label: string,
    arabic: boolean,
    optional: boolean,
    placeholder?: string,
  ) => (
    <FormField label={label} optional={optional} errors={missing(key)}>
      {(control) => (
        <Textarea
          {...control}
          dir={arabic ? "rtl" : undefined}
          lang={arabic ? "ar" : undefined}
          value={fields[key]}
          placeholder={placeholder}
          onChange={(event) => set(key, event.target.value)}
        />
      )}
    </FormField>
  );
  return (
    <SettingsSection
      title="Legal details"
      description="The business as its quotes and invoices name it."
      submitLabel="Save legal details"
      pending={pending}
      error={error}
      saved={saved}
      isDirty={() => Boolean(reason)}
      onSubmit={async () => {
        setSubmitted(true);
        setSaved(false);
        if (REQUIRED.some((key) => !fields[key].trim()) || !reason.trim())
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
          "They could not be saved.",
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
            value={fields.legalNameEn}
            errors={missing("legalNameEn")}
            onChange={(event) => set("legalNameEn", event.target.value)}
          />
          <TextField
            label="Legal name in Arabic"
            dir="rtl"
            lang="ar"
            value={fields.legalNameAr}
            errors={missing("legalNameAr")}
            onChange={(event) => set("legalNameAr", event.target.value)}
          />
          {area("addressEn", "Address in English", false, false)}
          {area("addressAr", "Address in Arabic", true, false)}
        </div>
      </SettingsGroup>
      <SettingsGroup title="Registration and contact">
        <div className="grid items-start gap-6 @md:grid-cols-2">
          <TextField
            label="Tax registration number"
            dir="ltr"
            value={fields.taxNumber}
            errors={missing("taxNumber")}
            onChange={(event) => set("taxNumber", event.target.value)}
          />
          <TextField
            label="Commercial registry"
            optional
            dir="ltr"
            value={fields.commercialRegistry}
            onChange={(event) => set("commercialRegistry", event.target.value)}
          />
          <TextField
            label="Email"
            type="email"
            dir="ltr"
            value={fields.email}
            errors={missing("email")}
            onChange={(event) => set("email", event.target.value)}
          />
          <TextField
            label="Phone"
            optional
            type="tel"
            dir="ltr"
            width="phone"
            value={fields.phone}
            onChange={(event) => set("phone", event.target.value)}
          />
          <TextField
            label="Website"
            optional
            dir="ltr"
            value={fields.website}
            onChange={(event) => set("website", event.target.value)}
          />
        </div>
      </SettingsGroup>
      <SettingsGroup title="Bank">
        <div className="grid items-start gap-6 @md:grid-cols-2">
          {area(
            "bankDetailsEn",
            "Bank details in English",
            false,
            true,
            "Bank, account name, IBAN, SWIFT",
          )}
          {area("bankDetailsAr", "Bank details in Arabic", true, true)}
        </div>
      </SettingsGroup>
      <WhyField value={reason} onChange={setReason} submitted={submitted} />
    </SettingsSection>
  );
}

interface RateFields {
  country: string;
  percent: string;
  nameEn: string;
  nameAr: string;
  validFrom: string;
}

type Rate = SettingsProps["data"]["rates"][number];

const RATE_COLUMNS: Column<Rate>[] = [
  {
    id: "country",
    header: "Country",
    primary: true,
    cell: (rate) => <span className="font-medium">{rate.country}</span>,
  },
  {
    id: "rate",
    header: "Rate",
    align: "end",
    cell: (rate) => `${Number(rate.percent)}%`,
  },
  {
    id: "name",
    header: "Printed as",
    cell: (rate) => (
      <span>
        {rate.nameEn} ·{" "}
        <span dir="rtl" lang="ar">
          {rate.nameAr}
        </span>
      </span>
    ),
  },
  {
    id: "who",
    header: "Accounted for by",
    cell: (rate) =>
      rate.reverseCharge ? "The customer (reverse charge)" : "Us",
  },
  { id: "from", header: "From", cell: (rate) => formatDay(rate.validFrom) },
];

const RATE_CARD: DataTableCard<Rate> = {
  title: (rate) => `${rate.country} · ${Number(rate.percent)}%`,
  fact: (rate) => `From ${formatDay(rate.validFrom)}`,
};

/** The VAT each customer's country is charged, from a day. */
function Rates({ data }: SettingsProps) {
  const adding = useSheet();
  return (
    <RecordSection
      title="VAT"
      description="By the customer's country, from a day. A new rate takes over from the one before; a country with none is charged none, and its quotes say so."
      action={
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={adding.show}
        >
          <Plus aria-hidden />
          Add rate
        </Button>
      }
    >
      {data.rates.length ? (
        <DataTable
          caption="VAT rates"
          rows={data.rates}
          columns={RATE_COLUMNS}
          rowLabel={(rate) => `${rate.country} from ${rate.validFrom}`}
          card={RATE_CARD}
          empty={{ icon: Percent, title: "No rates yet" }}
        />
      ) : (
        <RecordEmpty>No rates yet: every customer is charged none.</RecordEmpty>
      )}
      <AddRateSheet
        key={adding.key}
        open={adding.open}
        onOpenChange={adding.onOpenChange}
      />
    </RecordSection>
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

interface AddRateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Sets a country's VAT from a day, with why. */
function AddRateSheet({ open, onOpenChange }: AddRateSheetProps) {
  const router = useRouter();
  const add = useServerFn(addRate);
  const [fields, setFields] = useState<RateFields>({
    country: "EG",
    percent: "",
    nameEn: "VAT",
    nameAr: "ضريبة القيمة المضافة",
    validFrom: businessToday(),
  });
  const [who, setWho] = useState<"us" | "customer">("us");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof RateFields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  const missing = (key: keyof RateFields) =>
    submitted && !fields[key].trim() ? ["Fill this in."] : undefined;
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Add a rate"
      submitLabel="Add rate"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (
          !fields.country.trim() ||
          !fields.percent.trim() ||
          !fields.validFrom ||
          !reason.trim()
        )
          return;
        setPending(true);
        setError(null);
        const failed = await attempt(
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
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Rate added.");
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <div className="grid items-start gap-6 sm:grid-cols-3">
        <TextField
          label="Country"
          hint="Two letters, such as EG."
          dir="ltr"
          maxLength={2}
          value={fields.country}
          errors={missing("country")}
          onChange={(event) => set("country", event.target.value)}
        />
        <TextField
          label="Percentage"
          inputMode="decimal"
          value={fields.percent}
          errors={missing("percent")}
          onChange={(event) => set("percent", event.target.value)}
        />
        <TextField
          label="From"
          type="date"
          value={fields.validFrom}
          errors={missing("validFrom")}
          onChange={(event) => set("validFrom", event.target.value)}
        />
      </div>
      <div className="grid items-start gap-6 sm:grid-cols-2">
        <TextField
          label="Printed in English as"
          value={fields.nameEn}
          onChange={(event) => set("nameEn", event.target.value)}
        />
        <TextField
          label="Printed in Arabic as"
          dir="rtl"
          lang="ar"
          value={fields.nameAr}
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
