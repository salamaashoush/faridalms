import { Button } from "@faridalms/ui/button";
import { ChangeLog } from "@faridalms/ui/system/change-log";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Suspense, useState } from "react";

import { historyEntry, historyLabels } from "~/components/system/history";
import { inLocale } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { gradingHistoryQuery, gradingOverviewQuery } from "~/queries/grading";
import { useWords } from "~/utils/words";

import type { ProgrammeRow } from "./Programmes";
import type { GradingOverview, ScaleRow } from "./Scales";

import {
  ProgrammeSheet,
  ProgrammesTable,
  RetireProgrammeDialog,
} from "./Programmes";
import {
  BandsSheet,
  RetireScaleSheet,
  ScaleSheet,
  ScalesTable,
} from "./Scales";
import { gradingScaleActions, gradingSettingsSections } from "./slots";

type Open =
  | { kind: "scale"; scale?: ScaleRow }
  | { kind: "bands"; scale: ScaleRow }
  | { kind: "retireScale"; scale: ScaleRow }
  | { kind: "programme"; programme?: ProgrammeRow }
  | { kind: "retireProgramme"; programme: ProgrammeRow };

/**
 * Sheets keep their content while they animate closed, and a new opening
 * starts a fresh form.
 */
function useSheet() {
  const [shown, setShown] = useState<{ open: Open; generation: number } | null>(
    null,
  );
  const [isOpen, setOpen] = useState(false);
  return {
    shown,
    isOpen,
    show: (open: Open) => {
      setShown((current) => ({
        open,
        generation: (current?.generation ?? 0) + 1,
      }));
      setOpen(true);
    },
    close: () => setOpen(false),
  };
}

/** The scale as it stands now: a grade saved from its sheet reloads it. */
const liveScale = (grading: GradingOverview, opened: ScaleRow) =>
  grading.scales.find((row) => row.id === opened.id) ?? opened;

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

interface GradingChangesProps {
  overview: GradingOverview;
}

function GradingChanges({ overview }: GradingChangesProps) {
  const [page, setPage] = useState(1);
  const { data } = useSuspenseQuery(gradingHistoryQuery(page));
  return (
    <RecordSection
      title={m.gradingHistory()}
      description={m.gradingHistoryHint()}
    >
      <ChangeLog
        labels={historyLabels({
          caption: m.gradingHistory(),
          empty: m.gradingHistoryEmpty(),
          spans: true,
        })}
        entries={data.rows.map((row) => ({
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
          data.pages > 1
            ? {
                page: data.page,
                pages: data.pages,
                total: data.total,
                pageSize: data.pageSize,
                onPage: setPage,
              }
            : undefined
        }
      />
    </RecordSection>
  );
}

/**
 * How the school grades: the scales a mark becomes a grade on, the
 * programmes whose classes grade on them, and every change to either.
 */
export function GradingSettings() {
  const grading = useSuspenseQuery(gradingOverviewQuery).data;
  const words = useWords();
  const sheet = useSheet();
  const shown = sheet.shown;
  const actions = useSlot(gradingScaleActions);
  const sections = useSlot(gradingSettingsSections);
  return (
    <div className="grid gap-10">
      <RecordSection
        title={m.gradingScalesTab()}
        description={m.gradingScalesHint()}
        action={
          <div className="flex flex-wrap gap-2">
            {actions.map(({ key, Action }) => (
              <Action key={key} />
            ))}
            <Button
              type="button"
              size="sm"
              className="max-md:h-10"
              onClick={() => sheet.show({ kind: "scale" })}
            >
              <Plus aria-hidden />
              {m.gradingAddScale()}
            </Button>
          </div>
        }
      >
        <ScalesTable
          overview={grading}
          onAdd={() => sheet.show({ kind: "scale" })}
          onRename={(scale) => sheet.show({ kind: "scale", scale })}
          onBands={(scale) => sheet.show({ kind: "bands", scale })}
          onRetire={(scale) => sheet.show({ kind: "retireScale", scale })}
        />
      </RecordSection>
      <RecordSection
        title={m.gradingProgrammesTab()}
        description={words(m.gradingProgrammesHintCore)()}
        action={
          <Button
            type="button"
            size="sm"
            className="max-md:h-10"
            onClick={() => sheet.show({ kind: "programme" })}
          >
            <Plus aria-hidden />
            {m.gradingAddProgramme()}
          </Button>
        }
      >
        <ProgrammesTable
          overview={grading}
          onAdd={() => sheet.show({ kind: "programme" })}
          onEdit={(programme) => sheet.show({ kind: "programme", programme })}
          onRetire={(programme) =>
            sheet.show({ kind: "retireProgramme", programme })
          }
        />
      </RecordSection>
      {sections.map(({ key, Section }) => (
        <Suspense key={key} fallback={null}>
          <Section />
        </Suspense>
      ))}
      <GradingChanges overview={grading} />
      {shown?.open.kind === "scale" ? (
        <ScaleSheet
          key={shown.generation}
          open={sheet.isOpen}
          scale={shown.open.scale}
          overview={grading}
          onClose={sheet.close}
        />
      ) : shown?.open.kind === "bands" ? (
        <BandsSheet
          key={shown.generation}
          open={sheet.isOpen}
          scale={liveScale(grading, shown.open.scale)}
          today={grading.today}
          onClose={sheet.close}
        />
      ) : shown?.open.kind === "retireScale" ? (
        <RetireScaleSheet
          key={shown.generation}
          open={sheet.isOpen}
          scale={shown.open.scale}
          onClose={sheet.close}
        />
      ) : shown?.open.kind === "programme" ? (
        <ProgrammeSheet
          key={shown.generation}
          open={sheet.isOpen}
          programme={shown.open.programme}
          overview={grading}
          onClose={sheet.close}
        />
      ) : shown?.open.kind === "retireProgramme" ? (
        <RetireProgrammeDialog
          key={shown.generation}
          open={sheet.isOpen}
          programme={shown.open.programme}
          onClose={sheet.close}
        />
      ) : null}
    </div>
  );
}
