import type { ReactNode } from "react";

import { CircleAlert, LoaderCircle } from "lucide-react";

import { Button } from "../button";

export interface FormFooterProps {
  submitLabel: string;
  pending: boolean;
  /** What went wrong saving, shown above the buttons. */
  error?: string | null;
  disabled?: boolean;
  /** Beside the submit button: Cancel, or Back to the step before. */
  secondary?: ReactNode;
}

/**
 * The bottom of a form that is not a whole record form page: its error,
 * then the submit at the start with the way out beside it.
 */
export function FormFooter({
  submitLabel,
  pending,
  error,
  disabled = false,
  secondary,
}: FormFooterProps) {
  return (
    <div className="grid gap-4 border-t pt-6">
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm leading-5 text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          className="max-md:h-10"
          disabled={pending || disabled}
        >
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
        {secondary}
      </div>
    </div>
  );
}
