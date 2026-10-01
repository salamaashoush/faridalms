import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, SelectField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classOptionsQuery } from "~/queries/classes";
import { yearQuery } from "~/queries/years";
import { regradeTerm } from "~/server/grading";
import { getMessageFromError } from "~/utils/error";

/**
 * Grades a term's scores again on the bands in force today, for when a
 * school decides its new bands should reach grades already given.
 */
export function RegradeSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const yearId = useQuery(classOptionsQuery).data?.workingYearId ?? "";
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
        label={m.examReason()}
        hint={m.examReasonHint()}
        errors={tried && !reason.trim() ? [m.examReasonNeeded()] : undefined}
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
