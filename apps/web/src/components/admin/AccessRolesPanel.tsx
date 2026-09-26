import type { Permission, Role } from "@faridalms/domain/identity";
import type { ReactNode } from "react";

import { saveAccessRoleSchema } from "@faridalms/domain/access";
import { PERMISSIONS, ROLES } from "@faridalms/domain/identity";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Pencil, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { Column, RowAction } from "~/components/system/DataTable";
import type { getAccessRoles } from "~/server/access";

import { formatMoment } from "~/components/admin/format";
import {
  PERMISSION_AREA,
  PERMISSION_AREA_LABEL,
  PERMISSION_LABEL,
  ROLE_LABEL,
  SENSITIVE_PERMISSIONS,
} from "~/components/admin/labels";
import { Value } from "~/components/app/primitives";
import { DataTable, Pagination } from "~/components/system/DataTable";
import { SelectField, TextField } from "~/components/system/field";
import { RecordEmpty, RecordSection } from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import { StatusBadge } from "~/components/system/status";
import { Checkbox } from "~/components/ui/checkbox";
import * as m from "~/i18n/messages";
import { accessChangesQuery, accessRolesQuery } from "~/queries/access";
import { saveAccessRole } from "~/server/access";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Roles = Awaited<ReturnType<typeof getAccessRoles>>;
export type AccessRole = Roles["builtins"][number] | Roles["custom"][number];

/** A built-in role nobody has edited has no id yet, only its base role. */
export function roleKey(role: AccessRole): string {
  return role.id ?? role.baseRole;
}

export function roleName(role: AccessRole) {
  return role.name ?? ROLE_LABEL[role.baseRole]();
}

export function findRole(roles: Roles, key: string) {
  return [...roles.builtins, ...roles.custom].find(
    (role) => roleKey(role) === key || role.builtinRole === key,
  );
}

interface RoleRow {
  id: string;
  role: AccessRole;
}

type NameLink = (role: AccessRole, name: string) => ReactNode;

function roleColumns(nameLink: NameLink): Column<RoleRow>[] {
  return [
    {
      id: "name",
      header: m.adminRole(),
      primary: true,
      cell: ({ role }) => nameLink(role, roleName(role)),
    },
    {
      id: "base",
      header: m.accessBaseRole(),
      cell: ({ role }) => ROLE_LABEL[role.baseRole](),
    },
    {
      id: "type",
      header: m.accessRoleType(),
      cell: ({ role }) =>
        role.builtinRole ? m.accessBuiltin() : m.accessCustom(),
    },
    {
      id: "capabilities",
      header: m.accessCapabilities(),
      className: "text-end",
      cell: ({ role }) => (
        <span className="tabular-nums">
          {formatNumber(role.permissions.length)}
        </span>
      ),
    },
    {
      id: "people",
      header: m.accessPeople(),
      className: "text-end",
      cell: ({ role }) => (
        <span className="tabular-nums">{formatNumber(role.members)}</span>
      ),
    },
    {
      id: "changed",
      header: m.accessLastChanged(),
      cell: ({ role }) =>
        role.updatedAt ? (
          formatMoment(role.updatedAt)
        ) : (
          <span className="text-muted-foreground">
            {m.accessNeverChanged()}
          </span>
        ),
    },
  ];
}

function roleCard(nameLink: NameLink) {
  return {
    title: ({ role }: RoleRow) => nameLink(role, roleName(role)),
    fact: ({ role }: RoleRow) =>
      `${ROLE_LABEL[role.baseRole]()} · ${role.builtinRole ? m.accessBuiltin() : m.accessCustom()}`,
  };
}

export function AccessRolesPanel({
  nameLink,
  onEdit,
  onDuplicate,
}: {
  nameLink: NameLink;
  onEdit: (role: AccessRole) => void;
  onDuplicate: (role: AccessRole) => void;
}) {
  const { data } = useSuspenseQuery(accessRolesQuery);
  const rows: RoleRow[] = [...data.builtins, ...data.custom].map((role) => ({
    id: roleKey(role),
    role,
  }));
  const rowActions = ({ role }: RoleRow): RowAction[] => [
    {
      label: m.accessEditRole(),
      icon: Pencil,
      onSelect: () => onEdit(role),
    },
    {
      label: m.accessDuplicateRole(),
      icon: Copy,
      onSelect: () => onDuplicate(role),
    },
  ];
  return (
    <div className="grid gap-10">
      <DataTable
        caption={m.accessRolesCaption()}
        rows={rows}
        columns={roleColumns(nameLink)}
        rowLabel={({ role }) => roleName(role)}
        rowActions={rowActions}
        card={roleCard(nameLink)}
        empty={{ icon: ShieldCheck, title: m.accessRolesCaption() }}
      />
      <AccessChanges />
    </div>
  );
}

const ACTION_LABEL: Record<string, () => string> = {
  "role.created": m.accessActionRoleCreated,
  "role.updated": m.accessActionRoleUpdated,
  "assignment.changed": m.accessActionAssignment,
};

function AccessChanges() {
  const [page, setPage] = useState(1);
  const { data } = useSuspenseQuery(accessChangesQuery(page));
  return (
    <RecordSection
      title={m.accessChanges()}
      description={m.accessChangesHint()}
    >
      {data.rows.length === 0 ? (
        <RecordEmpty>{m.accessNoChanges()}</RecordEmpty>
      ) : (
        <div className="grid gap-4">
          <ul className="divide-y">
            {data.rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-sm leading-5"
              >
                <span className="font-medium">
                  {ACTION_LABEL[row.action]?.() ?? row.action}
                </span>
                <span dir="auto" className="min-w-0">
                  <Value>{row.after.name ?? null}</Value>
                </span>
                <span className="ms-auto text-[13px] leading-[18px] text-muted-foreground">
                  <bdi>{row.actor.name}</bdi>
                  {" · "}
                  {formatMoment(row.createdAt)}
                </span>
              </li>
            ))}
          </ul>
          {data.pages > 1 ? (
            <Pagination
              page={data.page}
              pages={data.pages}
              total={data.total}
              pageSize={25}
              onPage={setPage}
            />
          ) : null}
        </div>
      )}
    </RecordSection>
  );
}

const roleFormSchema = v.pick(saveAccessRoleSchema, [
  "name",
  "baseRole",
  "permissions",
]);

interface RoleDraft {
  id: string;
  expectedRevision: number;
  builtinRole: Role | null;
  name: string;
  baseRole: Role;
  permissions: Permission[];
}

function draftFor(
  role: AccessRole | undefined,
  copyOf: AccessRole | undefined,
  grantable: readonly Permission[],
): RoleDraft {
  if (role)
    return {
      id: role.id ?? crypto.randomUUID(),
      expectedRevision: role.revision,
      builtinRole: role.builtinRole,
      name: roleName(role),
      baseRole: role.baseRole,
      permissions: [...role.permissions],
    };
  return {
    id: crypto.randomUUID(),
    expectedRevision: 0,
    builtinRole: null,
    name: copyOf ? m.accessCopyName({ name: roleName(copyOf) }) : "",
    baseRole: copyOf?.baseRole ?? "teacher",
    // A copy starts from what the source grants that the editor may grant.
    permissions: copyOf
      ? copyOf.permissions.filter((permission) =>
          grantable.includes(permission),
        )
      : [],
  };
}

const AREAS = (["school", "teaching", "family"] as const).map((area) => ({
  area,
  permissions: PERMISSIONS.filter(
    (permission) => PERMISSION_AREA[permission] === area,
  ),
}));

export function RoleSheet({
  open,
  role,
  copyOf,
  onClose,
}: {
  open: boolean;
  role?: AccessRole;
  copyOf?: AccessRole;
  onClose: () => void;
}) {
  const { data } = useSuspenseQuery(accessRolesQuery);
  const [draft] = useState(() => draftFor(role, copyOf, data.grantable));
  const save = useServerFn(saveAccessRole);
  const mutation = useMutation({
    mutationFn: (value: v.InferOutput<typeof roleFormSchema>) =>
      save({
        data: {
          id: draft.id,
          expectedRevision: draft.expectedRevision,
          builtinRole: draft.builtinRole,
          ...value,
        },
      }),
    meta: { inlineError: true },
  });
  const form = useForm({
    defaultValues: {
      name: draft.name,
      baseRole: draft.baseRole,
      permissions: draft.permissions,
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: roleFormSchema },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(v.parse(roleFormSchema, value));
      } catch {
        return;
      }
      toast.success(m.managementSaved());
      onClose();
    },
  });
  const existing = draft.expectedRevision > 0 || draft.builtinRole !== null;
  const held = new Set(data.grantable);
  const groupId = useId();
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={existing ? m.accessEditRole() : m.accessNewRole()}
      onSubmit={() => form.handleSubmit()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
    >
      <form.Field name="name">
        {(field) => (
          <TextField
            id="access-role-name"
            label={m.accessRoleName()}
            width="name"
            maxLength={128}
            autoComplete="off"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
          />
        )}
      </form.Field>
      <form.Field name="baseRole">
        {(field) => (
          <SelectField
            id="access-base-role"
            label={m.accessBaseRole()}
            hint={m.accessBaseRoleHint()}
            width="name"
            value={field.state.value}
            disabled={existing}
            options={ROLES.map((value) => ({
              value,
              label: ROLE_LABEL[value](),
            }))}
            onChange={field.handleChange}
            errors={field.state.meta.errors}
          />
        )}
      </form.Field>
      <form.Field name="permissions">
        {(field) => (
          <fieldset aria-describedby={`${groupId}-hint`} className="grid gap-2">
            <legend className="mb-2 text-sm leading-5 font-medium">
              {m.accessCapabilities()}
            </legend>
            <p
              id={`${groupId}-hint`}
              className="-mt-1 text-[13px] leading-[18px] text-muted-foreground"
            >
              {m.accessCapabilitiesHint()}
            </p>
            {AREAS.map(({ area, permissions }) => (
              <fieldset key={area} className="grid pt-2">
                <legend className="pb-1 text-[13px] leading-[18px] font-medium text-muted-foreground">
                  {PERMISSION_AREA_LABEL[area]()}
                </legend>
                {permissions.map((permission) => {
                  const allowed = held.has(permission);
                  const checked = field.state.value.includes(permission);
                  return (
                    <label
                      key={permission}
                      aria-disabled={!allowed && !checked ? true : undefined}
                      className="flex min-h-9 cursor-pointer items-center gap-3 text-sm leading-5 aria-disabled:cursor-default aria-disabled:text-muted-foreground max-md:min-h-10"
                    >
                      <Checkbox
                        aria-labelledby={`${groupId}-${permission}`}
                        checked={checked}
                        disabled={!allowed && !checked}
                        onCheckedChange={(next) =>
                          field.handleChange(
                            next
                              ? [...field.state.value, permission]
                              : field.state.value.filter(
                                  (item) => item !== permission,
                                ),
                          )
                        }
                      />
                      <span id={`${groupId}-${permission}`} className="min-w-0">
                        {PERMISSION_LABEL[permission]()}
                      </span>
                      {SENSITIVE_PERMISSIONS.has(permission) ? (
                        <StatusBadge tone="warning">
                          {m.accessSensitive()}
                        </StatusBadge>
                      ) : null}
                      {allowed ? null : (
                        <span className="ms-auto text-[13px] leading-[18px] text-muted-foreground">
                          {m.accessNotHeld()}
                        </span>
                      )}
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </fieldset>
        )}
      </form.Field>
    </SheetForm>
  );
}
