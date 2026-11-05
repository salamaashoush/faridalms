import {
  acceptAgreement,
  customerById,
  listCustomers,
  removeContact,
  saveContact,
  saveCustomer,
} from "@faridalms/database/business/customers";
import { eventsOf } from "@faridalms/database/business/events";
import { contactSchema, customerSchema } from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { requireArea } from "./access";
import { requireBusiness } from "./business";
import { directoryAdmin } from "./directory-admin";
import { operatorNames } from "./operators";

const uuid = v.pipe(v.string(), v.uuid());

export const getCustomers = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireArea("customers");
    return listCustomers(requireBusiness());
  },
);

/** A customer, its contacts, subscriptions, the schools it runs and its history. */
export const getCustomer = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => v.parse(v.object({ id: uuid }), input))
  .handler(async ({ data }) => {
    await requireArea("customers");
    const db = requireBusiness();
    const [found, history, names] = await Promise.all([
      customerById(db, data.id),
      eventsOf(db, "customer", data.id),
      operatorNames(db),
    ]);
    if (!found) throw new Error("NOT_FOUND");
    const tenantId = found.customer.tenantId;
    const schools = tenantId
      ? (await directoryAdmin().schools())
          .filter((school) => school.tenantId === tenantId)
          .map((school) => ({
            id: school.id,
            name: school.nameEn ?? school.nameAr ?? school.slug,
          }))
      : [];
    return { ...found, schools, history, names };
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
