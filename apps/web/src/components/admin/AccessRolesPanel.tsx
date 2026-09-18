import type { Permission, Role } from "@faridalms/domain/identity";

import { saveAccessRoleSchema } from "@faridalms/domain/access";
import { PERMISSIONS, ROLES } from "@faridalms/domain/identity";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { PERMISSION_LABEL, ROLE_LABEL } from "~/components/admin/labels";
import {
  ManagementDialog,
  ManagementInput,
} from "~/components/admin/ManagementDialog";
import { SelectField } from "~/components/admin/SelectField";
import { SectionCard, Value } from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import * as m from "~/i18n/messages";
import { accessChangesQuery, accessRolesQuery } from "~/queries/access";
import { saveAccessRole } from "~/server/access";
import { formatDateTime, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

interface RoleDraft {
  id: string;
  expectedRevision: number;
  name: string;
  baseRole: Role;
  permissions: Permission[];
  builtinRole: Role | null;
}

export function AccessRolesPanel() {
  const { data } = useSuspenseQuery(accessRolesQuery);
  const [editing, setEditing] = useState<RoleDraft | null>(null);
  const rows = [...data.builtins, ...data.custom];
  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        title={m.adminPermissionsSection()}
        description={m.accessRolesHint()}
        actions={
          <Button
            type="button"
            size="sm"
            onClick={() =>
              setEditing({
                id: crypto.randomUUID(),
                expectedRevision: 0,
                name: "",
                baseRole: "teacher",
                permissions: [],
                builtinRole: null,
              })
            }
          >
            <Plus aria-hidden />
            {m.accessNewRole()}
          </Button>
        }
      >
        <ul className="divide-y">
          {rows.map((row) => (
            <li
              key={row.id ?? row.builtinRole}
              className="flex flex-wrap items-start gap-x-4 gap-y-2 py-4"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {row.name ?? ROLE_LABEL[row.baseRole]()}
                  {row.builtinRole ? (
                    <Badge variant="outline">{m.accessBuiltin()}</Badge>
                  ) : (
                    <Badge variant="secondary">
                      {ROLE_LABEL[row.baseRole]()}
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {m.adminPermissionsHeldBy({
                    count: formatNumber(row.permissions.length),
                  })}
                  {" · "}
                  {m.accessMembers({ count: formatNumber(row.members) })}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {row.permissions.map((permission) => (
                    <li key={permission}>
                      <Badge variant="secondary">
                        {PERMISSION_LABEL[permission]()}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={m.managementEditNamed({
                  name: row.name ?? ROLE_LABEL[row.baseRole](),
                })}
                onClick={() =>
                  setEditing({
                    id: row.id ?? crypto.randomUUID(),
                    expectedRevision: row.revision,
                    name: row.name ?? ROLE_LABEL[row.baseRole](),
                    baseRole: row.baseRole,
                    permissions: [...row.permissions],
                    builtinRole: row.builtinRole,
                  })
                }
              >
                <Pencil aria-hidden />
                {m.managementEdit()}
              </Button>
            </li>
          ))}
        </ul>
      </SectionCard>
      <AccessChanges />
      {editing ? (
        <RoleDialog
          key={editing.id}
          initial={editing}
          grantable={data.grantable}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function RoleDialog({
  initial,
  grantable,
  onClose,
}: {
  initial: RoleDraft;
  grantable: Permission[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveAccessRole);
  const [name, setName] = useState(initial.name);
  const [baseRole, setBaseRole] = useState<Role>(initial.baseRole);
  const [permissions, setPermissions] = useState<Permission[]>(
    initial.permissions,
  );
  const [failure, setFailure] = useState<string>();
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: v.parse(
          v.object({
            ...saveAccessRoleSchema.entries,
            builtinRole: v.nullable(v.picklist(ROLES)),
          }),
          {
            id: initial.id,
            expectedRevision: initial.expectedRevision,
            name,
            baseRole,
            permissions,
            builtinRole: initial.builtinRole,
          },
        ),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["access"] });
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      toast.success(m.managementSaved());
      onClose();
    },
    onError: (error) => setFailure(getMessageFromError(error)),
  });
  const held = new Set(grantable);
  return (
    <ManagementDialog
      title={
        initial.expectedRevision > 0 || initial.builtinRole
          ? m.accessEditRole()
          : m.accessNewRole()
      }
      description={m.accessRoleHint()}
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      pending={mutation.isPending}
    >
      <ManagementInput
        label={m.accessRoleName()}
        value={name}
        maxLength={128}
        required
        onChange={(event) => setName(event.target.value)}
      />
      <SelectField
        id="access-base-role"
        label={m.accessBaseRole()}
        value={baseRole}
        disabled={initial.expectedRevision > 0 || initial.builtinRole !== null}
        options={ROLES.map((role) => ({
          value: role,
          label: ROLE_LABEL[role](),
        }))}
        onChange={setBaseRole}
        description={m.accessBaseRoleHint()}
      />
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">
          {m.adminCapability()}
        </legend>
        {PERMISSIONS.map((permission) => {
          const allowed = held.has(permission);
          const checked = permissions.includes(permission);
          return (
            <label
              key={permission}
              className="flex items-center gap-2 text-sm aria-disabled:text-muted-foreground"
              aria-disabled={!allowed || undefined}
            >
              <Checkbox
                checked={checked}
                disabled={!allowed && !checked}
                onCheckedChange={(next) =>
                  setPermissions((current) =>
                    next
                      ? [...current, permission]
                      : current.filter((item) => item !== permission),
                  )
                }
              />
              <span>{PERMISSION_LABEL[permission]()}</span>
              {!allowed ? (
                <span className="text-xs text-muted-foreground">
                  ({m.accessNotHeld()})
                </span>
              ) : null}
            </label>
          );
        })}
      </fieldset>
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      ) : null}
    </ManagementDialog>
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
    <SectionCard title={m.accessChanges()} description={m.accessChangesHint()}>
      {data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.accessNoChanges()}</p>
      ) : (
        <ul className="divide-y">
          {data.rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm"
            >
              <ShieldCheck
                className="size-4 text-muted-foreground"
                aria-hidden
              />
              <span className="font-medium">
                {ACTION_LABEL[row.action]?.() ?? row.action}
              </span>
              <span className="text-muted-foreground">
                <Value>{row.after.name ?? null}</Value>
              </span>
              <span className="ms-auto text-xs text-muted-foreground">
                {row.actor.name} · {formatDateTime(row.createdAt.toISOString())}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.pages > 1 ? (
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {m.paginationPrevious()}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= data.pages}
            onClick={() => setPage(page + 1)}
          >
            {m.paginationNext()}
          </Button>
        </div>
      ) : null}
    </SectionCard>
  );
}
