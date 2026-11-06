import type { DecideHealthChangeInput } from "@faridalms/domain/people";
import type { Column } from "@faridalms/ui/system/data-table";

import { decideHealthChangeSchema } from "@faridalms/domain/people";
import { DataTable } from "@faridalms/ui/system/data-table";
import { ChoiceField, FormField } from "@faridalms/ui/system/form-field";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { Fact, Facts } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClipboardCheck, HeartPulse } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { CHANGE_STATE, valueLine } from "~/components/health/labels";
import { CheckboxRow } from "~/components/people/fields";
import { displayName, labelOf } from "~/components/people/format";
import { FileList } from "~/components/system/FileList";
import { UserText } from "~/components/system/UserText";
import * as m from "~/i18n/messages";
import { healthChangesQuery } from "~/queries/records";
import { currentUserQuery } from "~/queries/user";
import { decideHealthChange } from "~/server/records";
import { formatDate, formatRelativeDays } from "~/utils/datetime";
import { refusalOf } from "~/utils/error";
import { requirePage } from "~/utils/page-access";
import { schemaErrors } from "~/utils/validation";

const SHOWN = ["open", "all"] as const;

export const Route = createFileRoute("/_app/health-changes")({
  staticData: { breadcrumb: m.healthChangesTitle },
  validateSearch: v.object({
    show: v.optional(v.picklist(SHOWN), "open"),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "health:write");
    await context.queryClient.ensureQueryData(
      healthChangesQuery(deps.show === "open"),
    );
  },
  component: HealthChangesPage,
});

type Queue = Awaited<
  ReturnType<NonNullable<ReturnType<typeof healthChangesQuery>["queryFn"]>>
>;
type Change = Queue["changes"][number];

function whatOf(row: Change) {
  if (row.target === "contact")
    return m.healthChangesPhoneOf({
      name: row.contact ? displayName(row.contact) : m.commonNotRecorded(),
    });
  const kind = labelOf(row.kind) ?? m.healthKind();
  return row.adds
    ? m.healthChangesAdd({ kind })
    : m.healthChangesEdit({ kind });
}

function ChangeStatus({ row, today }: { row: Change; today: string }) {
  if (row.state !== "open") {
    const state = CHANGE_STATE[row.state];
    return <StatusText tone={state.tone}>{state.label()}</StatusText>;
  }
  if (row.dueOn < today)
    return <StatusText tone="danger">{m.privacyOverdue()}</StatusText>;
  return (
    <StatusText tone="warning">
      {m.privacyDueIn({
        when: formatRelativeDays(row.dueOn, Date.parse(today)),
      })}
    </StatusText>
  );
}

function columns(today: string): Column<Change>[] {
  return [
    {
      id: "student",
      header: m.healthChangesStudent(),
      primary: true,
      cell: (row) => (
        <span className="grid gap-0.5">
          <UserText
            text={displayName({
              fullNameEn: row.studentNameEn,
              fullNameAr: row.studentNameAr,
            })}
          />
          <UserText
            text={m.healthChangesAskedBy({
              name: displayName({
                fullNameEn: row.requesterNameEn,
                fullNameAr: row.requesterNameAr,
              }),
            })}
            className="text-[13px] leading-[18px] text-muted-foreground"
          />
        </span>
      ),
    },
    { id: "what", header: m.healthChangesWhat(), cell: whatOf },
    {
      id: "asked",
      header: m.privacyReceived(),
      cell: (row) => formatDate(row.askedOn),
    },
    {
      id: "status",
      header: m.privacyStatus(),
      cell: (row) => <ChangeStatus row={row} today={today} />,
    },
  ];
}

function cardOf(today: string) {
  return {
    title: (row: Change) => (
      <UserText
        text={displayName({
          fullNameEn: row.studentNameEn,
          fullNameAr: row.studentNameAr,
        })}
      />
    ),
    status: (row: Change) => <ChangeStatus row={row} today={today} />,
    fact: whatOf,
  };
}

type Answer = "accepted" | "declined";

/**
 * What the school holds beside what the family asked for, and the answer:
 * accept, which applies it to the record as compared, or decline with the
 * reason the family will read.
 */
function ReviewSheet({ row, onClose }: { row: Change; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState<Answer>("accepted");
  const [reason, setReason] = useState("");
  const [keepReport, setKeepReport] = useState(true);
  const [shareReport, setShareReport] = useState(true);
  const keeps = row.report !== null && row.target === "record";
  const [errors, setErrors] = useState<{ reason?: string }>({});
  const mutation = useMutation({
    mutationFn: (data: DecideHealthChangeInput) => decideHealthChange({ data }),
    meta: { inlineError: true },
  });
  const open = row.state === "open";
  const input: DecideHealthChangeInput =
    answer === "accepted"
      ? {
          id: row.id,
          decision: "accepted",
          ...(row.nowVersion ? { expectedVersion: row.nowVersion } : {}),
          ...(keeps
            ? { keepReport, shareReport: keepReport && shareReport }
            : {}),
        }
      : { id: row.id, decision: "declined", reason };
  const refusal = refusalOf(mutation.error, {});
  const student = displayName({
    fullNameEn: row.studentNameEn,
    fullNameAr: row.studentNameAr,
  });
  const facts = (
    <Facts>
      <Fact label={m.healthChangesStudent()}>
        <bdi>{student}</bdi>
      </Fact>
      <Fact label={m.healthChangesAskedByLabel()}>
        <bdi>
          {displayName({
            fullNameEn: row.requesterNameEn,
            fullNameAr: row.requesterNameAr,
          })}
        </bdi>
      </Fact>
      <Fact label={m.healthChangesWhat()}>{whatOf(row)}</Fact>
      <Fact label={m.healthChangesNow()} notApplicable={row.adds}>
        {row.now ? (
          <bdi dir={"phone" in row.now ? "ltr" : undefined}>
            {valueLine(row.now)}
          </bdi>
        ) : null}
      </Fact>
      <Fact label={m.healthChangesAsked()}>
        <bdi dir={"phone" in row.asked ? "ltr" : undefined}>
          {valueLine(row.asked)}
        </bdi>
      </Fact>
      {row.reason ? (
        <Fact label={m.medicalReason()}>
          <bdi>{row.reason}</bdi>
        </Fact>
      ) : null}
    </Facts>
  );
  const sent = row.report ? (
    <div className="grid gap-1.5">
      <span className="text-[13px] leading-[18px] text-muted-foreground">
        {m.healthChangesReport()}
      </span>
      <FileList
        files={[
          {
            id: row.report.fileId,
            name: row.report.name,
            mediaType: row.report.mediaType,
            sizeBytes: row.report.sizeBytes,
          },
        ]}
      />
    </div>
  ) : null;
  return (
    <SheetForm
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.healthChangesReview({ name: student })}
      submitLabel={
        !open
          ? m.commonClose()
          : answer === "accepted"
            ? m.healthChangesAccept()
            : m.healthChangesDecline()
      }
      destructive={open && answer === "declined"}
      pending={mutation.isPending}
      error={refusal?.message ?? null}
      onSubmit={async () => {
        if (!open) {
          onClose();
          return;
        }
        const found = schemaErrors(decideHealthChangeSchema, input, (key) =>
          key === "reason" ? "reason" : undefined,
        );
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        await mutation.mutateAsync(input).then(
          async () => {
            await queryClient.invalidateQueries({
              queryKey: ["health-changes"],
            });
            toast.success(
              answer === "accepted"
                ? m.healthChangesAccepted()
                : m.healthChangesDeclined(),
            );
            onClose();
          },
          () => undefined,
        );
      }}
    >
      {facts}
      {sent}
      {row.missing ? (
        <p className="text-sm text-muted-foreground">
          {m.healthChangesMissing()}
        </p>
      ) : null}
      {open ? (
        <>
          <ChoiceField
            label={m.healthChangesAnswer()}
            value={answer}
            options={[
              {
                value: "accepted",
                label: m.healthChangesAcceptOption(),
                hint: m.healthChangesAcceptHint(),
              },
              {
                value: "declined",
                label: m.healthChangesDeclineOption(),
                hint: m.healthChangesDeclineHint(),
              },
            ]}
            onChange={setAnswer}
          />
          {answer === "accepted" && keeps ? (
            <>
              <CheckboxRow
                label={m.healthChangesKeepReport()}
                hint={m.healthChangesKeepReportHint()}
                checked={keepReport}
                onChange={setKeepReport}
              />
              {keepReport ? (
                <CheckboxRow
                  label={m.healthChangesShareReport()}
                  checked={shareReport}
                  onChange={setShareReport}
                />
              ) : null}
            </>
          ) : null}
          {answer === "declined" ? (
            <FormField
              id="health-change-reason"
              label={m.healthChangesReason()}
              hint={m.healthChangesReasonHint()}
              errors={errors.reason ? [errors.reason] : undefined}
            >
              {(control) => (
                <Textarea
                  {...control}
                  dir="auto"
                  rows={4}
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => {
                    setErrors({});
                    setReason(event.target.value);
                  }}
                />
              )}
            </FormField>
          ) : null}
        </>
      ) : null}
    </SheetForm>
  );
}

function HealthChangesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queue = useSuspenseQuery(
    healthChangesQuery(search.show === "open"),
  ).data;
  const [reviewing, setReviewing] = useState<Change | null>(null);
  return (
    <>
      <PageHeader
        title={m.healthChangesTitle()}
        count={queue.changes.length}
        description={m.healthChangesHint()}
      />
      <DataTable
        caption={m.healthChangesCaption()}
        rows={queue.changes}
        columns={columns(queue.today)}
        rowLabel={(row) =>
          displayName({
            fullNameEn: row.studentNameEn,
            fullNameAr: row.studentNameAr,
          })
        }
        rowActions={(row) => [
          {
            label:
              row.state === "open"
                ? m.healthChangesReviewAction()
                : m.healthChangesOpenAction(),
            icon: ClipboardCheck,
            inline: true,
            onSelect: () => setReviewing(row),
          },
        ]}
        toolbar={{
          facets: [
            {
              id: "show",
              label: m.healthChangesShow(),
              single: true,
              options: [
                { value: "open", label: m.healthChangesShowOpen() },
                { value: "all", label: m.healthChangesShowAll() },
              ],
              selected: [search.show],
              defaultSelected: ["open"],
              onChange: (selected) =>
                void navigate({
                  search: {
                    show: selected[0] === "all" ? "all" : "open",
                  },
                }),
            },
          ],
          onReset: () => void navigate({ search: { show: "open" } }),
        }}
        card={cardOf(queue.today)}
        empty={{
          icon: HeartPulse,
          title:
            search.show === "open"
              ? m.healthChangesEmpty()
              : m.healthChangesEmptyAll(),
          description: m.healthChangesEmptyBody(),
        }}
      />
      {reviewing ? (
        <ReviewSheet
          key={reviewing.id}
          row={reviewing}
          onClose={() => setReviewing(null)}
        />
      ) : null}
    </>
  );
}
