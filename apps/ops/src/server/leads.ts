import { eventsOf } from "@faridalms/database/business/events";
import {
  addActivity,
  createLead,
  dueNextSteps,
  leadById,
  listLeads,
  planLead,
  saveLead,
  setLeadState,
} from "@faridalms/database/business/leads";
import {
  latestQuotesOfLeads,
  quotesFor,
} from "@faridalms/database/business/quotes";
import {
  ACTIVITY_KINDS,
  leadSchema,
  leadStateSchema,
} from "@faridalms/domain/leads";
import { businessToday } from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { requireArea } from "./access";
import { requireBusiness } from "./business";
import { operatorNames, operatorsWhoMay } from "./operators";

const uuid = v.pipe(v.string(), v.uuid());

/** Every lead, and the next steps due today or earlier. */
export const getLeads = createServerFn({ method: "GET" }).handler(async () => {
  await requireArea("leads");
  const db = requireBusiness();
  const today = businessToday();
  const [rows, due, names, quoted] = await Promise.all([
    listLeads(db),
    dueNextSteps(db, today),
    operatorNames(db),
    latestQuotesOfLeads(db),
  ]);
  return {
    today,
    leads: rows.map((lead) => {
      const quote = quoted.get(lead.id);
      return {
        ...lead,
        quote: quote
          ? {
              totalMinor: quote.totalMinor,
              currency: quote.currency,
              state: quote.state,
            }
          : null,
      };
    }),
    due,
    names,
  };
});

export const getLead = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => v.parse(v.object({ id: uuid }), input))
  .handler(async ({ data }) => {
    await requireArea("leads");
    const db = requireBusiness();
    const [found, quotes, history, names, owners] = await Promise.all([
      leadById(db, data.id),
      quotesFor(db, { leadId: data.id }),
      eventsOf(db, "lead", data.id),
      operatorNames(db),
      operatorsWhoMay(db, "leads"),
    ]);
    if (!found) throw new Error("NOT_FOUND");
    return { ...found, quotes, history, names, owners, today: businessToday() };
  });

export const addLead = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof leadSchema>) =>
    v.parse(leadSchema, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("leads");
    return {
      id: await createLead(requireBusiness(), { ...data, by: operator.id }),
    };
  });

const detailsInput = v.object({
  ...leadSchema.entries,
  id: uuid,
  expectedVersion: v.number(),
});

export const saveLeadDetails = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof detailsInput>) =>
    v.parse(detailsInput, input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      const { operator } = await requireArea("leads");
      return (await saveLead(requireBusiness(), { ...data, by: operator.id }))
        ? { ok: true }
        : {
            ok: false,
            message:
              "Someone changed this lead since you opened it. Reload to see their change.",
          };
    },
  );

const moveInput = v.intersect([v.object({ id: uuid }), leadStateSchema]);

/** Moves a lead along the pipeline, with why when it was lost. */
export const moveLead = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof moveInput>) =>
    v.parse(moveInput, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("leads");
    await setLeadState(requireBusiness(), { ...data, by: operator.id });
    return { ok: true };
  });

const planInput = v.object({
  id: uuid,
  ownerId: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
  nextStep: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(300),
    v.transform((value) => value || null),
  ),
  nextStepOn: v.nullable(v.pipe(v.string(), v.isoDate())),
});

export const planLeadStep = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof planInput>) =>
    v.parse(planInput, input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      const { operator } = await requireArea("leads");
      if (
        data.ownerId &&
        !(await operatorsWhoMay(requireBusiness(), "leads")).some(
          (seller) => seller.id === data.ownerId,
        )
      )
        return { ok: false, message: "Choose an owner or sales operator." };
      await planLead(requireBusiness(), { ...data, by: operator.id });
      return { ok: true };
    },
  );

const activityInput = v.object({
  leadId: uuid,
  kind: v.picklist(ACTIVITY_KINDS),
  note: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4000)),
});

export const logActivity = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof activityInput>) =>
    v.parse(activityInput, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("leads");
    await addActivity(requireBusiness(), { ...data, by: operator.id });
    return { ok: true };
  });
