import type { ReactNode } from "react";

import { useHydrated } from "@tanstack/react-router";
import { LoaderCircle, X } from "lucide-react";
import { useId, useState } from "react";

import { UnsavedChangesGuard } from "~/components/app/UnsavedChangesGuard";
import { PageActions } from "~/components/system/PageActions";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";
import { getMessageFromError } from "~/utils/error";

export function ManagementPage({
  title,
  description,
  children,
  onClose,
  onSubmit,
  pending,
  isDirty,
  sectioned = false,
  actions,
  submitLabel,
  headerActions,
  width = "form",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  pending: boolean;
  isDirty: () => boolean;
  sectioned?: boolean;
  actions?: ReactNode;
  submitLabel?: string;
  headerActions?: ReactNode;
  width?: "form" | "document" | "wide";
}) {
  const [failure, setFailure] = useState<string>();
  const hydrated = useHydrated();
  const formId = useId();
  const busy = !hydrated || pending;
  return (
    <>
      <PageActions>
        {headerActions ? (
          <div className="hidden items-center gap-2 md:flex">
            {headerActions}
          </div>
        ) : null}
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          <X aria-hidden />
          {m.commonClose()}
        </Button>
        {actions}
        <Button type="submit" form={formId} disabled={busy}>
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : null}
          {submitLabel ?? m.managementSave()}
        </Button>
      </PageActions>
      <form
        id={formId}
        noValidate
        className={cn(
          "mx-auto w-full pb-16",
          width === "document" && "max-w-3xl",
          width === "form" && "max-w-4xl",
          width === "wide" && "max-w-6xl",
        )}
        onSubmit={async (event) => {
          event.preventDefault();
          const element = event.currentTarget;
          setFailure(undefined);
          try {
            await onSubmit();
            requestAnimationFrame(() =>
              element
                .querySelector<HTMLElement>('[aria-invalid="true"]')
                ?.focus(),
            );
          } catch (error) {
            setFailure(getMessageFromError(error));
          }
        }}
      >
        <header className="mb-8 grid gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {title}
            </h1>
            {headerActions ? (
              <div className="flex items-center gap-2 md:hidden">
                {headerActions}
              </div>
            ) : null}
          </div>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </header>
        {failure ? (
          <p
            role="alert"
            className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {failure}
          </p>
        ) : null}
        <fieldset
          disabled={busy}
          className={cn("min-w-0", sectioned ? "grid gap-12" : "grid gap-6")}
        >
          {children}
        </fieldset>
      </form>
      <UnsavedChangesGuard isDirty={isDirty} pending={pending} />
    </>
  );
}
