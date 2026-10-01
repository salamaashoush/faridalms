import type { YearAction, YearLifecycle } from "@faridalms/domain/years";

import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CopyPlus, Lock, LockOpen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { ActionItem } from "~/components/system/ActionMenu";

import { FormField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import * as m from "~/i18n/messages";
import { changeYearLifecycle } from "~/server/years";
import { getMessageFromError } from "~/utils/error";

import { yearTitle } from "./format";

export interface LifecycleYear {
  id: string;
  version: number;
  titleEn: string | null;
  titleAr: string | null;
}

const COPY: Record<
  YearAction,
  {
    title: (name: string) => string;
    body: (name: string, current: string) => string;
    submit: () => string;
    done: (name: string) => string;
  }
> = {
  make_current: {
    title: (name) => m.yearsMakeCurrentTitle({ name }),
    body: (name, current) =>
      current
        ? m.yearsMakeCurrentBody({ name, current })
        : m.yearsMakeCurrentFirstBody({ name }),
    submit: m.yearsMakeCurrent,
    done: (name) => m.yearsMadeCurrent({ name }),
  },
  close: {
    title: (name) => m.yearsCloseTitle({ name }),
    body: (name) => m.yearsCloseBody({ name }),
    submit: m.yearsClose,
    done: (name) => m.yearsClosedDone({ name }),
  },
  reopen: {
    title: (name) => m.yearsReopenTitle({ name }),
    body: (name) => m.yearsReopenBody({ name }),
    submit: m.yearsReopen,
    done: (name) => m.yearsReopened({ name }),
  },
};

/**
 * One lifecycle step on a year, explained before it is taken. Reopening asks
 * why, and the reason stays in the year's history.
 */
export function YearLifecycleSheet({
  year,
  action,
  current,
  open,
  onClose,
}: {
  year: LifecycleYear;
  action: YearAction;
  current: LifecycleYear | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[action];
  const name = yearTitle(year);
  const mutation = useMutation({
    mutationFn: () =>
      changeYearLifecycle({
        data: {
          id: year.id,
          expectedVersion: year.version,
          action,
          reason,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={copy.title(name)}
      submitLabel={copy.submit()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (action === "reopen" && !reason.trim()) {
          setError(m.yearsReasonRequired());
          return;
        }
        await mutation.mutateAsync().then(
          async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["years"] }),
              queryClient.invalidateQueries({ queryKey: ["classes"] }),
              queryClient.invalidateQueries({ queryKey: ["people"] }),
            ]);
            toast.success(copy.done(name));
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {copy.body(name, current ? yearTitle(current) : "")}
      </p>
      {action === "reopen" ? (
        <FormField
          label={m.yearsReason()}
          hint={m.yearsReasonHint()}
          errors={error ? [error] : undefined}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => {
                setError(null);
                setReason(event.target.value);
              }}
            />
          )}
        </FormField>
      ) : null}
    </SheetForm>
  );
}

interface SheetState {
  year: LifecycleYear | null;
  action: YearAction;
  open: boolean;
  key: number;
}

export function useYearLifecycle(current: LifecycleYear | null) {
  const [state, setState] = useState<SheetState>({
    year: null,
    action: "close",
    open: false,
    key: 0,
  });
  const open = (year: LifecycleYear, action: YearAction) =>
    setState((previous) => ({
      year,
      action,
      open: true,
      key: previous.key + 1,
    }));
  const sheet = state.year ? (
    <YearLifecycleSheet
      key={state.key}
      year={state.year}
      action={state.action}
      current={current && current.id !== state.year.id ? current : null}
      open={state.open}
      onClose={() => setState((previous) => ({ ...previous, open: false }))}
    />
  ) : null;
  return { sheet, open };
}

export function lifecycleActions(
  year: LifecycleYear & { lifecycle: YearLifecycle },
  access: { manage: boolean; reopen: boolean },
  open: (year: LifecycleYear, action: YearAction) => void,
): ActionItem[] {
  if (!access.manage) return [];
  if (year.lifecycle === "upcoming")
    return [
      {
        label: m.yearsMakeCurrent(),
        icon: CalendarCheck,
        onSelect: () => open(year, "make_current"),
      },
      {
        label: m.yearsClose(),
        icon: Lock,
        onSelect: () => open(year, "close"),
      },
    ];
  if (year.lifecycle === "closed" && access.reopen)
    return [
      {
        label: m.yearsReopen(),
        icon: LockOpen,
        onSelect: () => open(year, "reopen"),
      },
    ];
  return [];
}

export function rolloverActions(
  year: { id: string; lifecycle: YearLifecycle },
  current: { id: string } | null,
  access: { manage: boolean },
  open: (source: string, target: string) => void,
): ActionItem[] {
  if (!access.manage || !current || year.lifecycle !== "upcoming") return [];
  return [
    {
      label: m.yearsRollover(),
      icon: CopyPlus,
      onSelect: () => open(current.id, year.id),
    },
  ];
}
