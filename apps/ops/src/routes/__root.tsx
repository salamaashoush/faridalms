import { Toaster } from "@faridalms/ui/sonner";
import { DesignSystemProvider } from "@faridalms/ui/system/provider";
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

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const access = await getAccess();
    if (!access && location.pathname !== "/sign-in")
      throw redirect({ to: "/sign-in" });
    if (access && access.roles.length === 0 && location.pathname !== "/no-role")
      throw redirect({ to: "/no-role" });
    return { access, operator: access?.operator ?? null };
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
  component: RootLayout,
});

/** Signed-in pages sit in the console's frame; signing in has a page of its own. */
function Page() {
  const { access } = Route.useRouteContext();
  if (!access || access.roles.length === 0) return <Outlet />;
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
            <Page />
            <Toaster position="top-center" />
          </DesignSystemProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
