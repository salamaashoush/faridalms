import {
  mentionNamesSchema,
  searchQuerySchema,
} from "@faridalms/domain/search";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";

export const search = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(searchQuerySchema, input))
  .handler(({ data }) => backend().search.find(data));

export const mentionNames = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(mentionNamesSchema, input))
  .handler(({ data }) => backend().search.mentionNames(data));
