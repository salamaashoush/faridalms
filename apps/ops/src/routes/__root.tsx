import type { ReactNode } from "react";

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

import { getOperator } from "../server/directory";
import appCss from "../styles/app.css?url";

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const operator = await getOperator();
    if (!operator && location.pathname !== "/sign-in")
      throw redirect({ to: "/sign-in" });
    return { operator };
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

function Shell({ children }: { children: ReactNode }) {
  const { operator } = Route.useRouteContext();
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-6 py-2">
          <span className="text-sm font-semibold">Farida operators</span>
          {operator ? (
            <>
              <nav aria-label="Console" className="flex gap-1 text-sm">
                <Link
                  to="/"
                  activeOptions={{ exact: true }}
                  className="rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground"
                >
                  Schools
                </Link>
                <Link
                  to="/series"
                  className="rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground"
                >
                  Exam sessions
                </Link>
                <Link
                  to="/changes"
                  className="rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground"
                >
                  Changes
                </Link>
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
