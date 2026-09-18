import type { SaveAcademicYearInput } from "@faridalms/domain/academic-year";

import { saveAcademicYearSchema } from "@faridalms/domain/academic-year";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { saveAcademicYear } from "~/server/academic-years";

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
  });
  const defaults: SaveAcademicYearInput = initial ?? {
    name: "",
    startsOn: "",
    endsOn: "",
  };
  const form = useForm({
    defaultValues: defaults,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: saveAcademicYearSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value);
    },
  });
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
    </ManagementPage>
  );
}
