import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { History, Plus } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import type {
  ExamBoardRow,
  ExamSession,
} from "~/components/exams/ExamSessions";

import { ExamHistory } from "~/components/exams/ExamHistory";
import {
  BoardSheet,
  BoardsTable,
  RetireSheet,
  SessionSheet,
  SessionsTable,
} from "~/components/exams/ExamSessions";
import { PageHeader } from "~/components/system/IndexPage";
import { RecordTabs } from "~/components/system/RecordPage";
import * as m from "~/i18n/messages";
import { examOverviewQuery } from "~/queries/exams";
import { currentUserQuery } from "~/queries/user";

const searchSchema = v.object({
  tab: v.optional(v.picklist(["sessions", "boards"]), "sessions"),
});

export const Route = createFileRoute("/_app/exams")({
  staticData: { breadcrumb: m.examTitle },
  validateSearch: searchSchema,
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("exams:manage"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await context.queryClient.ensureQueryData(examOverviewQuery);
  },
  component: ExamsPage,
});

type Open =
  | { kind: "session"; session?: ExamSession }
  | { kind: "retire"; session: ExamSession }
  | { kind: "board"; board?: ExamBoardRow }
  | { kind: "history" };

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
  const sheet = useSheet();
  const shown = sheet.shown;
  return (
    <>
      <PageHeader
        title={m.examTitle()}
        description={m.examSubtitle()}
        action={
          tab === "sessions"
            ? {
                label: m.examAddSession(),
                icon: Plus,
                onClick: () => sheet.show({ kind: "session" }),
              }
            : {
                label: m.examAddBoard(),
                icon: Plus,
                onClick: () => sheet.show({ kind: "board" }),
              }
        }
        menu={[
          {
            label: m.examHistory(),
            icon: History,
            onSelect: () => sheet.show({ kind: "history" }),
          },
        ]}
      />
      <RecordTabs
        label={m.examTitle()}
        tabs={[
          { value: "sessions", label: m.examSessionsTab() },
          { value: "boards", label: m.examBoardsTab() },
        ]}
        value={tab}
        onChange={(next) => void navigate({ search: { tab: next } })}
      >
        {tab === "sessions" ? (
          <SessionsTable
            overview={overview}
            onAdd={() => sheet.show({ kind: "session" })}
            onEdit={(session) => sheet.show({ kind: "session", session })}
            onRetire={(session) => sheet.show({ kind: "retire", session })}
          />
        ) : (
          <BoardsTable
            overview={overview}
            onEdit={(board) => sheet.show({ kind: "board", board })}
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
      ) : shown?.open.kind === "history" ? (
        <ExamHistory
          key={shown.generation}
          open={sheet.isOpen}
          onOpenChange={(next) => {
            if (!next) sheet.close();
          }}
        />
      ) : null}
    </>
  );
}
