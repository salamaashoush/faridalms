import type { HeaderAction } from "@faridalms/ui/system/page-header";

import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { History, Plus, RefreshCcw } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import type { ProgrammeRow } from "~/components/grading/ProgrammesTab";
import type { GradingOverview, ScaleRow } from "~/components/grading/ScalesTab";

import { GradingHistory } from "~/components/grading/GradingHistory";
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
import { gradingOverviewQuery } from "~/queries/grading";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

const TABS = ["scales", "programmes"] as const;
type Tab = (typeof TABS)[number];

const searchSchema = v.object({
  tab: v.optional(v.picklist(TABS), "scales"),
});

export const Route = createFileRoute("/_app/_staff/grade-scales")({
  staticData: { breadcrumb: m.gradingTitle },
  validateSearch: searchSchema,
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "grading:manage");
    await context.queryClient.ensureQueryData(gradingOverviewQuery);
  },
  component: GradingPage,
});

type Open =
  | { kind: "history" }
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

/** The scale as it stands now: a grade saved from its sheet reloads it. */
const liveScale = (grading: GradingOverview, opened: ScaleRow) =>
  grading.scales.find((row) => row.id === opened.id) ?? opened;

function GradingPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const grading = useSuspenseQuery(gradingOverviewQuery).data;
  const sheet = useSheet();
  const shown = sheet.shown;
  const adds: Record<Tab, HeaderAction> = {
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
        title={m.gradingTitle()}
        description={m.gradingSubtitle()}
        action={adds[tab]}
        menu={[
          {
            label: m.gradingHistory(),
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
        label={m.gradingTitle()}
        tabs={[
          { value: "scales", label: m.gradingScalesTab() },
          { value: "programmes", label: m.gradingProgrammesTab() },
        ]}
        value={tab}
        onChange={(next) => void navigate({ search: { tab: next } })}
      >
        {tab === "scales" ? (
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
      ) : shown?.open.kind === "regrade" ? (
        <RegradeSheet
          key={shown.generation}
          open={sheet.isOpen}
          onClose={sheet.close}
        />
      ) : shown?.open.kind === "history" ? (
        <GradingHistory
          key={shown.generation}
          open={sheet.isOpen}
          overview={grading}
          onOpenChange={(next) => {
            if (!next) sheet.close();
          }}
        />
      ) : null}
    </Page>
  );
}
