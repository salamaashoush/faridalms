import type { ComponentProps, ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import { useId } from "react";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "~/components/app/field";
import * as m from "~/i18n/messages";

type Errors = ComponentProps<typeof FieldError>["errors"];

export interface ControlProps {
  id: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
}

/**
 * The one field layout: label, an "optional" marker beside it rather than
 * across the row, an optional hint, the control, then the error. The marker
 * sits outside the label so a control's accessible name stays its label.
 */
export function FormField({
  id: givenId,
  label,
  labelId,
  optional = false,
  description,
  errors,
  className,
  children,
}: {
  id?: string;
  label: ReactNode;
  labelId?: string;
  optional?: boolean;
  description?: ReactNode;
  errors?: Errors;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const generated = useId();
  const id = givenId ?? generated;
  const invalid = Boolean(errors?.some(Boolean));
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = invalid ? `${id}-error` : undefined;
  return (
    <Field
      data-invalid={invalid || undefined}
      className={cn("gap-2", className)}
    >
      <div className="flex min-h-5 items-baseline gap-1.5">
        <FieldLabel id={labelId} htmlFor={id} className="text-sm font-medium">
          {label}
        </FieldLabel>
        {optional ? (
          <span className="text-xs text-muted-foreground">
            {m.formOptional()}
          </span>
        ) : null}
      </div>
      {children({
        id,
        "aria-invalid": invalid || undefined,
        "aria-describedby":
          [descriptionId, errorId].filter(Boolean).join(" ") || undefined,
      })}
      {description ? (
        <FieldDescription id={descriptionId} className="text-xs">
          {description}
        </FieldDescription>
      ) : null}
      <FieldError id={`${id}-error`} errors={errors} />
    </Field>
  );
}

export function TextField({
  label,
  optional,
  description,
  errors,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, "children"> & {
  label: string;
  optional?: boolean;
  description?: ReactNode;
  errors?: Errors;
}) {
  return (
    <FormField
      id={props.id}
      label={label}
      optional={optional ?? !props.required}
      description={description}
      errors={errors}
      className={className}
    >
      {(control) => (
        <Input
          {...props}
          {...control}
          aria-describedby={
            [props["aria-describedby"], control["aria-describedby"]]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
      )}
    </FormField>
  );
}

export function FormSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-5", className)}>
      <div className="flex items-start justify-between gap-4 border-b pb-3">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function FormGrid({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-5",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
