import {
  activateToolSchema,
  registerToolSchema,
  saveToolSchema,
  toolRefSchema,
} from "@faridalms/domain/lti";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getLtiTools = createServerFn({ method: "GET" }).handler(() =>
  record(backend().lti.tools()),
);

export const getAvailableTools = createServerFn({ method: "GET" }).handler(() =>
  backend().lti.available(),
);

export const saveLtiTool = createServerFn({ method: "POST" })
  .validator(checked(saveToolSchema))
  .handler(({ data }) => backend().lti.saveTool(data));

export const removeLtiTool = createServerFn({ method: "POST" })
  .validator(checked(toolRefSchema))
  .handler(({ data }) => backend().lti.removeTool(data));

export const activateLtiTool = createServerFn({ method: "POST" })
  .validator(checked(activateToolSchema))
  .handler(({ data }) => backend().lti.activateTool(data));

export const startLtiRegistration = createServerFn({ method: "POST" })
  .validator(checked(registerToolSchema))
  .handler(({ data }) => backend().lti.startRegistration(data));
