import { TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import { recordTaxId } from "../server/invoicing";

/** The issued document whose tax authority id is recorded. */
export interface TaxIdDocument {
  kind: "invoice" | "credit_note";
  id: string;
  number: string | null;
  held: string | null;
}

export interface TaxIdSheetProps {
  document: TaxIdDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Records the tax authority's id for an issued invoice or credit note,
 * which finance copies from the e-invoice it submitted there.
 */
export function TaxIdSheet({ document, open, onOpenChange }: TaxIdSheetProps) {
  const router = useRouter();
  const save = useServerFn(recordTaxId);
  const [value, setValue] = useState(document.held ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const named = document.kind === "invoice" ? "Invoice" : "Credit note";
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={
        document.number
          ? `${named} ${document.number}: tax authority id`
          : "The tax authority's id"
      }
      pending={saving}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!value.trim()) return;
        if (value === document.held) {
          onOpenChange(false);
          return;
        }
        setSaving(true);
        setError(null);
        const failed = await attempt(
          () =>
            save({
              data: {
                document: document.kind,
                id: document.id,
                taxAuthorityId: value,
              },
            }),
          "The id could not be saved.",
        );
        setSaving(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Tax authority's id saved.");
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <TextField
        label="Tax authority id"
        hint="From the e-invoice, once it is submitted."
        dir="ltr"
        maxLength={80}
        value={value}
        errors={submitted && !value.trim() ? ["Enter the id."] : undefined}
        onChange={(event) => setValue(event.target.value)}
      />
    </SheetForm>
  );
}
