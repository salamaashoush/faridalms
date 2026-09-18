import type { ReactNode } from "react";

import { ROLE_HOME } from "@faridalms/domain/identity";
import { Link, useRouterState } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";

import { NAVIGATION } from "~/components/app/navigation";
import { NotificationBell } from "~/components/app/NotificationBell";
import { UserMenu } from "~/components/app/UserMenu";
import { LocaleToggle } from "~/components/theme/LocaleToggle";
import { ThemeToggle } from "~/components/theme/ThemeToggle";
import { Separator } from "~/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "~/components/ui/sidebar";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";

import { WorkspaceBreadcrumb } from "./WorkspaceBreadcrumb";
import { WorkspaceSearch } from "./WorkspaceSearch";

function SidebarContents() {
  const user = useCurrentUser();
  const { setOpenMobile } = useSidebar();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  return (
    <>
      <SidebarHeader className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link to={ROLE_HOME[user.role]} />}
              className="gap-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <GraduationCap className="size-5" aria-hidden />
              </span>
              <span className="grid min-w-0 flex-1 gap-1 text-start">
                <span className="truncate font-semibold">{m.appName()}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.school.name}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={m.navPrimary()}>
          {NAVIGATION[user.role].map((section) => {
            const items = section.items.filter(
              (item) =>
                (!item.permission ||
                  user.permissions.includes(item.permission)) &&
                (!item.feature || user.features[item.feature]),
            );
            if (!items.length) return null;
            return (
              <SidebarGroup key={section.title()}>
                <SidebarGroupLabel>{section.title()}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map(({ to, label, icon: Icon, exact }) => (
                      <SidebarMenuItem key={to}>
                        <SidebarMenuButton
                          tooltip={label()}
                          isActive={
                            exact
                              ? pathname === to
                              : pathname === to || pathname.startsWith(`${to}/`)
                          }
                          render={
                            <Link
                              to={to}
                              activeOptions={{ exact: exact === true }}
                              onClick={() => setOpenMobile(false)}
                            />
                          }
                          className="h-10 gap-3"
                        >
                          <Icon aria-hidden />
                          <span>{label()}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <UserMenu sidebar />
      </SidebarFooter>
    </>
  );
}
function WorkspaceSidebar() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const direction = getTextDirection(getLocale());
  const side = direction === "rtl" ? "right" : "left";
  if (isMobile)
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side={side}
          className="w-72 bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">{m.navPrimary()}</SheetTitle>
          <SheetDescription className="sr-only">
            {m.appTagline()}
          </SheetDescription>
          <Sidebar collapsible="none" className="w-full">
            <SidebarContents />
          </Sidebar>
        </SheetContent>
      </Sheet>
    );
  return (
    <Sidebar variant="inset" collapsible="icon" side={side} dir={direction}>
      <aside className="flex h-full min-h-0 flex-col">
        <SidebarContents />
      </aside>
    </Sidebar>
  );
}
export function AppShell({
  children,
  sidebarOpen = true,
}: {
  children: ReactNode;
  sidebarOpen?: boolean;
}) {
  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-lg"
      >
        {m.navSkipToContent()}
      </a>
      <WorkspaceSidebar />
      <SidebarInset id="main" className="min-w-0" tabIndex={-1}>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm md:rounded-t-xl lg:px-6">
          <SidebarTrigger
            aria-label={m.navOpenMenu()}
            className="rtl:rotate-180"
          />
          <Separator
            orientation="vertical"
            className="h-4 data-vertical:self-auto"
          />
          <WorkspaceBreadcrumb />
          <div className="ms-auto flex min-w-0 items-center gap-1">
            <WorkspaceSearch />
            <NotificationBell />
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
