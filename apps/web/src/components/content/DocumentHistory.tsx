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

import { LOCALE_NAME } from "~/components/content/languages";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { getDocumentHistory, restoreDocumentVersion } from "~/server/documents";
import { formatInstant } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Reason = "publish" | "checkpoint" | "before_restore" | "import";

const REASON: Record<Reason, () => string> = {
  publish: m.docVersionShown,
  checkpoint: m.docVersionKept,
  before_restore: m.docVersionBeforeRestore,
  import: m.docVersionImported,
};

/** What a restore brings back: a document's words, or a website page's sections. */
export type Restored = Awaited<ReturnType<typeof restoreDocumentVersion>>;

/**
 * A document's earlier versions in each language it is written in, in a
 * sheet beside it. Restoring one puts it in the editor as the working copy;
 * it reaches readers only when saved or shown as any other edit would.
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
  onRestore: (restored: Restored) => void;
}) {
  const versions = useQuery({
    queryKey: ["documents", "history", hostType, hostId],
    queryFn: () => getDocumentHistory({ data: { hostType, hostId } }),
    enabled: open,
  });
  const restore = useMutation({
    mutationFn: (row: {
      documentVersion: number;
      locale: "en" | "ar" | null;
    }) =>
      restoreDocumentVersion({
        data: {
          hostType,
          hostId,
          documentVersion: row.documentVersion,
          ...(row.locale ? { locale: row.locale } : {}),
        },
      }),
    onSuccess: (result) => {
      onRestore(result);
      onOpenChange(false);
      toast.success(m.docRestored());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const end = getTextDirection(getLocale()) === "rtl" ? "left" : "right";
  const rows = versions.data?.versions ?? [];
  const bilingual = (versions.data?.languages.length ?? 0) > 1;
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
                    key={`${row.locale ?? ""}-${row.documentVersion}-${row.reason}-${row.createdAt}`}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="grid min-w-0 gap-0.5">
                      <span className="text-sm leading-5 font-medium">
                        {REASON[row.reason]()}
                        {bilingual && row.locale
                          ? ` · ${LOCALE_NAME[row.locale]()}`
                          : ""}
                      </span>
                      <span className="text-[13px] leading-[18px] text-muted-foreground">
                        {[formatInstant(row.createdAt), who]
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
                      onClick={() => restore.mutate(row)}
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
