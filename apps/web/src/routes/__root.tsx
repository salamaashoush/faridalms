import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { MathDigits } from "@faridalms/editor/math-digits";
import { Toaster } from "@faridalms/ui/sonner";
import { DesignSystemProvider } from "@faridalms/ui/system/provider";
import { ErrorPage, NotFoundPage } from "@faridalms/ui/system/status-page";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";

import type { AuthState } from "~/server/auth";
import type { ModuleFillings } from "~/utils/extension";

import { portalDesignSystem } from "~/components/app/design-system";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { currentUserQuery } from "~/queries/user";
import { getAuthState } from "~/server/auth";
import appCss from "~/styles/globals.css?url";
import { digits } from "~/utils/digits";
import { hostView } from "~/utils/host";
import { iconsFor } from "~/utils/icons";

import { bareHref } from "../utils/host";
import { seo } from "../utils/seo";

interface AppRouterContext {
  auth: AuthState;
  queryClient: QueryClient;
  /** Every module's fillings for the slots pages declare. */
  extensions: readonly ModuleFillings[];
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
  beforeLoad: async () => {
    // Nothing on a school's website host reads a session.
    const auth: AuthState = hostView().site
      ? {
          isAuthenticated: false,
          workspace: null,
          school: null,
          childMode: false,
        }
      : await getAuthState();
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
  head: ({ matches }) => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      ...(matches.some((match) => match.staticData.website)
        ? []
        : seo({
            title: m.commonAppName(),
            description: m.commonAppDescription(),
            image: bareHref("/og-image.png"),
          })),
      { name: "theme-color", content: "#153f3a" },
    ],
    links: [{ rel: "stylesheet", href: appCss }, ...iconsFor(matches)],
  }),
  errorComponent: (props) => {
    return (
      <RootDocument>
        <ErrorPage {...props} />
      </RootDocument>
    );
  },
  notFoundComponent: NotFoundPage,
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
          <DesignSystemProvider value={portalDesignSystem()}>
            <MathDigits value={digits()}>
              {children}
              <Toaster position="top-center" />
            </MathDigits>
          </DesignSystemProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
