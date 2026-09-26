import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { DirectionProvider } from "@base-ui/react/direction-provider";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense, useSyncExternalStore } from "react";

import type { AuthState } from "~/server/auth";

import { Toaster } from "~/components/ui/sonner";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { currentUserQuery } from "~/queries/user";
import { getAuthState } from "~/server/auth";
import appCss from "~/styles/globals.css?url";

import { DefaultCatchBoundary } from "../components/DefaultCatchBoundary";
import { NotFound } from "../components/NotFound";
import { seo } from "../utils/seo";

// import.meta.env.PROD is statically replaced, so the dynamic import is dropped
// from the production bundle entirely. Do not use the runtime `env` here: it
// resolves PROD to its schema default (false) on the server.
const LazyDevtools = import.meta.env.PROD
  ? () => null
  : lazy(() =>
      import("../components/Devtools").then((res) => ({
        default: res.Devtools,
      })),
    );

// Never changes after hydration, so the subscribe callback has nothing to do.
const noopSubscribe = () => () => {};

function Devtools() {
  // The devtools shell is client-only and throws if server-rendered.
  // useSyncExternalStore returns the server snapshot during SSR and the client
  // one after hydration, which is the same guard without a render-triggering
  // setState in an effect.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  if (!hydrated) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyDevtools />
    </Suspense>
  );
}

interface AppRouterContext {
  auth: AuthState;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
  beforeLoad: async () => {
    const auth = await getAuthState();
    // Return only what this route adds. Router merges it into the existing
    // context, and the return value must be serializable (the QueryClient
    // already in context is not).
    return { auth };
  },
  loader: async ({ context }) => {
    const { auth, queryClient } = context;
    if (auth.isAuthenticated) {
      await queryClient.ensureQueryData(currentUserQuery);
    }
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      ...seo({
        title: m.commonAppName(),
        description: m.commonAppDescription(),
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
      },
      {
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap",
        rel: "stylesheet",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      { rel: "manifest", href: "/site.webmanifest", color: "#fffff" },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  errorComponent: (props) => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    );
  },
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

interface RootDocumentProps {
  children: ReactNode;
}

function RootDocument({ children }: RootDocumentProps) {
  const locale = getLocale();
  const direction = getTextDirection(locale);

  return (
    <html suppressHydrationWarning lang={locale} dir={direction}>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider attribute="class" enableColorScheme enableSystem>
          {/* Base UI reads direction from this context, not from the page, for
              arrow keys in tabs, menus and radios and for popup alignment. */}
          <DirectionProvider direction={direction}>
            {children}
            <Toaster position="top-center" />
          </DirectionProvider>
        </ThemeProvider>
        <Devtools />
        <Scripts />
      </body>
    </html>
  );
}
