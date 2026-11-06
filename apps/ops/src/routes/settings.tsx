import { businessToday } from "@faridalms/domain/subscriptions";
import {
  CheckboxGroupField,
  FormField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { PageHeader } from "@faridalms/ui/system/page-header";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import {
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from "@faridalms/ui/system/settings-section";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
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
    <>
      <PageHeader
        title="Settings"
        description="As every quote and invoice prints them."
      />
      <SettingsPage>
        <Profile data={data} key={data.profile?.version ?? 0} />
        <Rates data={data} />
      </SettingsPage>
    </>
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

function Rates({ data }: SettingsProps) {
  const router = useRouter();
  const add = useServerFn(addRate);
  const [fields, setFields] = useState<RateFields>({
    country: "EG",
    percent: "",
    nameEn: "VAT",
    nameAr: "ضريبة القيمة المضافة",
    validFrom: businessToday(),
  });
  const [reverseCharge, setReverseCharge] = useState(false);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof RateFields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  const missing = (key: keyof RateFields) =>
    submitted && !fields[key].trim() ? ["Fill this in."] : undefined;
  return (
    <>
      <RecordSection
        title="VAT"
        description="By the customer's country, from a day. A new rate follows the one before; a country with none is charged none, and the quote says so."
      >
        {data.rates.length ? (
          <RecordList>
            {data.rates.map((rate) => (
              <li
                key={rate.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-3"
              >
                <span className="text-sm leading-5">
                  <span className="font-medium">{rate.country}</span> ·{" "}
                  {Number(rate.percent)}% {rate.nameEn}
                  {rate.reverseCharge ? ", reverse charge" : ""}
                </span>
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  <span dir="rtl" lang="ar">
                    {rate.nameAr}
                  </span>{" "}
                  · from {formatDay(rate.validFrom)}
                </span>
              </li>
            ))}
          </RecordList>
        ) : (
          <RecordEmpty>No rates yet.</RecordEmpty>
        )}
      </RecordSection>
      <SettingsSection
        title="Add a rate"
        submitLabel="Add rate"
        pending={pending}
        error={error}
        isDirty={() => Boolean(fields.percent || reason)}
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
                  reverseCharge,
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
          setFields((current) => ({ ...current, percent: "" }));
          setReason("");
          setSubmitted(false);
          await router.invalidate();
        }}
      >
        <div className="grid items-start gap-6 @md:grid-cols-3">
          <TextField
            label="Country"
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
          <TextField
            label="Name in English"
            value={fields.nameEn}
            onChange={(event) => set("nameEn", event.target.value)}
          />
          <TextField
            label="Name in Arabic"
            dir="rtl"
            lang="ar"
            value={fields.nameAr}
            onChange={(event) => set("nameAr", event.target.value)}
          />
        </div>
        <CheckboxGroupField
          label="Who accounts for it"
          value={reverseCharge ? ["reverse"] : []}
          options={[
            {
              value: "reverse",
              label: "Reverse charge",
              hint: "The customer, a registered business abroad, accounts for the VAT.",
            },
          ]}
          onChange={(value) => setReverseCharge(value.includes("reverse"))}
        />
        <WhyField value={reason} onChange={setReason} submitted={submitted} />
      </SettingsSection>
    </>
  );
}
