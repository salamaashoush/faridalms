import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useState } from "react";

import { WhyField } from "./Why";

export interface ReasonSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  /** Removes or stops something, so the submit takes the destructive colour. */
  destructive?: boolean;
  placeholder?: string;
  /** Does the change; resolves to what went wrong, or null when it worked. */
  onSubmit: (reason: string) => Promise<string | null>;
}

/** Asks why before a change the change log keeps, then makes it. */
export function ReasonSheet({
  open,
  onOpenChange,
  title,
  submitLabel,
  destructive = false,
  placeholder,
  onSubmit,
}: ReasonSheetProps) {
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason("");
          setSubmitted(false);
          setError(null);
        }
        onOpenChange(next);
      }}
      title={title}
      submitLabel={submitLabel}
      destructive={destructive}
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!reason.trim()) return;
        setPending(true);
        setError(null);
        const failed = await onSubmit(reason.trim());
        setPending(false);
        if (failed) setError(failed);
        else {
          setReason("");
          setSubmitted(false);
          onOpenChange(false);
        }
      }}
    >
      <WhyField
        value={reason}
        onChange={setReason}
        submitted={submitted}
        placeholder={placeholder}
      />
    </SheetForm>
  );
}
