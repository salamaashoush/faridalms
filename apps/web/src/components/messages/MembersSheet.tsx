import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserMinus } from "lucide-react";
import { useState } from "react";

import type { threadQuery } from "~/queries/messages";

import { ComboboxField } from "~/components/system/ComboboxField";
import { SheetForm } from "~/components/system/SheetForm";
import { Button } from "~/components/ui/button";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { messageRecipientsQuery } from "~/queries/messages";
import { changeMembers } from "~/server/messages";
import { getMessageFromError } from "~/utils/error";

import { nameOf } from "./format";

type Thread = Awaited<
  ReturnType<NonNullable<ReturnType<typeof threadQuery>["queryFn"]>>
>;

/** Who is in a conversation; a group's owner can bring people in or take them out. */
export function MembersSheet({
  thread,
  onClose,
}: {
  thread: Thread;
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [add, setAdd] = useState<string[]>([]);
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [remove, setRemove] = useState<string[]>([]);
  const found = useQuery({
    ...messageRecipientsQuery(search),
    enabled: thread.canManage,
  }).data?.rows;
  const present = new Set(thread.members.map((row) => row.userId));
  const save = useMutation({
    mutationFn: () =>
      changeMembers({ data: { threadId: thread.id, add, remove } }),
    meta: { inlineError: true },
  });
  const options = [
    ...add.map((userId) => ({
      value: userId,
      label: labels.get(userId) ?? "",
    })),
    ...(found ?? [])
      .filter((row) => !present.has(row.userId) && !add.includes(row.userId))
      .map((row) => ({ value: row.userId, label: nameOf(row) })),
  ];
  const list = (
    <ul className="divide-y rounded-lg border">
      {thread.members
        .filter((row) => !remove.includes(row.userId))
        .map((row) => (
          <li
            key={row.userId}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <span className="grid min-w-0">
              <bdi className="truncate text-sm leading-5 font-medium">
                {nameOf(row)}
              </bdi>
              {row.role === "owner" ? (
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {m.msgOwner()}
                </span>
              ) : null}
            </span>
            {thread.canManage && row.userId !== user.id ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="max-md:size-10"
                aria-label={m.msgRemoveMember({ name: nameOf(row) })}
                onClick={() => setRemove((current) => [...current, row.userId])}
              >
                <UserMinus aria-hidden />
              </Button>
            ) : null}
          </li>
        ))}
    </ul>
  );
  if (!thread.canManage)
    return (
      <SheetForm
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={m.msgMembers()}
        submitLabel={m.msgDone()}
        onSubmit={onClose}
      >
        {list}
      </SheetForm>
    );
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={m.msgMembers()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={() =>
        save.mutateAsync().then(
          async () => {
            await queryClient.invalidateQueries({ queryKey: ["messages"] });
            onClose();
          },
          () => undefined,
        )
      }
    >
      {list}
      <ComboboxField
        label={m.msgAddMembers()}
        optional
        multiple
        options={options}
        value={add}
        onChange={(next) => {
          setLabels(
            (current) =>
              new Map([
                ...current,
                ...options.map(
                  (option) => [option.value, option.label] as const,
                ),
              ]),
          );
          setAdd(next);
        }}
        search={search}
        onSearchChange={setSearch}
      />
    </SheetForm>
  );
}
