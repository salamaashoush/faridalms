import type { InvoiceState } from "@faridalms/domain/invoices";
import type { AttentionItem } from "@faridalms/ui/system/attention-list";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { RecordTab } from "@faridalms/ui/system/record-page";

import { INVOICE_STATES } from "@faridalms/domain/invoices";
import { daysBetween } from "@faridalms/domain/school";
import { Button } from "@faridalms/ui/button";
import { AttentionList } from "@faridalms/ui/system/attention-list";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { SelectField } from "@faridalms/ui/system/form-field";
import { Metric, MetricGrid } from "@faridalms/ui/system/metrics";
import { Page } from "@faridalms/ui/system/page";
import { useDesignSystem } from "@faridalms/ui/system/provider";
import {
  RecordHeader,
  RecordStack,
  RecordTabs,
} from "@faridalms/ui/system/record-page";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import { Value } from "@faridalms/ui/system/value";
import {
  createFileRoute,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Banknote,
  FileSignature,
  ListChecks,
  Pause,
  Pencil,
  Plus,
  Receipt,
  School as SchoolIcon,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { attempt } from "../actions";
import { Accepted, AgreementSheet } from "../components/Agreements";
import { ContactSheet, ContactsTable } from "../components/Contacts";
import { EditCustomerSheet } from "../components/CustomerForm";
import { EventList } from "../components/EventList";
import { HealthBadge } from "../components/Health";
import { PauseSheet } from "../components/PauseSheet";
import { PaymentSheet } from "../components/PaymentSheet";
import { CloseTask, TaskTable } from "../components/TaskList";
import {
  formatCountry,
  formatDay,
  formatMoney,
  formatWhenDay,
  INVOICE_KIND_NAMES,
  INVOICE_STATE_NAMES,
  INVOICE_STATE_TONE,
  PAYMENT_METHOD_NAMES,
  STANDING_NAMES,
  STANDING_TONE,
  SUBSCRIPTION_STATE_NAMES,
  SUBSCRIPTION_STATE_TONE,
  TENANT_STATE_NAMES,
  TENANT_STATE_TONE,
} from "../format";
import { useMay } from "../may";
import { getCustomer } from "../server/customers";
import { getCustomerBilling } from "../server/invoicing";
import { endClockPause, setCustomerOwner } from "../server/receivables";

const CUSTOMER_TABS = [
  "about",
  "invoices",
  "payments",
  "schools",
  "contacts",
  "tasks",
  "history",
] as const;
type CustomerTab = (typeof CUSTOMER_TABS)[number];

const TAB_NAMES: Record<CustomerTab, string> = {
  invoices: "Invoices",
  payments: "Payments",
  schools: "Schools",
  contacts: "Contacts",
  tasks: "Tasks",
  about: "About",
  history: "History",
};

const TASK_VIEWS = ["open", "done"] as const;

const customerSearch = v.object({
  tab: v.fallback(v.optional(v.picklist(CUSTOMER_TABS)), undefined),
  status: v.fallback(v.optional(v.array(v.picklist(INVOICE_STATES)), []), []),
  tasks: v.fallback(v.optional(v.picklist(TASK_VIEWS), "open"), "open"),
});

export const Route = createFileRoute("/customers/$customerId")({
  validateSearch: customerSearch,
  search: { middlewares: [stripSearchParams({ status: [], tasks: "open" })] },
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

type Billing = Awaited<ReturnType<typeof getCustomerBilling>>;
type Data = Awaited<ReturnType<typeof getCustomer>> & {
  billing: Billing | null;
};
type InvoiceRow = Billing["invoices"][number];
type PaymentRow = Billing["payments"][number];
type SchoolRow = Data["schools"][number];
type TaskRow = Data["tasks"][number]["task"];

const isOverdue = (invoice: InvoiceRow, today: string) =>
  invoice.state !== "draft" &&
  invoice.owedMinor > 0 &&
  invoice.dueOn !== null &&
  invoice.dueOn < today;

/** Owed on issued invoices, and those past due, oldest first. */
function owing(billing: Billing, today: string) {
  const overdue = billing.invoices
    .filter((invoice) => isOverdue(invoice, today))
    .toSorted((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
  return {
    owed: billing.invoices.reduce(
      (sum, invoice) =>
        invoice.state === "draft" ? sum : sum + invoice.owedMinor,
      0,
    ),
    overdue,
  };
}

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en")} ${count === 1 ? one : many}`;

/**
 * One customer, the account behind its schools. Above the tabs, what to
 * know before calling it and what needs doing; each tab below is one thing
 * it has: invoices, payments, schools, contacts, tasks, its details, and
 * its history.
 */
function CustomerPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const mayBill = useMay("billing");
  const { customer, contacts, billing, owners, tasks, schools, today } = data;
  const editing = useSheet();
  const changingOwner = useSheet();
  const addingContact = useSheet();
  const recording = useSheet();
  const pausing = useSheet();
  const paying = useSheet();
  const closing = useSheet();
  const [closingTask, setClosingTask] = useState<TaskRow | null>(null);
  const open = tasks.filter((row) => !row.task.doneAt);
  const counts: Partial<Record<CustomerTab, number>> = {
    invoices: billing?.invoices.length,
    payments: billing?.payments.length,
    schools: schools.length,
    contacts: contacts.length,
    tasks: open.length,
  };
  const tabs: RecordTab<CustomerTab>[] = CUSTOMER_TABS.filter(
    (value) => (value !== "invoices" && value !== "payments") || billing,
  ).map((value) => ({ value, label: TAB_NAMES[value], count: counts[value] }));
  const fallback = tabs[0]?.value ?? "about";
  const tab =
    search.tab && tabs.some((one) => one.value === search.tab)
      ? search.tab
      : fallback;
  const owner = owners.find((one) => one.id === customer.accountOwnerId);
  const payer = [
    {
      id: customer.id,
      legalNameEn: customer.legalNameEn,
      currency: customer.currency,
    },
  ];
  const current = data.subscriptions.find(
    (subscription) => subscription.state !== "ended",
  );
  return (
    <Page width="record">
      <RecordHeader
        title={customer.legalNameEn}
        status={
          current
            ? {
                label: SUBSCRIPTION_STATE_NAMES[current.state],
                tone: SUBSCRIPTION_STATE_TONE[current.state],
              }
            : { label: "No subscription", tone: "neutral" }
        }
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
          {
            label: "Country and currency",
            value: `${formatCountry(customer.country)} · ${customer.currency}`,
          },
          {
            label: "Account owner",
            value: owner ? `Looked after by ${owner.name}` : "No account owner",
          },
        ]}
        menu={[
          ...(mayBill && billing
            ? [
                {
                  label: "New invoice",
                  icon: Plus,
                  onSelect: () =>
                    void router.navigate({
                      to: "/invoices/new",
                      search: { customerId: customer.id },
                    }),
                },
                {
                  label: "Record a payment",
                  icon: Banknote,
                  onSelect: paying.show,
                },
                {
                  label: "Pause reminders",
                  icon: Pause,
                  onSelect: pausing.show,
                },
              ]
            : []),
          {
            label: "Add contact",
            icon: UserRoundPlus,
            onSelect: addingContact.show,
          },
          {
            label: "Record acceptance",
            icon: FileSignature,
            onSelect: recording.show,
          },
          {
            label: "Change the account owner",
            icon: UserRound,
            onSelect: changingOwner.show,
          },
          {
            label: "Edit legal details",
            icon: Pencil,
            onSelect: editing.show,
          },
        ]}
      />
      <RecordStack>
        <Glance data={data} />
        <ToDo
          data={data}
          onAddContact={addingContact.show}
          onRecord={recording.show}
          onChooseOwner={changingOwner.show}
          onClose={(task) => {
            setClosingTask(task);
            closing.show();
          }}
        />
        <RecordTabs
          label="The customer's records"
          tabs={tabs}
          value={tab}
          onChange={(next) =>
            void navigate({
              search: (previous) => ({
                ...previous,
                tab: next === fallback ? undefined : next,
              }),
              replace: true,
              resetScroll: false,
            })
          }
        >
          {tab === "invoices" && billing ? (
            <InvoicesTab
              data={data}
              billing={billing}
              status={search.status}
              onStatus={(status) =>
                void navigate({
                  search: (previous) => ({ ...previous, status }),
                  replace: true,
                  resetScroll: false,
                })
              }
            />
          ) : tab === "payments" && billing ? (
            <PaymentsTab billing={billing} onPay={paying.show} />
          ) : tab === "schools" ? (
            <SchoolsTab schools={schools} />
          ) : tab === "contacts" ? (
            <ContactsTable
              customerId={customer.id}
              contacts={contacts}
              onAdd={addingContact.show}
            />
          ) : tab === "tasks" ? (
            <TaskTable
              rows={tasks.filter((row) =>
                search.tasks === "done"
                  ? Boolean(row.task.doneAt)
                  : !row.task.doneAt,
              )}
              names={data.names}
              today={today}
              toolbar={{
                facets: [
                  {
                    id: "tasks",
                    label: "Show",
                    single: true,
                    defaultSelected: ["open"],
                    selected: [search.tasks],
                    options: [
                      { value: "open", label: "To do", count: open.length },
                      {
                        value: "done",
                        label: "Done",
                        count: tasks.length - open.length,
                      },
                    ],
                    onChange: (selected) =>
                      void navigate({
                        search: (previous) => ({
                          ...previous,
                          tasks: selected[0] === "done" ? "done" : "open",
                        }),
                        replace: true,
                        resetScroll: false,
                      }),
                  },
                ],
                onReset: () =>
                  void navigate({
                    search: (previous) => ({ ...previous, tasks: "open" }),
                    replace: true,
                    resetScroll: false,
                  }),
              }}
              empty={
                search.tasks === "done"
                  ? {
                      icon: ListChecks,
                      title: "No task done yet",
                      description:
                        "A closed task shows here with what came of it.",
                    }
                  : {
                      icon: ListChecks,
                      title: "Nothing to do for this customer",
                      description:
                        "The console adds a task when something needs a person, such as a call when an invoice is two weeks overdue.",
                    }
              }
            />
          ) : tab === "about" ? (
            <AboutTab
              data={data}
              ownerName={owner?.name ?? null}
              onEdit={editing.show}
              onChangeOwner={changingOwner.show}
              onRecord={recording.show}
            />
          ) : (
            <EventList events={data.history} names={data.names} />
          )}
        </RecordTabs>
      </RecordStack>
      <EditCustomerSheet
        key={`edit-${editing.key}`}
        customer={customer}
        open={editing.open}
        onOpenChange={editing.onOpenChange}
        onSaved={async () => {
          toast.success("Details saved.");
          await router.invalidate();
        }}
      />
      <AccountOwnerSheet
        key={`owner-${changingOwner.key}`}
        customerId={customer.id}
        ownerId={customer.accountOwnerId}
        owners={owners}
        open={changingOwner.open}
        onOpenChange={changingOwner.onOpenChange}
      />
      <ContactSheet
        key={`contact-${addingContact.key}`}
        customerId={customer.id}
        contact={null}
        open={addingContact.open}
        onOpenChange={addingContact.onOpenChange}
      />
      <AgreementSheet
        key={`agreement-${recording.key}`}
        customerId={customer.id}
        open={recording.open}
        onOpenChange={recording.onOpenChange}
      />
      {closingTask ? (
        <CloseTask
          key={`close-${closing.key}`}
          task={closingTask}
          open={closing.open}
          onOpenChange={closing.onOpenChange}
        />
      ) : null}
      {mayBill && billing ? (
        <>
          <PauseSheet
            key={`pause-${pausing.key}`}
            customerId={customer.id}
            today={today}
            open={pausing.open}
            onOpenChange={pausing.onOpenChange}
          />
          <PaymentSheet
            key={`pay-${paying.key}`}
            customers={payer}
            today={today}
            open={paying.open}
            onOpenChange={paying.onOpenChange}
          />
        </>
      ) : null}
    </Page>
  );
}

interface GlanceProps {
  data: Data;
}

/**
 * What to know before calling the customer: what it owes, what it last
 * paid, what it holds and until when, and how many students it has against
 * those it pays for.
 */
function Glance({ data }: GlanceProps) {
  const { formatNumber } = useDesignSystem();
  const { customer, billing, subscriptions, schools, today } = data;
  const money = billing ? owing(billing, today) : null;
  const oldest = money?.overdue[0];
  const current = subscriptions.find(
    (subscription) => subscription.state !== "ended",
  );
  const lastPayment = billing?.payments[0];
  const ends = current?.trialEndsOn ?? current?.termEndsOn ?? null;
  const reported = schools.filter((school) => school.students !== null);
  const enrolled = reported.reduce(
    (sum, school) => sum + (school.students ?? 0),
    0,
  );
  const contracted = current?.contractedStudents ?? null;
  return (
    <MetricGrid label="At a glance">
      {money ? (
        <Metric
          label="Owed"
          value={formatMoney(money.owed, customer.currency)}
          detail={
            oldest?.dueOn
              ? {
                  text: `${formatMoney(
                    money.overdue.reduce(
                      (sum, invoice) => sum + invoice.owedMinor,
                      0,
                    ),
                    customer.currency,
                  )} overdue since ${formatDay(oldest.dueOn)}`,
                  tone: "danger",
                }
              : { text: money.owed ? "Nothing overdue" : "Nothing owed" }
          }
        />
      ) : null}
      {billing ? (
        <Metric
          label="Last payment"
          value={
            lastPayment
              ? formatMoney(lastPayment.amountMinor, lastPayment.currency)
              : "None yet"
          }
          detail={
            lastPayment
              ? {
                  text: `${PAYMENT_METHOD_NAMES[lastPayment.method]}, ${formatDay(lastPayment.receivedOn)}`,
                }
              : undefined
          }
        />
      ) : null}
      <Metric
        label="Plan"
        value={
          current
            ? (current.plan ??
              (current.grandfathered ? "None sold yet" : "No plan"))
            : "None"
        }
        link={
          current
            ? {
                to: "/subscriptions/$subscriptionId",
                params: { subscriptionId: current.id },
              }
            : undefined
        }
        detail={
          current?.grandfathered && !current.plan
            ? { text: "Its schools keep what they had" }
            : current && ends
              ? {
                  text: `${current.state === "trial" ? "Trial ends" : "Term ends"} ${formatDay(ends)}`,
                  tone: ends < today ? "danger" : undefined,
                }
              : current
                ? { text: "No end date" }
                : { text: "Opens with its first school" }
        }
      />
      <Metric
        label="Students"
        value={reported.length ? formatNumber(enrolled) : "Not reported"}
        meter={
          contracted && reported.length ? enrolled / contracted : undefined
        }
        detail={{
          text: contracted
            ? `Of ${formatNumber(contracted)} contracted`
            : "No contracted number",
          tone: contracted && enrolled > contracted ? "warning" : undefined,
        }}
      />
    </MetricGrid>
  );
}

interface ToDoProps {
  data: Data;
  onAddContact: () => void;
  onRecord: () => void;
  onChooseOwner: () => void;
  onClose: (task: TaskRow) => void;
}

/** What needs a person on this account now, most urgent first, each with its fix. */
function ToDo({
  data,
  onAddContact,
  onRecord,
  onChooseOwner,
  onClose,
}: ToDoProps) {
  const router = useRouter();
  const end = useServerFn(endClockPause);
  const mayBill = useMay("billing");
  const { customer, contacts, billing, tasks, subscriptions, names, today } =
    data;
  const items: AttentionItem[] = [];
  if (billing)
    for (const invoice of owing(billing, today).overdue)
      items.push({
        id: `invoice-${invoice.id}`,
        tone: "danger",
        title: `Invoice ${invoice.number ?? ""} is ${plural(daysBetween(invoice.dueOn ?? today, today) - 1, "day", "days")} overdue`,
        detail: `${formatMoney(invoice.owedMinor, invoice.currency)} owed of ${formatMoney(invoice.totalMinor, invoice.currency)}, due ${formatDay(invoice.dueOn ?? today)}`,
        action: (
          <ButtonLink
            variant="outline"
            size="sm"
            to="/invoices/$invoiceId"
            params={{ invoiceId: invoice.id }}
          >
            Open invoice
          </ButtonLink>
        ),
      });
  for (const { task } of tasks)
    if (!task.doneAt && task.dueOn <= today)
      items.push({
        id: `task-${task.id}`,
        tone: task.dueOn < today ? "danger" : "warning",
        title: task.title,
        detail: `${task.dueOn < today ? "Was due" : "Due today"}, ${formatDay(task.dueOn)} · ${task.assigneeId ? (names[task.assigneeId] ?? "A former operator") : "Nobody assigned"}`,
        action: (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onClose(task)}
          >
            Close task
          </Button>
        ),
      });
  const running = billing?.pauses.find(
    (pause) => pause.startsOn <= today && pause.endsOn >= today,
  );
  if (running)
    items.push({
      id: `pause-${running.id}`,
      tone: "info",
      title: `Reminders paused until ${formatDay(running.endsOn)}`,
      detail: <span dir="auto">{running.reason}</span>,
      action: mayBill ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            const failed = await attempt(
              () => end({ data: { id: running.id } }),
              "The pause could not end.",
            );
            if (failed) toast.error(failed);
            else {
              toast.success("Reminders start again tomorrow.");
              await router.invalidate();
            }
          }}
        >
          End the pause
        </Button>
      ) : undefined,
    });
  if (!contacts.some((contact) => contact.roles.includes("billing")))
    items.push({
      id: "billing-contact",
      tone: "warning",
      title: "No billing contact",
      detail: "Invoices and payment reminders are sent to nobody.",
      action: (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddContact}
        >
          Add contact
        </Button>
      ),
    });
  if (!customer.dpaVersion)
    items.push({
      id: "dpa",
      tone: "warning",
      title: "Data processing agreement not accepted",
      detail: data.schools.length
        ? "Record the version the customer signed."
        : "No school can be created for the customer until it is.",
      action: (
        <Button type="button" variant="outline" size="sm" onClick={onRecord}>
          Record acceptance
        </Button>
      ),
    });
  const current = subscriptions.find(
    (subscription) => subscription.state !== "ended",
  );
  if (current?.state === "trial" && current.trialEndsOn) {
    const left = daysBetween(today, current.trialEndsOn) - 1;
    if (left <= 14)
      items.push({
        id: "trial",
        tone: left < 0 ? "danger" : "warning",
        title:
          left < 0
            ? `Trial ended ${formatDay(current.trialEndsOn)} without a contract`
            : `Trial ends in ${plural(left, "day", "days")}`,
        detail: "Set the contract's term and plan on the subscription.",
        action: (
          <ButtonLink
            variant="outline"
            size="sm"
            to="/subscriptions/$subscriptionId"
            params={{ subscriptionId: current.id }}
          >
            Open subscription
          </ButtonLink>
        ),
      });
  }
  if (
    current?.state === "active" &&
    current.termEndsOn &&
    current.renewal !== "auto"
  ) {
    const left = daysBetween(today, current.termEndsOn) - 1;
    if (left <= 60)
      items.push({
        id: "term",
        tone: left < 14 ? "warning" : "info",
        title: `Term ends in ${plural(Math.max(left, 0), "day", "days")}, ${formatDay(current.termEndsOn)}`,
        detail: "It does not renew on its own.",
        action: (
          <ButtonLink
            variant="outline"
            size="sm"
            to="/subscriptions/$subscriptionId"
            params={{ subscriptionId: current.id }}
          >
            Open subscription
          </ButtonLink>
        ),
      });
  }
  if (!customer.accountOwnerId)
    items.push({
      id: "owner",
      tone: "info",
      title: "Nobody looks after this customer",
      detail:
        "The account owner is asked to call when an invoice is two weeks overdue.",
      action: (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onChooseOwner}
        >
          Choose
        </Button>
      ),
    });
  return <AttentionList title="To do" items={items} />;
}

function invoiceColumns(today: string): Column<InvoiceRow>[] {
  return [
    {
      id: "invoice",
      header: "Invoice",
      primary: true,
      cell: (invoice) => (
        <RowLink to="/invoices/$invoiceId" params={{ invoiceId: invoice.id }}>
          {invoice.number ?? "Draft"}
        </RowLink>
      ),
    },
    {
      id: "for",
      header: "For",
      cell: (invoice) =>
        `${INVOICE_KIND_NAMES[invoice.kind]}, ${formatDay(invoice.forDay)}`,
    },
    {
      id: "state",
      header: "Status",
      cell: (invoice) =>
        isOverdue(invoice, today) ? (
          <StatusBadge tone="danger">Overdue</StatusBadge>
        ) : (
          <StatusBadge tone={INVOICE_STATE_TONE[invoice.state]}>
            {INVOICE_STATE_NAMES[invoice.state]}
          </StatusBadge>
        ),
    },
    {
      id: "issued",
      header: "Issued",
      cell: (invoice) =>
        invoice.issuedOn ? (
          formatDay(invoice.issuedOn)
        ) : (
          <Value notApplicable>{null}</Value>
        ),
    },
    {
      id: "due",
      header: "Due",
      cell: (invoice) =>
        !invoice.dueOn || invoice.state === "draft" ? (
          <Value notApplicable>{null}</Value>
        ) : isOverdue(invoice, today) ? (
          <StatusText tone="danger">{formatDay(invoice.dueOn)}</StatusText>
        ) : (
          formatDay(invoice.dueOn)
        ),
    },
    {
      id: "total",
      header: "Total",
      align: "end",
      cell: (invoice) => formatMoney(invoice.totalMinor, invoice.currency),
    },
    {
      id: "owed",
      header: "Owed",
      align: "end",
      cell: (invoice) =>
        invoice.state === "draft" || invoice.owedMinor === 0 ? (
          <Value notApplicable>{null}</Value>
        ) : (
          formatMoney(invoice.owedMinor, invoice.currency)
        ),
    },
  ];
}

const INVOICE_CARD: DataTableCard<InvoiceRow> = {
  title: (invoice) => (
    <RowLink to="/invoices/$invoiceId" params={{ invoiceId: invoice.id }}>
      {invoice.number ?? "Draft"}
    </RowLink>
  ),
  status: (invoice) => (
    <StatusBadge tone={INVOICE_STATE_TONE[invoice.state]}>
      {INVOICE_STATE_NAMES[invoice.state]}
    </StatusBadge>
  ),
  fact: (invoice) =>
    invoice.state !== "draft" && invoice.owedMinor > 0
      ? `${formatMoney(invoice.owedMinor, invoice.currency)} owed of ${formatMoney(invoice.totalMinor, invoice.currency)}`
      : formatMoney(invoice.totalMinor, invoice.currency),
};

interface InvoicesTabProps {
  data: Data;
  billing: Billing;
  status: InvoiceState[];
  onStatus: (status: InvoiceState[]) => void;
}

/** Every invoice, newest first, filtered by status, with the total still owed. */
function InvoicesTab({ data, billing, status, onStatus }: InvoicesTabProps) {
  const { customer, today } = data;
  const mayBill = useMay("billing");
  const rows = status.length
    ? billing.invoices.filter((invoice) => status.includes(invoice.state))
    : billing.invoices;
  const owed = rows.reduce(
    (sum, invoice) =>
      invoice.state === "draft" ? sum : sum + invoice.owedMinor,
    0,
  );
  const newInvoice = mayBill ? (
    <ButtonLink
      variant="outline"
      size="sm"
      to="/invoices/new"
      search={{ customerId: customer.id }}
    >
      <Plus aria-hidden />
      New invoice
    </ButtonLink>
  ) : null;
  return (
    <DataTable
      caption="Invoices"
      rows={rows}
      columns={invoiceColumns(today)}
      rowLabel={(invoice) => invoice.number ?? "Draft"}
      card={INVOICE_CARD}
      toolbar={{
        facets: [
          {
            id: "status",
            label: "Status",
            options: INVOICE_STATES.map((state) => ({
              value: state,
              label: INVOICE_STATE_NAMES[state],
              count: billing.invoices.filter(
                (invoice) => invoice.state === state,
              ).length,
            })),
            selected: status,
            onChange: (selected) =>
              onStatus(
                INVOICE_STATES.filter((state) => selected.includes(state)),
              ),
          },
        ],
        onReset: () => onStatus([]),
      }}
      actions={newInvoice}
      totals={
        owed
          ? [
              {
                id: "owed",
                label: "Owed",
                cells: { owed: formatMoney(owed, customer.currency) },
              },
            ]
          : undefined
      }
      empty={{
        icon: Receipt,
        title: "No invoices yet",
        description:
          "The daily round drafts each invoice of a contract before it falls due; finance issues it from Billing.",
        action: newInvoice,
      }}
    />
  );
}

const PAYMENT_COLUMNS: Column<PaymentRow>[] = [
  {
    id: "received",
    header: "Received",
    primary: true,
    cell: (payment) => formatDay(payment.receivedOn),
  },
  {
    id: "how",
    header: "How",
    cell: (payment) => PAYMENT_METHOD_NAMES[payment.method],
  },
  {
    id: "reference",
    header: "Reference",
    cell: (payment) => (
      <span dir="ltr" className="text-muted-foreground">
        {payment.reference}
      </span>
    ),
  },
  {
    id: "settled",
    header: "Settled",
    width: "medium",
    cell: (payment) => {
      const used = payment.settled.reduce(
        (sum, row) => sum + row.amountMinor,
        0,
      );
      const left = payment.amountMinor - used;
      return (
        <span className="grid gap-0.5">
          {payment.settled.map((row) => (
            <span key={row.invoiceId}>
              <RowLink
                to="/invoices/$invoiceId"
                params={{ invoiceId: row.invoiceId }}
              >
                {row.number ?? "An invoice"}
              </RowLink>
              <span className="text-muted-foreground">
                {" "}
                {formatMoney(row.amountMinor, payment.currency)}
              </span>
            </span>
          ))}
          {left > 0 ? (
            <StatusText tone="warning">
              {formatMoney(left, payment.currency)} not settled yet
            </StatusText>
          ) : null}
        </span>
      );
    },
  },
  {
    id: "amount",
    header: "Amount",
    align: "end",
    cell: (payment) => formatMoney(payment.amountMinor, payment.currency),
  },
];

const PAYMENT_CARD: DataTableCard<PaymentRow> = {
  title: (payment) => formatMoney(payment.amountMinor, payment.currency),
  fact: (payment) =>
    `${PAYMENT_METHOD_NAMES[payment.method]} · ${formatDay(payment.receivedOn)}`,
};

interface PaymentsTabProps {
  billing: Billing;
  onPay: () => void;
}

/** Money received, newest first, and which invoices each settled. */
function PaymentsTab({ billing, onPay }: PaymentsTabProps) {
  const mayBill = useMay("billing");
  const record = mayBill ? (
    <Button type="button" variant="outline" size="sm" onClick={onPay}>
      <Banknote aria-hidden />
      Record a payment
    </Button>
  ) : null;
  return (
    <DataTable
      caption="Payments"
      rows={billing.payments}
      columns={PAYMENT_COLUMNS}
      rowLabel={(payment) => payment.reference}
      card={PAYMENT_CARD}
      actions={record}
      empty={{
        icon: Banknote,
        title: "No payments yet",
        description:
          "A bank transfer is recorded here or in Billing; a card payment made through an invoice's payment link records itself.",
        action: record,
      }}
    />
  );
}

const SCHOOL_COLUMNS: Column<SchoolRow>[] = [
  {
    id: "school",
    header: "School",
    primary: true,
    cell: (school) => (
      <span className="grid min-w-0">
        <RowLink to="/schools/$schoolId" params={{ schoolId: school.id }}>
          {school.name}
        </RowLink>
        <span
          dir="ltr"
          className="truncate text-start text-[13px] leading-[18px] text-muted-foreground"
        >
          {school.slug}
        </span>
      </span>
    ),
  },
  {
    id: "access",
    header: "Access",
    cell: (school) =>
      school.standing ? (
        <StatusBadge tone={STANDING_TONE[school.standing]}>
          {STANDING_NAMES[school.standing]}
        </StatusBadge>
      ) : (
        <StatusBadge tone={TENANT_STATE_TONE[school.tenantState]}>
          {TENANT_STATE_NAMES[school.tenantState]}
        </StatusBadge>
      ),
  },
  {
    id: "health",
    header: "Health",
    cell: (school) =>
      school.health ? (
        <HealthBadge level={school.health} />
      ) : (
        <Value notApplicable>{null}</Value>
      ),
  },
  {
    id: "students",
    header: "Students",
    align: "end",
    cell: (school) =>
      school.students === null ? (
        <span className="text-muted-foreground">Not reported</span>
      ) : school.studentLimit === null ? (
        school.students.toLocaleString("en")
      ) : (
        `${school.students.toLocaleString("en")} of ${school.studentLimit.toLocaleString("en")}`
      ),
  },
  {
    id: "signedIn",
    header: "Signed in this week",
    align: "end",
    cell: (school) =>
      school.signedIn7d === null ? (
        <span className="text-muted-foreground">Not reported</span>
      ) : (
        school.signedIn7d.toLocaleString("en")
      ),
  },
];

const SCHOOL_CARD: DataTableCard<SchoolRow> = {
  title: (school) => (
    <RowLink to="/schools/$schoolId" params={{ schoolId: school.id }}>
      {school.name}
    </RowLink>
  ),
  status: (school) =>
    school.health ? <HealthBadge level={school.health} /> : null,
  fact: (school) =>
    school.standing ? STANDING_NAMES[school.standing] : school.slug,
};

interface SchoolsTabProps {
  schools: SchoolRow[];
}

/** The schools it runs, how each stands and how much each is used. */
function SchoolsTab({ schools }: SchoolsTabProps) {
  return (
    <DataTable
      caption="Schools"
      rows={schools}
      columns={SCHOOL_COLUMNS}
      rowLabel={(school) => school.name}
      card={SCHOOL_CARD}
      empty={{
        icon: SchoolIcon,
        title: "No schools yet",
        description:
          "Its first school is created through New school, which opens its subscription too.",
        action: (
          <ButtonLink variant="outline" to="/schools/new">
            <Plus aria-hidden />
            New school
          </ButtonLink>
        ),
      }}
    />
  );
}

const optional = (text: string | null, dir: "ltr" | "auto" = "auto") => (
  <Value>{text ? <span dir={dir}>{text}</span> : null}</Value>
);

interface AboutTabProps {
  data: Data;
  ownerName: string | null;
  onEdit: () => void;
  onChangeOwner: () => void;
  onRecord: () => void;
}

/**
 * Who the customer is in law, as its invoices name it; who at the business
 * looks after it; and what it has signed.
 */
function AboutTab({
  data,
  ownerName,
  onEdit,
  onChangeOwner,
  onRecord,
}: AboutTabProps) {
  const { customer } = data;
  return (
    <RecordStack>
      <SummaryList
        title="Legal details"
        align="start"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Edit legal details"
            onClick={onEdit}
          >
            <Pencil aria-hidden />
            Edit
          </Button>
        }
        items={[
          {
            id: "nameEn",
            label: "Legal name in English",
            value: optional(customer.legalNameEn),
          },
          {
            id: "nameAr",
            label: "Legal name in Arabic",
            value: (
              <Value>
                {customer.legalNameAr ? (
                  <span dir="rtl" lang="ar">
                    {customer.legalNameAr}
                  </span>
                ) : null}
              </Value>
            ),
          },
          {
            id: "tax",
            label: "Tax registration number",
            value: optional(customer.taxNumber, "ltr"),
          },
          {
            id: "registry",
            label: "Commercial registry",
            value: optional(customer.commercialRegistry, "ltr"),
          },
          {
            id: "address",
            label: "Billing address",
            value: (
              <Value>
                {customer.address ? (
                  <span dir="auto" className="whitespace-pre-line">
                    {customer.address}
                  </span>
                ) : null}
              </Value>
            ),
          },
          {
            id: "country",
            label: "Country and currency",
            value: `${formatCountry(customer.country)}, invoiced in ${customer.currency}`,
          },
        ]}
      />
      <SummaryList
        title="Relationship"
        align="start"
        items={[
          {
            id: "owner",
            label: "Account owner",
            value: ownerName ?? (
              <StatusText tone="warning">Nobody yet</StatusText>
            ),
            action: (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Change the account owner"
                onClick={onChangeOwner}
              >
                Change
              </Button>
            ),
          },
          {
            id: "since",
            label: "Customer since",
            value: formatWhenDay(customer.createdAt),
          },
        ]}
      />
      <SummaryList
        title="Agreements"
        align="start"
        action={
          <Button type="button" variant="ghost" size="sm" onClick={onRecord}>
            <FileSignature aria-hidden />
            Record acceptance
          </Button>
        }
        items={[
          {
            id: "terms",
            label: "Terms of service",
            value: (
              <Accepted
                held={{
                  version: customer.termsVersion,
                  at: customer.termsAcceptedAt,
                }}
              />
            ),
          },
          {
            id: "dpa",
            label: "Data processing agreement",
            value: (
              <Accepted
                held={{
                  version: customer.dpaVersion,
                  at: customer.dpaAcceptedAt,
                }}
              />
            ),
          },
        ]}
      />
    </RecordStack>
  );
}

/** Someone who may look after a customer. */
interface Owner {
  id: string;
  name: string;
}

interface AccountOwnerSheetProps {
  customerId: string;
  ownerId: string | null;
  owners: readonly Owner[];
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
        hint="Asked to call when one of its invoices is two weeks overdue."
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
