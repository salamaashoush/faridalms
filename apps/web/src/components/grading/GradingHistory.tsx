import { ChangeLog } from "@faridalms/ui/system/change-log";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { historyEntry, historyLabels } from "~/components/system/history";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { gradingHistoryQuery } from "~/queries/grading";

import type { GradingOverview } from "./ScalesTab";

interface Named {
  titleEn: string | null;
  titleAr: string | null;
}

/** The scale or programme a change was made to, by its name now or as the change wrote it. */
function recordOf(
  overview: GradingOverview,
  row: Named & { objectId: string | null },
): string {
  const named: Named =
    overview.scales.find((item) => item.id === row.objectId) ??
    overview.programmes.find((item) => item.id === row.objectId) ??
    row;
  return inLocale(named.titleEn, named.titleAr);
}

export interface GradingHistoryProps {
  open: boolean;
  overview: GradingOverview;
  onOpenChange: (open: boolean) => void;
}

/** Every change to the school's grade scales, programmes and classes' grading, with who and why. */
export function GradingHistory({
  open,
  overview,
  onOpenChange,
}: GradingHistoryProps) {
  const [page, setPage] = useState(1);
  const history = useQuery({
    ...gradingHistoryQuery(page),
    enabled: open,
  }).data;
  return (
    <SheetPanel
      open={open}
      onOpenChange={onOpenChange}
      title={m.gradingHistory()}
      description={m.gradingHistoryHint()}
    >
      {history ? (
        <ChangeLog
          labels={historyLabels({
            caption: m.gradingHistory(),
            empty: m.gradingHistoryEmpty(),
            spans: true,
          })}
          entries={history.rows.map((row) => ({
            ...historyEntry({
              id: row.id,
              action: row.action,
              occurredAt: row.occurredAt,
              actorEn: row.actorEn,
              actorAr: row.actorAr,
            }),
            details: [],
            why: row.reason,
            record: <bdi>{recordOf(overview, row)}</bdi>,
          }))}
          pagination={
            history.pages > 1
              ? {
                  page: history.page,
                  pages: history.pages,
                  total: history.total,
                  pageSize: history.pageSize,
                  onPage: setPage,
                }
              : undefined
          }
        />
      ) : (
        <div aria-busy="true" className="min-h-20" />
      )}
    </SheetPanel>
  );
}
