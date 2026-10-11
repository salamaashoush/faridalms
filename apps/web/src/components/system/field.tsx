import type { ComponentProps, ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@faridalms/ui/select";
import { CircleAlert } from "lucide-react";
import { useId } from "react";

import * as m from "~/i18n/messages";
import { validationMessage } from "~/utils/validation";

type Issue = { message?: string } | string | undefined | null;

export interface ControlProps {
  id: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
}

export const widths = {
  full: "w-full",
  name: "w-full max-w-[30rem]",
  phone: "w-full max-w-[20ch]",
  reference: "w-full max-w-[24ch]",
  code: "w-full max-w-[12ch]",
  date: "w-full max-w-40",
  score: "w-full max-w-[8ch]",
} as const;

function message(issue: Issue): string | null {
  if (!issue) return null;
  return typeof issue === "string" ? issue : validationMessage(issue);
}

/**
 * The field: label, "(optional)" beside it, a hint between label and control,
 * the control, then the error in place of the hint. The optional marker sits
 * outside the label so the control's accessible name stays the label alone.
 */
export function FormField({
  id: givenId,
  label,
  optional = false,
  hint,
  errors,
  className,
  labelHidden = false,
  children,
}: {
  id?: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  errors?: Issue[];
  className?: string;
  labelHidden?: boolean;
  children: (control: ControlProps) => ReactNode;
}) {
  const generated = useId();
  const id = givenId ?? generated;
  const error = errors?.map(message).find(Boolean) ?? null;
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div
      data-slot="form-field"
      data-invalid={error ? true : undefined}
      className={cn("grid min-w-0 content-start gap-2", className)}
    >
      <div
        className={cn(
          "flex min-h-5 items-baseline gap-1.5",
          labelHidden && "sr-only",
        )}
      >
        <label
          htmlFor={id}
          id={`${id}-label`}
          className="text-sm leading-5 font-medium"
        >
          {label}
        </label>
        {optional ? (
          <span className="text-sm leading-5 text-muted-foreground">
            {m.formOptionalSuffix()}
          </span>
        ) : null}
      </div>
      {hintId ? (
        <p
          id={hintId}
          className="-mt-1 text-[13px] leading-[18px] text-muted-foreground"
        >
          {hint}
        </p>
      ) : null}
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby":
          [hintId, errorId].filter(Boolean).join(" ") || undefined,
      })}
      {error ? (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-[13px] leading-[18px] text-destructive"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

const TYPED_TEXT = new Set([undefined, "text", "search"]);

/**
 * Typed text takes the direction of what was typed. An empty field keeps the
 * page's direction instead, since dir="auto" on an empty input resolves to
 * left-to-right and starts the caret on the wrong side of an Arabic form.
 */
export function TextField({
  label,
  optional,
  hint,
  errors,
  width = "full",
  className,
  dir,
  ...props
}: Omit<ComponentProps<typeof Input>, "children" | "width"> & {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  errors?: Issue[];
  width?: keyof typeof widths;
}) {
  const follows =
    dir === "auto" || (dir === undefined && TYPED_TEXT.has(props.type));
  const direction = follows ? (props.value ? "auto" : undefined) : dir;
  return (
    <FormField
      id={props.id}
      label={label}
      optional={optional}
      hint={hint}
      errors={errors}
      className={className}
    >
      {(control) => (
        <Input
          {...props}
          {...control}
          dir={direction}
          className={cn(widths[width], "max-md:h-10")}
        />
      )}
    </FormField>
  );
}

export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  optional,
  hint,
  errors,
  disabled,
  width = "full",
  className,
  labelHidden,
}: {
  id?: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  optional?: boolean;
  hint?: ReactNode;
  errors?: Issue[];
  disabled?: boolean;
  width?: keyof typeof widths;
  className?: string;
  labelHidden?: boolean;
}) {
  return (
    <FormField
      id={id}
      label={label}
      optional={optional}
      hint={hint}
      errors={errors}
      className={className}
      labelHidden={labelHidden}
    >
      {(control) => (
        <Select
          items={options}
          value={value}
          disabled={disabled}
          onValueChange={(next) => {
            const match = options.find((option) => option.value === next);
            if (match) onChange(match.value);
          }}
        >
          <SelectTrigger
            {...control}
            aria-labelledby={`${control.id}-label ${control.id}`}
            className={cn(widths[width], "min-w-0")}
          >
            <SelectValue className="block min-w-0 truncate" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

/**
 * One choice among a few, each with a line saying what choosing it means.
 * The group is named by its legend as a field is by its label, and an error
 * sits below it as it does below any control.
 */
export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
  errors,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  errors?: Issue[];
}) {
  const id = useId();
  const error = errors?.map(message).find(Boolean) ?? null;
  return (
    <fieldset
      data-slot="form-field"
      data-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className="grid min-w-0 content-start gap-2"
    >
      <legend className="mb-2 text-sm leading-5 font-medium">{label}</legend>
      <RadioGroup
        value={value}
        onValueChange={(next) => {
          const match = options.find((option) => option.value === next);
          if (match) onChange(match.value);
        }}
      >
        {options.map((option) => (
          <label
            key={option.value}
            htmlFor={`${id}-${option.value}`}
            className="flex items-start gap-3"
          >
            <RadioGroupItem
              id={`${id}-${option.value}`}
              value={option.value}
              aria-describedby={
                option.hint ? `${id}-${option.value}-hint` : undefined
              }
              className="mt-0.5"
            />
            <span className="grid gap-0.5">
              <span className="text-sm leading-5 font-medium">
                {option.label}
              </span>
              {option.hint ? (
                <span
                  id={`${id}-${option.value}-hint`}
                  className="text-[13px] leading-[18px] text-muted-foreground"
                >
                  {option.hint}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </RadioGroup>
      {error ? (
        <p
          id={`${id}-error`}
          className="flex items-start gap-1.5 text-[13px] leading-[18px] text-destructive"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
