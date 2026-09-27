import type { ReactNode } from "react";

import { notifyManager } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { DefaultCatchBoundary } from "./components/DefaultCatchBoundary";
import { NotFound } from "./components/NotFound";
import { createQueryClient } from "./queryClient";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  if (typeof document !== "undefined") {
    notifyManager.setScheduler(window.requestAnimationFrame);
  }

  // Must be per-router, not a module singleton: on the server a shared client
  // would leak cache across requests.
  const queryClient = createQueryClient();

  const router = createTanStackRouter({
    routeTree,
    context: {
      auth: { isAuthenticated: false, workspace: null, school: null },
      queryClient,
    },
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    defaultStructuralSharing: true,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    breadcrumb?: () => string;
    /**
     * The steps after the section, for a page whose crumbs name the record it
     * shows. Replaces `breadcrumb`.
     */
    trail?: ReactNode;
    /**
     * The navigation item this page belongs to, when its path does not say.
     * A page shared across workspaces lists one per workspace; the first the
     * viewer's navigation holds wins.
     */
    section?: string | readonly string[];
    /** The page takes the whole window, without the sidebar or top bar. */
    immersive?: boolean;
  }
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
