import type { HeaderAction } from "@faridalms/ui/system/page-header";

import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { History, Plus, RefreshCcw } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import type {
  ExamBoardRow,
  ExamSession,
} from "~/components/exams/ExamSessions";
import type { ProgrammeRow } from "~/components/grading/ProgrammesTab";
import type { ScaleRow } from "~/components/grading/ScalesTab";

import {
  CourseworkList,
  CourseworkStudents,
} from "~/components/exams/CourseworkList";
import { ExamHistory } from "~/components/exams/ExamHistory";
import {
  BoardSheet,
  BoardsTable,
  RetireSheet,
  SessionSheet,
  SessionsTable,
} from "~/components/exams/ExamSessions";
import {
  ProgrammeSheet,
  ProgrammesTable,
  RetireProgrammeDialog,
} from "~/components/grading/ProgrammesTab";
import { RegradeSheet } from "~/components/grading/RegradeSheet";
import {
  BandsSheet,
  RetireScaleSheet,
  ScaleSheet,
  ScalesTable,
} from "~/components/grading/ScalesTab";
import * as m from "~/i18n/messages";
import { courseworkListQuery, examOverviewQuery } from "~/queries/exams";
import { gradingOverviewQuery } from "~/queries/grading";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

const TABS = [
  "coursework",
  "sessions",
  "boards",
  "scales",
  "programmes",
] as const;
type Tab = (typeof TABS)[number];

const searchSchema = v.object({
  tab: v.optional(v.picklist(TABS), "coursework"),
});

export const Route = createFileRoute("/_app/exams")({
  staticData: { breadcrumb: m.examTitle },
  validateSearch: searchSchema,
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "exams:manage");
    await Promise.all([
      context.queryClient.ensureQueryData(examOverviewQuery),
      context.queryClient.ensureQueryData(courseworkListQuery),
      context.queryClient.ensureQueryData(gradingOverviewQuery),
    ]);
  },
  component: ExamsPage,
});

type Open =
  | { kind: "session"; session?: ExamSession }
  | { kind: "retire"; session: ExamSession }
  | { kind: "board"; board?: ExamBoardRow }
  | { kind: "history" }
  | { kind: "students"; assignmentId: string; title: string }
  | { kind: "scale"; scale?: ScaleRow }
  | { kind: "bands"; scale: ScaleRow }
  | { kind: "retireScale"; scale: ScaleRow }
  | { kind: "programme"; programme?: ProgrammeRow }
  | { kind: "retireProgramme"; programme: ProgrammeRow }
  | { kind: "regrade" };

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

function ExamsPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const overview = useSuspenseQuery(examOverviewQuery).data;
  const grading = useSuspenseQuery(gradingOverviewQuery).data;
  const sheet = useSheet();
  const shown = sheet.shown;
  const adds: Partial<Record<Tab, HeaderAction>> = {
    sessions: {
      label: m.examAddSession(),
      icon: Plus,
      onClick: () => sheet.show({ kind: "session" }),
    },
    boards: {
      label: m.examAddBoard(),
      icon: Plus,
      onClick: () => sheet.show({ kind: "board" }),
    },
    scales: {
      label: m.gradingAddScale(),
      icon: Plus,
      onClick: () => sheet.show({ kind: "scale" }),
    },
    programmes: {
      label: m.gradingAddProgramme(),
      icon: Plus,
      onClick: () => sheet.show({ kind: "programme" }),
    },
  };
  return (
    <Page width="list">
      <PageHeader
        title={m.examTitle()}
        description={m.examSubtitle()}
        action={adds[tab]}
        menu={[
          {
            label: m.examHistory(),
            icon: History,
            onSelect: () => sheet.show({ kind: "history" }),
          },
          {
            label: m.gradingRegradeTitle(),
            icon: RefreshCcw,
            onSelect: () => sheet.show({ kind: "regrade" }),
          },
        ]}
      />
      <RecordTabs
        label={m.examTitle()}
        tabs={[
          { value: "coursework", label: m.examCourseworkTab() },
          { value: "sessions", label: m.examSessionsTab() },
          { value: "boards", label: m.examBoardsTab() },
          { value: "scales", label: m.gradingScalesTab() },
          { value: "programmes", label: m.gradingProgrammesTab() },
        ]}
        value={tab}
        onChange={(next) => void navigate({ search: { tab: next } })}
      >
        {tab === "coursework" ? (
          <CourseworkList
            onOpen={(row) =>
              sheet.show({
                kind: "students",
                assignmentId: row.assignmentId,
                title: row.title,
              })
            }
          />
        ) : tab === "sessions" ? (
          <SessionsTable
            overview={overview}
            onAdd={() => sheet.show({ kind: "session" })}
            onEdit={(session) => sheet.show({ kind: "session", session })}
            onRetire={(session) => sheet.show({ kind: "retire", session })}
          />
        ) : tab === "boards" ? (
          <BoardsTable
            overview={overview}
            onEdit={(board) => sheet.show({ kind: "board", board })}
          />
        ) : tab === "scales" ? (
          <ScalesTable
            overview={grading}
            onAdd={() => sheet.show({ kind: "scale" })}
            onRename={(scale) => sheet.show({ kind: "scale", scale })}
            onBands={(scale) => sheet.show({ kind: "bands", scale })}
            onRetire={(scale) => sheet.show({ kind: "retireScale", scale })}
          />
        ) : (
          <ProgrammesTable
            overview={grading}
            onAdd={() => sheet.show({ kind: "programme" })}
            onEdit={(programme) => sheet.show({ kind: "programme", programme })}
            onRetire={(programme) =>
              sheet.show({ kind: "retireProgramme", programme })
            }
          />
        )}
      </RecordTabs>
      {shown?.open.kind === "session" ? (
        <SessionSheet
          key={shown.generation}
          open={sheet.isOpen}
          session={shown.open.session}
          overview={overview}
          onClose={sheet.close}
        />
      ) : shown?.open.kind === "retire" ? (
        <RetireSheet
          key={shown.generation}
          open={sheet.isOpen}
          session={shown.open.session}
          onClose={sheet.close}
        />
      ) : shown?.open.kind === "board" ? (
        <BoardSheet
          key={shown.generation}
          open={sheet.isOpen}
          board={shown.open.board}
          onClose={sheet.close}
        />
      ) : shown?.open.kind === "students" ? (
        <CourseworkStudents
          key={shown.generation}
          open={sheet.isOpen}
          assignmentId={shown.open.assignmentId}
          title={shown.open.title}
          onOpenChange={(next) => {
            if (!next) sheet.close();
          }}
        />
      ) : shown?.open.kind === "scale" ? (
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
          scale={shown.open.scale}
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
      ) : shown?.open.kind === "regrade" ? (
        <RegradeSheet
          key={shown.generation}
          open={sheet.isOpen}
          onClose={sheet.close}
        />
      ) : shown?.open.kind === "history" ? (
        <ExamHistory
          key={shown.generation}
          open={sheet.isOpen}
          onOpenChange={(next) => {
            if (!next) sheet.close();
          }}
        />
      ) : null}
    </Page>
  );
}
