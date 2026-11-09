import type { LucideIcon } from "lucide-react";

import { Button } from "../button";
import { cn } from "../cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../dropdown-menu";
import { Ellipsis } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "./confirm-dialog";
import { useDesignSystem } from "./provider";

export const phoneMenuItem = "max-md:min-h-10";

export interface Confirmation {
  title: string;
  body: string;
  label: string;
}

interface ActionBase {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void | Promise<unknown>;
}

interface RegularAction extends ActionBase {
  destructive?: false;
  confirm?: Confirmation;
}

/** Removes something, so it always asks first. */
interface DestructiveAction extends ActionBase {
  destructive: true;
  confirm: Confirmation;
}

export type ActionItem = RegularAction | DestructiveAction;

/** The one filled button of a page or a record's header. */
export interface PrimaryAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
}

/** Runs an action and says what went wrong, or null when nothing did. */
export type Attempt = (
  action: () => void | Promise<unknown>,
) => Promise<string | null>;

export function useAttempt(): Attempt {
  const { errorMessage } = useDesignSystem();
  return async (action) => {
    try {
      await action();
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  };
}

/** Runs an action from a menu, where a failure has nowhere inline to show. */
export function useRunAndReport(): (
  action: () => void | Promise<unknown>,
) => void {
  const attempt = useAttempt();
  const { strings } = useDesignSystem();
  return (action) => {
    void attempt(action).then((failure) => {
      if (failure)
        toast.error(strings.actionFailed, { id: failure, description: failure });
    });
  };
}

export interface ActionMenuProps {
  label: string;
  actions: ActionItem[];
  size?: "icon-sm" | "icon" | "icon-lg";
  className?: string;
}

/**
 * The `•••` menu: regular actions, then destructive ones after a separator,
 * each destructive one confirmed in a dialog that names what it removes.
 */
export function ActionMenu({
  label,
  actions,
  size = "icon-sm",
  className,
}: ActionMenuProps) {
  const attempt = useAttempt();
  const runAndReport = useRunAndReport();
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
          destructive={confirming.destructive === true}
          pending={pending}
          error={error ?? undefined}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void confirm(confirming)}
        />
      ) : null}
    </>
  );
}
