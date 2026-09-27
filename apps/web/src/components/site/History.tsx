import type { SiteLocale } from "@faridalms/domain/website";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { formatInstant } from "~/components/coursework/format";
import { RecordList } from "~/components/system/RecordPage";
import { Button } from "~/components/ui/button";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { restoreSitePage, restoreSitePost } from "~/server/site";
import { getMessageFromError } from "~/utils/error";

import type { Languages } from "./SectionFields";

import { LOCALE_NAME } from "./format";

interface Version {
  documentVersion: number;
  reason: "publish" | "checkpoint" | "before_restore" | "import";
  createdAt: string;
  createdByNameEn: string | null;
  createdByNameAr: string | null;
  locale: SiteLocale;
}

const REASON: Record<Version["reason"], () => string> = {
  publish: m.siteVersionPublished,
  checkpoint: m.siteVersionCheckpoint,
  before_restore: m.siteVersionBeforeRestore,
  import: m.siteVersionImported,
};

/**
 * Earlier versions of each language: every publication and every working
 * copy set aside by a restore. Restoring brings one back as the working copy;
 * visitors see it only once it is published again.
 */
export function History({
  kind,
  id,
  rows,
  languages,
}: {
  kind: "page" | "post";
  id: string;
  rows: Version[];
  languages: Languages;
}) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const restore = useMutation({
    mutationFn: (row: Version) => {
      const data = {
        id,
        locale: row.locale,
        documentVersion: row.documentVersion,
      };
      return kind === "page"
        ? restoreSitePage({ data })
        : restoreSitePost({ data });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["site"] });
      toast.success(m.siteRestored());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <RecordList>
      {rows.map((row) => {
        const who = inLocale(row.createdByNameEn, row.createdByNameAr);
        return (
          <li
            key={`${row.locale}-${row.documentVersion}-${row.reason}-${row.createdAt}`}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3"
          >
            <div className="grid min-w-0 gap-0.5">
              <span className="text-sm leading-5 font-medium">
                {REASON[row.reason]()}
                {languages.other ? ` · ${LOCALE_NAME[row.locale]()}` : ""}
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {[formatInstant(row.createdAt, user.school.timeZone), who]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              disabled={restore.isPending}
              onClick={() => restore.mutate(row)}
            >
              <RotateCcw aria-hidden />
              {m.siteRestore()}
            </Button>
          </li>
        );
      })}
    </RecordList>
  );
}
