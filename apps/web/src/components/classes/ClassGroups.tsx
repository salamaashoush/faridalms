import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import { CheckboxGroupField, TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { getClassGroups } from "~/server/classes";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classGroupsQuery } from "~/queries/classes";
import { removeClassGroup, saveClassGroup } from "~/server/classes";
import { formatList } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { displayName } from "../people/format";

type GroupsData = Awaited<ReturnType<typeof getClassGroups>>;
type Group = GroupsData["groups"][number];
type Student = GroupsData["roster"][number];

const groupName = (group: Pick<Group, "titleEn" | "titleAr">) =>
  inLocale(group.titleEn, group.titleAr);

function membersOf(group: Group, roster: readonly Student[]): string {
  return formatList(
    roster
      .filter((student) => group.studentIds.includes(student.id))
      .map(displayName),
  );
}

type Opener = (group: Group, text: ReactNode) => ReactNode;

function groupColumns(roster: readonly Student[], opener: Opener) {
  const columns: Column<Group>[] = [
    {
      id: "name",
      header: m.classGroupsName(),
      primary: true,
      cell: (group) => opener(group, <bdi>{groupName(group)}</bdi>),
    },
    {
      id: "students",
      header: m.classesStudents(),
      width: "wide",
      cell: (group) => membersOf(group, roster),
    },
  ];
  return columns;
}

function groupCard(roster: readonly Student[], opener: Opener) {
  return {
    title: (group: Group) => opener(group, <bdi>{groupName(group)}</bdi>),
    fact: (group: Group) => membersOf(group, roster),
  };
}

interface GroupSheetProps {
  classId: string;
  roster: readonly Student[];
  group: Group | null;
  open: boolean;
  onClose: () => void;
}

/** Adds a group of the class's students, or renames one and changes who is in it. */
function GroupSheet({
  classId,
  roster,
  group,
  open,
  onClose,
}: GroupSheetProps) {
  const queryClient = useQueryClient();
  const [titleEn, setTitleEn] = useState(group?.titleEn ?? "");
  const [titleAr, setTitleAr] = useState(group?.titleAr ?? "");
  const [studentIds, setStudentIds] = useState<string[]>(
    group?.studentIds ?? [],
  );
  const [tried, setTried] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      saveClassGroup({
        data: {
          ...(group ? { id: group.id } : {}),
          classId,
          titleEn: titleEn.trim(),
          titleAr: titleAr.trim(),
          studentIds,
        },
      }),
    meta: { inlineError: true },
  });
  const untitled = tried && !titleEn.trim() && !titleAr.trim();
  const empty = tried && studentIds.length === 0;
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        group
          ? m.classGroupsChange({ name: groupName(group) })
          : m.classGroupsAdd()
      }
      submitLabel={group ? m.classGroupsSave() : m.classGroupsAdd()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if ((!titleEn.trim() && !titleAr.trim()) || studentIds.length === 0)
          return;
        try {
          await mutation.mutateAsync();
        } catch {
          return;
        }
        await queryClient.invalidateQueries({
          queryKey: classGroupsQuery(classId).queryKey,
        });
        toast.success(m.classGroupsSaved());
        onClose();
      }}
    >
      <TextField
        id="group-title-en"
        label={m.gradingTitleEn()}
        hint={m.classGroupsNameHint()}
        width="name"
        lang="en"
        autoComplete="off"
        maxLength={80}
        value={titleEn}
        onChange={(event) => setTitleEn(event.target.value)}
        errors={untitled ? [m.classGroupsNameNeeded()] : undefined}
      />
      <TextField
        id="group-title-ar"
        label={m.gradingTitleAr()}
        width="name"
        lang="ar"
        dir="rtl"
        autoComplete="off"
        maxLength={80}
        value={titleAr}
        onChange={(event) => setTitleAr(event.target.value)}
      />
      <CheckboxGroupField
        label={m.classGroupsMembers()}
        hint={m.classGroupsMembersHint()}
        columns
        value={studentIds}
        options={roster.map((student) => ({
          value: student.id,
          label: displayName(student),
        }))}
        onChange={setStudentIds}
        errors={empty ? [m.classGroupsMembersNeeded()] : undefined}
      />
    </SheetForm>
  );
}

interface RemoveGroupDialogProps {
  classId: string;
  group: Group;
  open: boolean;
  onClose: () => void;
}

function RemoveGroupDialog({
  classId,
  group,
  open,
  onClose,
}: RemoveGroupDialogProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => removeClassGroup({ data: { id: group.id, classId } }),
    meta: { inlineError: true },
  });
  return (
    <ConfirmDialog
      open={open}
      title={m.classGroupsRemoveTitle({ name: groupName(group) })}
      body={m.classGroupsRemoveBody()}
      confirmLabel={m.classGroupsRemove()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : undefined}
      onCancel={onClose}
      onConfirm={() =>
        void mutation.mutateAsync().then(
          async () => {
            await queryClient.invalidateQueries({
              queryKey: classGroupsQuery(classId).queryKey,
            });
            toast.success(m.classGroupsRemoved());
            onClose();
          },
          () => undefined,
        )
      }
    />
  );
}

type Opened =
  | { kind: "edit"; group: Group | null }
  | { kind: "remove"; group: Group };

export interface ClassGroupsProps {
  classId: string;
}

/**
 * The class's groups: named sets of its students that work or a module
 * can be set for. Each is added, renamed, given other students or removed
 * from its own sheet.
 */
export function ClassGroups({ classId }: ClassGroupsProps) {
  const { groups, roster } = useSuspenseQuery(classGroupsQuery(classId)).data;
  const [opened, setOpened] = useState<{
    what: Opened;
    open: boolean;
    key: number;
  } | null>(null);
  const open = (what: Opened) =>
    setOpened((current) => ({
      what,
      open: true,
      key: (current?.key ?? 0) + 1,
    }));
  const close = () =>
    setOpened((current) => current && { ...current, open: false });
  const opener: Opener = (group, text) => (
    <RowButton onClick={() => open({ kind: "edit", group })}>{text}</RowButton>
  );
  const add = (variant: "default" | "outline") =>
    roster.length > 0 ? (
      <Button
        type="button"
        variant={variant}
        className="max-md:h-10"
        onClick={() => open({ kind: "edit", group: null })}
      >
        <Plus aria-hidden />
        {m.classGroupsAdd()}
      </Button>
    ) : undefined;
  const rowActions = (group: Group): RowAction[] => [
    {
      label: m.recordEdit(),
      icon: Pencil,
      onSelect: () => open({ kind: "edit", group }),
    },
    {
      label: m.classGroupsRemove(),
      icon: Trash2,
      onSelect: () => open({ kind: "remove", group }),
    },
  ];
  return (
    <>
      <DataTable
        caption={m.classGroupsCaption()}
        rows={groups}
        columns={groupColumns(roster, opener)}
        rowLabel={groupName}
        rowActions={rowActions}
        actions={add("outline")}
        card={groupCard(roster, opener)}
        empty={{
          icon: UsersRound,
          title: m.classGroupsEmpty(),
          description:
            roster.length > 0
              ? m.classGroupsEmptyHint()
              : m.classGroupsEmptyNoStudents(),
          action: add("default"),
        }}
      />
      {opened?.what.kind === "edit" ? (
        <GroupSheet
          key={opened.key}
          classId={classId}
          roster={roster}
          group={opened.what.group}
          open={opened.open}
          onClose={close}
        />
      ) : opened?.what.kind === "remove" ? (
        <RemoveGroupDialog
          key={opened.key}
          classId={classId}
          group={opened.what.group}
          open={opened.open}
          onClose={close}
        />
      ) : null}
    </>
  );
}
