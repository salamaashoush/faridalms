import type { ReactNode } from "react";

import { notifyManager } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { DefaultCatchBoundary } from "./components/DefaultCatchBoundary";
import { NotFound } from "./components/NotFound";
import { createQueryClient } from "./queryClient";
import { routeTree } from "./routeTree.gen";
import { adoptHostView, hostView, sitePathIn, sitePathOut } from "./utils/host";
import "./preview-locale";

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
      auth: {
        isAuthenticated: false,
        workspace: null,
        school: null,
        childMode: false,
      },
      queryClient,
    },
    // A school's website host serves the website's pages from its root, so
    // the router reads `/news` there as `/site/<school>/news` and writes
    // the website's links back without the prefix. Nothing else matches.
    rewrite: {
      input: ({ url }) => {
        const school = hostView().site;
        if (!school) return undefined;
        url.pathname = sitePathIn(url.pathname, school);
        return url;
      },
      output: ({ url }) => {
        const school = hostView().site;
        if (!school) return undefined;
        url.pathname = sitePathOut(url.pathname, school);
        return url;
      },
    },
    // The browser reads its address before anything else, so it needs the
    // host's view first; hydration reads the address again once it has it.
    dehydrate: () => ({ host: hostView() }),
    hydrate: (dehydrated) => adoptHostView(dehydrated.host),
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
