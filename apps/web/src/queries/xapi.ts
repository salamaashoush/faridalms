import { queryOptions } from "@tanstack/react-query";

import { getRecordStore } from "~/server/xapi";

export const recordStoreQuery = queryOptions({
  queryKey: ["xapi", "store"],
  queryFn: () => getRecordStore(),
});
