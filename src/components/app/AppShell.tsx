import type { ReactNode } from "react";

import { Link } from "@tanstack/react-router";
import { GraduationCap, Menu } from "lucide-react";
import { useState } from "react";

import { NAVIGATION } from "~/components/app/navigation";
import { UserMenu } from "~/components/app/UserMenu";
import { LocaleToggle } from "~/components/theme/LocaleToggle";
import { ThemeToggle } from "~/components/theme/ThemeToggle";
import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { ROLE_HOME } from "~/data/identity";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { cn } from "~/utils/cn";

function Brand() {
  const user = useCurrentUser();
  return (
    <Link
      to={ROLE_HOME[user.role]}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
        <GraduationCap className="size-5" aria-hidden />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight">
          {m.appName()}
        </span>
        <span className="text-xs text-muted-foreground">{m.appTagline()}</span>
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser();
  const sections = NAVIGATION[user.role];

  return (
    <nav className="flex flex-col gap-6 py-2" aria-label={m.navPrimary()}>
      {sections.map((section) => {
        const items = section.items.filter(
          (item) =>
            !item.permission || user.permissions.includes(item.permission),
        );
        if (items.length === 0) {
          return null;
        }

        return (
          <div key={section.title()} className="flex flex-col gap-1">
            <h2 className="px-3 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {section.title()}
            </h2>
            {items.map(({ to, label, icon: Icon, exact }) => (
              <Link
                key={to}
                to={to}
                onClick={onNavigate}
                // Exact only for the section index, otherwise it stays active
                // on every child route.
                activeOptions={{ exact: exact === true }}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  "data-[status=active]:bg-primary/10 data-[status=active]:text-primary",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{label()}</span>
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Derived from the locale rather than the live document direction: reading
  // `dir` off the DOM would differ between the SSR pass and hydration.
  const drawerSide = getTextDirection(getLocale()) === "rtl" ? "right" : "left";

  return (
    <div className="min-h-screen bg-muted/30">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-lg"
      >
        {m.navSkipToContent()}
      </a>

      <div className="lg:grid lg:grid-cols-[17rem_1fr]">
        <aside className="sticky top-0 hidden h-screen flex-col border-e border-border bg-background lg:flex">
          <div className="px-4 py-4">
            <Brand />
          </div>
          <div className="flex-1 overflow-y-auto px-3">
            <NavLinks />
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-sm">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    aria-label={m.navOpenMenu()}
                  >
                    <Menu className="size-5" />
                  </Button>
                }
              />
              <SheetContent side={drawerSide} className="w-72 p-0">
                <SheetTitle className="sr-only">{m.navPrimary()}</SheetTitle>
                <div className="px-4 py-4">
                  <Brand />
                </div>
                <div className="overflow-y-auto px-3 pb-8">
                  <NavLinks onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>

            <div className="lg:hidden">
              <Brand />
            </div>

            <div className="ms-auto flex items-center gap-1">
              <LocaleToggle />
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>

          <main id="main" className="flex-1 p-4 sm:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
