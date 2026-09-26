import type { ReactNode } from "react";

import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  Check,
  ChevronsUpDown,
  Ellipsis,
  GraduationCap,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Settings2,
  Sun,
  UserRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback } from "react";

import type { NavItem } from "~/components/app/navigation";

import { MOBILE_TABS, NAVIGATION } from "~/components/app/navigation";
import { NotificationBell } from "~/components/app/NotificationBell";
import { initialsOf, WORKSPACE_LABEL } from "~/components/app/UserMenu";
import { WorkspaceBreadcrumb } from "~/components/app/WorkspaceBreadcrumb";
import { WorkspaceSearch } from "~/components/app/WorkspaceSearch";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "~/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
import {
  getLocale,
  getTextDirection,
  locales,
  setLocale,
} from "~/i18n/runtime";
import { logout } from "~/server/auth";
import { cn } from "~/utils/cn";

import {
  PageActionsProvider,
  PageActionsSlot,
  PageLeadingSlot,
} from "./PageActions";

const LOCALE_NAME: Record<string, string> = { en: "English", ar: "العربية" };

function useVisibleNavigation() {
  const user = useCurrentUser();
  return NAVIGATION[user.workspace]
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          (!item.capability || user.capabilities.includes(item.capability)) &&
          (!item.feature || user.features[item.feature]),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

function useIsActive() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const section = useRouterState({
    select: (state) => state.matches.at(-1)?.staticData.section ?? null,
  });
  return (item: NavItem) =>
    section
      ? item.to === section
      : item.exact
        ? pathname === item.to
        : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function AccountMenu() {
  const user = useCurrentUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const signOut = useCallback(async () => {
    await logout();
    // The cache outlives the session cookie: without this the signed-out tab
    // still holds the profile and every other authed query.
    queryClient.clear();
    await router.invalidate();
    await router.navigate({ to: "/sign-in" });
  }, [router, queryClient]);
  const current = getLocale();
  const themes = [
    { value: "light", label: m.shellThemeLight(), icon: Sun },
    { value: "dark", label: m.shellThemeDark(), icon: Moon },
    { value: "system", label: m.shellThemeSystem(), icon: Monitor },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            aria-label={m.shellAccount()}
            className="h-11 gap-2.5 px-2 data-popup-open:bg-sidebar-accent"
          />
        }
      >
        <Avatar className="size-7 rounded-md">
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback className="rounded-md bg-primary/12 text-[11px] font-semibold text-primary">
            {initialsOf(user.name)}
          </AvatarFallback>
        </Avatar>
        <span className="grid min-w-0 flex-1 text-start leading-tight">
          <span dir="auto" className="truncate text-start text-sm font-medium">
            {user.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {WORKSPACE_LABEL[user.workspace]()}
          </span>
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="grid gap-0.5 py-2">
            <span
              dir="auto"
              className="truncate text-start text-sm font-medium text-foreground"
            >
              {user.name}
            </span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<Link to="/people/$userId" params={{ userId: user.id }} />}
        >
          <UserRound aria-hidden />
          {m.shellProfile()}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/notification-preferences" />}>
          <Settings2 aria-hidden />
          {m.shellPreferences()}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages aria-hidden />
            {m.shellLanguage()}
            <span className="ms-auto text-xs text-muted-foreground">
              {LOCALE_NAME[current]}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {locales.map((locale) => (
              <DropdownMenuItem
                key={locale}
                lang={locale}
                // setLocale writes the cookie and reloads, so the next document
                // is rendered by the server in the new language.
                onClick={() => void setLocale(locale)}
              >
                {LOCALE_NAME[locale]}
                {locale === current ? (
                  <Check className="ms-auto" aria-hidden />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun aria-hidden />
            {m.shellTheme()}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {themes.map((item) => (
              <DropdownMenuItem
                key={item.value}
                onClick={() => setTheme(item.value)}
              >
                <item.icon aria-hidden />
                {item.label}
                {theme === item.value ? (
                  <Check className="ms-auto" aria-hidden />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut aria-hidden />
          {m.shellSignOut()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody() {
  const user = useCurrentUser();
  const { setOpenMobile } = useSidebar();
  const sections = useVisibleNavigation();
  const isActive = useIsActive();
  return (
    <>
      <SidebarHeader className="gap-3 px-3 pt-3 pb-2">
        {/* The mobile sheet's close button sits over the end of this row. */}
        <Link
          to={WORKSPACE_HOME[user.workspace]}
          className="flex h-10 items-center gap-2.5 rounded-md px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring in-data-[slot=sheet-content]:me-10"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="size-4" aria-hidden />
          </span>
          <span className="grid min-w-0 flex-1 leading-tight">
            <span
              dir="auto"
              className="max-w-full justify-self-start truncate text-sm font-semibold"
            >
              {user.school.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {m.appName()}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <WorkspaceSearch variant="sidebar" />
          </div>
          <NotificationBell className="size-8" />
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-1">
        <nav aria-label={m.navPrimary()}>
          {sections.map((section, index) => (
            <SidebarGroup key={section.title?.() ?? index} className="py-1">
              {section.title ? (
                <SidebarGroupLabel className="h-7 text-xs font-medium text-muted-foreground">
                  {section.title()}
                </SidebarGroupLabel>
              ) : null}
              <SidebarGroupContent>
                <SidebarMenu className="gap-px">
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        isActive={isActive(item)}
                        render={
                          <Link
                            to={item.to}
                            activeOptions={{ exact: item.exact === true }}
                            onClick={() => setOpenMobile(false)}
                          />
                        }
                        className="h-8 gap-2.5 px-2 text-sm text-sidebar-foreground data-active:font-medium data-active:text-sidebar-accent-foreground"
                      >
                        <item.icon className="size-4" aria-hidden />
                        <span className="truncate">{item.label()}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu />
          </SidebarMenuItem>
        </SidebarMenu>
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
            <SidebarBody />
          </Sidebar>
        </SheetContent>
      </Sheet>
    );
  return (
    <Sidebar
      collapsible="offcanvas"
      side={side}
      dir={direction}
      className="border-e"
    >
      <SidebarBody />
    </Sidebar>
  );
}

function MobileTabs() {
  const user = useCurrentUser();
  const { setOpenMobile } = useSidebar();
  const isActive = useIsActive();
  const items = useVisibleNavigation().flatMap((section) => section.items);
  const tabs = MOBILE_TABS[user.workspace]
    .map((to) => items.find((item) => item.to === to))
    .filter((item) => item !== undefined);
  return (
    <nav
      aria-label={m.navPrimary()}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {tabs.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: item.exact === true }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-5" aria-hidden />
                <span className="max-w-full truncate px-1">{item.label()}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            className="flex h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
          >
            <Ellipsis className="size-5" aria-hidden />
            {m.shellMore()}
          </button>
        </li>
      </ul>
    </nav>
  );
}

export function Shell({
  children,
  sidebarOpen = true,
}: {
  children: ReactNode;
  sidebarOpen?: boolean;
}) {
  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <PageActionsProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-lg"
        >
          {m.navSkipToContent()}
        </a>
        <WorkspaceSidebar />
        <SidebarInset id="main" className="min-w-0 bg-background" tabIndex={-1}>
          <header
            data-slot="top-bar"
            className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur-md lg:px-4"
          >
            <SidebarTrigger
              aria-label={m.navOpenMenu()}
              className="size-8 max-md:size-10 rtl:rotate-180"
            />
            <PageLeadingSlot />
            <div className="min-w-0 flex-1">
              <WorkspaceBreadcrumb />
            </div>
            <PageActionsSlot />
            <div data-slot="global-tools" className="md:hidden">
              <NotificationBell className="size-8 max-md:size-10" />
            </div>
          </header>
          <div className="flex flex-1 flex-col px-4 py-6 pb-24 sm:px-6 md:pb-10">
            {children}
          </div>
          <MobileTabs />
        </SidebarInset>
      </PageActionsProvider>
    </SidebarProvider>
  );
}
