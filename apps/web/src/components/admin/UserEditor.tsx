import type { SaveUserInput } from "@faridalms/domain/administration-schema";

import { saveUserSchema } from "@faridalms/domain/administration-schema";
import { ROLES } from "@faridalms/domain/identity";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { ClassPicker } from "~/components/teach/ClassPicker";
import { usePermission } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { accessRolesQuery, userAccessQuery } from "~/queries/access";
import { assignAccessRole } from "~/server/access";
import { saveUser } from "~/server/school";
import { getMessageFromError } from "~/utils/error";

import { ROLE_LABEL } from "./labels";
import { ManagementDialog, ManagementInput } from "./ManagementDialog";
import { SelectField } from "./SelectField";

const DEFAULT_ROLE = "default";

export function UserEditor({
  initial,
  onClose,
}: {
  initial?: Omit<SaveUserInput, "password" | "title" | "mobile"> & {
    title: string | null;
    mobile?: string | null;
  };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const canManageAccess = usePermission("access:manage");
  const assign = useServerFn(assignAccessRole);
  const roles = useQuery({ ...accessRolesQuery, enabled: canManageAccess });
  const access = useQuery({
    ...userAccessQuery(initial?.id ?? ""),
    enabled: canManageAccess && Boolean(initial?.id),
  });
  const [chosenRole, setChosenRole] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const currentRole = access.data?.accessRoleId ?? null;
  const selectedRole = chosenRole ?? currentRole ?? DEFAULT_ROLE;
  const mutation = useMutation({
    mutationFn: async (value: SaveUserInput) => {
      const saved = await saveUser({ data: value });
      const next = selectedRole === DEFAULT_ROLE ? null : selectedRole;
      if (canManageAccess && initial?.id && next !== currentRole)
        await assign({
          data: {
            userId: initial.id,
            accessRoleId: next,
            expectedRevision: access.data?.revision ?? 0,
          },
        });
      return saved;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["access"] });
      toast.success(m.managementSaved());
      onClose();
    },
    onError: (error) => setFailure(getMessageFromError(error)),
  });
  const defaults: SaveUserInput = {
    id: initial?.id,
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    role: initial?.role ?? "teacher",
    title: initial?.title ?? "",
    mobile: initial?.mobile ?? "",
    password: "",
    isActive: initial?.isActive ?? true,
  };
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: saveUserSchema },
    onSubmit: async ({ value }) => {
      setFailure(undefined);
      await mutation.mutateAsync(value);
    },
  });
  const labels = {
    name: m.adminName(),
    email: m.adminEmail(),
    title: m.adminJobTitle(),
    mobile: m.adminMobile(),
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
        {(["name", "email", "title", "mobile", "password"] as const).map(
          (name) => (
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
          ),
        )}
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
      {canManageAccess && initial?.id && roles.data ? (
        <form.Subscribe selector={(state) => state.values.role}>
          {(role) => (
            <SelectField
              id="account-access-role"
              label={m.accessAssignedRole()}
              description={m.accessAssignedHint()}
              value={selectedRole}
              options={[
                { value: DEFAULT_ROLE, label: m.accessDefaultRole() },
                ...roles.data.custom
                  .filter((row) => row.baseRole === role)
                  .map((row) => ({ value: row.id, label: row.name })),
              ]}
              onChange={setChosenRole}
            />
          )}
        </form.Subscribe>
      ) : null}
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
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      ) : null}
    </ManagementDialog>
  );
}
