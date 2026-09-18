import type { SaveAcademicYearInput } from "@faridalms/domain/academic-year";

import { saveAcademicYearSchema } from "@faridalms/domain/academic-year";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FieldError } from "~/components/app/field";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { saveAcademicYear } from "~/server/academic-years";
import { getMessageFromError } from "~/utils/error";

import { ManagementInput } from "./ManagementDialog";
import { ManagementPage } from "./ManagementPage";

export function AcademicYearEditor({
  initial,
  onClose,
}: {
  initial?: SaveAcademicYearInput;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rowKeys, setRowKeys] = useState(() =>
    (initial?.terms ?? []).map(() => crypto.randomUUID()),
  );
  const [failure, setFailure] = useState<string>();
  const mutation = useMutation({
    mutationFn: (input: SaveAcademicYearInput) =>
      saveAcademicYear({ data: input }),
    onSuccess: async (_, variables) => {
      form.reset(variables);
      await queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      await queryClient.invalidateQueries({ queryKey: ["school", "settings"] });
      toast.success(m.managementSaved());
      onClose();
    },
    onError: (error) => setFailure(getMessageFromError(error)),
  });
  const defaults: SaveAcademicYearInput = initial ?? {
    name: "",
    startsOn: "",
    endsOn: "",
    terms: [],
  };
  const form = useForm({
    defaultValues: defaults,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: saveAcademicYearSchema },
    onSubmit: async ({ value }) => {
      setFailure(undefined);
      await mutation.mutateAsync(value);
    },
  });
  const termLabels = {
    name: m.academicYearTermName(),
    startsOn: m.adminStartsOn(),
    endsOn: m.adminEndsOn(),
  };
  const labels = {
    name: m.academicYearName(),
    startsOn: m.adminStartsOn(),
    endsOn: m.adminEndsOn(),
  };
  return (
    <ManagementPage
      title={initial ? m.academicYearEdit() : m.academicYearCreate()}
      description={m.academicYearEditorHint()}
      onClose={onClose}
      onSubmit={() => form.handleSubmit()}
      pending={mutation.isPending}
      isDirty={() => form.state.isDirty}
    >
      <fieldset
        disabled={mutation.isPending}
        className="grid gap-6 sm:grid-cols-2"
      >
        <legend className="mb-6 text-base font-semibold">
          {m.academicYearDates()}
        </legend>
        {(["name", "startsOn", "endsOn"] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <div className={name === "name" ? "sm:col-span-2" : ""}>
                <ManagementInput
                  id={`academic-year-${name}`}
                  label={labels[name]}
                  type={name === "name" ? "text" : "date"}
                  maxLength={name === "name" ? 16 : undefined}
                  required
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  errors={field.state.meta.errors}
                />
              </div>
            )}
          </form.Field>
        ))}
      </fieldset>
      <p className="text-sm leading-6 text-muted-foreground">
        {m.academicYearDatesHint()}
      </p>
      <form.Field name="terms" mode="array">
        {(field) => (
          <fieldset disabled={mutation.isPending} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <legend className="text-base font-semibold">
                  {m.academicYearTerms()}
                </legend>
                <p className="mt-1 text-sm text-muted-foreground">
                  {m.academicYearTermsHint()}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRowKeys((keys) => [...keys, crypto.randomUUID()]);
                  field.pushValue({ name: "", startsOn: "", endsOn: "" });
                }}
              >
                <Plus aria-hidden />
                {m.academicYearAddTerm()}
              </Button>
            </div>
            {(field.state.value ?? []).map((_, index) => (
              <div
                key={rowKeys[index]}
                className="grid items-end gap-3 rounded-lg border bg-background p-4 sm:grid-cols-[1.4fr_1fr_1fr_auto]"
              >
                {(["name", "startsOn", "endsOn"] as const).map((name) => (
                  <form.Field key={name} name={`terms[${index}].${name}`}>
                    {(termField) => (
                      <ManagementInput
                        id={`term-${index}-${name}`}
                        label={termLabels[name]}
                        type={name === "name" ? "text" : "date"}
                        maxLength={name === "name" ? 32 : undefined}
                        required
                        value={termField.state.value}
                        onChange={(event) =>
                          termField.handleChange(event.target.value)
                        }
                        onBlur={termField.handleBlur}
                        errors={termField.state.meta.errors}
                      />
                    )}
                  </form.Field>
                ))}
                <div className="flex justify-end pb-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={m.academicYearRemoveTerm()}
                    onClick={() => {
                      setRowKeys((keys) =>
                        keys.filter((key, position) => position !== index),
                      );
                      field.removeValue(index);
                    }}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
            <FieldError errors={field.state.meta.errors} />
          </fieldset>
        )}
      </form.Field>
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      ) : null}
    </ManagementPage>
  );
}
