import type { ApplicationState } from "@faridalms/domain/admissions";
import type { BatchAction, Column } from "@faridalms/ui/system/data-table";

import { BreadcrumbCurrent } from "@faridalms/ui/system/app-shell";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { Metric, MetricGrid } from "@faridalms/ui/system/metrics";
import { Page } from "@faridalms/ui/system/page";
import { RecordHeader, RecordTabs } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import {
  CheckCheck,
  FileUser,
  Gavel,
  GraduationCap,
  Pencil,
  Send,
  Undo2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import {
  APPLICATION_STATE_LABEL,
  APPLICATION_STATE_TONE,
  DECISION_LABEL,
  PRIORITY_LABEL,
} from "~/components/admissions/application-labels";
import { DecideSheet } from "~/components/admissions/Decisions";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { boardQuery } from "~/queries/admissions";
import { currentUserQuery } from "~/queries/user";
import {
  convertApplications,
  offerPlaces,
  refusePlaces,
  releaseDecisions,
  reopenApplications,
} from "~/server/admissions";
import { formatDate, formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { requirePage } from "~/utils/page-access";

/** The board's phases, each the applications in some of an application's states. */
const PHASES = {
  submitted: ["submitted"],
  in_review: ["in_review"],
  decided: ["decided"],
  offered: ["offered"],
  waitlisted: ["waitlisted"],
  accepted: ["accepted"],
  enrolled: ["enrolled"],
  closed: [
    "declined_by_school",
    "withdrawn",
    "offer_declined",
    "offer_expired",
    "deferred",
  ],
} as const satisfies Record<string, readonly ApplicationState[]>;
type Phase = keyof typeof PHASES;
const PHASE_KEYS = Object.keys(PHASES) as Phase[];

const PHASE_LABEL: Record<Phase, () => string> = {
  submitted: m.brdPhaseNew,
  in_review: m.aplStateInReview,
  decided: m.aplStateDecided,
  offered: m.aplStateOffered,
  waitlisted: m.brdPhaseWaitlist,
  accepted: m.aplStateAccepted,
  enrolled: m.aplStateEnrolled,
  closed: m.brdPhaseClosed,
};

const searchSchema = v.object({
  phase: v.optional(v.picklist(PHASE_KEYS), "in_review"),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/admissions/intakes/$intakeId")({
  staticData: {
    trail: <BoardTrail />,
    section: "/admissions/intakes",
  },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loader: async ({ context, params }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "admissions:read", "admissions:manage");
    await context.queryClient.ensureQueryData(boardQuery(params.intakeId));
  },
  component: BoardPage,
});

type Board = Awaited<
  ReturnType<NonNullable<ReturnType<typeof boardQuery>["queryFn"]>>
>;
type Row = Board["applications"][number];

const titleOf = (intake: Board["intake"]) =>
  m.itkEditTitle({
    grade: inLocale(intake.gradeEn, intake.gradeAr),
    year: inLocale(intake.yearTitleEn, intake.yearTitleAr),
  });

function BoardTrail() {
  const { intakeId } = Route.useParams();
  const board = useSuspenseQuery(boardQuery(intakeId)).data;
  return <BreadcrumbCurrent>{titleOf(board.intake)}</BreadcrumbCurrent>;
}

interface ChildProps {
  row: Row;
}

function Child({ row }: ChildProps) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <RowLink
        to="/admissions/applications/$applicationId"
        params={{ applicationId: row.id }}
        className="justify-self-start"
      >
        {inLocale(row.applicantEn, row.applicantAr)}
      </RowLink>
      <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
        {row.reference ? <bdi dir="ltr">{row.reference}</bdi> : null}
        {row.birthDate
          ? ` · ${m.aplBorn({ date: formatDate(row.birthDate) })}`
          : ""}
      </span>
    </span>
  );
}

interface StandingProps {
  row: Row;
}

/** What a row says of where it stands in its phase. */
function Standing({ row }: StandingProps) {
  if (row.state === "decided" && row.decision)
    return (
      <StatusText tone="info">{DECISION_LABEL[row.decision]()}</StatusText>
    );
  if (row.state === "waitlisted" && row.rank)
    return m.brdRank({ rank: formatNumber(row.rank) });
  if (row.state === "offered" && row.offerExpiresOn)
    return m.brdUntil({ date: formatDate(row.offerExpiresOn) });
  if (row.state === "accepted" && row.matchedStudents.length)
    return <StatusText tone="warning">{m.brdCheckMatch()}</StatusText>;
  return (
    <StatusText tone={APPLICATION_STATE_TONE[row.state]}>
      {APPLICATION_STATE_LABEL[row.state]()}
    </StatusText>
  );
}

const COLUMNS: Column<Row>[] = [
  {
    id: "child",
    header: m.aplColChild(),
    primary: true,
    cell: (row) => <Child row={row} />,
  },
  {
    id: "family",
    header: m.aplColFamily(),
    cell: (row) => <bdi>{inLocale(row.familyEn, row.familyAr)}</bdi>,
  },
  {
    id: "priorities",
    header: m.aplColPriorities(),
    cell: (row) =>
      row.priorities.length
        ? formatList(row.priorities.map((rule) => PRIORITY_LABEL[rule]()))
        : m.aplNoPriority(),
  },
  {
    id: "outstanding",
    header: m.aplColOutstanding(),
    cell: (row) =>
      row.outstanding
        ? m.aplOutstanding({ count: formatNumber(row.outstanding) })
        : m.aplChecklistDone(),
  },
  {
    id: "standing",
    header: m.brdColStanding(),
    cell: (row) => <Standing row={row} />,
  },
];

const CARD = {
  title: (row: Row) => <Child row={row} />,
  status: (row: Row) => <Standing row={row} />,
  fact: (row: Row) => inLocale(row.familyEn, row.familyAr),
};

interface PlacesProps {
  board: Board;
}

/** The places of the intake, each counted with its label. */
function Places({ board }: PlacesProps) {
  const { places } = board;
  const facts = [
    { label: m.brdPlaces(), value: places.capacity },
    { label: m.brdAccepted(), value: places.accepted },
    { label: m.brdOffersOpen(), value: places.offered },
    { label: m.brdLeft(), value: places.left },
    { label: m.brdToOffer(), value: places.toOffer },
  ];
  return (
    <div className="mb-6">
      <MetricGrid label={m.brdPlacesTitle()}>
        {facts.map((fact) => (
          <Metric
            key={fact.label}
            label={fact.label}
            value={formatNumber(fact.value)}
          />
        ))}
      </MetricGrid>
    </div>
  );
}

/**
 * One intake's applications by phase, with its places: seats less the
 * offers accepted and the offers still open. Applications are decided,
 * released, offered from the waiting list and enrolled from here, several
 * at once; each also has its own page for one at a time.
 */
function BoardPage() {
  const { intakeId } = Route.useParams();
  const { phase } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const board = useSuspenseQuery(boardQuery(intakeId)).data;
  const [deciding, setDeciding] = useState<Row[] | null>(null);
  const states: readonly ApplicationState[] = PHASES[phase];
  const rows = board.applications
    .filter((row) => states.includes(row.state))
    .toSorted((a, b) =>
      phase === "waitlisted" ? (a.rank ?? 0) - (b.rank ?? 0) : 0,
    );
  const count = (key: Phase) =>
    board.applications.filter((row) =>
      (PHASES[key] as readonly ApplicationState[]).includes(row.state),
    ).length;
  const versions = (picked: Row[]) =>
    picked.map((row) => ({ id: row.id, expectedVersion: row.version }));
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["admissions"] });
  const run = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
    } catch (error) {
      toast.error(getMessageFromError(error));
      return;
    }
    await refresh();
    toast.success(done);
  };
  const batch: Partial<Record<Phase, BatchAction<Row>[]>> = board.decides
    ? {
        in_review: [
          {
            label: m.decDecideAction(),
            icon: Gavel,
            onSelect: (picked) => setDeciding(picked),
          },
        ],
        decided: [
          {
            label: m.decRelease(),
            icon: Send,
            confirm: (picked) => ({
              title: m.brdReleaseTitle({ count: picked.length }),
              body: m.brdReleaseBody(),
              label: m.decRelease(),
            }),
            onSelect: (picked) =>
              run(
                () =>
                  releaseDecisions({
                    data: { applications: versions(picked) },
                  }),
                m.decReleasedToast({ count: picked.length }),
              ),
          },
          {
            label: m.decReopen(),
            icon: Undo2,
            onSelect: (picked) =>
              run(
                () =>
                  reopenApplications({
                    data: { applications: versions(picked) },
                  }),
                m.decReopened(),
              ),
          },
        ],
        waitlisted: [
          {
            label: m.decOfferPlace(),
            icon: CheckCheck,
            confirm: (picked) => ({
              title: m.brdOfferTitle({ count: picked.length }),
              body: m.brdOfferBody({
                left: formatNumber(board.places.left),
              }),
              label: m.decOfferPlace(),
            }),
            onSelect: (picked) =>
              run(
                () => offerPlaces({ data: { applications: versions(picked) } }),
                m.decOffered({ count: picked.length }),
              ),
          },
          {
            label: m.decRefuse(),
            icon: XCircle,
            destructive: true,
            confirm: (picked) => ({
              title: m.brdRefuseTitle({ count: picked.length }),
              body: m.decRefuseBody(),
              label: m.decRefuse(),
            }),
            onSelect: (picked) =>
              run(
                () =>
                  refusePlaces({ data: { applications: versions(picked) } }),
                m.decRefused(),
              ),
          },
        ],
        accepted: [
          {
            label: m.decEnrolAction(),
            icon: GraduationCap,
            confirm: (picked) => ({
              title: m.brdEnrolTitle({ count: picked.length }),
              body: picked.some((row) => row.matchedStudents.length)
                ? m.brdEnrolBodyMatched()
                : m.brdEnrolBody(),
              label: m.decEnrolAction(),
            }),
            onSelect: (picked) => {
              const clear = picked.filter(
                (row) => row.matchedStudents.length === 0,
              );
              if (clear.length === 0) {
                toast.error(m.brdEnrolNoneClear());
                return Promise.resolve();
              }
              return run(
                () =>
                  convertApplications({
                    data: {
                      applications: clear.map((row) => ({
                        id: row.id,
                        expectedVersion: row.version,
                        studentId: "",
                        reference: "",
                      })),
                    },
                  }),
                m.brdEnrolled({ count: clear.length }),
              );
            },
          },
        ],
      }
    : {};
  return (
    <Page width="record">
      <RecordHeader
        title={titleOf(board.intake)}
        facts={[
          {
            label: m.itkColDates(),
            value: m.itkDates({
              from: formatDate(board.intake.opensOn),
              to: formatDate(board.intake.closesOn),
            }),
          },
          {
            label: m.brdDecisionsOn(),
            value: board.intake.decisionsOn
              ? m.brdDecisionsOnDate({
                  date: formatDate(board.intake.decisionsOn),
                })
              : m.brdDecisionsByHand(),
          },
          {
            label: m.brdOfferDays(),
            value: m.brdOfferDaysValue({
              days: formatNumber(board.intake.offerDays),
            }),
          },
        ]}
        menu={
          board.configures
            ? [
                {
                  label: m.brdEditIntake(),
                  icon: Pencil,
                  onSelect: () =>
                    void navigate({
                      to: "/admissions/intake-editor",
                      search: { id: intakeId },
                    }),
                },
              ]
            : []
        }
      />
      <Places board={board} />
      <RecordTabs
        label={m.brdPhases()}
        tabs={PHASE_KEYS.map((key) => ({
          value: key,
          label: m.brdPhaseCount({
            phase: PHASE_LABEL[key](),
            count: formatNumber(count(key)),
          }),
        }))}
        value={phase}
        onChange={(next) => void navigate({ search: { phase: next } })}
      >
        <DataTable
          caption={m.brdCaption({ phase: PHASE_LABEL[phase]() })}
          rows={rows}
          columns={COLUMNS}
          rowLabel={(row) => inLocale(row.applicantEn, row.applicantAr)}
          card={CARD}
          batchActions={batch[phase]}
          empty={{
            icon: FileUser,
            title: m.brdEmpty({ phase: PHASE_LABEL[phase]() }),
            description: m.brdEmptyBody(),
          }}
        />
      </RecordTabs>
      {deciding ? (
        <DecideSheet
          applications={versions(deciding)}
          open
          onOpenChange={(next) => !next && setDeciding(null)}
        />
      ) : null}
    </Page>
  );
}
