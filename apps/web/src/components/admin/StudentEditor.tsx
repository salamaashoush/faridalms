import type { SaveStudentInput } from "@faridalms/domain/administration-schema";

import { saveStudentSchema } from "@faridalms/domain/administration-schema";
import { useForm, revalidateLogic } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { getStudentForManagement, saveStudent } from "~/server/school";

import { ManagementInput } from "./ManagementDialog";
import { ManagementPage } from "./ManagementPage";
import { RecordPicker, RecordMultiPicker } from "./RecordPicker";

export function ExistingStudentEditor({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { data } = useSuspenseQuery({
    queryKey: ["student-management", id],
    queryFn: () => getStudentForManagement({ data: { id } }),
  });
  return <StudentEditor initial={data} onClose={onClose} />;
}
export function StudentEditor({
  initial,
  onClose,
}: {
  initial?: SaveStudentInput;
  onClose: () => void;
}) {
  const mutation = useMutation({
    mutationFn: saveStudent,
    onSuccess: () => {
      form.reset(form.state.values);
      toast.success(m.managementSaved());
      onClose();
    },
  });
  const defaults: SaveStudentInput = initial ?? {
    reference: "",
    firstName: "",
    lastName: "",
    birthdate: "",
    classId: "",
    guardianIds: [],
    userId: "",
  };
  const form = useForm({
    defaultValues: defaults,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: saveStudentSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ data: value });
    },
  });
  const labels = {
    reference: m.adminReference(),
    firstName: m.managementFirstName(),
    lastName: m.managementLastName(),
    birthdate: m.managementBirthdate(),
  };
  return (
    <ManagementPage
      title={initial ? m.managementEditStudent() : m.managementAddStudent()}
      description={m.managementStudentHint()}
      onClose={onClose}
      pending={mutation.isPending}
      isDirty={() => !mutation.isSuccess && form.state.isDirty}
      onSubmit={() => form.handleSubmit()}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {(["firstName", "lastName", "reference", "birthdate"] as const).map(
          (name) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <ManagementInput
                  id={`student-${name}`}
                  label={labels[name]}
                  value={field.state.value}
                  type={name === "birthdate" ? "date" : "text"}
                  required={name !== "birthdate"}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>
          ),
        )}
      </div>
      <form.Field name="classId">
        {(field) => (
          <RecordPicker
            kind="classes"
            label={m.studentClass()}
            value={field.state.value ?? ""}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="guardianIds">
        {(field) => (
          <RecordMultiPicker
            kind="parents"
            label={m.managementLinkGuardian()}
            values={field.state.value ?? []}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="userId">
        {(field) => (
          <RecordPicker
            kind="students"
            label={m.managementStudentAccount()}
            value={field.state.value ?? ""}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
    </ManagementPage>
  );
}
