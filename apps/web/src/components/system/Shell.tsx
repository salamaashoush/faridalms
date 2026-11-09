import type { Profile } from "@faridalms/domain/capabilities";
import type {
  ShellIsActive,
  ShellNavItem,
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
import {
  arrange,
  holds,
  MOBILE_TABS,
  NAVIGATION,
  pagesOf,
} from "~/components/app/navigation";
import { NotificationBell } from "~/components/app/NotificationBell";
import { UnreadMessagesCount } from "~/components/app/UnreadMessagesCount";
import { WorkspaceBreadcrumb } from "~/components/app/WorkspaceBreadcrumb";
import { WorkspaceSearch } from "~/components/app/WorkspaceSearch";
import { ChangePassword } from "~/components/auth/ChangePassword";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useSessionChange } from "~/hooks/useSessionChange";
import * as m from "~/i18n/messages";
import { getLocale, locales, setLocale } from "~/i18n/runtime";
import { logout, SIDEBAR_MORE_COOKIE } from "~/server/auth";
import { pageOn } from "~/utils/modules";

const LOCALE_NAME: Record<string, string> = { en: "English", ar: "العربية" };

const PROFILE_LABEL: Record<Profile, () => string> = {
  staff_admin: m.roleAdmin,
  staff: m.roleTeacher,
  family: m.roleParent,
  student: m.roleStudent,
  young_student: m.roleStudent,
};

/**
 * The workspace's navigation as this person may see it, in their language:
 * each section's links, with those opened now and then folded under its
 * More when the section runs long for them, and each area's pages the
 * person may open beneath its link.
 */
function useVisibleNavigation(): ShellNavSection[] {
  const user = useCurrentUser();
  const shown = (item: NavItem): ShellNavItem => ({
    to: item.to,
    label: item.label(),
    icon: item.icon,
    exact: item.exact,
    badge: item.count ? <UnreadMessagesCount /> : undefined,
    pages: item.pages
      ? pagesOf(item, user).map((page) => ({
          to: page.to,
          label: page.label(),
          icon: item.icon,
        }))
      : undefined,
  });
  return NAVIGATION[user.workspace]
    .map((section) => {
      const visible = section.items.filter(
        (item) =>
          holds(item, user.capabilities) &&
          pageOn(user.modules, item.to) &&
          (!item.pages || pagesOf(item, user).length > 0) &&
          (user.profile !== "young_student" || item.young),
      );
      const { items, more } = arrange(visible);
      return {
        id: section.id,
        title: section.title?.(),
        items: items.map(shown),
        more: more.map(shown),
      };
    })
    .filter((section) => section.items.length + section.more.length > 0);
}

/**
 * A page can name the navigation item it belongs to (`staticData.section`),
 * so a record opened from two places lights the one it lives under. A link
 * to an area lights on any of its pages too.
 */
function useIsActive(): ShellIsActive {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const section = useRouterState({
    select: (state) => state.matches.at(-1)?.staticData.section ?? null,
  });
  return (item) => {
    const own = [item.to, ...(item.pages ?? []).map((page) => page.to)];
    return section
      ? [section].flat().some((path) => own.includes(path))
      : item.exact
        ? pathname === item.to
        : own.some(
            (path) => pathname === path || pathname.startsWith(`${path}/`),
          );
  };
}

const NONE_OPEN: readonly string[] = [];

/** Kept for a year: which sections' More someone leaves open is a habit. */
const MORE_MAX_AGE = 60 * 60 * 24 * 365;

function rememberMoreOpen(open: string[]) {
  document.cookie = `${SIDEBAR_MORE_COOKIE}=${open.join(".")}; path=/; max-age=${String(MORE_MAX_AGE)}; samesite=lax`;
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
        detail={PROFILE_LABEL[user.profile]()}
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
  /** The sections whose More was left open, from the person's last visit. */
  moreOpen?: readonly string[];
}

/** The portal's frame: the workspace's navigation, account and tools. */
export function Shell({
  children,
  sidebarOpen = true,
  moreOpen: remembered = NONE_OPEN,
}: ShellProps) {
  const user = useCurrentUser();
  const childMode = useRouteContext({
    from: "__root__",
    select: (context) => context.auth.childMode,
  });
  const navigation = useVisibleNavigation();
  const isActive = useIsActive();
  const [moreOpen, setMoreOpen] = useState(remembered);
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
  const items = navigation.flatMap((section) => [
    ...section.items,
    ...(section.more ?? []),
  ]);
  const { first, last } = MOBILE_TABS[user.workspace];
  const seen = (to: string) => items.find((item) => item.to === to);
  const tabs = [
    ...first
      .map(seen)
      .filter((item) => item !== undefined)
      .slice(0, 3),
    seen(last),
  ].filter((item) => item !== undefined);
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
      moreOpen={moreOpen}
      onMoreOpenChange={(open) => {
        setMoreOpen(open);
        rememberMoreOpen(open);
      }}
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
