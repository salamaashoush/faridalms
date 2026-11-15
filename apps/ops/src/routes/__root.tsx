import type { ReactNode } from "react";

import { Toaster } from "@faridalms/ui/sonner";
import { DesignSystemProvider } from "@faridalms/ui/system/provider";
import { ErrorPage, NotFoundPage } from "@faridalms/ui/system/status-page";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";

import { CONSOLE_SYSTEM } from "../actions";
import { ConsoleShell } from "../components/ConsoleShell";
import { getAccess } from "../server/directory";
import appCss from "../styles/app.css?url";

/**
 * Pages a customer opens from a link the console sent, and the agreements'
 * public text: no sign-in, and none of the console's frame.
 */
const CUSTOMER_PAGES = ["/offer/", "/agree/", "/legal/"];

const forCustomers = (pathname: string) =>
  CUSTOMER_PAGES.some((prefix) => pathname.startsWith(prefix));

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (forCustomers(location.pathname))
      return { access: null, operator: null, forCustomers: true };
    const access = await getAccess();
    if (!access && location.pathname !== "/sign-in")
      throw redirect({ to: "/sign-in" });
    if (access && access.roles.length === 0 && location.pathname !== "/no-role")
      throw redirect({ to: "/no-role" });
    return {
      access,
      operator: access?.operator ?? null,
      forCustomers: false,
    };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "robots", content: "noindex" },
      { title: "Farida operators" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  errorComponent: (props) => (
    <RootDocument>
      <ErrorPage {...props} />
    </RootDocument>
  ),
  notFoundComponent: NotFoundPage,
  component: RootLayout,
});

/** Signed-in pages sit in the console's frame; signing in has a page of its own. */
function Page() {
  const { access, forCustomers: customers } = Route.useRouteContext();
  if (customers || !access || access.roles.length === 0) return <Outlet />;
  return (
    <ConsoleShell
      operator={{
        name: access.operator.name,
        email: access.operator.email,
        roles: access.roles,
        business: access.business,
      }}
    >
      <Outlet />
    </ConsoleShell>
  );
}

function RootLayout() {
  return (
    <RootDocument>
      <Page />
    </RootDocument>
  );
}

interface RootDocumentProps {
  children: ReactNode;
}

function RootDocument({ children }: RootDocumentProps) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableColorScheme
          enableSystem
        >
          <DesignSystemProvider value={CONSOLE_SYSTEM}>
            {children}
            <Toaster position="top-center" />
          </DesignSystemProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
