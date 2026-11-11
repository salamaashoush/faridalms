import type { ExamBoard, ExamChangeDetails } from "@faridalms/domain/exams";

import { ChangeLog } from "@faridalms/ui/system/change-log";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { historyEntry, historyLabels } from "~/components/system/history";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { examHistoryQuery } from "~/queries/exams";
import { formatDate, formatMonthLabel } from "~/utils/datetime";

import { sessionName } from "./names";

function subject(details: ExamChangeDetails): string {
  if (details.series) {
    const [board, year, month] = details.series.split("-");
    return sessionName({
      official: { board: board as ExamBoard },
      boardId: null,
      titleEn: null,
      titleAr: null,
      sitsIn: `${year}-${month}-01`,
    });
  }
  const named = details.after ?? details.before;
  return named ? inLocale(named.titleEn, named.titleAr) : "";
}

function yesNo(value: boolean) {
  return value ? m.commonYes() : m.commonNo();
}

const keptUntil = (date: string | null) =>
  date ? formatDate(date) : m.examKeepBoardDate();

function differences(details: ExamChangeDetails): string[] {
  const { before, after } = details;
  if (!before || !after || !("sitsIn" in after)) return [];
  const lines: string[] = [];
  if (before.keepUntil !== after.keepUntil)
    lines.push(
      m.examHistoryKeepUntil({
        from: keptUntil(before.keepUntil),
        to: keptUntil(after.keepUntil),
      }),
    );
  for (const [rule, label] of [
    ["declarationRequired", m.examRuleDeclaration()],
    ["aiEvidenceRequired", m.examRuleAiEvidence()],
  ] as const)
    if (before[rule] !== after[rule])
      lines.push(
        m.examHistoryRule({
          rule: label,
          from: yesNo(before[rule]),
          to: yesNo(after[rule]),
        }),
      );
  if (before.sitsIn !== after.sitsIn)
    lines.push(
      m.examHistorySitsIn({
        from: formatMonthLabel(before.sitsIn),
        to: formatMonthLabel(after.sitsIn),
      }),
    );
  return lines;
}

export interface ExamHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Every change to the school's exam sessions and boards, with who and why. */
export function ExamHistory({ open, onOpenChange }: ExamHistoryProps) {
  const [page, setPage] = useState(1);
  const history = useQuery({ ...examHistoryQuery(page), enabled: open }).data;
  return (
    <SheetPanel
      open={open}
      onOpenChange={onOpenChange}
      title={m.examHistory()}
      description={m.examHistoryHint()}
    >
      {history ? (
        <ChangeLog
          labels={historyLabels({
            caption: m.examHistory(),
            empty: m.examHistoryEmpty(),
            spans: true,
          })}
          entries={history.rows.map((row) => {
            const below = row.details.belowBoard;
            return {
              ...historyEntry({
                id: row.id,
                action: row.action,
                occurredAt: row.occurredAt,
                actorEn: row.actorEn,
                actorAr: row.actorAr,
              }),
              details: [
                ...differences(row.details),
                ...(below
                  ? [m.examKeepBelowBoard({ date: formatDate(below) })]
                  : []),
              ],
              why: row.details.reason ?? null,
              record: <bdi>{subject(row.details)}</bdi>,
            };
          })}
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
