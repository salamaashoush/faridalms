import { Button } from "@faridalms/ui/button";
import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Merge } from "lucide-react";
import { useState } from "react";

import * as m from "~/i18n/messages";
import { messageContactsQuery } from "~/queries/messages";
import { mergeMessageContacts } from "~/server/messages";
import { getMessageFromError } from "~/utils/error";

export interface MergeContactProps {
  /** The contact kept, as this conversation names it. */
  contactId: string;
  name: string;
}

/**
 * Merges another contact of the same family, who wrote from a different
 * address, into the one this conversation names, for the team that writes
 * in its mailbox. The other's conversations and words join this one's.
 */
export function MergeContact({ contactId, name }: MergeContactProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const found = useQuery({ ...messageContactsQuery(search), enabled: open });
  const merge = useMutation({
    mutationFn: (fromId: string) =>
      mergeMessageContacts({ data: { intoId: contactId, fromId } }),
    onSuccess: async () => {
      setPicked([]);
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    meta: { inlineError: true },
  });
  if (!open)
    return (
      <div className="grid gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start max-md:h-10"
          onClick={() => setOpen(true)}
        >
          <Merge aria-hidden />
          {m.msgMergeOpen()}
        </Button>
        {merge.isSuccess ? (
          <p
            aria-live="polite"
            className="text-[13px] leading-[18px] text-muted-foreground"
          >
            {m.msgMergeDone({ name })}
          </p>
        ) : null}
      </div>
    );
  const options = (found.data?.rows ?? [])
    .filter((row) => row.id !== contactId)
    .map((row) => ({
      value: row.id,
      label: [row.displayName, row.email ?? row.phone ?? ""]
        .filter(Boolean)
        .join(" · "),
    }));
  const [fromId] = picked;
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <ComboboxField
        label={m.msgMergeLabel()}
        hint={m.msgMergeHint({ name })}
        options={options}
        value={picked}
        onChange={setPicked}
        search={search}
        onSearchChange={setSearch}
        searchLabel={m.msgMergeSearch()}
        emptyLabel={m.msgMergeNone()}
      />
      {merge.error ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {getMessageFromError(merge.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="max-md:h-10"
          disabled={!fromId || merge.isPending}
          onClick={() => {
            if (fromId)
              void merge.mutateAsync(fromId).then(
                () => setOpen(false),
                () => undefined,
              );
          }}
        >
          {m.msgMergeConfirm({ name })}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:h-10"
          onClick={() => setOpen(false)}
        >
          {m.msgMergeCancel()}
        </Button>
      </div>
    </div>
  );
}
