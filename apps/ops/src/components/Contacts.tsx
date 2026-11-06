import type { ContactRow } from "@faridalms/database/business/customers";
import type { ContactRole } from "@faridalms/domain/subscriptions";

import { CONTACT_ROLES } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import {
  CheckboxGroupField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusBadge } from "@faridalms/ui/system/status";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
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

interface ContactSheetProps {
  customerId: string;
  /** The contact being changed, or null for a new one. */
  contact: ContactRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Adds a person at the customer, or changes one. */
function ContactSheet({
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

interface ContactItemProps {
  customerId: string;
  contact: ContactRow;
}

function ContactItem({ customerId, contact }: ContactItemProps) {
  const router = useRouter();
  const remove = useServerFn(removeCustomerContact);
  const [editing, setEditing] = useState(false);
  return (
    <li>
      <article
        aria-label={contact.name}
        className="flex items-start justify-between gap-3 py-3"
      >
        <div className="grid min-w-0 gap-1">
          <span className="flex flex-wrap items-center gap-2 text-sm leading-5 font-medium">
            {contact.name}
            {contact.roles.map((role) => (
              <StatusBadge key={role} tone="neutral">
                {ROLE_NAMES[role]}
              </StatusBadge>
            ))}
          </span>
          <span
            dir="ltr"
            className="justify-self-start text-[13px] leading-[18px] text-muted-foreground"
          >
            {[contact.email, contact.phone].filter(Boolean).join(" · ")}
          </span>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            Writes to them in {contact.locale === "ar" ? "Arabic" : "English"}
          </span>
        </div>
        <ActionMenu
          label={`Actions for ${contact.name}`}
          actions={[
            { label: "Edit", onSelect: () => setEditing(true) },
            {
              label: "Remove",
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
      </article>
      <ContactSheet
        customerId={customerId}
        contact={contact}
        open={editing}
        onOpenChange={setEditing}
      />
    </li>
  );
}

export interface ContactsProps {
  customerId: string;
  contacts: ContactRow[];
}

/** The people at the customer, each with what they are written to about. */
export function Contacts({ customerId, contacts }: ContactsProps) {
  const [adding, setAdding] = useState(false);
  return (
    <RecordSection
      title="Contacts"
      action={
        <Button type="button" variant="ghost" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          Add contact
        </Button>
      }
    >
      {contacts.length ? (
        <RecordList>
          {contacts.map((contact) => (
            <ContactItem
              key={contact.id}
              customerId={customerId}
              contact={contact}
            />
          ))}
        </RecordList>
      ) : (
        <RecordEmpty>No contacts yet.</RecordEmpty>
      )}
      <ContactSheet
        customerId={customerId}
        contact={null}
        open={adding}
        onOpenChange={setAdding}
      />
    </RecordSection>
  );
}
