import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";

export const getPerson = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    v.parse(v.object({ id: v.pipe(v.string(), v.uuid()) }), input),
  )
  .handler(({ data }) => record(backend().getPerson(data)));
