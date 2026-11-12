import type { Capability } from "@faridalms/domain/capabilities";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { ReactNode } from "react";

import { BUILTIN_ROLE_MODULE } from "@faridalms/domain/capabilities";
import { wordOn } from "@faridalms/domain/modules";
import { Checkbox } from "@faridalms/ui/checkbox";
import { ChangeLog } from "@faridalms/ui/system/change-log";
import { DataTable } from "@faridalms/ui/system/data-table";
import { TextField } from "@faridalms/ui/system/form-field";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusBadge } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Copy, Pencil, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import {
  accessRoleName,
  CAPABILITY_AREAS,
  CAPABILITY_LABEL,
  SENSITIVE_CAPABILITIES,
} from "~/components/people/capabilities";
import { historyEntry, historyLabels } from "~/components/system/history";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { accessChangesQuery, accessRolesQuery } from "~/queries/access";
import { saveAccessRole } from "~/server/access";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Roles = Awaited<
  ReturnType<NonNullable<(typeof accessRolesQuery)["queryFn"]>>
>;
export type AccessRole = Roles["roles"][number];

export function findRole(roles: Roles, id: string) {
  return roles.roles.find((role) => role.id === id);
}

type NameLink = (role: AccessRole, name: string) => ReactNode;

const SCOPE_LABEL: Record<AccessRole["scope"], () => string> = {
  tenant: m.accessScopeAllSchools,
  group: m.accessScopeGroup,
  school: m.accessScopeSchool,
};

function roleColumns(nameLink: NameLink): Column<AccessRole>[] {
  return [
    {
      id: "name",
      header: m.adminRole(),
      primary: true,
      cell: (role) => nameLink(role, accessRoleName(role)),
    },
    {
      id: "type",
      header: m.accessRoleType(),
      cell: (role) => (role.builtinKey ? m.accessBuiltin() : m.accessCustom()),
    },
    {
      id: "scope",
      header: m.accessScope(),
      cell: (role) => SCOPE_LABEL[role.scope](),
    },
    {
      id: "capabilities",
      header: m.accessCapabilities(),
      className: "text-end",
      cell: (role) => (
        <span className="tabular-nums">
          {formatNumber(role.capabilities.length)}
        </span>
      ),
    },
    {
      id: "people",
      header: m.accessPeople(),
      className: "text-end",
      cell: (role) => (
        <span className="tabular-nums">{formatNumber(role.people)}</span>
      ),
    },
    {
      id: "changed",
      header: m.accessLastChanged(),
      cell: (role) => formatInstant(role.changedAt, "medium"),
    },
  ];
}

function roleCard(nameLink: NameLink) {
  return {
    title: (role: AccessRole) => nameLink(role, accessRoleName(role)),
    fact: (role: AccessRole) =>
      `${role.builtinKey ? m.accessBuiltin() : m.accessCustom()} · ${SCOPE_LABEL[role.scope]()}`,
  };
}

export interface AccessRolesPanelProps {
  nameLink: NameLink;
  onEdit: (role: AccessRole) => void;
  onDuplicate: (role: AccessRole) => void;
}

export function AccessRolesPanel({
  nameLink,
  onEdit,
  onDuplicate,
}: AccessRolesPanelProps) {
  const { data } = useSuspenseQuery(accessRolesQuery);
  const { modules } = useCurrentUser();
  const rows = data.roles.filter((role) => {
    const module = role.builtinKey
      ? BUILTIN_ROLE_MODULE[role.builtinKey]
      : undefined;
    return module === undefined || modules[module];
  });
  const rowActions = (role: AccessRole): RowAction[] => [
    ...(role.editable
      ? [
          {
            label: m.accessEditRole(),
            icon: Pencil,
            onSelect: () => onEdit(role),
          },
        ]
      : []),
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
        rowLabel={(role) => accessRoleName(role)}
        rowActions={rowActions}
        card={roleCard(nameLink)}
        empty={{ icon: ShieldCheck, title: m.accessRolesCaption() }}
      />
      <AccessChanges />
    </div>
  );
}

function AccessChanges() {
  const [page, setPage] = useState(1);
  const { data } = useSuspenseQuery(accessChangesQuery(page));
  return (
    <RecordSection
      title={m.accessChanges()}
      description={m.accessChangesHint()}
    >
      <ChangeLog
        labels={historyLabels({
          caption: m.accessChanges(),
          empty: m.accessNoChanges(),
          spans: true,
        })}
        entries={data.rows.map((row) => ({
          ...historyEntry({
            id: row.id,
            action: row.action,
            occurredAt: row.occurredAt,
            actorEn: row.actorNameEn,
            actorAr: row.actorNameAr,
          }),
          details: [],
          why: null,
          record: (
            <Value>
              {row.subjectNameEn || row.subjectNameAr
                ? inLocale(row.subjectNameEn, row.subjectNameAr)
                : null}
            </Value>
          ),
        }))}
        pagination={
          data.pages > 1
            ? {
                page: data.page,
                pages: data.pages,
                total: data.total,
                pageSize: data.pageSize,
                onPage: setPage,
              }
            : undefined
        }
      />
    </RecordSection>
  );
}

interface RoleDraft {
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  capabilities: Capability[];
}

function draftFor(
  role: AccessRole | undefined,
  copyOf: AccessRole | undefined,
  grantable: readonly Capability[],
): RoleDraft {
  if (role)
    return {
      nameEn: role.nameEn ?? "",
      nameAr: role.nameAr ?? "",
      descriptionEn: role.descriptionEn ?? "",
      descriptionAr: role.descriptionAr ?? "",
      capabilities: [...role.capabilities],
    };
  const source = copyOf ? accessRoleName(copyOf) : null;
  return {
    nameEn: source ? m.accessCopyName({ name: source }, { locale: "en" }) : "",
    nameAr: source ? m.accessCopyName({ name: source }, { locale: "ar" }) : "",
    descriptionEn: "",
    descriptionAr: "",
    // A copy starts from what the source grants that the editor may grant.
    capabilities: copyOf
      ? copyOf.capabilities.filter((capability) =>
          grantable.includes(capability),
        )
      : [],
  };
}

export interface RoleSheetProps {
  open: boolean;
  role?: AccessRole;
  copyOf?: AccessRole;
  onClose: () => void;
}

export function RoleSheet({ open, role, copyOf, onClose }: RoleSheetProps) {
  const { data } = useSuspenseQuery(accessRolesQuery);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() =>
    draftFor(role, copyOf, data.grantable),
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      saveAccessRole({
        data: {
          ...(role ? { id: role.id, expectedVersion: role.version } : {}),
          nameEn: draft.nameEn,
          nameAr: draft.nameAr,
          descriptionEn: draft.descriptionEn,
          descriptionAr: draft.descriptionAr,
          capabilities: draft.capabilities,
        },
      }),
    meta: { inlineError: true },
  });
  const held = new Set<Capability>(data.grantable);
  const { modules } = useCurrentUser();
  const offered = (capability: Capability) =>
    wordOn("capabilities", capability, modules);
  const groupId = useId();
  const set = <K extends keyof RoleDraft>(key: K, value: RoleDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={role ? m.accessEditRole() : m.accessNewRole()}
      onSubmit={async () => {
        if (!draft.nameEn.trim() && !draft.nameAr.trim()) {
          setNameError(m.validationNameRequired());
          return;
        }
        await mutation.mutateAsync().then(
          async () => {
            await queryClient.invalidateQueries({ queryKey: ["access"] });
            toast.success(m.managementSaved());
            onClose();
          },
          () => undefined,
        );
      }}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
    >
      {role?.builtinKey && role.scope !== "school" ? (
        <p className="text-sm leading-5 text-muted-foreground">
          {m.accessBuiltinOverrideHint()}
        </p>
      ) : null}
      <TextField
        id="access-role-name-en"
        label={m.accessRoleNameEnglish()}
        dir="ltr"
        width="name"
        maxLength={80}
        autoComplete="off"
        value={draft.nameEn}
        onChange={(event) => {
          setNameError(null);
          set("nameEn", event.target.value);
        }}
        errors={nameError ? [nameError] : undefined}
      />
      <TextField
        id="access-role-name-ar"
        label={m.accessRoleNameArabic()}
        dir="rtl"
        width="name"
        maxLength={80}
        autoComplete="off"
        value={draft.nameAr}
        onChange={(event) => {
          setNameError(null);
          set("nameAr", event.target.value);
        }}
      />
      <TextField
        id="access-role-description-en"
        label={m.accessRoleDescriptionEnglish()}
        optional
        dir="ltr"
        width="full"
        maxLength={500}
        autoComplete="off"
        value={draft.descriptionEn}
        onChange={(event) => set("descriptionEn", event.target.value)}
      />
      <TextField
        id="access-role-description-ar"
        label={m.accessRoleDescriptionArabic()}
        optional
        dir="rtl"
        width="full"
        maxLength={500}
        autoComplete="off"
        value={draft.descriptionAr}
        onChange={(event) => set("descriptionAr", event.target.value)}
      />
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
        {CAPABILITY_AREAS.map(({ area, label, capabilities }) =>
          capabilities.some(offered) ? (
            <fieldset key={area} className="grid pt-2">
              <legend className="pb-1 text-[13px] leading-[18px] font-medium text-muted-foreground">
                {label()}
              </legend>
              {capabilities.filter(offered).map((capability) => {
                const allowed = held.has(capability);
                const checked = draft.capabilities.includes(capability);
                return (
                  <label
                    key={capability}
                    aria-disabled={!allowed && !checked ? true : undefined}
                    className="flex min-h-9 cursor-pointer items-center gap-3 text-sm leading-5 aria-disabled:cursor-default aria-disabled:text-muted-foreground max-md:min-h-10"
                  >
                    <Checkbox
                      aria-labelledby={`${groupId}-${capability}`}
                      checked={checked}
                      disabled={!allowed && !checked}
                      onCheckedChange={(next) =>
                        set(
                          "capabilities",
                          next
                            ? [...draft.capabilities, capability]
                            : draft.capabilities.filter(
                                (item) => item !== capability,
                              ),
                        )
                      }
                    />
                    <span id={`${groupId}-${capability}`} className="min-w-0">
                      {CAPABILITY_LABEL[capability]()}
                    </span>
                    {SENSITIVE_CAPABILITIES.has(capability) ? (
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
          ) : null,
        )}
      </fieldset>
    </SheetForm>
  );
}
