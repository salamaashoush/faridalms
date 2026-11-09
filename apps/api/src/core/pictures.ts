import { schoolSwitch } from "@faridalms/database/stores/identity";
import { LIBRARY_USERS } from "@faridalms/domain/media-library";
import { COMMONS_SWITCH } from "@faridalms/domain/pictures";

import type { UnitContext } from "./context";

import { can } from "./procedure";
import { isStaff } from "./reach";

/**
 * Whether the viewer may search Wikimedia Commons for pictures: someone
 * signed in as staff who writes for others, at a school that turned it on.
 * Students and families never may, whatever they hold.
 */
export async function searchesCommons(context: UnitContext) {
  return (
    isStaff(context) &&
    LIBRARY_USERS.some((capability) => can(context, capability)) &&
    (await schoolSwitch(
      context.tx,
      context.tenantId,
      context.schoolId,
      COMMONS_SWITCH,
    ))
  );
}
