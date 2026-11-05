import * as v from "valibot";

/** What the console asks an operator to do: call a customer, end a contract. */
export const TASK_KINDS = ["call", "contract_end"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** An operator closing a task with what came of it. */
export const taskDoneSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  outcome: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(1000)),
});
export type TaskDone = v.InferOutput<typeof taskDoneSchema>;
