import type { Workspace } from "@faridalms/domain/workspace";
import type {
  ShellIsActive,
  ShellNavSection,
} from "@faridalms/ui/system/app-shell";
import type { ReactNode } from "react";

import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@faridalms/ui/dropdown-menu";
import {
  AppShell,
  ShellAccount,
  ShellBrand,
  ThemeSubmenu,
} from "@faridalms/ui/system/app-shell";
import { PageActionsProvider } from "@faridalms/ui/system/page-actions";
import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import {
  Check,
  GraduationCap,
  KeyRound,
  Languages,
  LogOut,
  Settings2,
  UserRound,
} from "lucide-react";
import { useCallback, useState } from "react";

import type { NavItem } from "~/components/app/navigation";

import { ContractNotice } from "~/components/app/ContractNotice";
import { GrownUpGate } from "~/components/app/GrownUpGate";
import { MOBILE_TABS, NAVIGATION } from "~/components/app/navigation";
import { NotificationBell } from "~/components/app/NotificationBell";
import { UnreadMessagesCount } from "~/components/app/UnreadMessagesCount";
import { WorkspaceBreadcrumb } from "~/components/app/WorkspaceBreadcrumb";
import { WorkspaceSearch } from "~/components/app/WorkspaceSearch";
import { ChangePassword } from "~/components/auth/ChangePassword";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useSessionChange } from "~/hooks/useSessionChange";
import * as m from "~/i18n/messages";
import { getLocale, locales, setLocale } from "~/i18n/runtime";
import { logout } from "~/server/auth";
import { pageOn } from "~/utils/modules";

const LOCALE_NAME: Record<string, string> = { en: "English", ar: "العربية" };

const WORKSPACE_LABEL: Record<Workspace, () => string> = {
  admin: m.roleAdmin,
  teach: m.roleTeacher,
  family: m.roleParent,
  me: m.roleStudent,
};

/** The workspace's navigation as this person may see it, in their language. */
function useVisibleNavigation(): ShellNavSection[] {
  const user = useCurrentUser();
  return NAVIGATION[user.workspace]
    .map((section) => ({
      title: section.title?.(),
      items: section.items
        .filter(
          (item) =>
            (!item.capability || user.capabilities.includes(item.capability)) &&
            pageOn(user.modules, item.to) &&
            (user.profile !== "young_student" || item.young),
        )
        .map((item: NavItem) => ({
          to: item.to,
          label: item.label(),
          icon: item.icon,
          exact: item.exact,
          badge: item.count ? <UnreadMessagesCount /> : undefined,
        })),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * A page can name the navigation item it belongs to (`staticData.section`),
 * so a record opened from two places lights the one it lives under.
 */
function useIsActive(): ShellIsActive {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const section = useRouterState({
    select: (state) => state.matches.at(-1)?.staticData.section ?? null,
  });
  return (item) => {
    return section
      ? [section].flat().includes(item.to)
      : item.exact
        ? pathname === item.to
        : pathname === item.to || pathname.startsWith(`${item.to}/`);
  };
}

function AccountMenu() {
  const user = useCurrentUser();
  const sessionChanged = useSessionChange();
  const [changingPassword, setChangingPassword] = useState(false);
  const signOut = useCallback(async () => {
    await logout();
    await sessionChanged("/sign-in");
  }, [sessionChanged]);
  const current = getLocale();
  return (
    <>
      {changingPassword ? (
        <ChangePassword onClose={() => setChangingPassword(false)} />
      ) : null}
      <ShellAccount
        label={m.shellAccount()}
        name={user.name}
        detail={WORKSPACE_LABEL[user.workspace]()}
        email={user.email}
        avatarUrl={user.avatarUrl}
      >
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
        {/* Only someone who signs in with a password has one to change. */}
        {user.email ? (
          <DropdownMenuItem onClick={() => setChangingPassword(true)}>
            <KeyRound aria-hidden />
            {m.passwordChange()}
          </DropdownMenuItem>
        ) : null}
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
        <ThemeSubmenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut aria-hidden />
          {m.shellSignOut()}
        </DropdownMenuItem>
      </ShellAccount>
    </>
  );
}

export interface ShellProps {
  children: ReactNode;
  sidebarOpen?: boolean;
}

/** The portal's frame: the workspace's navigation, account and tools. */
export function Shell({ children, sidebarOpen = true }: ShellProps) {
  const user = useCurrentUser();
  const childMode = useRouteContext({
    from: "__root__",
    select: (context) => context.auth.childMode,
  });
  const navigation = useVisibleNavigation();
  const isActive = useIsActive();
  const young = user.profile === "young_student";
  const immersive = useRouterState({
    select: (state) => state.matches.at(-1)?.staticData.immersive ?? false,
  });
  if (immersive)
    return (
      <PageActionsProvider>
        <main id="main" className="h-dvh overflow-hidden bg-background">
          {children}
        </main>
      </PageActionsProvider>
    );
  const items = navigation.flatMap((section) => section.items);
  const tabs = MOBILE_TABS[user.workspace]
    .map((to) => items.find((item) => item.to === to))
    .filter((item) => item !== undefined);
  return (
    <AppShell
      sidebarOpen={sidebarOpen}
      brand={
        <ShellBrand
          to={WORKSPACE_HOME[user.workspace]}
          icon={GraduationCap}
          title={user.school.name}
          subtitle={m.appName()}
        />
      }
      tools={
        young ? null : (
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <WorkspaceSearch variant="sidebar" />
            </div>
            <NotificationBell className="size-8" />
          </div>
        )
      }
      navigation={navigation}
      navigationLabel={m.navPrimary()}
      description={m.appTagline()}
      isActive={isActive}
      account={childMode ? <GrownUpGate /> : <AccountMenu />}
      breadcrumb={<WorkspaceBreadcrumb />}
      // A child who cannot read yet has nothing to search for and no
      // notices to read; their home holds all they open.
      barTools={
        young ? undefined : (
          <>
            <WorkspaceSearch variant="bar" />
            <NotificationBell className="size-8 max-md:size-10" />
          </>
        )
      }
      tabs={tabs}
      notice={<ContractNotice />}
    >
      {children}
    </AppShell>
  );
}
