import type { LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { Link, useRouterState } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Ellipsis, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Avatar, AvatarFallback, AvatarImage } from "../avatar";
import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../breadcrumb";
import { cn } from "../cn";
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
} from "../dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../sheet";
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
} from "../sidebar";
import {
  PageActionsProvider,
  PageActionsSlot,
  PageLeadingSlot,
} from "./page-actions";
import { useDesignSystem, useSystemStrings } from "./provider";

/** One destination in the sidebar, and in the phone's tab bar when chosen. */
export interface ShellNavItem {
  /** A path in the app; checked against the app's routes where it is written. */
  to: string;
  label: string;
  icon: LucideIcon;
  /** Active only on its own path, not on the pages beneath it. */
  exact?: boolean;
  /** Something counted beside the label, such as unread messages. */
  badge?: ReactNode;
}

/** A titled group of destinations; the first group usually has no title. */
export interface ShellNavSection {
  title?: string;
  items: ShellNavItem[];
}

export type ShellIsActive = (item: ShellNavItem) => boolean;

/**
 * The item a path belongs to: its own path, or the deepest item whose path
 * the page sits beneath.
 */
export function useActiveByPath(): ShellIsActive {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  return (item) => {
    const to = item.to;
    return item.exact
      ? pathname === to
      : pathname === to || pathname.startsWith(`${to}/`);
  };
}

export interface ShellBrandProps {
  /** The app's home. */
  to: string;
  icon: LucideIcon;
  /** The school, or the product: what this sidebar belongs to. */
  title: string;
  subtitle: string;
}

/** The sidebar's first row: a mark and two lines naming where this is. */
export function ShellBrand({
  to,
  icon: Icon,
  title,
  subtitle,
}: ShellBrandProps) {
  return (
    // The mobile sheet's close button sits over the end of this row.
    <Link
      to={to}
      className="flex h-10 items-center gap-2.5 rounded-md px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring in-data-[slot=sheet-content]:me-10"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="grid min-w-0 flex-1 leading-tight">
        <span
          dir="auto"
          className="max-w-full justify-self-start truncate text-sm font-semibold"
        >
          {title}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </Link>
  );
}

/** Up to two initials, for an avatar without a photo. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export interface ShellAccountProps {
  /** Names the menu's button for screen readers. */
  label: string;
  name: string;
  /** The second line under the name, such as the workspace or role. */
  detail: string;
  email?: string | null;
  avatarUrl?: string | null;
  /** The menu's items: DropdownMenuItem, separators and submenus. */
  children: ReactNode;
}

/** The sidebar footer: who is signed in, opening their account menu. */
export function ShellAccount({
  label,
  name,
  detail,
  email,
  avatarUrl,
  children,
}: ShellAccountProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            aria-label={label}
            className="h-11 gap-2.5 px-2 data-popup-open:bg-sidebar-accent"
          />
        }
      >
        <Avatar className="size-7 rounded-md">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className="rounded-md bg-primary/12 text-[11px] font-semibold text-primary">
            {initialsOf(name)}
          </AvatarFallback>
        </Avatar>
        <span className="grid min-w-0 flex-1 text-start leading-tight">
          <span dir="auto" className="truncate text-start text-sm font-medium">
            {name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {detail}
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
              {name}
            </span>
            {email ? (
              <span className="truncate text-xs font-normal text-muted-foreground">
                {email}
              </span>
            ) : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const THEMES = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

/** Light, dark or the device's own, as a submenu of the account menu. */
export function ThemeSubmenu() {
  const strings = useSystemStrings();
  const { theme, setTheme } = useTheme();
  const label = {
    light: strings.themeLight,
    dark: strings.themeDark,
    system: strings.themeSystem,
  };
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Sun aria-hidden />
        {strings.theme}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-44">
        {THEMES.map((item) => (
          <DropdownMenuItem key={item.value} onClick={() => setTheme(item.value)}>
            <item.icon aria-hidden />
            {label[item.value]}
            {theme === item.value ? (
              <Check className="ms-auto" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export interface ShellNavProps {
  label: string;
  sections: ShellNavSection[];
  isActive: ShellIsActive;
}

function ShellNav({ label, sections, isActive }: ShellNavProps) {
  const { setOpenMobile } = useSidebar();
  return (
    <nav aria-label={label}>
      {sections.map((section, index) => (
        <SidebarGroup key={section.title ?? index} className="py-1">
          {section.title ? (
            <SidebarGroupLabel className="h-7 text-xs font-medium text-muted-foreground">
              {section.title}
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
                    <span className="truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="ms-auto">{item.badge}</span>
                    ) : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  );
}

export interface ShellSidebarProps {
  brand: ReactNode;
  /** Global tools under the brand, such as search and notifications. */
  tools?: ReactNode;
  navigation: ShellNavSection[];
  navigationLabel: string;
  isActive: ShellIsActive;
  /** The sidebar footer, usually ShellAccount. */
  account: ReactNode;
  /** Describes the phone's navigation sheet for screen readers. */
  description: string;
}

function SidebarBody({
  brand,
  tools,
  navigation,
  navigationLabel,
  isActive,
  account,
}: ShellSidebarProps) {
  return (
    <>
      <SidebarHeader className="gap-3 px-3 pt-3 pb-2">
        {brand}
        {tools}
      </SidebarHeader>
      <SidebarContent className="gap-0 px-1">
        <ShellNav
          label={navigationLabel}
          sections={navigation}
          isActive={isActive}
        />
      </SidebarContent>
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>{account}</SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}

function ShellSidebar(props: ShellSidebarProps) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const { direction } = useDesignSystem();
  const side = direction === "rtl" ? "right" : "left";
  if (isMobile)
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side={side}
          className="w-72 bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">{props.navigationLabel}</SheetTitle>
          <SheetDescription className="sr-only">
            {props.description}
          </SheetDescription>
          <Sidebar collapsible="none" className="w-full">
            <SidebarBody {...props} />
          </Sidebar>
        </SheetContent>
      </Sheet>
    );
  return (
    <Sidebar
      collapsible="offcanvas"
      side={side}
      dir={direction}
      className="border-e print:hidden"
    >
      <SidebarBody {...props} />
    </Sidebar>
  );
}

export interface ShellTabsProps {
  label: string;
  items: ShellNavItem[];
  isActive: ShellIsActive;
}

/** The phone's bottom bar: up to four destinations, then More for the rest. */
function ShellTabs({ label, items, isActive }: ShellTabsProps) {
  const strings = useSystemStrings();
  const { setOpenMobile } = useSidebar();
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: item.exact === true }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-5" aria-hidden />
                <span className="max-w-full truncate px-1">{item.label}</span>
                {item.badge ? (
                  <span className="absolute start-1/2 top-1.5 ms-2">
                    {item.badge}
                  </span>
                ) : null}
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
            {strings.more}
          </button>
        </li>
      </ul>
    </nav>
  );
}

export interface AppShellProps extends ShellSidebarProps {
  /** Where the page sits: the top bar's breadcrumb. */
  breadcrumb: ReactNode;
  /** Global tools kept at the end of the top bar on phones. */
  barTools?: ReactNode;
  /** Destinations for the phone's bottom bar; without them phones use the menu. */
  tabs?: ShellNavItem[];
  /** A notice above every page, such as a contract about to lapse. */
  notice?: ReactNode;
  sidebarOpen?: boolean;
  children: ReactNode;
}

/**
 * The frame of every signed-in page: the sidebar with the app's navigation
 * and account, a 48px top bar holding the breadcrumb and the page's actions,
 * then the page with 24px of padding (16px on phones).
 */
export function AppShell({
  breadcrumb,
  barTools,
  tabs,
  notice,
  sidebarOpen = true,
  children,
  ...sidebar
}: AppShellProps) {
  const strings = useSystemStrings();
  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <PageActionsProvider>
        <a
          href="#main"
          className="sr-only start-0 top-0 m-0 focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-lg"
        >
          {strings.skipToContent}
        </a>
        <ShellSidebar {...sidebar} />
        <SidebarInset
          id="main"
          tabIndex={-1}
          data-tabs={tabs ? true : undefined}
          className="min-w-0 bg-background max-md:data-tabs:[--shell-bottom-bar:3.5rem]"
        >
          <header
            data-slot="top-bar"
            className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur-md lg:px-4 print:hidden"
          >
            <SidebarTrigger
              aria-label={strings.openMenu}
              className="size-8 max-md:size-10 rtl:rotate-180"
            />
            <PageLeadingSlot />
            <div className="min-w-0 flex-1">{breadcrumb}</div>
            <PageActionsSlot />
            {barTools ? (
              <div
                data-slot="global-tools"
                className="flex items-center md:hidden"
              >
                {barTools}
              </div>
            ) : null}
          </header>
          <div
            className={cn(
              "flex flex-1 flex-col px-4 py-6 sm:px-6 print:p-0",
              tabs ? "pb-24 md:pb-10" : "pb-10",
            )}
          >
            {notice}
            {children}
          </div>
          {tabs ? (
            <ShellTabs
              label={sidebar.navigationLabel}
              items={tabs}
              isActive={sidebar.isActive}
            />
          ) : null}
        </SidebarInset>
      </PageActionsProvider>
    </SidebarProvider>
  );
}

export interface BreadcrumbStepProps {
  /** The link to the step, such as `<Link to="/schools" />`. */
  render: ReactElement;
  children: ReactNode;
}

/** A step on the way to the page. Phones show the page alone. */
export function BreadcrumbStep({ render, children }: BreadcrumbStepProps) {
  return (
    <>
      <BreadcrumbItem className="hidden min-w-0 sm:inline-flex">
        <BreadcrumbLink render={render} dir="auto" className="truncate">
          {children}
        </BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbSeparator className="hidden sm:inline-flex rtl:rotate-180" />
    </>
  );
}

export interface BreadcrumbCurrentProps {
  children: ReactNode;
}

/** The page itself, last in the breadcrumb. */
export function BreadcrumbCurrent({ children }: BreadcrumbCurrentProps) {
  return (
    <BreadcrumbItem className="min-w-0">
      <BreadcrumbPage dir="auto" className="truncate font-medium">
        {children}
      </BreadcrumbPage>
    </BreadcrumbItem>
  );
}
