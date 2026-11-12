import { Button } from "@faridalms/ui/button";
import { FormField, SelectField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { yearOptionsQuery, yearQuery } from "~/queries/years";
import { regradeTerm } from "~/server/gradebook";
import { getMessageFromError } from "~/utils/error";

export interface RegradeSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Grades a term's scores again on the bands in force today, for when a
 * school decides its new bands should reach grades already given.
 */
export function RegradeSheet({ open, onClose }: RegradeSheetProps) {
  const queryClient = useQueryClient();
  const yearId = useQuery(yearOptionsQuery).data?.workingYearId ?? "";
  const terms =
    useQuery({ ...yearQuery(yearId), enabled: Boolean(yearId) }).data?.terms ??
    [];
  const [termId, setTermId] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const chosen = termId || terms[0]?.id || "";
  const mutation = useMutation({
    mutationFn: () =>
      regradeTerm({ data: { periodId: chosen, reason: reason.trim() } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.gradingRegradeTitle()}
      submitLabel={m.gradingRegrade()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (!chosen || !reason.trim()) return;
        let counts: { terms: number; work: number };
        try {
          counts = await mutation.mutateAsync();
        } catch {
          return;
        }
        await queryClient.invalidateQueries();
        toast.success(
          m.gradingRegraded({ terms: counts.terms, work: counts.work }),
        );
        onClose();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.gradingRegradeHint()}
      </p>
      <SelectField
        id="regrade-term"
        label={m.gradingTerm()}
        value={chosen}
        options={terms.map((term) => ({
          value: term.id,
          label: inLocale(term.titleEn, term.titleAr),
        }))}
        onChange={setTermId}
      />
      <FormField
        id="regrade-reason"
        label={m.gradingReason()}
        hint={m.gradingReasonHint()}
        errors={tried && !reason.trim() ? [m.gradingReasonNeeded()] : undefined}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

/** The scales' action that grades a term again, with its sheet. */
export function RegradeAction() {
  const [open, setOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="max-md:h-10"
        onClick={() => {
          setGeneration((current) => current + 1);
          setOpen(true);
        }}
      >
        <RefreshCcw aria-hidden />
        {m.gradingRegradeTitle()}
      </Button>
      <RegradeSheet
        key={generation}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
