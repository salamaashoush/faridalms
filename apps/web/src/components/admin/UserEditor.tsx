import type { SaveUserInput } from "@faridalms/domain/administration-schema";

import { saveUserSchema } from "@faridalms/domain/administration-schema";
import { ROLES } from "@faridalms/domain/identity";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { ClassPicker } from "~/components/teach/ClassPicker";
import * as m from "~/i18n/messages";
import { saveUser } from "~/server/school";

import { ROLE_LABEL } from "./labels";
import { ManagementDialog, ManagementInput } from "./ManagementDialog";

export function UserEditor({
  initial,
  onClose,
}: {
  initial?: Omit<SaveUserInput, "password" | "title"> & {
    title: string | null;
  };
  onClose: () => void;
}) {
  const mutation = useMutation({
    mutationFn: saveUser,
    onSuccess: () => {
      toast.success(m.managementSaved());
      onClose();
    },
  });
  const defaults: SaveUserInput = {
    id: initial?.id,
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    role: initial?.role ?? "teacher",
    title: initial?.title ?? "",
    password: "",
    isActive: initial?.isActive ?? true,
  };
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: saveUserSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ data: value });
    },
  });
  const labels = {
    name: m.adminName(),
    email: m.adminEmail(),
    title: m.adminJobTitle(),
    password: initial ? m.managementNewPassword() : m.managementPassword(),
  };
  return (
    <ManagementDialog
      title={initial ? m.managementEditAccount() : m.managementAddAccount()}
      description={m.managementAccountHint()}
      onClose={onClose}
      pending={mutation.isPending}
      onSubmit={() => {
        void form.handleSubmit();
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {(["name", "email", "title", "password"] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <ManagementInput
                id={`account-${name}`}
                label={labels[name]}
                value={field.state.value}
                type={
                  name === "password"
                    ? "password"
                    : name === "email"
                      ? "email"
                      : "text"
                }
                autoComplete={name === "password" ? "new-password" : "off"}
                required={
                  name === "name" ||
                  name === "email" ||
                  (!initial && name === "password")
                }
                minLength={name === "password" ? 12 : undefined}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
        ))}
      </div>
      <form.Field name="role">
        {(field) => (
          <ClassPicker
            id="account-role"
            label={m.adminRole()}
            value={field.state.value}
            classes={ROLES.map((id) => ({ id, name: ROLE_LABEL[id]() }))}
            onChange={(value) => {
              const role = ROLES.find((item) => item === value);
              if (role) field.handleChange(role);
            }}
          />
        )}
      </form.Field>
      <form.Field name="isActive">
        {(field) => (
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={field.state.value}
              onChange={(event) => field.handleChange(event.target.checked)}
            />
            {m.managementAccountActive()}
          </label>
        )}
      </form.Field>
    </ManagementDialog>
  );
}
