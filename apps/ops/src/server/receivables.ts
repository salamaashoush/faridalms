import type { AgingBucket, DunningStep } from "@faridalms/domain/dunning";

import { setAccountOwner } from "@faridalms/database/business/customers";
import {
  addPause,
  endPause,
  heldStandings,
  owedInvoices,
  pausesOf,
} from "@faridalms/database/business/dunning";
import { finishTask, listTasks } from "@faridalms/database/business/tasks";
import {
  AGING_BUCKETS,
  agingBucket,
  clockDays,
  dunningPauseSchema,
  dunningStep,
} from "@faridalms/domain/dunning";
import { daysBetween } from "@faridalms/domain/school";
import { businessToday } from "@faridalms/domain/subscriptions";
import { taskDoneSchema } from "@faridalms/domain/tasks";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { requireArea } from "./access";
import { requireBusiness } from "./business";
import { operatorNames, operatorsWhoMay } from "./operators";

const uuid = v.pipe(v.string(), v.uuid());

type Outcome = { ok: true } | { ok: false; message: string };

const emptyBuckets = (): Record<AgingBucket, number> =>
  Object.fromEntries(AGING_BUCKETS.map((bucket) => [bucket, 0])) as Record<
    AgingBucket,
    number
  >;

/**
 * What every customer owes, aged by how long ago it fell due, with where
 * the oldest invoice stands on the clock, any pause, the access the clock
 * holds back, and the calls still to make.
 */
export const getReceivables = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireArea("readBilling");
    const db = requireBusiness();
    const today = businessToday();
    const owed = await owedInvoices(db);
    const customerIds = [...new Set(owed.map((row) => row.invoice.customerId))];
    const [pauses, held, calls, names] = await Promise.all([
      pausesOf(db, customerIds),
      heldStandings(db),
      listTasks(db, { open: true }),
      operatorNames(db),
    ]);
    const rows = customerIds.map((customerId) => {
      const mine = owed.filter((row) => row.invoice.customerId === customerId);
      const paused = pauses.filter((pause) => pause.customerId === customerId);
      const buckets = emptyBuckets();
      let oldest: {
        invoiceId: string;
        number: string;
        days: number;
        step: DunningStep | null;
      } | null = null;
      for (const row of mine) {
        buckets[agingBucket(daysBetween(row.dueOn, today) - 1)] +=
          row.owedMinor;
        if (!oldest)
          oldest = {
            invoiceId: row.invoice.id,
            number: row.number,
            days: clockDays(row, paused, today),
            step: dunningStep(
              {
                dueOn: row.dueOn,
                totalMinor: row.invoice.totalMinor,
                owedMinor: row.owedMinor,
              },
              paused,
              today,
            ),
          };
      }
      const [first] = mine;
      return {
        customerId,
        customerName: first?.customerName ?? "",
        currency: first?.invoice.currency ?? "EGP",
        buckets,
        owedMinor: mine.reduce((sum, row) => sum + row.owedMinor, 0),
        oldest,
        pausedUntil:
          paused.find(
            (pause) => pause.startsOn <= today && pause.endsOn >= today,
          )?.endsOn ?? null,
        held:
          held.find((row) => row.customerId === customerId)?.standing ?? null,
      };
    });
    return {
      today,
      rows: rows.toSorted(
        (a, b) => (b.oldest?.days ?? 0) - (a.oldest?.days ?? 0),
      ),
      calls,
      names,
    };
  },
);

/** Stops a customer's clock between two days, with the reason. */
export const pauseClock = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof dunningPauseSchema>) =>
    v.parse(dunningPauseSchema, input),
  )
  .handler(async ({ data }): Promise<Outcome> => {
    const { operator } = await requireArea("billing");
    if (data.endsOn < businessToday())
      return { ok: false, message: "A pause ends today or later." };
    await addPause(requireBusiness(), { ...data, by: operator.id });
    return { ok: true };
  });

/** Ends a pause today, so the clock runs again from tomorrow. */
export const endClockPause = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => v.parse(v.object({ id: uuid }), input))
  .handler(async ({ data }): Promise<Outcome> => {
    const { operator } = await requireArea("billing");
    const ended = await endPause(requireBusiness(), {
      id: data.id,
      today: businessToday(),
      by: operator.id,
    });
    return ended
      ? { ok: true }
      : { ok: false, message: "That pause has already ended." };
  });

/** Closes a task with what came of it. */
export const closeTask = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof taskDoneSchema>) =>
    v.parse(taskDoneSchema, input),
  )
  .handler(async ({ data }): Promise<Outcome> => {
    const { operator } = await requireArea("customers");
    const done = await finishTask(requireBusiness(), {
      ...data,
      by: operator.id,
    });
    return done
      ? { ok: true }
      : { ok: false, message: "That task is already done." };
  });

const ownerInput = v.object({
  customerId: uuid,
  ownerId: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
});

/** Names who looks after a customer: an operator who works with customers, or nobody. */
export const setCustomerOwner = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof ownerInput>) =>
    v.parse(ownerInput, input),
  )
  .handler(async ({ data }): Promise<Outcome> => {
    const { operator } = await requireArea("customers");
    const db = requireBusiness();
    if (
      data.ownerId &&
      !(await operatorsWhoMay(db, "customers")).some(
        (candidate) => candidate.id === data.ownerId,
      )
    )
      return {
        ok: false,
        message: "Choose an operator who works with customers.",
      };
    const saved = await setAccountOwner(db, {
      customerId: data.customerId,
      ownerId: data.ownerId,
      by: operator.id,
    });
    return saved ? { ok: true } : { ok: false, message: "No such customer." };
  });
