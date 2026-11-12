import { useRouteContext } from "@tanstack/react-router";

import { pageOn } from "~/utils/pages";

import { useCurrentUser } from "./useCurrentUser";

/** Whether the viewer's school has a page, by its path. */
export function usePageOn(): (path: string) => boolean {
  const { extensions } = useRouteContext({ from: "__root__" });
  const { modules } = useCurrentUser();
  return (path) => pageOn(extensions, modules, path);
}
