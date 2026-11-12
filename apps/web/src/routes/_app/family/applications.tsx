import { WITHDRAW_REASONS } from "@faridalms/domain/admissions";
import { Button, buttonVariants } from "@faridalms/ui/button";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, FileText, FileUser, Plus } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import {
  APPLICATION_STATE_LABEL,
  APPLICATION_STATE_TONE,
  EVENT_KIND_LABEL,
} from "~/components/admissions/application-labels";
import { DocumentsStep } from "~/components/admissions/ApplicationForm";
import { LetterDialog } from "~/components/admissions/Decisions";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { draftQuery, myApplicationsQuery } from "~/queries/admissions";
import { answerOffer, withdrawApplication } from "~/server/admissions";
import { formatDate, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

export const Route = createFileRoute("/_app/family/applications")({
  staticData: { breadcrumb: m.famAppsTitle },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(myApplicationsQuery),
  component: FamilyApplications,
});

type Mine = Awaited<
  ReturnType<NonNullable<(typeof myApplicationsQuery)["queryFn"]>>
>;
type Row = Mine["applications"][number];

interface DocumentsProps {
  id: string;
}

function Documents({ id }: DocumentsProps) {
  const data = useSuspenseQuery(draftQuery(id)).data;
  return <DocumentsStep data={data} />;
}

interface OfferAnswerProps {
  row: Row;
}

/**
 * An offer of a place and its answer: accepting or declining, each asked
 * once more before it is sent, since the school acts on it at once.
 */
function OfferAnswer({ row }: OfferAnswerProps) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<"accept" | "decline" | null>(null);
  const answer = useMutation({
    mutationFn: (choice: "accept" | "decline") =>
      answerOffer({
        data: {
          id: row.id,
          expectedVersion: row.version,
          answer: choice,
          note: "",
        },
      }),
  });
  return (
    <div className="grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-medium">
        {row.offerExpiresOn
          ? m.famOfferUntil({ date: formatDate(row.offerExpiresOn) })
          : m.famOfferOpen()}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          className="max-md:h-10"
          onClick={() => setAsking("accept")}
        >
          {m.famOfferAccept()}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={() => setAsking("decline")}
        >
          {m.famOfferDecline()}
        </Button>
      </div>
      <ConfirmDialog
        open={asking !== null}
        title={
          asking === "decline"
            ? m.famOfferDeclineTitle()
            : m.famOfferAcceptTitle()
        }
        body={
          asking === "decline"
            ? m.famOfferDeclineBody()
            : m.famOfferAcceptBody()
        }
        confirmLabel={
          asking === "decline" ? m.famOfferDecline() : m.famOfferAccept()
        }
        destructive={asking === "decline"}
        pending={answer.isPending}
        error={answer.error ? getMessageFromError(answer.error) : undefined}
        onCancel={() => {
          answer.reset();
          setAsking(null);
        }}
        onConfirm={() => {
          if (!asking) return;
          void answer.mutateAsync(asking).then(
            async () => {
              await queryClient.invalidateQueries({ queryKey: ["applying"] });
              toast.success(
                asking === "decline"
                  ? m.famOfferDeclined()
                  : m.famOfferAccepted(),
              );
              setAsking(null);
            },
            () => undefined,
          );
        }}
      />
    </div>
  );
}

interface CorrespondenceProps {
  row: Row;
}

/** The letters the school sent and the visits booked, each where the family will look. */
function Correspondence({ row }: CorrespondenceProps) {
  const [open, setOpen] = useState<Row["letters"][number] | null>(null);
  if (!row.letters.length && !row.events.length) return null;
  return (
    <div className="grid gap-3">
      {row.events.length ? (
        <ul className="grid gap-2" aria-label={m.famEventsTitle()}>
          {row.events.map((event) => (
            <li key={event.id} className="flex items-start gap-2 text-sm">
              <CalendarClock
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <span>
                {m.famEvent({
                  event: EVENT_KIND_LABEL[event.kind](),
                  date: formatDate(event.startsOn),
                  from: event.startTime,
                  to: event.endTime,
                })}
                {event.location ? (
                  <>
                    {" · "}
                    <bdi>{event.location}</bdi>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {row.letters.length ? (
        <ul className="grid gap-1" aria-label={m.famLettersTitle()}>
          {row.letters.map((letter) => (
            <li key={letter.id}>
              <button
                type="button"
                onClick={() => setOpen(letter)}
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline max-md:min-h-10"
              >
                <FileText aria-hidden className="size-4" />
                <bdi>{letter.title}</bdi>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <LetterDialog
        letter={open}
        reader="family"
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

interface ApplicationCardProps {
  row: Row;
}

function ApplicationCard({ row }: ApplicationCardProps) {
  const queryClient = useQueryClient();
  const withdraw = useMutation({
    mutationFn: () =>
      withdrawApplication({
        data: {
          id: row.id,
          expectedVersion: row.version,
          reason: WITHDRAW_REASONS[0],
          note: "",
        },
      }),
  });
  const grade = row.intake
    ? inLocale(row.intake.titleEn, row.intake.titleAr)
    : "";
  return (
    <RecordSection
      title={inLocale(row.applicant.nameEn, row.applicant.nameAr)}
      description={grade}
      action={
        row.moves.withdraw ? (
          <ActionMenu
            label={m.famAppsActions({
              child: inLocale(row.applicant.nameEn, row.applicant.nameAr),
            })}
            actions={[
              {
                label: m.aplWithdrawAction(),
                destructive: true,
                confirm: {
                  title: m.famAppsWithdrawTitle(),
                  body: m.famAppsWithdrawBody(),
                  label: m.aplWithdrawAction(),
                },
                onSelect: () =>
                  withdraw.mutateAsync().then(
                    async () => {
                      await queryClient.invalidateQueries({
                        queryKey: ["applying"],
                      });
                      toast.success(m.aplWithdrawn());
                    },
                    (error: unknown) => toast.error(getMessageFromError(error)),
                  ),
              },
            ]}
          />
        ) : undefined
      }
    >
      <div className="grid gap-4">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <StatusText tone={APPLICATION_STATE_TONE[row.state]}>
            {APPLICATION_STATE_LABEL[row.state]()}
          </StatusText>
          {row.reference ? (
            <span className="text-muted-foreground">
              {m.famAppsNumber({ reference: row.reference })}
            </span>
          ) : null}
          {row.submittedAt ? (
            <span className="text-muted-foreground">
              {m.famAppsSent({
                date: formatDate(row.submittedAt.slice(0, 10)),
              })}
            </span>
          ) : null}
          {row.needed ? (
            <StatusText tone="warning">
              {m.famAppsNeeded({ count: formatNumber(row.needed) })}
            </StatusText>
          ) : null}
        </p>
        {row.moves.answer ? <OfferAnswer row={row} /> : null}
        <Correspondence row={row} />
        {row.state === "draft" ? (
          <Link
            to="/apply"
            search={{ application: row.id }}
            className={buttonVariants({ className: "justify-self-start" })}
          >
            {m.famAppsContinue()}
          </Link>
        ) : null}
        {[
          "submitted",
          "in_review",
          "waitlisted",
          "offered",
          "accepted",
        ].includes(row.state) ? (
          <Suspense fallback={null}>
            <Documents id={row.id} />
          </Suspense>
        ) : null}
      </div>
    </RecordSection>
  );
}

/** A family's applications to the school: where each stands and the documents still asked for. */
function FamilyApplications() {
  const data = useSuspenseQuery(myApplicationsQuery).data;
  return (
    <Page width="list">
      <PageHeader
        title={m.famAppsTitle()}
        description={m.famAppsHint()}
        action={
          data.intakes.length
            ? { label: m.famAppsStart(), icon: Plus, link: { to: "/apply" } }
            : undefined
        }
      />
      {data.applications.length ? (
        <div className="grid gap-6">
          {data.applications.map((row) => (
            <ApplicationCard key={row.id} row={row} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileUser}
          title={m.famAppsEmpty()}
          description={m.famAppsEmptyBody()}
        />
      )}
    </Page>
  );
}
