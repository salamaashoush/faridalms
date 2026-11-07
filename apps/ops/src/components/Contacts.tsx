import type { ContactRow } from "@faridalms/database/business/customers";
import type { ContactRole } from "@faridalms/domain/subscriptions";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";

import { CONTACT_ROLES } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { DataTable } from "@faridalms/ui/system/data-table";
import {
  CheckboxGroupField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusBadge } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import {
  removeCustomerContact,
  saveCustomerContact,
} from "../server/customers";

const ROLE_NAMES: Record<ContactRole, string> = {
  billing: "Billing",
  decision_maker: "Decision maker",
  technical: "Technical",
};

const ROLE_OPTIONS = CONTACT_ROLES.map((role) => ({
  value: role,
  label: ROLE_NAMES[role],
}));

const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
] as const;

export interface ContactSheetProps {
  customerId: string;
  /** The contact being changed, or null for a new one. */
  contact: ContactRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Adds a person at the customer, or changes one. */
export function ContactSheet({
  customerId,
  contact,
  open,
  onOpenChange,
}: ContactSheetProps) {
  const router = useRouter();
  const save = useServerFn(saveCustomerContact);
  const [name, setName] = useState(contact?.name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [roles, setRoles] = useState<ContactRole[]>(contact?.roles ?? []);
  const [locale, setLocale] = useState<"en" | "ar">(contact?.locale ?? "en");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unreachable = submitted && !email.trim() && !phone.trim();
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={contact ? `Edit ${contact.name}` : "New contact"}
      submitLabel={contact ? "Save contact" : "Add contact"}
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (
          !name.trim() ||
          roles.length === 0 ||
          (!email.trim() && !phone.trim())
        )
          return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () =>
            save({
              data: {
                customerId,
                id: contact?.id,
                name,
                email,
                phone,
                roles,
                locale,
              },
            }),
          "The contact could not be saved.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success(contact ? "Contact saved." : "Contact added.");
        if (!contact) {
          setName("");
          setEmail("");
          setPhone("");
          setRoles([]);
          setSubmitted(false);
        }
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <TextField
        label="Name"
        width="name"
        maxLength={200}
        value={name}
        errors={submitted && !name.trim() ? ["Enter their name."] : undefined}
        onChange={(event) => setName(event.target.value)}
      />
      <TextField
        label="Email"
        type="email"
        dir="ltr"
        width="name"
        maxLength={254}
        hint="An email address or a phone number, or both."
        value={email}
        errors={
          unreachable ? ["Give an email address or a phone number."] : undefined
        }
        onChange={(event) => setEmail(event.target.value)}
      />
      <TextField
        label="Phone"
        type="tel"
        dir="ltr"
        width="phone"
        maxLength={40}
        optional
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
      />
      <SelectField
        label="Writes in"
        value={locale}
        options={LOCALE_OPTIONS}
        onChange={setLocale}
      />
      <CheckboxGroupField
        label="Roles"
        value={roles}
        options={ROLE_OPTIONS}
        onChange={setRoles}
        errors={
          submitted && roles.length === 0
            ? ["Give the contact at least one role."]
            : undefined
        }
      />
    </SheetForm>
  );
}

const COLUMNS: Column<ContactRow>[] = [
  {
    id: "name",
    header: "Name",
    primary: true,
    cell: (contact) => (
      <span dir="auto" className="font-medium">
        {contact.name}
      </span>
    ),
  },
  {
    id: "roles",
    header: "Written to about",
    cell: (contact) => (
      <span className="flex flex-wrap gap-1.5">
        {contact.roles.map((role) => (
          <StatusBadge key={role} tone="neutral">
            {ROLE_NAMES[role]}
          </StatusBadge>
        ))}
      </span>
    ),
  },
  {
    id: "email",
    header: "Email",
    cell: (contact) =>
      contact.email ? (
        <a
          dir="ltr"
          href={`mailto:${contact.email}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {contact.email}
        </a>
      ) : (
        <Value>{null}</Value>
      ),
  },
  {
    id: "phone",
    header: "Phone",
    cell: (contact) =>
      contact.phone ? (
        <a
          dir="ltr"
          href={`tel:${contact.phone}`}
          className="tabular-nums underline-offset-4 hover:underline"
        >
          {contact.phone}
        </a>
      ) : (
        <Value>{null}</Value>
      ),
  },
  {
    id: "language",
    header: "Language",
    cell: (contact) => (contact.locale === "ar" ? "Arabic" : "English"),
  },
];

const CARD: DataTableCard<ContactRow> = {
  title: (contact) => <span dir="auto">{contact.name}</span>,
  status: (contact) => contact.roles.map((role) => ROLE_NAMES[role]).join(", "),
  fact: (contact) => (
    <span dir="ltr">
      {[contact.email, contact.phone].filter(Boolean).join(" · ")}
    </span>
  ),
};

export interface ContactsTableProps {
  customerId: string;
  contacts: ContactRow[];
  /** Opens the sheet that adds a contact, owned by the page. */
  onAdd: () => void;
}

/**
 * The people at the customer: what each is written to about, how to reach
 * them and in which language. Each row is edited or removed from its menu.
 */
export function ContactsTable({
  customerId,
  contacts,
  onAdd,
}: ContactsTableProps) {
  const router = useRouter();
  const remove = useServerFn(removeCustomerContact);
  const editing = useSheet();
  const [chosen, setChosen] = useState<ContactRow | null>(null);
  const add = (
    <Button type="button" variant="outline" size="sm" onClick={onAdd}>
      <Plus aria-hidden />
      Add contact
    </Button>
  );
  return (
    <>
      <DataTable
        caption="Contacts"
        rows={contacts}
        columns={COLUMNS}
        rowLabel={(contact) => contact.name}
        card={CARD}
        actions={add}
        empty={{
          icon: UserRound,
          title: "Add the people to write to",
          description:
            "Invoices and payment reminders go to the contacts written to about billing; notices about the contract to its decision makers.",
          action: add,
        }}
        rowActions={(contact) => [
          {
            label: "Edit",
            icon: Pencil,
            onSelect: () => {
              setChosen(contact);
              editing.show();
            },
          },
          {
            label: "Remove",
            icon: Trash2,
            destructive: true,
            confirm: {
              title: `Remove ${contact.name}?`,
              body: "They stop receiving the customer's invoices and notices.",
              label: "Remove",
            },
            onSelect: async () => {
              await remove({ data: { customerId, id: contact.id } });
              toast.success("Contact removed.");
              await router.invalidate();
            },
          },
        ]}
      />
      {chosen ? (
        <ContactSheet
          key={editing.key}
          customerId={customerId}
          contact={chosen}
          open={editing.open}
          onOpenChange={editing.onOpenChange}
        />
      ) : null}
    </>
  );
}

export interface ContactsProps {
  customerId: string;
  contacts: ContactRow[];
}

/** The people at the customer, with the sheet that adds one. */
export function Contacts({ customerId, contacts }: ContactsProps) {
  const adding = useSheet();
  return (
    <>
      <ContactsTable
        customerId={customerId}
        contacts={contacts}
        onAdd={adding.show}
      />
      <ContactSheet
        key={adding.key}
        customerId={customerId}
        contact={null}
        open={adding.open}
        onOpenChange={adding.onOpenChange}
      />
    </>
  );
}
