import type { ReactNode } from "react";

import { useHydrated } from "@tanstack/react-router";
import { Check, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "~/components/app/primitives";
import { UnsavedChangesGuard } from "~/components/app/UnsavedChangesGuard";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
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
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  pending: boolean;
  isDirty: () => boolean;
  sectioned?: boolean;
}) {
  const [failure, setFailure] = useState<string>();
  const hydrated = useHydrated();
  return (
    <>
      <form
        noValidate
        className="mx-auto w-full max-w-5xl space-y-6"
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
        <PageHeader title={title} description={description} />
        <fieldset
          disabled={!hydrated || pending}
          className={
            sectioned
              ? "min-w-0 space-y-6"
              : "min-w-0 space-y-6 rounded-xl border bg-card p-5 sm:p-7"
          }
        >
          {children}
        </fieldset>
        {failure ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {failure}
          </p>
        ) : null}
        <div className="sticky bottom-0 z-10 flex justify-end gap-3 rounded-xl border bg-background/95 p-4 shadow-sm backdrop-blur">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={!hydrated || pending}
          >
            {m.commonClose()}
          </Button>
          <Button type="submit" disabled={!hydrated || pending}>
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Check aria-hidden />
            )}
            {m.managementSave()}
          </Button>
        </div>
      </form>
      <UnsavedChangesGuard isDirty={isDirty} pending={pending} />
    </>
  );
}
