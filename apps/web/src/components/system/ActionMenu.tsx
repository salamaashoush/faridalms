import type { LucideIcon } from "lucide-react";

import { Ellipsis } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";
import { getMessageFromError } from "~/utils/error";

import { ConfirmDialog } from "./ConfirmDialog";

export const phoneMenuItem = "max-md:min-h-10";

export interface Confirmation {
  title: string;
  body: string;
  label: string;
}

export type ActionItem = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void | Promise<unknown>;
} & (
  | { destructive?: false; confirm?: Confirmation }
  | { destructive: true; confirm: Confirmation }
);

export async function attempt(
  action: () => void | Promise<unknown>,
): Promise<string | null> {
  try {
    await action();
    return null;
  } catch (error) {
    return getMessageFromError(error);
  }
}

export function runAndReport(action: () => void | Promise<unknown>) {
  void attempt(action).then((failure) => {
    if (failure)
      toast.error(m.notificationErrorTitle(), {
        id: failure,
        description: failure,
      });
  });
}

export function ActionMenu({
  label,
  actions,
  size = "icon-sm",
  className,
}: {
  label: string;
  actions: ActionItem[];
  size?: "icon-sm" | "icon" | "icon-lg";
  className?: string;
}) {
  const [confirming, setConfirming] = useState<ActionItem | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (actions.length === 0) return null;
  const regular = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);
  const choose = (action: ActionItem) => {
    if (action.confirm) {
      setError(null);
      setConfirming(action);
      return;
    }
    runAndReport(action.onSelect);
  };
  const confirm = async (action: ActionItem) => {
    setPending(true);
    setError(null);
    const failure = await attempt(action.onSelect);
    setPending(false);
    if (failure) setError(failure);
    else setConfirming(null);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size={size}
              aria-label={label}
              className={cn("text-muted-foreground", className)}
            />
          }
        >
          <Ellipsis aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          {regular.map((action) => (
            <DropdownMenuItem
              key={action.label}
              className={phoneMenuItem}
              onClick={() => choose(action)}
            >
              {action.icon ? <action.icon aria-hidden /> : null}
              {action.label}
            </DropdownMenuItem>
          ))}
          {regular.length && destructive.length ? (
            <DropdownMenuSeparator />
          ) : null}
          {destructive.map((action) => (
            <DropdownMenuItem
              key={action.label}
              variant="destructive"
              className={phoneMenuItem}
              onClick={() => choose(action)}
            >
              {action.icon ? <action.icon aria-hidden /> : null}
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {confirming?.confirm ? (
        <ConfirmDialog
          open
          title={confirming.confirm.title}
          body={confirming.confirm.body}
          confirmLabel={confirming.confirm.label}
          pending={pending}
          error={error ?? undefined}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void confirm(confirming)}
        />
      ) : null}
    </>
  );
}
