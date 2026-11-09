import type { FocusPoint } from "@faridalms/ui/system/focus-picker";

import { Button } from "@faridalms/ui/button";
import { FocusPicker } from "@faridalms/ui/system/focus-picker";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { focusMediaItem } from "~/server/media";
import { getMessageFromError } from "~/utils/error";

import type { MediaRow } from "./media-items";

export interface FocusSheetProps {
  item: MediaRow;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}

/**
 * Marks where a media picture's subject sits. Crops of it start there,
 * and the website keeps it in view in whatever shape it shows the picture,
 * unless a page says otherwise for its own use.
 */
export function FocusSheet({ item, onClose, onSaved }: FocusSheetProps) {
  const save = useServerFn(focusMediaItem);
  const [focus, setFocus] = useState<FocusPoint>(
    item.focus ?? { x: 50, y: 50 },
  );
  const mutation = useMutation({
    mutationFn: (next: FocusPoint | null) =>
      save({ data: { id: item.id, focus: next } }),
    onSuccess: async (_, next) => {
      await onSaved();
      toast.success(next ? m.mediaFocusSaved() : m.mediaFocusCleared());
      onClose();
    },
  });
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={m.mediaFocusTitle({ name: item.name })}
      submitLabel={m.mediaFocusSave()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={() => mutation.mutateAsync(focus).catch(() => undefined)}
    >
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.mediaFocusHint()}
      </p>
      <FocusPicker
        src={`/files/${item.id}?w=1024`}
        label={m.mediaFocusMark()}
        focus={focus}
        onChange={setFocus}
      />
      {item.focus ? (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={mutation.isPending}
          onClick={() => void mutation.mutateAsync(null).catch(() => undefined)}
        >
          {m.mediaFocusClear()}
        </Button>
      ) : null}
    </SheetForm>
  );
}
