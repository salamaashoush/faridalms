import { SelectField } from "@faridalms/ui/system/form-field";
import {
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusBadge } from "@faridalms/ui/system/status";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import { Agreements } from "../components/Agreements";
import { ClockPauses } from "../components/ClockPauses";
import { Contacts } from "../components/Contacts";
import { CustomerDetails } from "../components/CustomerForm";
import { EventList } from "../components/EventList";
import { TaskList } from "../components/TaskList";
import {
  formatDay,
  formatMoney,
  formatWhen,
  INVOICE_STATE_NAMES,
  INVOICE_STATE_TONE,
  PAYMENT_METHOD_NAMES,
  SUBSCRIPTION_STATE_NAMES,
  SUBSCRIPTION_STATE_TONE,
} from "../format";
import { useMay } from "../may";
import { getCustomer } from "../server/customers";
import { getCustomerBilling } from "../server/invoicing";
import { setCustomerOwner } from "../server/receivables";

export const Route = createFileRoute("/customers/$customerId")({
  loader: async ({ params }) => {
    const [customer, billing] = await Promise.all([
      getCustomer({ data: { id: params.customerId } }),
      getCustomerBilling({ data: { customerId: params.customerId } }).catch(
        () => null,
      ),
    ]);
    return { ...customer, billing };
  },
  staticData: { title: "Customer" },
  component: CustomerPage,
});

/** Someone who may look after a customer. */
interface Owner {
  id: string;
  name: string;
}

interface AccountOwnerProps {
  customerId: string;
  ownerId: string | null;
  owners: readonly Owner[];
}

/** Who looks after the customer: asked to call when an invoice is two weeks overdue. */
function AccountOwner({ customerId, ownerId, owners }: AccountOwnerProps) {
  const sheet = useSheet();
  const owner = owners.find((one) => one.id === ownerId);
  return (
    <RecordSection
      title="Account owner"
      description="Asked to call when an invoice is two weeks overdue."
      edit={{
        label: "Change the account owner",
        onClick: sheet.show,
      }}
    >
      <p className="text-sm leading-5">
        {owner ? (
          owner.name
        ) : (
          <span className="text-muted-foreground">Nobody yet</span>
        )}
      </p>
      <AccountOwnerSheet
        key={sheet.key}
        customerId={customerId}
        ownerId={ownerId}
        owners={owners}
        open={sheet.open}
        onOpenChange={sheet.onOpenChange}
      />
    </RecordSection>
  );
}

interface AccountOwnerSheetProps extends AccountOwnerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Names who looks after the customer, or nobody. */
function AccountOwnerSheet({
  customerId,
  ownerId,
  owners,
  open,
  onOpenChange,
}: AccountOwnerSheetProps) {
  const router = useRouter();
  const save = useServerFn(setCustomerOwner);
  const [chosen, setChosen] = useState(ownerId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Account owner"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setPending(true);
        setError(null);
        const failed = await attempt(
          () => save({ data: { customerId, ownerId: chosen || null } }),
          "The account owner could not be saved.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Account owner saved.");
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <SelectField
        label="Looked after by"
        value={chosen}
        options={[
          { value: "", label: "Nobody yet" },
          ...owners.map((one) => ({ value: one.id, label: one.name })),
        ]}
        onChange={setChosen}
      />
    </SheetForm>
  );
}

function CustomerPage() {
  const {
    customer,
    contacts,
    subscriptions,
    schools,
    history,
    names,
    owners,
    tasks,
    today,
    billing,
  } = Route.useLoaderData();
  const mayBill = useMay("billing");
  const router = useRouter();
  return (
    <>
      <RecordHeader
        title={customer.legalNameEn}
        facts={[
          ...(customer.legalNameAr
            ? [
                {
                  label: "Legal name in Arabic",
                  value: (
                    <span dir="rtl" lang="ar">
                      {customer.legalNameAr}
                    </span>
                  ),
                },
              ]
            : []),
          { label: "Country", value: customer.country },
          { label: "Currency", value: customer.currency },
          ...(customer.taxNumber
            ? [{ label: "Tax number", value: customer.taxNumber }]
            : []),
        ]}
        action={
          mayBill && billing
            ? {
                label: "New invoice",
                icon: Plus,
                onClick: () =>
                  void router.navigate({
                    to: "/invoices/new",
                    search: { customerId: customer.id },
                  }),
              }
            : undefined
        }
      />
      <RecordColumns
        main={
          <>
            <RecordSection title="Schools and subscriptions">
              <div className="grid gap-4">
                {schools.length ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {schools.map((school) => (
                      <Link
                        key={school.id}
                        to="/schools/$schoolId"
                        params={{ schoolId: school.id }}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {school.name}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <RecordEmpty>
                    No schools yet: a customer runs a tenant once its schools
                    are created.
                  </RecordEmpty>
                )}
                {subscriptions.length ? (
                  <RecordList>
                    {subscriptions.map((subscription) => (
                      <li
                        key={subscription.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3"
                      >
                        <span className="grid gap-0.5">
                          <Link
                            to="/subscriptions/$subscriptionId"
                            params={{ subscriptionId: subscription.id }}
                            className="text-sm leading-5 font-medium hover:text-primary hover:underline"
                          >
                            Opened {formatWhen(subscription.createdAt)}
                          </Link>
                          <span className="text-[13px] leading-[18px] text-muted-foreground">
                            {subscription.termEndsOn
                              ? `Term ends ${formatDay(subscription.termEndsOn)}`
                              : subscription.trialEndsOn
                                ? `Trial ends ${formatDay(subscription.trialEndsOn)}`
                                : "No end set"}
                            {subscription.grandfathered
                              ? " · Grandfathered"
                              : ""}
                          </span>
                        </span>
                        <StatusBadge
                          tone={SUBSCRIPTION_STATE_TONE[subscription.state]}
                        >
                          {SUBSCRIPTION_STATE_NAMES[subscription.state]}
                        </StatusBadge>
                      </li>
                    ))}
                  </RecordList>
                ) : null}
              </div>
            </RecordSection>
            {billing ? (
              <RecordSection title="Billing">
                <div className="grid gap-5">
                  {billing.invoices.length ? (
                    <RecordList>
                      {billing.invoices.map((invoice) => (
                        <li
                          key={invoice.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-3"
                        >
                          <span className="grid gap-0.5">
                            <Link
                              to="/invoices/$invoiceId"
                              params={{ invoiceId: invoice.id }}
                              className="text-sm leading-5 font-medium hover:text-primary hover:underline"
                            >
                              {invoice.number ?? "Draft"}
                            </Link>
                            <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
                              {formatDay(invoice.forDay)} ·{" "}
                              {formatMoney(
                                invoice.totalMinor,
                                invoice.currency,
                              )}
                              {invoice.state === "draft" ||
                              invoice.owedMinor === 0
                                ? ""
                                : `, ${formatMoney(invoice.owedMinor, invoice.currency)} owed`}
                            </span>
                          </span>
                          <StatusBadge tone={INVOICE_STATE_TONE[invoice.state]}>
                            {INVOICE_STATE_NAMES[invoice.state]}
                          </StatusBadge>
                        </li>
                      ))}
                    </RecordList>
                  ) : (
                    <RecordEmpty>No invoices yet.</RecordEmpty>
                  )}
                  {billing.payments.length ? (
                    <div className="grid gap-2">
                      <h3 className="text-sm leading-5 font-semibold">
                        Payments
                      </h3>
                      <RecordList>
                        {billing.payments.map((payment) => (
                          <li
                            key={payment.id}
                            className="flex flex-wrap justify-between gap-2 py-3 text-sm leading-5"
                          >
                            <span>
                              {PAYMENT_METHOD_NAMES[payment.method]} ·{" "}
                              {payment.reference} ·{" "}
                              {formatDay(payment.receivedOn)}
                            </span>
                            <span className="tabular-nums">
                              {formatMoney(
                                payment.amountMinor,
                                payment.currency,
                              )}
                            </span>
                          </li>
                        ))}
                      </RecordList>
                    </div>
                  ) : null}
                </div>
              </RecordSection>
            ) : null}
            <Contacts customerId={customer.id} contacts={contacts} />
            <CustomerDetails
              customer={customer}
              onSaved={async () => {
                toast.success("Details saved.");
                await router.invalidate();
              }}
            />
            <RecordSection title="History">
              <EventList events={history} names={names} />
            </RecordSection>
          </>
        }
        aside={
          <>
            <AccountOwner
              customerId={customer.id}
              ownerId={customer.accountOwnerId}
              owners={owners}
            />
            <RecordSection title="Tasks">
              <TaskList rows={tasks} names={names} today={today} />
            </RecordSection>
            <Agreements
              customerId={customer.id}
              terms={{
                version: customer.termsVersion,
                at: customer.termsAcceptedAt,
              }}
              dpa={{ version: customer.dpaVersion, at: customer.dpaAcceptedAt }}
            />
            {billing ? (
              <ClockPauses
                customerId={customer.id}
                pauses={billing.pauses}
                today={today}
              />
            ) : null}
          </>
        }
      />
    </>
  );
}
