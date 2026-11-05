import { Badge } from "@faridalms/ui/badge";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import { Agreements } from "../components/Agreements";
import { ContactCard, ContactForm } from "../components/Contacts";
import { CustomerForm } from "../components/CustomerForm";
import { EventList } from "../components/EventList";
import { formatDay, formatWhen } from "../format";
import { getCustomer } from "../server/customers";

export const Route = createFileRoute("/customers/$customerId")({
  loader: ({ params }) => getCustomer({ data: { id: params.customerId } }),
  component: CustomerPage,
});

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
