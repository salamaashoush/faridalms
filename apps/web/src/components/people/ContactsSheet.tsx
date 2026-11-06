import { shownContacts } from "@faridalms/domain/people";
import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import { TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { saveContacts } from "~/server/students";
import { getMessageFromError } from "~/utils/error";

import { matching } from "./RecordSections";
import { COUNTRY_CODES, countryName } from "./regions";

export interface HeldContact {
  kind: "email" | "phone" | "postal";
  value: string;
  normalized: string | null;
  postal: {
    lines?: string[];
    city?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  } | null;
}

/** An adult's phone, email and home address, from the records that show them. */
export interface ContactsSheetProps {
  userId: string;
  name: string;
  contacts: readonly HeldContact[];
  open: boolean;
  onClose: () => void;
}

export function ContactsSheet({
  userId,
  name,
  contacts,
  open,
  onClose,
}: ContactsSheetProps) {
  const queryClient = useQueryClient();
  const held = (kind: HeldContact["kind"]) =>
    contacts.find((contact) => contact.kind === kind);
  const postal = held("postal")?.postal ?? null;
  const [phone, setPhone] = useState(held("phone")?.value ?? "");
  const [email, setEmail] = useState(held("email")?.value ?? "");
  const [street, setStreet] = useState(postal?.lines?.[0] ?? "");
  const [detail, setDetail] = useState(postal?.lines?.[1] ?? "");
  const [city, setCity] = useState(postal?.city ?? "");
  const [region, setRegion] = useState(postal?.region ?? "");
  const [postalCode, setPostalCode] = useState(postal?.postal_code ?? "");
  const [country, setCountry] = useState(postal?.country ?? "");
  const [countrySearch, setCountrySearch] = useState("");
  const countries = COUNTRY_CODES.map((code) => ({
    value: code,
    label: countryName(code),
  })).toSorted((a, b) => a.label.localeCompare(b.label));
  const mutation = useMutation({
    mutationFn: () =>
      saveContacts({
        data: {
          userId,
          expected: shownContacts(contacts),
          phone,
          email,
          address: {
            lines: [street, detail],
            city,
            region,
            postalCode,
            country,
          },
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.contactsEditFor({ name })}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        await mutation.mutateAsync().then(
          async () => {
            await queryClient.invalidateQueries({ queryKey: ["people"] });
            toast.success(m.managementSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <TextField
        id="contacts-phone"
        label={m.familyMobile()}
        type="tel"
        dir="ltr"
        optional
        width="phone"
        autoComplete="off"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
      />
      <TextField
        id="contacts-email"
        label={m.studentEmail()}
        type="email"
        dir="ltr"
        optional
        width="name"
        autoComplete="off"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm leading-5 font-semibold">
          {m.addressTitle()}
        </legend>
        <TextField
          id="contacts-street"
          label={m.addressStreet()}
          optional
          width="full"
          maxLength={120}
          autoComplete="off"
          value={street}
          onChange={(event) => setStreet(event.target.value)}
        />
        <TextField
          id="contacts-detail"
          label={m.addressDetail()}
          optional
          width="full"
          maxLength={120}
          autoComplete="off"
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
        />
        <TextField
          id="contacts-city"
          label={m.addressCity()}
          optional
          width="name"
          maxLength={80}
          autoComplete="off"
          value={city}
          onChange={(event) => setCity(event.target.value)}
        />
        <TextField
          id="contacts-region"
          label={m.addressRegion()}
          optional
          width="name"
          maxLength={80}
          autoComplete="off"
          value={region}
          onChange={(event) => setRegion(event.target.value)}
        />
        <TextField
          id="contacts-postal-code"
          label={m.addressPostalCode()}
          optional
          dir="ltr"
          width="code"
          maxLength={20}
          autoComplete="off"
          value={postalCode}
          onChange={(event) => setPostalCode(event.target.value)}
        />
        <ComboboxField
          label={m.addressCountry()}
          optional
          clearable
          options={matching(countrySearch, countries)}
          value={country ? [country] : []}
          onChange={(next) => setCountry(next[0] ?? "")}
          search={countrySearch}
          onSearchChange={setCountrySearch}
        />
      </fieldset>
    </SheetForm>
  );
}
