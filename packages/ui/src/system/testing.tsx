import type { RenderOptions, RenderResult } from "@testing-library/react";
import type { PropsWithChildren, ReactElement } from "react";

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";

import type { DesignSystemValue } from "./provider";

import { Toaster } from "../sonner";
import { ENGLISH } from "./english";
import { DesignSystemProvider } from "./provider";

export interface SystemRenderOptions extends RenderOptions {
  /** The language to render in; English unless a test needs another. */
  system?: DesignSystemValue;
}

/** Renders a component the way an app does: inside the design system, with toasts. */
export function renderWithSystem(
  component: ReactElement,
  { system = ENGLISH, ...options }: SystemRenderOptions = {},
): RenderResult {
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <DesignSystemProvider value={system}>
        {children}
        <Toaster />
      </DesignSystemProvider>
    );
  }
  return render(component, { wrapper: Wrapper, ...options });
}

export interface PageRenderOptions extends SystemRenderOptions {
  /** Where the page is opened; "/" unless the test needs a deeper path. */
  path?: string;
  /** Further paths the page may link to, each rendering its own path. */
  paths?: string[];
}

/**
 * Renders a page inside a router, for components that link or guard
 * navigation. Every path in `paths` exists and shows its own path, so a
 * test can follow a link and see where it went.
 */
export function renderPageWithSystem(
  Page: () => ReactElement,
  { path = "/", paths = [], ...options }: PageRenderOptions = {},
): RenderResult {
  const root = createRootRoute({ component: Outlet });
  const routes = [...new Set([path, ...paths])].map((route) =>
    createRoute({
      getParentRoute: () => root,
      path: route,
      component: route === path ? Page : () => <p>{route}</p>,
    }),
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return renderWithSystem(<RouterProvider router={router} />, options);
}
