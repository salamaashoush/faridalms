import type { ExamBoard, ExamChangeDetails } from "@faridalms/domain/exams";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Pagination } from "~/components/system/DataTable";
import { SheetPanel } from "~/components/system/SheetPanel";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { examHistoryQuery } from "~/queries/exams";
import { formatDate, formatInstant, formatMonthLabel } from "~/utils/datetime";

import { sessionName } from "./names";

const ACTION: Record<string, () => string> = {
  "exam_session.create": m.examHistoryAdded,
  "exam_session.update": m.examHistoryChanged,
  "exam_session.retire": m.examHistoryRetired,
  "exam_board.create": m.examHistoryBoardAdded,
  "exam_board.update": m.examHistoryBoardChanged,
};

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

/** Every change to the school's exam sessions and boards, with who and why. */
export function ExamHistory({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
        history.rows.length ? (
          <>
            <ol className="grid gap-5">
              {history.rows.map((row) => {
                const { reason, belowBoard: below } = row.details;
                return (
                  <li key={row.id} className="grid gap-1 text-sm leading-5">
                    <span className="font-medium" dir="auto">
                      {(ACTION[row.action] ?? m.examHistoryChanged)()}
                      {": "}
                      <bdi>{subject(row.details)}</bdi>
                    </span>
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {formatInstant(row.occurredAt, "medium")}
                      {" · "}
                      <bdi>{inLocale(row.actorEn, row.actorAr)}</bdi>
                    </span>
                    {differences(row.details).map((line) => (
                      <span key={line} className="text-muted-foreground">
                        {line}
                      </span>
                    ))}
                    {below ? (
                      <span className="text-warning-foreground dark:text-warning">
                        {m.examKeepBelowBoard({ date: formatDate(below) })}
                      </span>
                    ) : null}
                    {reason ? <q dir="auto">{reason}</q> : null}
                  </li>
                );
              })}
            </ol>
            {history.pages > 1 ? (
              <Pagination
                page={history.page}
                pages={history.pages}
                total={history.total}
                pageSize={history.pageSize}
                onPage={setPage}
              />
            ) : null}
          </>
        ) : (
          <p className="text-sm leading-5 text-muted-foreground">
            {m.examHistoryEmpty()}
          </p>
        )
      ) : (
        <div aria-busy="true" className="min-h-20" />
      )}
    </SheetPanel>
  );
}
