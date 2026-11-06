import { ErrorPage, NotFoundPage } from "@faridalms/ui/system/status-page";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultErrorComponent: ErrorPage,
    defaultNotFoundComponent: NotFoundPage,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
  interface StaticDataRouteOption {
    /** The navigation item a page lives under, when its path does not say. */
    section?: string;
    /** The page's name in the breadcrumb, after its section. */
    title?: string;
  }
}
