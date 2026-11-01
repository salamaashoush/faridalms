import type {
  AskHealthChangeInput,
  FamilyHealthKind,
} from "@faridalms/domain/people";

import { askHealthChangeSchema } from "@faridalms/domain/people";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, SelectField, TextField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import * as m from "~/i18n/messages";
import { askHealthChange } from "~/server/records";
import { formatDate } from "~/utils/datetime";
import { refusalOf } from "~/utils/error";
import { schemaErrors } from "~/utils/validation";

import type { Severity } from "./labels";

import { KIND_HINT } from "./labels";

export type Asking =
  | {
      target: "record";
      kind: FamilyHealthKind;
      record: {
        id: string;
        version: number;
        text: string;
        severity: Severity | null;
      } | null;
    }
  | {
      target: "contact";
      contact: { relationshipId: string; name: string; phone: string | null };
    };

type Field = "text" | "severity" | "phone";

const KIND_ADD: Record<FamilyHealthKind, () => string> = {
  allergy: m.medicalAddAllergy,
  chronic_condition: m.medicalAddCondition,
  medication: m.medicalAddMedicine,
  dietary_requirement: m.medicalAddDiet,
  doctor: m.medicalAddDoctor,
};

const KIND_CHANGE: Record<FamilyHealthKind, () => string> = {
  allergy: m.medicalChangeAllergy,
  chronic_condition: m.medicalChangeCondition,
  medication: m.medicalChangeMedicine,
  dietary_requirement: m.medicalChangeDiet,
  doctor: m.medicalChangeDoctor,
};

const REFUSED: Partial<Record<string, Field>> = {
  "contact_point.phone_invalid": "phone",
};

const isField = (key: string): key is Field =>
  key === "text" || key === "severity" || key === "phone";

/**
 * Asks the school to add or change one entry of a child's medical summary.
 * What is sent waits for the school's health staff; the summary shows it
 * only once they accept it.
 */
export function ChangeSheet({
  studentId,
  name,
  asking,
  onClose,
}: {
  studentId: string;
  name: string;
  asking: Asking;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const record = asking.target === "record" ? asking.record : null;
  const [text, setText] = useState(record?.text ?? "");
  const [severity, setSeverity] = useState<"" | Severity>(
    record?.severity ?? "",
  );
  const [phone, setPhone] = useState(
    asking.target === "contact" ? (asking.contact.phone ?? "") : "",
  );
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const mutation = useMutation({
    mutationFn: (data: AskHealthChangeInput) => askHealthChange({ data }),
    meta: { inlineError: true },
  });
  const input: AskHealthChangeInput =
    asking.target === "record"
      ? {
          target: "record",
          studentId,
          kind: asking.kind,
          ...(record
            ? { recordId: record.id, expectedVersion: record.version }
            : {}),
          text,
          severity: asking.kind === "allergy" ? severity : "",
        }
      : {
          target: "contact",
          studentId,
          relationshipId: asking.contact.relationshipId,
          phone,
        };
  const refusal = refusalOf(mutation.error, {
    ...REFUSED,
    "health.change_unchanged": asking.target === "record" ? "text" : "phone",
  });
  const shown = { ...errors };
  if (refusal?.field && !shown[refusal.field])
    shown[refusal.field] = refusal.message;
  const title =
    asking.target === "contact"
      ? m.medicalChangePhone({ name: asking.contact.name })
      : (record ? KIND_CHANGE : KIND_ADD)[asking.kind]();
  return (
    <SheetForm
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={title}
      submitLabel={m.medicalAskSend()}
      pending={mutation.isPending}
      error={refusal && !refusal.field ? refusal.message : null}
      onSubmit={async () => {
        const found = schemaErrors(askHealthChangeSchema, input, (key) =>
          isField(key) ? key : undefined,
        );
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        await mutation.mutateAsync(input).then(
          async (sent) => {
            await queryClient.invalidateQueries({
              queryKey: ["family", "health", studentId],
            });
            toast.success(m.medicalAskSent({ date: formatDate(sent.dueOn) }));
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-sm text-muted-foreground">
        {m.medicalAskIntro({ name })}
      </p>
      {asking.target === "record" ? (
        <>
          <FormField
            id="health-change-text"
            label={m.medicalAskDetails()}
            hint={KIND_HINT[asking.kind]()}
            errors={shown.text ? [shown.text] : undefined}
          >
            {(control) => (
              <Textarea
                {...control}
                dir="auto"
                rows={4}
                maxLength={2000}
                value={text}
                onChange={(event) => {
                  setErrors(({ text: _text, ...rest }) => rest);
                  setText(event.target.value);
                }}
              />
            )}
          </FormField>
          {asking.kind === "allergy" ? (
            <SelectField
              id="health-change-severity"
              label={m.healthSeverity()}
              optional
              value={severity || "none"}
              options={[
                { value: "none", label: m.commonNotRecorded() },
                { value: "mild", label: m.healthSeverityMild() },
                { value: "moderate", label: m.healthSeverityModerate() },
                { value: "severe", label: m.healthSeveritySevere() },
              ]}
              onChange={(value) =>
                setSeverity(
                  value === "mild" || value === "moderate" || value === "severe"
                    ? value
                    : "",
                )
              }
              width="name"
            />
          ) : null}
        </>
      ) : (
        <TextField
          id="health-change-phone"
          label={m.medicalAskPhone()}
          hint={m.medicalAskPhoneHint()}
          type="tel"
          dir="ltr"
          width="phone"
          autoComplete="tel"
          value={phone}
          errors={shown.phone ? [shown.phone] : undefined}
          onChange={(event) => {
            setErrors(({ phone: _phone, ...rest }) => rest);
            setPhone(event.target.value);
          }}
        />
      )}
    </SheetForm>
  );
}
