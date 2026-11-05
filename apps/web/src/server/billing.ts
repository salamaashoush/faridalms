import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";

/** The school's invoices, as the platform's business keeps them. */
export const getBilling = createServerFn({ method: "GET" }).handler(() =>
  backend().billing.overview(),
);
