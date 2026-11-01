import { demoRequestSchema } from "@faridalms/domain/product";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

export const requestDemo = createServerFn({ method: "POST" })
  .validator(checked(demoRequestSchema))
  .handler(({ data }) => backend().product.requestDemo(data));
