import type { OperatorArea } from "@faridalms/domain/operators";
import type { ReactNode } from "react";

import { mayOperate } from "@faridalms/domain/operators";
import { Button } from "@faridalms/ui/button";
import { Toaster } from "@faridalms/ui/sonner";
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  redirect,
  Scripts,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";

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

/** The console's sections, each shown to the roles that may use it. */
const NAVIGATION: {
  to:
    | "/"
    | "/series"
    | "/changes"
    | "/subscriptions"
    | "/customers"
    | "/catalogue"
    | "/operators";
  label: string;
  area: OperatorArea;
  /** Offered only where the console has its business database. */
  business?: boolean;
}[] = [
  { to: "/", label: "Schools", area: "readTenants" },
  { to: "/series", label: "Exam sessions", area: "readTenants" },
  { to: "/changes", label: "Changes", area: "readTenants" },
  {
    to: "/subscriptions",
    label: "Subscriptions",
    area: "readSubscriptions",
    business: true,
  },
  { to: "/customers", label: "Customers", area: "customers", business: true },
  { to: "/catalogue", label: "Catalogue", area: "catalogue", business: true },
  { to: "/operators", label: "Operators", area: "operators", business: true },
];

function Shell({ children }: { children: ReactNode }) {
  const { operator, access } = Route.useRouteContext();
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-6 py-2">
          <span className="text-sm font-semibold">Farida operators</span>
          {operator ? (
            <>
              <nav
                aria-label="Console"
                className="flex flex-wrap gap-1 text-sm"
              >
                {NAVIGATION.filter(
                  (item) =>
                    (!item.business || access?.business) &&
                    mayOperate(access?.roles ?? [], item.area),
                ).map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.to === "/" }}
                    className="rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <form
                method="post"
                action="/auth/logout"
                className="ms-auto flex items-center gap-3 text-sm"
              >
                <span className="text-muted-foreground max-sm:hidden">
                  {operator.name}
                </span>
                <Button type="submit" variant="ghost" size="sm">
                  Sign out
                </Button>
              </form>
            </>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

function RootLayout() {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Shell>
            <Outlet />
          </Shell>
          <Toaster />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
