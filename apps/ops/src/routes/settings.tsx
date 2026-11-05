import { businessToday } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import { formatDay } from "../format";
import { addRate, getSettings, saveBusinessProfile } from "../server/settings";

export const Route = createFileRoute("/settings")({
  loader: () => getSettings(),
  component: Settings,
});

type Data = Awaited<ReturnType<typeof getSettings>>;

function Settings() {
  const data = Route.useLoaderData();
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          The business's own legal details and the VAT its customers are
          charged, as every quote and invoice prints them.
        </p>
      </div>
      <Profile data={data} key={data.profile?.version ?? 0} />
      <Rates data={data} />
    </div>
  );
}

function Profile({ data }: { data: Data }) {
  const router = useRouter();
  const save = useServerFn(saveBusinessProfile);
  const held = data.profile;
  const [fields, setFields] = useState({
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
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set =
    (key: keyof typeof fields) => (event: { target: { value: string } }) =>
      setFields((current) => ({ ...current, [key]: event.target.value }));
  const text = (
    key: keyof typeof fields,
    label: string,
    options: { required?: boolean; dir?: "ltr" | "rtl"; type?: string },
  ) => (
    <div className="grid gap-1.5 text-sm">
      <label htmlFor={`profile-${key}`} className="font-medium">
        {label}
      </label>
      <Input
        id={`profile-${key}`}
        required={options.required}
        dir={options.dir}
        lang={options.dir === "rtl" ? "ar" : undefined}
        type={options.type}
        value={fields[key]}
        onChange={set(key)}
      />
    </div>
  );
  return (
    <form
      aria-label="Legal details"
      className="grid max-w-3xl gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setAnswer(null);
        try {
          const out = await save({
            data: { ...fields, reason, expectedVersion: held?.version ?? null },
          });
          if (out.ok) {
            toast.success("Legal details saved.");
            setReason("");
            await router.invalidate();
          } else setAnswer(out.message);
        } catch (error) {
          setAnswer(
            failure(
              error,
              "They could not be saved. Fill in each field marked.",
            ),
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2 className="text-base font-semibold">Legal details</h2>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        {text("legalNameEn", "Legal name in English", { required: true })}
        {text("legalNameAr", "Legal name in Arabic", {
          required: true,
          dir: "rtl",
        })}
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="profile-addressEn" className="font-medium">
            Address in English
          </label>
          <Textarea
            id="profile-addressEn"
            required
            value={fields.addressEn}
            onChange={set("addressEn")}
          />
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="profile-addressAr" className="font-medium">
            Address in Arabic
          </label>
          <Textarea
            id="profile-addressAr"
            required
            dir="rtl"
            lang="ar"
            value={fields.addressAr}
            onChange={set("addressAr")}
          />
        </div>
        {text("taxNumber", "Tax registration number", {
          required: true,
          dir: "ltr",
        })}
        {text("commercialRegistry", "Commercial registry", { dir: "ltr" })}
        {text("email", "Email", { required: true, dir: "ltr", type: "email" })}
        {text("phone", "Phone", { dir: "ltr", type: "tel" })}
        {text("website", "Website", { dir: "ltr" })}
        <div className="grid gap-1.5 text-sm sm:col-span-2 sm:grid-cols-2 sm:gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="profile-bankDetailsEn" className="font-medium">
              Bank details in English
            </label>
            <Textarea
              id="profile-bankDetailsEn"
              value={fields.bankDetailsEn}
              onChange={set("bankDetailsEn")}
              placeholder="Bank, account name, IBAN, SWIFT"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="profile-bankDetailsAr" className="font-medium">
              Bank details in Arabic
            </label>
            <Textarea
              id="profile-bankDetailsAr"
              dir="rtl"
              lang="ar"
              value={fields.bankDetailsAr}
              onChange={set("bankDetailsAr")}
            />
          </div>
        </div>
      </div>
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="profile-reason" className="font-medium">
          Why
        </label>
        <Input
          id="profile-reason"
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={saving || !reason.trim()}
        className="justify-self-start"
      >
        {saving ? "Saving…" : "Save legal details"}
      </Button>
    </form>
  );
}

function Rates({ data }: { data: Data }) {
  const router = useRouter();
  const add = useServerFn(addRate);
  const [fields, setFields] = useState({
    country: "EG",
    percent: "",
    nameEn: "VAT",
    nameAr: "ضريبة القيمة المضافة",
    validFrom: businessToday(),
    reason: "",
  });
  const [reverseCharge, setReverseCharge] = useState(false);
  const [saving, setSaving] = useState(false);
  const set =
    (key: keyof typeof fields) => (event: { target: { value: string } }) =>
      setFields((current) => ({ ...current, [key]: event.target.value }));
  return (
    <section className="grid max-w-3xl gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">VAT</h2>
        <p className="text-sm text-muted-foreground">
          By the customer's country, from a day. A new rate follows the one
          before; a country with none is charged none, and the quote says so.
        </p>
      </div>
      {data.rates.length ? (
        <ul className="divide-y rounded-lg border text-sm">
          {data.rates.map((rate) => (
            <li key={rate.id} className="flex flex-wrap gap-2 px-4 py-3">
              <span className="font-medium">{rate.country}</span>
              <span>
                {Number(rate.percent)}% {rate.nameEn}
                {rate.reverseCharge ? ", reverse charge" : ""}
              </span>
              <span dir="rtl" lang="ar" className="text-muted-foreground">
                {rate.nameAr}
              </span>
              <span className="text-muted-foreground">
                from {formatDay(rate.validFrom)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No rates yet.</p>
      )}
      <form
        aria-label="Add a rate"
        className="grid gap-4 rounded-lg border p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            const out = await add({
              data: {
                ...fields,
                percent: Number(fields.percent),
                reverseCharge,
              },
            });
            if (out.ok) {
              toast.success("Rate added.");
              setFields((current) => ({ ...current, percent: "", reason: "" }));
              await router.invalidate();
            } else toast.error(out.message);
          } catch (error) {
            const said = failure(
              error,
              "The rate could not be added. Give a country, a percentage and the day it starts.",
            );
            if (said) toast.error(said);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="grid items-start gap-4 sm:grid-cols-3">
          {(
            [
              ["country", "Country", "ltr"],
              ["percent", "Percentage", "ltr"],
              ["validFrom", "From", "ltr"],
              ["nameEn", "Name in English", "ltr"],
              ["nameAr", "Name in Arabic", "rtl"],
            ] as const
          ).map(([key, label, dir]) => (
            <div key={key} className="grid gap-1.5 text-sm">
              <label htmlFor={`rate-${key}`} className="font-medium">
                {label}
              </label>
              <Input
                id={`rate-${key}`}
                required
                dir={dir}
                type={key === "validFrom" ? "date" : undefined}
                inputMode={key === "percent" ? "decimal" : undefined}
                value={fields[key]}
                onChange={set(key)}
              />
            </div>
          ))}
        </div>
        <span className="flex items-center gap-2 text-sm">
          <Checkbox
            id="rate-reverse"
            checked={reverseCharge}
            onCheckedChange={(checked) => setReverseCharge(checked)}
          />
          <label htmlFor="rate-reverse">
            Reverse charge: the customer, a registered business abroad, accounts
            for the VAT
          </label>
        </span>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="rate-reason" className="font-medium">
            Why
          </label>
          <Input
            id="rate-reason"
            required
            maxLength={500}
            value={fields.reason}
            onChange={set("reason")}
          />
        </div>
        <Button
          type="submit"
          disabled={saving || !fields.reason.trim() || !fields.percent}
          className="justify-self-start"
        >
          {saving ? "Adding…" : "Add rate"}
        </Button>
      </form>
    </section>
  );
}
