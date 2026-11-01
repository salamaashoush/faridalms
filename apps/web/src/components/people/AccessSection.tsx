import { Button } from "@faridalms/ui/button";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Plus, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ActionMenu } from "~/components/system/ActionMenu";
import { SelectField, TextField } from "~/components/system/field";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import { StatusBadge } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { accessRolesQuery, personAccessQuery } from "~/queries/access";
import { assignAccessRole, endAccessAssignment } from "~/server/access";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import {
  accessRoleName,
  CAPABILITY_AREAS,
  CAPABILITY_LABEL,
} from "./capabilities";
import { CheckboxRow } from "./fields";
import { lastDay } from "./format";

type Access = Awaited<
  ReturnType<NonNullable<ReturnType<typeof personAccessQuery>["queryFn"]>>
>;
type Assignment = Access["assignments"][number];

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["access"] }),
      queryClient.invalidateQueries({ queryKey: ["people"] }),
    ]);
}

function AssignSheet({
  userId,
  name,
  open,
  onClose,
  today,
}: {
  userId: string;
  name: string;
  open: boolean;
  onClose: () => void;
  today: string;
}) {
  const roles = useSuspenseQuery(accessRolesQuery).data;
  const refresh = useRefresh();
  const held = new Set<string>(roles.grantable);
  const choices = roles.roles.filter((role) =>
    role.capabilities.every((capability) => held.has(capability)),
  );
  const [roleId, setRoleId] = useState("");
  const [replaces, setReplaces] = useState(false);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ role?: string; endsOn?: string }>({});
  const mutation = useMutation({
    mutationFn: () =>
      assignAccessRole({
        data: {
          userId,
          accessRoleId: roleId,
          replacesBuiltin: replaces,
          startsOn,
          endsOn,
          reason,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.accessAssignRole()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        const found: typeof errors = {};
        if (!roleId) found.role = m.validationSelection();
        if (endsOn && endsOn <= startsOn) found.endsOn = m.validationEndDate();
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.accessAssigned({ name }));
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <SelectField
        id="assign-role"
        label={m.adminRole()}
        hint={m.accessAssignHint()}
        value={roleId}
        options={choices.map((role) => ({
          value: role.id,
          label: accessRoleName(role),
        }))}
        onChange={(value) => {
          setErrors((current) => ({ ...current, role: undefined }));
          setRoleId(value);
        }}
        errors={errors.role ? [errors.role] : undefined}
        width="name"
      />
      <CheckboxRow
        label={m.accessReplacesBuiltin()}
        hint={m.accessReplacesBuiltinHint()}
        checked={replaces}
        onChange={setReplaces}
      />
      <TextField
        id="assign-starts"
        label={m.accessStartsOn()}
        type="date"
        width="date"
        value={startsOn}
        onChange={(event) => setStartsOn(event.target.value)}
      />
      <TextField
        id="assign-ends"
        label={m.accessEndsOn()}
        optional
        hint={m.accessEndsOnHint()}
        type="date"
        width="date"
        value={endsOn}
        onChange={(event) => {
          setErrors((current) => ({ ...current, endsOn: undefined }));
          setEndsOn(event.target.value);
        }}
        errors={errors.endsOn ? [errors.endsOn] : undefined}
      />
      <TextField
        id="assign-reason"
        label={m.accessReason()}
        optional
        width="full"
        maxLength={500}
        autoComplete="off"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
    </SheetForm>
  );
}

function AssignmentItem({
  assignment,
  name,
  onEnd,
}: {
  assignment: Assignment;
  name: string;
  onEnd: () => Promise<void>;
}) {
  const role = accessRoleName({
    builtinKey: assignment.builtinKey,
    nameEn: assignment.roleNameEn,
    nameAr: assignment.roleNameAr,
  });
  const granted =
    assignment.grantedByEn || assignment.grantedByAr
      ? inLocale(assignment.grantedByEn, assignment.grantedByAr)
      : null;
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5 font-medium">
          <span dir="auto">{role}</span>
          {assignment.replacesBuiltin ? (
            <StatusBadge tone="warning">
              {m.accessReplacesBuiltinShort()}
            </StatusBadge>
          ) : null}
        </span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {[
            assignment.to
              ? m.accessDuring({
                  from: formatDate(assignment.from),
                  to: formatDate(lastDay(assignment.to)),
                })
              : m.personSince({ date: formatDate(assignment.from) }),
            granted ? m.accessGrantedBy({ name: granted }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {assignment.reason ? (
          <span dir="auto" className="text-[13px] leading-[18px]">
            {assignment.reason}
          </span>
        ) : null}
      </div>
      {assignment.atSchool ? (
        <ActionMenu
          label={m.accessAssignmentActions({ role })}
          actions={[
            {
              label: m.accessEndAssignment(),
              icon: XCircle,
              destructive: true,
              confirm: {
                title: m.accessEndAssignmentTitle({ role, name }),
                body: m.accessEndAssignmentBody({ name }),
                label: m.accessEndAssignment(),
              },
              onSelect: onEnd,
            },
          ]}
        />
      ) : null}
    </li>
  );
}

/** What a member of staff may do at this school, and the roles that give it. */
export function AccessSection({
  userId,
  name,
  today,
}: {
  userId: string;
  name: string;
  today: string;
}) {
  const access = useSuspenseQuery(personAccessQuery(userId)).data;
  const refresh = useRefresh();
  const [sheet, setSheet] = useState({ open: false, key: 0 });
  const held = new Set<string>(access.capabilities);
  const end = (assignment: Assignment) => async () => {
    try {
      await endAccessAssignment({
        data: {
          assignmentId: assignment.id,
          expectedVersion: assignment.version,
        },
      });
    } catch (error) {
      throw new Error(getMessageFromError(error), { cause: error });
    }
    await refresh();
    toast.success(m.accessAssignmentEnded({ name }));
  };
  return (
    <>
      <RecordSection
        title={m.accessAssignedRoles()}
        description={m.accessAssignedRolesHint()}
        action={
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-10"
            onClick={() =>
              setSheet((current) => ({ open: true, key: current.key + 1 }))
            }
          >
            <Plus aria-hidden />
            {m.accessAssignRole()}
          </Button>
        }
      >
        {access.assignments.length === 0 ? (
          <RecordEmpty>{m.accessNoAssignments()}</RecordEmpty>
        ) : (
          <RecordList>
            {access.assignments.map((assignment) => (
              <AssignmentItem
                key={assignment.id}
                assignment={assignment}
                name={name}
                onEnd={end(assignment)}
              />
            ))}
          </RecordList>
        )}
      </RecordSection>
      <RecordSection
        title={m.accessHeldHere()}
        description={m.accessHeldHereHint()}
      >
        {access.capabilities.length === 0 ? (
          <RecordEmpty>{m.accessHoldsNothing()}</RecordEmpty>
        ) : (
          <div className="grid gap-4">
            {CAPABILITY_AREAS.map(({ area, label, capabilities }) => {
              const here = capabilities.filter((capability) =>
                held.has(capability),
              );
              return here.length ? (
                <div key={area} className="grid gap-1">
                  <h3 className="text-[13px] leading-[18px] font-medium text-muted-foreground">
                    {label()}
                  </h3>
                  <ul className="grid gap-1 text-sm leading-5">
                    {here.map((capability) => (
                      <li key={capability}>{CAPABILITY_LABEL[capability]()}</li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })}
          </div>
        )}
      </RecordSection>
      <AssignSheet
        key={sheet.key}
        userId={userId}
        name={name}
        open={sheet.open}
        today={today}
        onClose={() => setSheet((current) => ({ ...current, open: false }))}
      />
    </>
  );
}
