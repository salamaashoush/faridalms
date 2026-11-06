import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { declareWork } from "~/server/exams";
import { getMessageFromError } from "~/utils/error";

export interface DeclarationDraft {
  agreed: boolean;
  aiUsed: boolean | null;
}

export const NO_DECLARATION: DeclarationDraft = { agreed: false, aiUsed: null };

export function declarationReady(
  draft: DeclarationDraft,
): draft is { agreed: true; aiUsed: boolean } {
  return draft.agreed && draft.aiUsed !== null;
}

export interface DeclarationFieldsProps {
  value: DeclarationDraft;
  onChange: (value: DeclarationDraft) => void;
  evidenceRequired: boolean;
  tried: boolean;
}

/**
 * What a student agrees to when handing in assessed coursework, in our own
 * words covering what JCQ, Cambridge and the IB ask a candidate to confirm,
 * and whether they used an AI tool, which the work itself then acknowledges.
 */
export function DeclarationFields({
  value,
  onChange,
  evidenceRequired,
  tried,
}: DeclarationFieldsProps) {
  const id = useId();
  return (
    <div className="grid gap-5">
      <section aria-labelledby={`${id}-statement`} className="grid gap-2">
        <h3 id={`${id}-statement`} className="text-sm leading-5 font-medium">
          {m.declarationTitle()}
        </h3>
        <ul className="grid list-disc gap-1.5 ps-5 text-sm leading-5">
          <li>{m.declarationOwnWork()}</li>
          <li>{m.declarationSources()}</li>
          <li>{m.declarationAi()}</li>
          <li>{m.declarationHelp()}</li>
          <li>{m.declarationConsequence()}</li>
        </ul>
        <CheckboxRow
          label={m.declarationAgree()}
          checked={value.agreed}
          onChange={(agreed) => onChange({ ...value, agreed })}
        />
        {tried && !value.agreed ? (
          <p
            role="alert"
            className="text-[13px] leading-[18px] text-destructive"
          >
            {m.declarationAgreeNeeded()}
          </p>
        ) : null}
      </section>
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm leading-5 font-medium">
          {m.declarationAiQuestion()}
        </legend>
        <RadioGroup
          value={value.aiUsed === null ? "" : value.aiUsed ? "yes" : "no"}
          onValueChange={(next) =>
            onChange({ ...value, aiUsed: next === "yes" })
          }
        >
          <label className="flex items-center gap-3 text-sm leading-5">
            <RadioGroupItem value="no" />
            {m.declarationAiNo()}
          </label>
          <label className="flex items-center gap-3 text-sm leading-5">
            <RadioGroupItem value="yes" />
            {m.declarationAiYes()}
          </label>
        </RadioGroup>
        {value.aiUsed ? (
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {evidenceRequired
              ? m.declarationAiBlockEvidence()
              : m.declarationAiBlock()}
          </p>
        ) : null}
        {tried && value.aiUsed === null ? (
          <p
            role="alert"
            className="text-[13px] leading-[18px] text-destructive"
          >
            {m.declarationAiNeeded()}
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}

/** Signs the declaration for work a teacher handed in for the student. */
export interface DeclareSheetProps {
  open: boolean;
  attemptId: string;
  evidenceRequired: boolean;
  onClose: () => void;
}

export function DeclareSheet({
  open,
  attemptId,
  evidenceRequired,
  onClose,
}: DeclareSheetProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(NO_DECLARATION);
  const [tried, setTried] = useState(false);
  const mutation = useMutation({
    mutationFn: (declaration: { agreed: true; aiUsed: boolean }) =>
      declareWork({ data: { attemptId, ...declaration } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.declarationSign()}
      submitLabel={m.declarationSign()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (!declarationReady(draft)) return;
        try {
          await mutation.mutateAsync(draft);
        } catch {
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["exams"] });
        toast.success(m.declarationSigned());
        onClose();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.declarationLaterHint()}
      </p>
      <DeclarationFields
        value={draft}
        onChange={setDraft}
        evidenceRequired={evidenceRequired}
        tried={tried}
      />
    </SheetForm>
  );
}
