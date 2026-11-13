import { useRouteContext } from "@tanstack/react-router";

import type { Slot } from "~/utils/extension";

import { filled } from "~/utils/extension";

import { useCurrentUser } from "./useCurrentUser";

/** What the modules on at the viewer's school put in a slot. */
export function useSlot<T>(to: Slot<T>): T[] {
  const { extensions } = useRouteContext({ from: "__root__" });
  return filled(extensions, useCurrentUser(), to);
}
