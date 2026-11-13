import { youngClassSchema } from "@faridalms/domain/early-years";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getYoungClassMark = createServerFn({ method: "GET" })
  .validator(checked(youngClassSchema))
  .handler(({ data }) => record(backend().earlyYears.classMark(data)));
