import type { ContactRow } from "@faridalms/database/business/customers";
import type { ContactRole } from "@faridalms/domain/subscriptions";

import { CONTACT_ROLES } from "@faridalms/domain/subscriptions";
import { Badge } from "@faridalms/ui/badge";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Input } from "@faridalms/ui/input";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import {
  removeCustomerContact,
  saveCustomerContact,
} from "../server/customers";

const ROLE_NAMES: Record<ContactRole, string> = {
  billing: "Billing",
  decision_maker: "Decision maker",
  technical: "Technical",
};

export function ContactCard({
  customerId,
  contact,
}: {
  customerId: string;
  contact: ContactRow;
}) {
  const router = useRouter();
  const remove = useServerFn(removeCustomerContact);
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <ContactForm
        customerId={customerId}
        contact={contact}
        onDone={() => setEditing(false)}
      />
    );
  return (
    <article
      aria-label={contact.name}
      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
    >
      <div className="grid gap-1">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {contact.name}
          {contact.roles.map((role) => (
            <Badge key={role} variant="secondary">
              {ROLE_NAMES[role]}
            </Badge>
          ))}
        </span>
        <span dir="ltr" className="text-muted-foreground">
          {[contact.email, contact.phone].filter(Boolean).join(" · ")}
        </span>
        <span className="text-xs text-muted-foreground">
          Writes to them in {contact.locale === "ar" ? "Arabic" : "English"}
        </span>
      </div>
      <span className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            try {
              await remove({ data: { customerId, id: contact.id } });
              toast.success("Contact removed.");
              await router.invalidate();
            } catch (error) {
              const said = failure(error, "The contact could not be removed.");
              if (said) toast.error(said);
            }
          }}
        >
          Remove
        </Button>
      </span>
    </article>
  );
}

/** Adds a person at the customer, or changes one. */
export function ContactForm({
  customerId,
  contact,
  onDone,
}: {
  customerId: string;
  contact: ContactRow | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const save = useServerFn(saveCustomerContact);
  const [name, setName] = useState(contact?.name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [roles, setRoles] = useState<ContactRole[]>(contact?.roles ?? []);
  const [locale, setLocale] = useState<"en" | "ar">(contact?.locale ?? "en");
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const prefix = `contact-${contact?.id ?? "new"}`;
  return (
    <form
      aria-label={contact ? `Edit ${contact.name}` : "New contact"}
      className="grid gap-4 rounded-lg border p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (roles.length === 0) {
          setAnswer("Give the contact at least one role.");
          return;
        }
        setSaving(true);
        setAnswer(null);
        try {
          await save({
            data: {
              customerId,
              id: contact?.id,
              name,
              email,
              phone,
              roles,
              locale,
            },
          });
          toast.success(contact ? "Contact saved." : "Contact added.");
          if (!contact) {
            setName("");
            setEmail("");
            setPhone("");
            setRoles([]);
          }
          onDone?.();
          await router.invalidate();
        } catch (error) {
          setAnswer(
            failure(
              error,
              "The contact could not be saved. Give an email address or a phone number.",
            ),
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3 className="text-sm font-semibold">
        {contact ? `Edit ${contact.name}` : "Add a contact"}
      </h3>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 text-sm">
          <label htmlFor={`${prefix}-name`} className="font-medium">
            Name
          </label>
          <Input
            id={`${prefix}-name`}
            required
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor={`${prefix}-locale`} className="font-medium">
            Writes in
          </label>
          <select
            id={`${prefix}-locale`}
            value={locale}
            onChange={(event) => setLocale(event.target.value as "en" | "ar")}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="en">English</option>
            <option value="ar">Arabic</option>
          </select>
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor={`${prefix}-email`} className="font-medium">
            Email
          </label>
          <Input
            id={`${prefix}-email`}
            type="email"
            dir="ltr"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor={`${prefix}-phone`} className="font-medium">
            Phone
          </label>
          <Input
            id={`${prefix}-phone`}
            type="tel"
            dir="ltr"
            maxLength={40}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-1 font-medium">Roles</legend>
        {CONTACT_ROLES.map((role) => (
          <span key={role} className="flex items-center gap-2">
            <Checkbox
              id={`${prefix}-${role}`}
              checked={roles.includes(role)}
              onCheckedChange={(checked) =>
                setRoles((current) =>
                  checked
                    ? [...current, role]
                    : current.filter((item) => item !== role),
                )
              }
            />
            <label htmlFor={`${prefix}-${role}`}>{ROLE_NAMES[role]}</label>
          </span>
        ))}
      </fieldset>
      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <span className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : contact ? "Save contact" : "Add contact"}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </span>
    </form>
  );
}
