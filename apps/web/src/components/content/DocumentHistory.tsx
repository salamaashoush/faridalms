import type { ContentDocument } from "@faridalms/domain/content";

import { Button } from "@faridalms/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@faridalms/ui/sheet";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { formatInstant } from "~/components/coursework/format";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { getDocumentHistory, restoreDocumentVersion } from "~/server/documents";
import { getMessageFromError } from "~/utils/error";

type Reason = "publish" | "checkpoint" | "before_restore" | "import";

const REASON: Record<Reason, () => string> = {
  publish: m.docVersionShown,
  checkpoint: m.docVersionKept,
  before_restore: m.docVersionBeforeRestore,
  import: m.docVersionImported,
};

/**
 * A document's earlier versions, in a sheet beside it. Restoring one puts it
 * in the editor as the working copy; it reaches readers only when saved or
 * shown as any other edit would.
 */
export function DocumentHistory({
  open,
  onOpenChange,
  hostType,
  hostId,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostType: string;
  hostId: string;
  onRestore: (content: ContentDocument) => void;
}) {
  const user = useCurrentUser();
  const versions = useQuery({
    queryKey: ["documents", "history", hostType, hostId],
    queryFn: () => getDocumentHistory({ data: { hostType, hostId } }),
    enabled: open,
  });
  const restore = useMutation({
    mutationFn: (documentVersion: number) =>
      restoreDocumentVersion({ data: { hostType, hostId, documentVersion } }),
    onSuccess: (result) => {
      onRestore(result.content);
      onOpenChange(false);
      toast.success(m.docRestored());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const end = getTextDirection(getLocale()) === "rtl" ? "left" : "right";
  const rows = versions.data?.versions ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={end}
        className="gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[400px] data-[side=right]:sm:max-w-[400px]"
      >
        <SheetHeader className="border-b px-5 py-3.5 pe-14">
          <SheetTitle className="text-base leading-6 font-semibold">
            {m.docHistory()}
          </SheetTitle>
          <SheetDescription>{m.docHistoryHint()}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {versions.isPending ? (
            <div aria-busy="true" className="min-h-24" />
          ) : rows.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              {m.docHistoryEmpty()}
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => {
                const who = inLocale(row.createdByNameEn, row.createdByNameAr);
                return (
                  <li
                    key={`${row.documentVersion}-${row.reason}-${row.createdAt}`}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="grid min-w-0 gap-0.5">
                      <span className="text-sm leading-5 font-medium">
                        {REASON[row.reason]()}
                      </span>
                      <span className="text-[13px] leading-[18px] text-muted-foreground">
                        {[
                          formatInstant(row.createdAt, user.school.timeZone),
                          who,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="max-md:h-10"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(row.documentVersion)}
                    >
                      <RotateCcw aria-hidden />
                      {m.docRestore()}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
