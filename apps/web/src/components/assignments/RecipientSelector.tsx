import type { AssignmentRecipientsInput } from "@faridalms/domain/assignment";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Field, FieldLabel } from "~/components/app/field";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import * as m from "~/i18n/messages";
import { deleteStudentGroup, saveStudentGroup } from "~/server/assignments";
import { getMessageFromError } from "~/utils/error";

interface RosterStudent {
  id: string;
  firstName: string;
  lastName: string;
}
interface Group {
  id: string;
  name: string;
  studentIds: string[];
}

function StudentChecklist({
  roster,
  selected,
  onChange,
  disabled,
  label,
}: {
  roster: RosterStudent[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  label: string;
}) {
  const [query, setQuery] = useState("");
  const id = useId();
  const visible = roster.filter((student) =>
    `${student.firstName} ${student.lastName}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <fieldset
      className="min-w-0 space-y-3 rounded-lg border p-4"
      disabled={disabled}
    >
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label={m.recipientSearchStudents()}
          placeholder={m.recipientSearchStudents()}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 w-full sm:w-64"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange([...new Set([...selected, ...visible.map((s) => s.id)])])
          }
        >
          {m.recipientSelectAll()}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange([])}
        >
          {m.recipientSelectNone()}
        </Button>
        <span className="ms-auto text-xs text-muted-foreground">
          {m.recipientSelectedCount({
            count: selected.length,
            total: roster.length,
          })}
        </span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((student) => {
          const checked = selected.includes(student.id);
          return (
            <li key={student.id}>
              <label
                htmlFor={`${id}-${student.id}`}
                className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm has-[[data-checked]]:border-primary"
              >
                <Checkbox
                  id={`${id}-${student.id}`}
                  checked={checked}
                  onCheckedChange={(next) =>
                    onChange(
                      next
                        ? [...selected, student.id]
                        : selected.filter((value) => value !== student.id),
                    )
                  }
                />
                {student.firstName} {student.lastName}
              </label>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {m.managementNoMatches()}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Who receives the work: the whole class, saved groups, or named students.
 * Groups are class-scoped and reusable, so a reading group set up once serves
 * every later assignment.
 */
export function RecipientSelector({
  classId,
  roster,
  groups,
  value,
  onChange,
  disabled = false,
}: {
  classId: string;
  roster: RosterStudent[];
  groups: Group[];
  value: AssignmentRecipientsInput;
  onChange: (value: AssignmentRecipientsInput) => void;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveStudentGroup);
  const remove = useServerFn(deleteStudentGroup);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["assignments", "authoring-context"],
    });
  const saveMutation = useMutation({
    mutationFn: save,
    onSuccess: async (group) => {
      await refresh();
      onChange({
        ...value,
        mode: "groups",
        groupIds: [...value.groupIds, group.id],
      });
      setCreating(false);
      setGroupName("");
      setGroupMembers([]);
      toast.success(m.groupSaved());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const removeMutation = useMutation({
    mutationFn: remove,
    onSuccess: async (_, variables) => {
      await refresh();
      onChange({
        ...value,
        groupIds: value.groupIds.filter((id) => id !== variables.data.id),
      });
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const modes = [
    { mode: "class", label: m.recipientWholeClass() },
    { mode: "groups", label: m.recipientGroups() },
    { mode: "students", label: m.recipientStudents() },
  ] as const;
  return (
    <Field>
      <FieldLabel>{m.assignmentRecipients()}</FieldLabel>
      <fieldset
        aria-label={m.assignmentRecipients()}
        className="flex flex-wrap gap-2"
        disabled={disabled}
      >
        {modes.map((option) => (
          <Button
            key={option.mode}
            type="button"
            variant={value.mode === option.mode ? "secondary" : "outline"}
            aria-pressed={value.mode === option.mode}
            onClick={() => onChange({ ...value, mode: option.mode })}
          >
            {option.label}
          </Button>
        ))}
      </fieldset>
      {value.mode === "class" ? (
        <p className="text-sm text-muted-foreground">
          {m.recipientClassHint({ count: roster.length })}
        </p>
      ) : null}
      {value.mode === "groups" ? (
        <div className="space-y-3">
          {groups.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {groups.map((group) => {
                const checked = value.groupIds.includes(group.id);
                return (
                  <li
                    key={group.id}
                    className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm has-[[data-checked]]:border-primary"
                  >
                    <Checkbox
                      id={`group-${group.id}`}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(next) =>
                        onChange({
                          ...value,
                          groupIds: next
                            ? [...value.groupIds, group.id]
                            : value.groupIds.filter((id) => id !== group.id),
                        })
                      }
                    />
                    <label
                      htmlFor={`group-${group.id}`}
                      className="min-w-0 flex-1 cursor-pointer"
                    >
                      <span className="font-medium">{group.name}</span>
                      <span className="ms-2 text-xs text-muted-foreground">
                        {m.groupMemberCount({ count: group.studentIds.length })}
                      </span>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={disabled || removeMutation.isPending}
                      aria-label={m.groupDeleteNamed({ name: group.name })}
                      onClick={() =>
                        removeMutation.mutate({
                          data: { id: group.id, classId },
                        })
                      }
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{m.groupNone()}</p>
          )}
          {creating ? (
            <div className="space-y-3 rounded-lg border border-dashed p-4">
              <Field>
                <FieldLabel htmlFor="new-group-name">
                  {m.groupName()}
                </FieldLabel>
                <Input
                  id="new-group-name"
                  value={groupName}
                  maxLength={64}
                  onChange={(event) => setGroupName(event.target.value)}
                />
              </Field>
              <StudentChecklist
                roster={roster}
                selected={groupMembers}
                onChange={setGroupMembers}
                disabled={disabled}
                label={m.groupMembers()}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={
                    disabled ||
                    saveMutation.isPending ||
                    !groupName.trim() ||
                    groupMembers.length === 0
                  }
                  onClick={() =>
                    saveMutation.mutate({
                      data: {
                        classId,
                        name: groupName.trim(),
                        studentIds: groupMembers,
                      },
                    })
                  }
                >
                  {m.groupSave()}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreating(false)}
                >
                  {m.commonCancel()}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => setCreating(true)}
            >
              <Plus className="size-4" aria-hidden />
              {m.groupNew()}
            </Button>
          )}
        </div>
      ) : null}
      {value.mode === "students" ? (
        <StudentChecklist
          roster={roster}
          selected={value.studentIds}
          onChange={(studentIds) => onChange({ ...value, studentIds })}
          disabled={disabled}
          label={m.recipientStudents()}
        />
      ) : null}
    </Field>
  );
}
