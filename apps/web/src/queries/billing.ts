import { queryOptions } from "@tanstack/react-query";

import { getBilling } from "~/server/billing";

export const billingQuery = queryOptions({
  queryKey: ["billing"],
  queryFn: () => getBilling(),
});
