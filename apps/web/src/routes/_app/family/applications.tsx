import { WITHDRAW_REASONS } from "@faridalms/domain/admissions";
import { buttonVariants } from "@faridalms/ui/button";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileUser, Plus } from "lucide-react";
import { Suspense } from "react";
import { toast } from "sonner";

import {
  APPLICATION_STATE_LABEL,
  APPLICATION_STATE_TONE,
} from "~/components/admissions/application-labels";
import { DocumentsStep } from "~/components/admissions/ApplicationForm";
import { ActionMenu } from "~/components/system/ActionMenu";
import { EmptyState, PageHeader } from "~/components/system/IndexPage";
import { RecordSection } from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { draftQuery, myApplicationsQuery } from "~/queries/admissions";
import { withdrawApplication } from "~/server/admissions";
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

function Documents({ id }: { id: string }) {
  const data = useSuspenseQuery(draftQuery(id)).data;
  return <DocumentsStep data={data} />;
}

function ApplicationCard({ row }: { row: Row }) {
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
    ? m.itkEditTitle({
        grade: inLocale(row.intake.gradeEn, row.intake.gradeAr),
        year: inLocale(row.intake.yearTitleEn, row.intake.yearTitleAr),
      })
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
        {row.state === "draft" ? (
          <Link
            to="/apply"
            search={{ application: row.id }}
            className={buttonVariants({ className: "justify-self-start" })}
          >
            {m.famAppsContinue()}
          </Link>
        ) : null}
        {row.state !== "draft" && row.state !== "withdrawn" ? (
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
    <>
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
    </>
  );
}
