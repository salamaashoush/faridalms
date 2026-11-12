import type { OperatorArea, OperatorRole } from "@faridalms/domain/operators";
import type {
  ShellIsActive,
  ShellNavItem,
  ShellNavSection,
} from "@faridalms/ui/system/app-shell";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { mayOperate } from "@faridalms/domain/operators";
import { Breadcrumb, BreadcrumbList } from "@faridalms/ui/breadcrumb";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@faridalms/ui/dropdown-menu";
import {
  AppShell,
  BreadcrumbCurrent,
  BreadcrumbStep,
  ShellAccount,
  ShellBrand,
  ThemeSubmenu,
} from "@faridalms/ui/system/app-shell";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  History,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  Repeat,
  School,
  Settings,
  ShieldCheck,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { useRef } from "react";

import { OPERATOR_ROLE_NAMES } from "../format";

/** A destination in the console, offered to the roles whose area it is. */
interface ConsoleNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  area: OperatorArea;
  /** Needs the business database: customers, billing, roles. */
  business?: boolean;
  exact?: boolean;
}

interface ConsoleNavSection {
  title?: string;
  items: ConsoleNavItem[];
}

/** The console's sections, grouped by the work they belong to. */
const NAVIGATION: ConsoleNavSection[] = [
  {
    items: [
      {
        to: "/",
        label: "Home",
        icon: LayoutDashboard,
        area: "readTenants",
        exact: true,
      },
    ],
  },
  {
    title: "Schools",
    items: [
      { to: "/schools", label: "Schools", icon: School, area: "readTenants" },
      { to: "/changes", label: "Changes", icon: History, area: "readTenants" },
    ],
  },
  {
    title: "Sales",
    items: [
      {
        to: "/leads",
        label: "Leads",
        icon: Target,
        area: "leads",
        business: true,
      },
      {
        to: "/customers",
        label: "Customers",
        icon: Building2,
        area: "customers",
        business: true,
      },
      {
        to: "/subscriptions",
        label: "Subscriptions",
        icon: Repeat,
        area: "readSubscriptions",
        business: true,
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        to: "/billing",
        label: "Billing",
        icon: Receipt,
        area: "readBilling",
        business: true,
      },
      {
        to: "/receivables",
        label: "Receivables",
        icon: Wallet,
        area: "readBilling",
        business: true,
      },
      {
        to: "/catalogue",
        label: "Catalogue",
        icon: Package,
        area: "catalogue",
        business: true,
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        to: "/operators",
        label: "Operators",
        icon: Users,
        area: "operators",
        business: true,
      },
      {
        to: "/settings",
        label: "Settings",
        icon: Settings,
        area: "settings",
        business: true,
      },
    ],
  },
];

/** Who is signed in, and what the console may show them. */
export interface ConsoleOperator {
  name: string;
  email: string | null;
  roles: readonly OperatorRole[];
  /** The console has its business database. */
  business: boolean;
}

function visibleNavigation(operator: ConsoleOperator): ShellNavSection[] {
  return NAVIGATION.map((section) => ({
    title: section.title,
    items: section.items
      .filter(
        (item) =>
          (!item.business || operator.business) &&
          mayOperate(operator.roles, item.area),
      )
      .map((item): ShellNavItem => ({
        to: item.to,
        label: item.label,
        icon: item.icon,
        exact: item.exact,
      })),
  })).filter((section) => section.items.length > 0);
}

/**
 * The section a page belongs to: the one it names in `staticData.section`,
 * else the deepest navigation item its path sits beneath.
 */
function useSection(items: ShellNavItem[]): ShellNavItem | undefined {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const declared = useRouterState({
    select: (state) => state.matches.at(-1)?.staticData.section ?? null,
  });
  if (declared) return items.find((item) => item.to === declared);
  return items
    .filter((item) =>
      item.exact
        ? pathname === item.to
        : pathname === item.to || pathname.startsWith(`${item.to}/`),
    )
    .toSorted((a, b) => b.to.length - a.to.length)[0];
}

interface ConsoleBreadcrumbProps {
  section: ShellNavItem | undefined;
}

/** The section, then the page when it is something inside the section. */
function ConsoleBreadcrumb({ section }: ConsoleBreadcrumbProps) {
  const page = useRouterState({
    select: (state) => state.matches.at(-1)?.staticData.title ?? null,
  });
  return (
    <Breadcrumb aria-label="Breadcrumb" className="min-w-0">
      <BreadcrumbList className="flex-nowrap text-sm">
        {section && page && page !== section.label ? (
          <>
            <BreadcrumbStep render={<Link to={section.to} />}>
              {section.label}
            </BreadcrumbStep>
            <BreadcrumbCurrent>{page}</BreadcrumbCurrent>
          </>
        ) : (
          <BreadcrumbCurrent>
            {page ?? section?.label ?? "Home"}
          </BreadcrumbCurrent>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

interface AccountProps {
  operator: ConsoleOperator;
}

/** The signed-in operator, their roles, the theme and signing out. */
function Account({ operator }: AccountProps) {
  // Signing out is a POST, so the session cannot be ended by a link.
  const signOut = useRef<HTMLFormElement>(null);
  return (
    <>
      <form
        ref={signOut}
        method="post"
        action="/auth/logout"
        className="hidden"
      />
      <ShellAccount
        label="Account"
        name={operator.name}
        detail={
          operator.roles.map((role) => OPERATOR_ROLE_NAMES[role]).join(", ") ||
          "No role"
        }
        email={operator.email}
      >
        <ThemeSubmenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut.current?.requestSubmit()}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </ShellAccount>
    </>
  );
}

export interface ConsoleShellProps {
  operator: ConsoleOperator;
  children: ReactNode;
}

/** The console's frame: its sections in the sidebar, the operator in its footer. */
export function ConsoleShell({ operator, children }: ConsoleShellProps) {
  const navigation = visibleNavigation(operator);
  const section = useSection(navigation.flatMap((group) => group.items));
  const isActive: ShellIsActive = (item) => item.to === section?.to;
  return (
    <AppShell
      brand={
        <ShellBrand
          to="/"
          icon={ShieldCheck}
          title="Farida"
          subtitle="Operations"
        />
      }
      navigation={navigation}
      navigationLabel="Console"
      description="The console's sections"
      isActive={isActive}
      account={<Account operator={operator} />}
      breadcrumb={<ConsoleBreadcrumb section={section} />}
    >
      {children}
    </AppShell>
  );
}
