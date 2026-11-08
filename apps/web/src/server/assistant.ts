import { assistantSettingsSchema } from "@faridalms/domain/assistant";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

export const getAssistantSettings = createServerFn({ method: "GET" }).handler(
  () => backend().assistant.settings(),
);

export const saveAssistantSettings = createServerFn({ method: "POST" })
  .validator(checked(assistantSettingsSchema))
  .handler(({ data }) => backend().assistant.saveSettings(data));

export const getAssistantStatus = createServerFn({ method: "GET" }).handler(
  () => backend().assistant.status(),
);
