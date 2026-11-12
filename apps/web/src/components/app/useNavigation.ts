import { useCurrentUser } from "~/hooks/useCurrentUser";
import { usePageOn } from "~/hooks/usePageOn";
import { useSlot } from "~/hooks/useSlot";

import type { Viewer } from "./navigation";

import { navigationOf, navItems } from "./navigation";

/** The viewer's workspace navigation, core's links and those of the modules on, and what they may open. */
export function useNavigation() {
  const user = useCurrentUser();
  const opens = usePageOn();
  const viewer: Viewer = { capabilities: user.capabilities, opens };
  return {
    sections: navigationOf(user.workspace, useSlot(navItems)),
    viewer,
  };
}
