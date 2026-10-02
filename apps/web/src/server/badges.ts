import {
  classBadgesSchema,
  issueBadgesSchema,
  stopBadgeSchema,
} from "@faridalms/domain/identity-schema";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

export const getClassBadges = createServerFn({ method: "GET" })
  .validator(checked(classBadgesSchema))
  .handler(({ data }) => backend().badges.classBadges(data));

export const issueBadges = createServerFn({ method: "POST" })
  .validator(checked(issueBadgesSchema))
  .handler(({ data }) => backend().badges.issueBadges(data));

export const stopBadge = createServerFn({ method: "POST" })
  .validator(checked(stopBadgeSchema))
  .handler(({ data }) => backend().badges.stopBadge(data));
