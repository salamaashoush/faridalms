import { Popover } from "@base-ui/react/popover";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Library, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { commentBankQuery } from "~/queries/coursework";
import { removeFromCommentBank, saveToCommentBank } from "~/server/coursework";
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
  compact = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (picked: { id: string; body: string }) => void;
  /** An icon alone, for the tight row under a comment. */
  compact?: boolean;
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
  const create = useMutation({
    mutationFn: (body: string) =>
      saveToCommentBank({
        data: { id: "", expectedVersion: 0, body, shared: false },
      }),
    onSuccess: async (saved, body) => {
      await queryClient.invalidateQueries({
        queryKey: commentBankQuery.queryKey,
      });
      onPick({ id: saved.id, body });
      onOpenChange(false);
      setSearch("");
    },
    onError: (failure) => toast.error(getMessageFromError(failure)),
  });
  const typed = search.trim();
  const wanted = typed.toLocaleLowerCase();
  const matching = (bank ?? []).filter((row) =>
    row.body.toLocaleLowerCase().includes(wanted),
  );
  // Opened empty, the bank shows the five a teacher uses most, as
  // Classroom's "#" does; typing searches all of it.
  const shown = typed ? matching : matching.slice(0, 5);
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
            size={compact ? "icon-sm" : "sm"}
            variant="ghost"
            className={compact ? "max-md:size-10" : "max-md:h-10"}
          />
        }
        aria-label={compact ? m.courseworkCommentBank() : undefined}
        title={compact ? m.courseworkCommentBank() : undefined}
      >
        <Library aria-hidden />
        {compact ? null : m.courseworkCommentBank()}
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
                      onClick={() => onPick({ id: row.id, body: row.body })}
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
            ) : typed ? null : (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                {m.courseworkBankEmpty()}
              </p>
            )}
            {!typed && matching.length > shown.length ? (
              <p className="px-2 text-xs text-muted-foreground">
                {m.courseworkBankMore()}
              </p>
            ) : null}
            {typed && !matching.some((row) => row.body === typed) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto justify-start py-1.5 text-start whitespace-normal"
                disabled={create.isPending}
                onClick={() => create.mutate(typed)}
              >
                <Plus aria-hidden />
                <span className="line-clamp-2">
                  {m.courseworkBankCreate({ text: typed })}
                </span>
              </Button>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
