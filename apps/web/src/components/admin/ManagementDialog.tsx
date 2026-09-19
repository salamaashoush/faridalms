import type { ComponentProps, ReactNode } from "react";

import { Check, LoaderCircle } from "lucide-react";
import { useId } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/app/dialog";
import { Field, FieldError, FieldLabel } from "~/components/app/field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import * as m from "~/i18n/messages";

export function ManagementDialog({
  title,
  description,
  children,
  onClose,
  onSubmit,
  pending,
  submitLabel,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
  submitLabel?: string;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <form
          noValidate
          className="mt-3 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            // The dialog is portaled, but React still bubbles its submit
            // through the component tree to any form that renders it.
            event.stopPropagation();
            onSubmit();
          }}
        >
          {children}
          <div className="flex justify-end gap-2 border-t pt-5">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={pending}
            >
              {m.commonClose()}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <Check aria-hidden />
              )}
              {submitLabel ?? m.managementSave()}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function ManagementInput({
  label,
  errors,
  ...props
}: ComponentProps<typeof Input> & {
  label: string;
  errors?: ComponentProps<typeof FieldError>["errors"];
}) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const invalid = Boolean(errors?.some(Boolean));
  const errorId = `${id}-error`;
  return (
    <Field data-invalid={invalid || undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {props.required ? null : (
          <span className="text-xs text-muted-foreground">
            {m.formOptional()}
          </span>
        )}
      </div>
      <Input
        {...props}
        id={id}
        className="h-11 sm:h-10"
        aria-invalid={invalid || undefined}
        aria-describedby={
          [props["aria-describedby"], invalid ? errorId : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      <FieldError id={errorId} errors={errors} />
    </Field>
  );
}
