import type { LucideIcon } from "lucide-react";

import { Button } from "../button";
import { cn } from "../cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip";
import { LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ActionItem, Confirmation } from "./action-menu";

import { ActionMenu, useAttempt, useRunAndReport } from "./action-menu";
import { ConfirmDialog } from "./confirm-dialog";
import { useDesignSystem } from "./provider";

interface BatchActionBase<T> {
  label: string;
  icon?: LucideIcon;
  onSelect: (rows: T[]) => void | Promise<unknown>;
}

interface RegularBatchAction<T> extends BatchActionBase<T> {
  destructive?: false;
  confirm?: (rows: T[]) => Confirmation;
}

interface DestructiveBatchAction<T> extends BatchActionBase<T> {
  destructive: true;
  confirm: (rows: T[]) => Confirmation;
}

/** Something done to every selected row at once. */
export type BatchAction<T> = RegularBatchAction<T> | DestructiveBatchAction<T>;

export interface SelectionBarProps<T> {
  /** What is selected; every action receives all of it. */
  rows: readonly T[];
  actions: readonly BatchAction<T>[];
  /**
   * How many of the regular actions stand as buttons; the rest, in their
   * order, wait under More.
   */
  promoted?: number;
  /** Empties the selection, as Clear and Escape do. */
  onClear: () => void;
}

/**
 * What can be done to the rows selected, floating at the foot of the list
 * while there are any: how many, the most used actions as buttons, the
 * rest under More, a destructive action last and confirmed, and Clear.
 * The list's own toolbar stays where it was, so selecting moves nothing.
 */
export function SelectionBar<T>({
  rows,
  actions,
  promoted = 3,
  onClear,
}: SelectionBarProps<T>) {
  const { strings, formatNumber } = useDesignSystem();
  const attempt = useAttempt();
  const runAndReport = useRunAndReport();
  const [pending, setPending] = useState<BatchAction<T> | null>(null);
  const [confirming, setConfirming] = useState<BatchAction<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = [...rows];
  const regular = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);
  const shown = regular.slice(0, promoted);
  const waiting = regular.slice(promoted);
  // A destructive action stands beside the others only while nothing waits
  // under More; otherwise it joins them there, after its separator.
  const standing = waiting.length === 0 ? destructive : [];
  const overflow: ActionItem[] = [...waiting, ...destructive]
    .filter((action) => !standing.includes(action))
    .map((action) => asMenuItem(action, selected));

  const choose = (action: BatchAction<T>) => {
    if (action.confirm) {
      setError(null);
      setConfirming(action);
      return;
    }
    setPending(action);
    runAndReport(async () => {
      try {
        await action.onSelect(selected);
      } finally {
        setPending(null);
      }
    });
  };
  const confirm = async (action: BatchAction<T>) => {
    setPending(action);
    setError(null);
    const failure = await attempt(() => action.onSelect(selected));
    setPending(null);
    if (failure) setError(failure);
    else setConfirming(null);
  };
  const confirmation = confirming?.confirm?.(selected);
  // Escape empties the selection from anywhere on the page, unless
  // something open on top of it (a menu, a dialog, a field) takes the key.
  const clear = useRef(onClear);
  useEffect(() => {
    clear.current = onClear;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "[role=dialog],[role=alertdialog],[role=menu],[role=listbox],input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      clear.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const button = (action: BatchAction<T>) => (
    <Button
      key={action.label}
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending !== null}
      className={cn(
        action.destructive &&
          "text-destructive hover:bg-destructive/10 hover:text-destructive",
      )}
      onClick={() => choose(action)}
    >
      {pending === action ? (
        <LoaderCircle className="animate-spin" aria-hidden />
      ) : action.icon ? (
        <action.icon aria-hidden />
      ) : null}
      {action.label}
    </Button>
  );

  return (
    <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
      <div
        role="group"
        aria-label={strings.selectionActions}
        className="pointer-events-auto flex max-w-full animate-in items-center gap-1 overflow-x-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-200 fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
      >
        <span className="flex shrink-0 items-center gap-0.5 rounded-lg bg-primary/10 ps-2.5 pe-0.5 text-sm font-medium text-primary tabular-nums">
          {strings.selectedCount(formatNumber(rows.length))}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={strings.clearSelection}
                  className="text-primary hover:bg-primary/15 hover:text-primary"
                  onClick={onClear}
                />
              }
            >
              <X aria-hidden />
            </TooltipTrigger>
            <TooltipContent>{strings.clearSelection}</TooltipContent>
          </Tooltip>
        </span>
        {shown.length ? (
          <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
        ) : null}
        {shown.map(button)}
        {standing.length ? (
          <>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
            {standing.map(button)}
          </>
        ) : null}
        {overflow.length ? (
          <ActionMenu label={strings.moreActions} actions={overflow} />
        ) : null}
      </div>
      {confirming && confirmation ? (
        <ConfirmDialog
          open
          title={confirmation.title}
          body={confirmation.body}
          confirmLabel={confirmation.label}
          pending={pending !== null}
          error={error ?? undefined}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void confirm(confirming)}
        />
      ) : null}
    </div>
  );
}

function asMenuItem<T>(action: BatchAction<T>, rows: T[]): ActionItem {
  const onSelect = () => action.onSelect(rows);
  return action.destructive
    ? {
        label: action.label,
        icon: action.icon,
        destructive: true,
        confirm: action.confirm(rows),
        onSelect,
      }
    : {
        label: action.label,
        icon: action.icon,
        confirm: action.confirm?.(rows),
        onSelect,
      };
}
