import * as v from "valibot";

import { keysetField } from "./paging";

export const historyQuerySchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  after: keysetField,
});
export type HistoryQuery = v.InferInput<typeof historyQuerySchema>;
