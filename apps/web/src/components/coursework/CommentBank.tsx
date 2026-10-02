import { Popover } from "@base-ui/react/popover";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Library, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { commentBankQuery } from "~/queries/coursework";
import { removeFromCommentBank } from "~/server/coursework";
import { getMessageFromError } from "~/utils/error";

/**
 * The grader's kept comments, searched and picked into what they are
 * writing. Their own can be taken out; those shared by colleagues are only
 * picked.
 */
export function CommentBankPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (body: string) => void;
}) {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const bank = useQuery({ ...commentBankQuery, enabled: open }).data;
  const remove = useMutation({
    mutationFn: (row: { id: string; version: number }) =>
      removeFromCommentBank({
        data: { id: row.id, expectedVersion: row.version },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: commentBankQuery.queryKey }),
    onError: (failure) => toast.error(getMessageFromError(failure)),
  });
  const wanted = search.trim().toLocaleLowerCase();
  const shown = (bank ?? []).filter((row) =>
    row.body.toLocaleLowerCase().includes(wanted),
  );
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSearch("");
      }}
    >
      <Popover.Trigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="max-md:h-10"
          />
        }
      >
        <Library aria-hidden />
        {m.courseworkCommentBank()}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" className="z-50">
          <Popover.Popup className="grid w-80 max-w-[calc(100vw-2rem)] gap-2 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg">
            <Input
              aria-label={m.courseworkCommentBankSearch()}
              placeholder={m.courseworkCommentBankSearch()}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {bank === undefined ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                {m.commonLoading()}
              </p>
            ) : shown.length ? (
              <ul className="grid max-h-72 gap-1 overflow-y-auto">
                {shown.map((row) => (
                  <li key={row.id} className="flex items-start gap-1">
                    <Popover.Close
                      className="grid min-w-0 flex-1 gap-0.5 rounded-md px-2 py-1.5 text-start text-sm leading-5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 max-md:min-h-10"
                      onClick={() => onPick(row.body)}
                    >
                      <span dir="auto" className="line-clamp-3">
                        {row.body}
                      </span>
                      {row.shared ? (
                        <span className="text-xs text-muted-foreground">
                          {row.mine
                            ? m.courseworkBankSharedMine()
                            : m.courseworkBankShared()}
                        </span>
                      ) : null}
                    </Popover.Close>
                    {row.mine ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={m.courseworkBankRemove()}
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(row)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                {bank.length
                  ? m.managementNoMatches()
                  : m.courseworkBankEmpty()}
              </p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
