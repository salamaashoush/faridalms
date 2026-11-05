import type { Workspace } from "@faridalms/domain/workspace";

import { Avatar, AvatarFallback, AvatarImage } from "@faridalms/ui/avatar";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@faridalms/ui/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { ChevronsUpDown } from "lucide-react";
import { useCallback } from "react";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useSessionChange } from "~/hooks/useSessionChange";
import * as m from "~/i18n/messages";
import { logout } from "~/server/auth";

export const WORKSPACE_LABEL: Record<Workspace, () => string> = {
  admin: m.roleAdmin,
  teach: m.roleTeacher,
  family: m.roleParent,
  me: m.roleStudent,
};

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({ sidebar = false }: { sidebar?: boolean }) {
  const user = useCurrentUser();
  const sessionChanged = useSessionChange();

  const handleLogout = useCallback(async () => {
    await logout();
    await sessionChanged("/sign-in");
  }, [sessionChanged]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            aria-label={m.userNavMenu()}
            className={cn(
              "relative hover:bg-muted",
              sidebar
                ? "h-12 w-full justify-start gap-3 px-1 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0"
                : "size-9 rounded-full",
            )}
          >
            <Avatar className="size-8">
              {user.avatarUrl ? (
                <AvatarImage src={user.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {initialsOf(user.name)}
              </AvatarFallback>
            </Avatar>
            {sidebar ? (
              <>
                <span className="grid min-w-0 flex-1 gap-1 text-start group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-sm font-medium">
                    {user.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {WORKSPACE_LABEL[user.workspace]()}
                  </span>
                </span>
                <ChevronsUpDown
                  className="size-4 text-muted-foreground group-data-[collapsible=icon]:hidden"
                  aria-hidden
                />
              </>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent className="w-60" align="end">
        {/* Base UI requires GroupLabel to live inside a Group; a bare label
            throws MenuGroupContext is missing. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col gap-1">
              <p className="text-sm leading-none font-medium">{user.name}</p>
              <p className="text-xs leading-none text-muted-foreground">
                {user.email}
              </p>
              <p className="pt-1 text-xs leading-none text-primary">
                {WORKSPACE_LABEL[user.workspace]()}
              </p>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<Link to="/people/$userId" params={{ userId: user.id }} />}
        >
          {m.personMyProfile()}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={handleLogout}>
          {m.authSignOut()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
