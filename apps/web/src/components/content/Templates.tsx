import type { ContentDocument } from "@faridalms/domain/content";
import type { TemplateKind } from "@faridalms/domain/templates";

import { Button } from "@faridalms/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@faridalms/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@faridalms/ui/dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LayoutTemplate, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { TextField } from "~/components/system/field";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  listTemplates,
  openTemplate,
  removeTemplate,
  saveTemplate,
} from "~/server/templates";
import { getMessageFromError } from "~/utils/error";

const templatesQuery = (kind: TemplateKind) => ({
  queryKey: ["templates", kind],
  queryFn: () => listTemplates({ data: { kind } }),
});

/**
 * Offered on an empty document: the templates the school keeps for this
 * kind, any of which fills the page to start from.
 */
export function TemplatePicker({
  kind,
  onApply,
}: {
  kind: TemplateKind;
  onApply: (content: ContentDocument) => void;
}) {
  const queryClient = useQueryClient();
  const rows = useQuery(templatesQuery(kind)).data ?? [];
  const apply = useMutation({
    mutationFn: (id: string) => openTemplate({ data: { id } }),
    onSuccess: (result) => onApply(result.content),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeTemplate({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["templates", kind] });
      toast.success(m.tplRemoved());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  if (rows.length === 0) return null;
  const mine = rows.filter((row) => row.mine);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit max-md:h-10"
            disabled={apply.isPending}
          />
        }
      >
        {apply.isPending ? (
          <LoaderCircle className="animate-spin" aria-hidden />
        ) : (
          <LayoutTemplate aria-hidden />
        )}
        {m.tplStartFrom()}
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuGroup>
          {rows.map((row) => (
            <DropdownMenuItem
              key={row.id}
              onClick={() => apply.mutate(row.id)}
              className="grid gap-0.5"
            >
              <span dir="auto" className="truncate font-medium">
                {row.title}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {row.mine
                  ? m.tplYours()
                  : inLocale(row.ownerNameEn, row.ownerNameAr)}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {mine.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{m.tplRemoveYours()}</DropdownMenuLabel>
              {mine.map((row) => (
                <DropdownMenuItem
                  key={row.id}
                  variant="destructive"
                  onClick={() => remove.mutate(row.id)}
                >
                  <span dir="auto" className="truncate">
                    {row.title}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Keeps the document as a template the whole school can start from. */
export function SaveTemplateDialog({
  open,
  onOpenChange,
  kind,
  content,
  suggestedTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: TemplateKind;
  content: ContentDocument;
  suggestedTitle: string;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(suggestedTitle);
  const save = useMutation({
    mutationFn: () =>
      saveTemplate({ data: { kind, title: title.trim(), content } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["templates", kind] });
      toast.success(m.tplSaved());
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!save.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="gap-5 sm:max-w-md">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) save.mutate();
          }}
        >
          <div className="grid gap-2">
            <DialogTitle className="text-base font-semibold">
              {m.tplSaveTitle()}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {m.tplSaveBody()}
            </DialogDescription>
          </div>
          <TextField
            id="template-title"
            label={m.tplName()}
            dir="auto"
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            errors={save.error ? [getMessageFromError(save.error)] : undefined}
          />
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => onOpenChange(false)}
            >
              {m.docCancel()}
            </Button>
            <Button type="submit" disabled={save.isPending || !title.trim()}>
              {save.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : null}
              {m.tplSave()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
