import { Button } from "@faridalms/ui/button";
import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { UserMinus } from "lucide-react";
import { useState } from "react";

import type { threadQuery } from "~/queries/messages";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { messageRecipientsQuery } from "~/queries/messages";
import { changeMembers } from "~/server/messages";
import { getMessageFromError } from "~/utils/error";

import { NameLink } from "./entries";
import { nameOf } from "./format";

type Thread = Awaited<
  ReturnType<NonNullable<ReturnType<typeof threadQuery>["queryFn"]>>
>;

export interface MembersSheetProps {
  thread: Thread;
  onClose: () => void;
}

/** Who is in a conversation; a group's owner can bring people in or take them out. */
export function MembersSheet({ thread, onClose }: MembersSheetProps) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [add, setAdd] = useState<string[]>([]);
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [remove, setRemove] = useState<string[]>([]);
  const recipients = useInfiniteQuery({
    ...messageRecipientsQuery(search),
    enabled: thread.canManage,
  });
  const found = recipients.data?.pages.flatMap((page) => page.rows);
  const present = new Set(
    thread.members.flatMap((row) => (row.userId ? [row.userId] : [])),
  );
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
        .filter((row) => !row.userId || !remove.includes(row.userId))
        .map((row) => (
          <li
            key={row.userId ?? row.contactId}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <span className="grid min-w-0">
              <NameLink
                userId={row.userId}
                link={row.link}
                className="truncate text-sm leading-5 font-medium"
              >
                {nameOf(row)}
              </NameLink>
              {row.role === "owner" ? (
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {thread.mailbox ? m.msgHolds() : m.msgOwner()}
                </span>
              ) : row.outside ? (
                <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
                  {row.userId ? m.msgOutsideLinked() : m.msgOutside()}
                  {row.email ? (
                    <>
                      {" · "}
                      <bdi dir="ltr">{row.email}</bdi>
                    </>
                  ) : null}
                  {row.unreachable ? (
                    <>
                      {" · "}
                      <span className="text-warning-foreground dark:text-warning">
                        {row.unreachable === "complained"
                          ? m.msgMemberComplained()
                          : m.msgMemberBounced()}
                      </span>
                    </>
                  ) : null}
                </span>
              ) : null}
            </span>
            {thread.canManage && row.userId && row.userId !== user.id ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="max-md:size-10"
                aria-label={m.msgRemoveMember({ name: nameOf(row) })}
                onClick={() =>
                  setRemove((current) =>
                    row.userId ? [...current, row.userId] : current,
                  )
                }
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
        more={
          recipients.hasNextPage
            ? {
                label: m.msgMoreRecipients(),
                pending: recipients.isFetchingNextPage,
                onMore: () => void recipients.fetchNextPage(),
              }
            : undefined
        }
      />
    </SheetForm>
  );
}
