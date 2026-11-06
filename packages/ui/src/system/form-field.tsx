import type { ComponentProps, ReactNode } from "react";

import { cn } from "../cn";
import { Input } from "../input";
import { Checkbox } from "../checkbox";
import { RadioGroup, RadioGroupItem } from "../radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select";
import type { Issue } from "./provider";

import { FieldError as PrimitiveFieldError } from "../field";
import { CircleAlert } from "lucide-react";
import { useId } from "react";

import { useDesignSystem } from "./provider";

/** What a validator reports for a field: an issue, plain text, or nothing. */
export type FieldIssue = Issue | string | undefined | null;

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

export type FieldWidth = keyof typeof widths;

/** The first issue to show, in the reader's language. */
function useFirstError(errors: FieldIssue[] | undefined): string | null {
  const { issueMessage } = useDesignSystem();
  for (const issue of errors ?? []) {
    if (!issue) continue;
    return typeof issue === "string" ? issue : issueMessage(issue);
  }
  return null;
}

export type FieldErrorProps = ComponentProps<typeof PrimitiveFieldError>;

/** The error under a Field, its issues read in the reader's language. */
export function FieldError({ errors, ...props }: FieldErrorProps) {
  const { issueMessage } = useDesignSystem();
  return (
    <PrimitiveFieldError
      {...props}
      errors={errors?.map((issue) =>
        issue ? { message: issueMessage(issue) } : undefined,
      )}
    />
  );
}

export interface FormFieldProps {
  id?: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  errors?: FieldIssue[];
  className?: string;
  labelHidden?: boolean;
  /** Renders the control, given the ids and states that tie it to the label. */
  children: (control: ControlProps) => ReactNode;
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
}: FormFieldProps) {
  const { strings } = useDesignSystem();
  const generated = useId();
  const id = givenId ?? generated;
  const error = useFirstError(errors);
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div
      data-slot="form-field"
      data-invalid={error ? true : undefined}
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2",
        className,
      )}
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
            {strings.optional}
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

export interface TextFieldProps extends Omit<
  ComponentProps<typeof Input>,
  "children" | "width"
> {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  errors?: FieldIssue[];
  width?: FieldWidth;
}

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
}: TextFieldProps) {
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

export interface FieldOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectFieldProps<T extends string> {
  id?: string;
  label: string;
  value: T;
  options: readonly FieldOption<T>[];
  onChange: (value: T) => void;
  optional?: boolean;
  hint?: ReactNode;
  errors?: FieldIssue[];
  disabled?: boolean;
  width?: FieldWidth;
  className?: string;
  labelHidden?: boolean;
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
}: SelectFieldProps<T>) {
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
            className={cn(
              widths[width],
              "min-w-0 max-md:data-[size=default]:h-10",
            )}
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
export interface ChoiceOption<T extends string> extends FieldOption<T> {
  /** What choosing it means, on the line below. */
  hint?: string;
}

export interface ChoiceFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  errors?: FieldIssue[];
}

export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
  errors,
}: ChoiceFieldProps<T>) {
  const id = useId();
  const error = useFirstError(errors);
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

export interface CheckboxGroupFieldProps<T extends string> {
  label: string;
  value: readonly T[];
  options: readonly ChoiceOption<T>[];
  onChange: (value: T[]) => void;
  hint?: ReactNode;
  errors?: FieldIssue[];
  /** Controls above the choices, such as shortcuts that pick a set. */
  actions?: ReactNode;
  /** Lays the choices out in columns once the form is wide enough. */
  columns?: boolean;
}

/**
 * Several choices among a few, each a checkbox with its label beside it.
 * The group is named by its legend and keeps the order of its options.
 */
export function CheckboxGroupField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  errors,
  actions,
  columns = false,
}: CheckboxGroupFieldProps<T>) {
  const id = useId();
  const error = useFirstError(errors);
  const describedBy =
    [hint && !error ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <fieldset
      data-slot="form-field"
      data-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className="grid min-w-0 content-start gap-2"
    >
      <legend className="mb-2 text-sm leading-5 font-medium">{label}</legend>
      {hint && !error ? (
        <p
          id={`${id}-hint`}
          className="-mt-1 text-[13px] leading-[18px] text-muted-foreground"
        >
          {hint}
        </p>
      ) : null}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      <div className={cn("grid gap-2.5", columns && "@md:grid-cols-2")}>
        {options.map((option) => (
          <label
            key={option.value}
            htmlFor={`${id}-${option.value}`}
            className="flex items-start gap-3"
          >
            <Checkbox
              id={`${id}-${option.value}`}
              checked={value.includes(option.value)}
              onCheckedChange={(checked) =>
                onChange(
                  options
                    .map((candidate) => candidate.value)
                    .filter((candidate) =>
                      candidate === option.value
                        ? checked
                        : value.includes(candidate),
                    ),
                )
              }
              className="mt-0.5"
            />
            <span className="grid gap-0.5">
              <span className="text-sm leading-5">{option.label}</span>
              {option.hint ? (
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {option.hint}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
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
