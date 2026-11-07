import {
  acceptAgreement,
  customerById,
  listCustomers,
  removeContact,
  saveContact,
  saveCustomer,
} from "@faridalms/database/business/customers";
import { owedInvoices } from "@faridalms/database/business/dunning";
import { eventsOf } from "@faridalms/database/business/events";
import {
  listOpenSubscriptions,
  soldInForce,
} from "@faridalms/database/business/subscriptions";
import { listTasks } from "@faridalms/database/business/tasks";
import { mayOperate } from "@faridalms/domain/operators";
import { standingOf } from "@faridalms/domain/provisioning";
import {
  businessToday,
  contactSchema,
  customerSchema,
} from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { requireArea } from "./access";
import { requireBusiness } from "./business";
import { directoryAdmin } from "./directory-admin";
import { schoolHealth } from "./health";
import { operatorNames, operatorsWhoMay } from "./operators";

const uuid = v.pipe(v.string(), v.uuid());

/**
 * Every customer with what a list of them is decided by: the subscription
 * it holds and its plan, how many schools it runs, who looks after it, and
 * for someone who may read billing what it owes and how much is overdue.
 */
export const getCustomers = createServerFn({ method: "GET" }).handler(
  async () => {
    const { roles } = await requireArea("customers");
    const db = requireBusiness();
    const today = businessToday();
    const mayBill = mayOperate(roles, "readBilling");
    const [customers, names, owing, open, schools] = await Promise.all([
      listCustomers(db),
      operatorNames(db),
      mayBill ? owedInvoices(db) : Promise.resolve(null),
      listOpenSubscriptions(db),
      directoryAdmin().schools(),
    ]);
    const sold = await soldInForce(
      db,
      open.map(({ subscription }) => subscription.id),
      today,
    );
    const owed = new Map<string, { owedMinor: number; overdueMinor: number }>();
    for (const row of owing ?? []) {
      const held = owed.get(row.invoice.customerId) ?? {
        owedMinor: 0,
        overdueMinor: 0,
      };
      owed.set(row.invoice.customerId, {
        owedMinor: held.owedMinor + row.owedMinor,
        overdueMinor:
          held.overdueMinor + (row.dueOn < today ? row.owedMinor : 0),
      });
    }
    return {
      mayBill,
      names,
      customers: customers.map((customer) => {
        const held = open.find(
          ({ subscription }) => subscription.customerId === customer.id,
        )?.subscription;
        return {
          ...customer,
          subscription: held
            ? {
                state: held.state,
                plan: sold.get(held.id)?.plan ?? null,
                grandfathered: held.grandfathered,
              }
            : null,
          schools: customer.tenantId
            ? schools.filter((school) => school.tenantId === customer.tenantId)
                .length
            : 0,
          owed: owed.get(customer.id) ?? { owedMinor: 0, overdueMinor: 0 },
        };
      }),
    };
  },
);

/**
 * A customer, its contacts, subscriptions with the plan each holds today,
 * the schools it runs with how each stands, its tasks and its history,
 * with who may look after it.
 */
export const getCustomer = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => v.parse(v.object({ id: uuid }), input))
  .handler(async ({ data }) => {
    await requireArea("customers");
    const db = requireBusiness();
    const today = businessToday();
    const [found, history, names, owners, tasks] = await Promise.all([
      customerById(db, data.id),
      eventsOf(db, "customer", data.id),
      operatorNames(db),
      operatorsWhoMay(db, "customers"),
      listTasks(db, { customerId: data.id }),
    ]);
    if (!found) throw new Error("NOT_FOUND");
    const tenantId = found.customer.tenantId;
    const directory = directoryAdmin();
    const held = tenantId
      ? (await directory.schools()).filter(
          (school) => school.tenantId === tenantId,
        )
      : [];
    const [health, plans] = await Promise.all([
      schoolHealth({ directory, business: db }, held, new Date(), today),
      soldInForce(
        db,
        found.subscriptions.map((subscription) => subscription.id),
        today,
      ),
    ]);
    return {
      ...found,
      subscriptions: found.subscriptions
        .map((subscription) => ({
          ...subscription,
          plan: plans.get(subscription.id)?.plan ?? null,
        }))
        .toReversed(),
      schools: held.map((school) => ({
        id: school.id,
        name: school.nameEn ?? school.nameAr ?? school.slug,
        slug: school.slug,
        tenantState: school.tenantState,
        standing: standingOf(school.tenantState, school.entitlements.access),
        students: school.usage?.students ?? null,
        studentLimit: school.entitlements.students,
        signedIn7d: school.usage?.signedIn7d ?? null,
        health: health.get(school.id)?.level ?? null,
      })),
      history,
      names,
      owners,
      tasks,
      today,
    };
  });

export const saveCustomerDetails = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof customerSchema>) =>
    v.parse(customerSchema, input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; id: string } | { ok: false; message: string }> => {
      const { operator } = await requireArea("customers");
      const id = await saveCustomer(requireBusiness(), {
        ...data,
        by: operator.id,
      });
      return id
        ? { ok: true, id }
        : {
            ok: false,
            message:
              "Someone changed this customer since you opened it. Reload to see their change, then save yours again.",
          };
    },
  );

const agreementSchema = v.object({
  customerId: uuid,
  agreement: v.picklist(["terms", "dpa"]),
  version: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)),
});

/** Records the version of the terms or data processing agreement a customer accepted. */
export const recordAgreement = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof agreementSchema>) =>
    v.parse(agreementSchema, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("customers");
    await acceptAgreement(requireBusiness(), { ...data, by: operator.id });
    return { ok: true };
  });

export const saveCustomerContact = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof contactSchema>) =>
    v.parse(contactSchema, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("customers");
    const id = await saveContact(requireBusiness(), {
      ...data,
      roles: [...new Set(data.roles)],
      by: operator.id,
    });
    return { ok: true, id };
  });

export const removeCustomerContact = createServerFn({ method: "POST" })
  .validator((input: { customerId: string; id: string }) =>
    v.parse(v.object({ customerId: uuid, id: uuid }), input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("customers");
    await removeContact(requireBusiness(), { ...data, by: operator.id });
    return { ok: true };
  });
