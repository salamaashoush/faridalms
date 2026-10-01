import {
  saveTemplateSchema,
  templateKindSchema,
  templateRefSchema,
} from "@faridalms/domain/templates";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

export const listTemplates = createServerFn({ method: "GET" })
  .validator(checked(templateKindSchema))
  .handler(({ data }) => backend().templates.list(data));

export const openTemplate = createServerFn({ method: "GET" })
  .validator(checked(templateRefSchema))
  .handler(({ data }) => backend().templates.open(data));

export const saveTemplate = createServerFn({ method: "POST" })
  .validator(checked(saveTemplateSchema))
  .handler(({ data }) => backend().templates.save(data));

export const removeTemplate = createServerFn({ method: "POST" })
  .validator(checked(templateRefSchema))
  .handler(({ data }) => backend().templates.remove(data));
