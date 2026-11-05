import type { ContactRow } from "@faridalms/database/business/customers";
import type { ContactRole } from "@faridalms/domain/subscriptions";

import { CONTACT_ROLES } from "@faridalms/domain/subscriptions";
import { Badge } from "@faridalms/ui/badge";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Input } from "@faridalms/ui/input";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import { CustomerForm } from "../components/CustomerForm";
import { EventList } from "../components/EventList";
import { formatDay, formatWhen } from "../format";
import {
  getCustomer,
  recordAgreement,
  removeCustomerContact,
  saveCustomerContact,
} from "../server/customers";

export const Route = createFileRoute("/customers/$customerId")({
  loader: ({ params }) => getCustomer({ data: { id: params.customerId } }),
  component: CustomerPage,
});

const ROLE_NAMES: Record<ContactRole, string> = {
  billing: "Billing",
  decision_maker: "Decision maker",
  technical: "Technical",
};

const STATE_NAMES = {
  trial: "Trial",
  active: "Active",
  ended: "Ended",
} as const;

function CustomerPage() {
  const { customer, contacts, subscriptions, schools, history, names } =
    Route.useLoaderData();
  const router = useRouter();
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <Link
          to="/customers"
          className="text-sm text-muted-foreground hover:underline"
        >
          Customers
        </Link>
        <h1 className="text-2xl font-semibold">{customer.legalNameEn}</h1>
        {customer.legalNameAr ? (
          <p dir="rtl" lang="ar" className="text-sm text-muted-foreground">
            {customer.legalNameAr}
          </p>
        ) : null}
      </div>
      <CustomerForm
        key={customer.version}
        customer={customer}
        onSaved={async () => {
          toast.success("Details saved.");
          await router.invalidate();
        }}
      />
      <section className="grid gap-3">
        <h2 className="text-base font-semibold">Schools and subscriptions</h2>
        {schools.length ? (
          <ul className="flex flex-wrap gap-2 text-sm">
            {schools.map((school) => (
              <li key={school.id}>
                <Link
                  to="/schools/$schoolId"
                  params={{ schoolId: school.id }}
                  className="underline"
                >
                  {school.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No schools yet: a customer runs a tenant once its schools are
            created.
          </p>
        )}
        {subscriptions.length ? (
          <ul className="divide-y rounded-lg border">
            {subscriptions.map((subscription) => (
              <li
                key={subscription.id}
                className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"
              >
                <Link
                  to="/subscriptions/$subscriptionId"
                  params={{ subscriptionId: subscription.id }}
                  className="font-medium underline"
                >
                  Opened {formatWhen(subscription.createdAt)}
                </Link>
                <Badge variant="secondary">
                  {STATE_NAMES[subscription.state]}
                </Badge>
                {subscription.grandfathered ? (
                  <Badge variant="outline">Grandfathered</Badge>
                ) : null}
                <span className="text-muted-foreground">
                  {subscription.termEndsOn
                    ? `term ends ${formatDay(subscription.termEndsOn)}`
                    : subscription.trialEndsOn
                      ? `trial ends ${formatDay(subscription.trialEndsOn)}`
                      : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <Agreements
        customerId={customer.id}
        terms={{
          version: customer.termsVersion,
          at: customer.termsAcceptedAt,
        }}
        dpa={{ version: customer.dpaVersion, at: customer.dpaAcceptedAt }}
      />
      <section className="grid max-w-2xl gap-3">
        <h2 className="text-base font-semibold">Contacts</h2>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts yet.</p>
        ) : null}
        {contacts.map((contact) => (
          <ContactCard
            key={contact.id}
            customerId={customer.id}
            contact={contact}
          />
        ))}
        <ContactForm customerId={customer.id} contact={null} />
      </section>
      <section className="grid gap-3">
        <h2 className="text-base font-semibold">History</h2>
        <EventList events={history} names={names} />
      </section>
    </div>
  );
}

const accepted = (held: { version: string | null; at: Date | null }) =>
  held.version && held.at
    ? `version ${held.version}, accepted ${formatWhen(held.at)}`
    : "Not accepted";

/** Which version of the terms and of the data processing agreement it accepted. */
function Agreements({
  customerId,
  terms,
  dpa,
}: {
  customerId: string;
  terms: { version: string | null; at: Date | null };
  dpa: { version: string | null; at: Date | null };
}) {
  const router = useRouter();
  const record = useServerFn(recordAgreement);
  const [agreement, setAgreement] = useState<"terms" | "dpa">("terms");
  const [version, setVersion] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <section className="grid max-w-2xl gap-4 rounded-lg border p-6">
      <h2 className="text-base font-semibold">Agreements</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Terms of service</dt>
          <dd>{accepted(terms)}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Data processing agreement</dt>
          <dd>{accepted(dpa)}</dd>
        </div>
      </dl>
      <form
        aria-label="Record an acceptance"
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await record({ data: { customerId, agreement, version } });
            toast.success("Acceptance recorded.");
            setVersion("");
            await router.invalidate();
          } catch (error) {
            const said = failure(
              error,
              "The acceptance could not be recorded.",
            );
            if (said) toast.error(said);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="grid gap-1 text-sm">
          <label htmlFor="agreement-kind" className="font-medium">
            Agreement
          </label>
          <select
            id="agreement-kind"
            value={agreement}
            onChange={(event) =>
              setAgreement(event.target.value as "terms" | "dpa")
            }
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="terms">Terms of service</option>
            <option value="dpa">Data processing agreement</option>
          </select>
        </div>
        <div className="grid gap-1 text-sm">
          <label htmlFor="agreement-version" className="font-medium">
            Version accepted
          </label>
          <Input
            id="agreement-version"
            required
            dir="ltr"
            maxLength={40}
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            placeholder="2026-11"
          />
        </div>
        <Button type="submit" disabled={saving || !version.trim()}>
          {saving ? "Recording…" : "Record acceptance"}
        </Button>
      </form>
    </section>
  );
}

function ContactCard({
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
function ContactForm({
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
