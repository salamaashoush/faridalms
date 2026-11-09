import type { EnquiryState } from "@faridalms/domain/enquiries";
import type { ActionItem } from "@faridalms/ui/system/action-menu";

import { responseMinutes } from "@faridalms/domain/enquiries";
import { Button } from "@faridalms/ui/button";
import { Skeleton } from "@faridalms/ui/skeleton";
import { BreadcrumbCurrent } from "@faridalms/ui/system/app-shell";
import { Page } from "@faridalms/ui/system/page";
import {
  Fact,
  Facts,
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CircleCheck,
  Clock,
  MessageSquarePlus,
  RotateCcw,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { AssignSheet, CloseSheet } from "~/components/admissions/EnquirySheets";
import {
  PURPOSE_LABEL,
  REASON_LABEL,
  SOURCE_LABEL,
  STATE_LABEL,
  STATE_TONE,
} from "~/components/admissions/labels";
import { Conversation } from "~/components/messages/Conversation";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { enquiryQuery } from "~/queries/admissions";
import { threadQuery } from "~/queries/messages";
import { currentUserQuery } from "~/queries/user";
import {
  eraseOutsideContact,
  moveEnquiry,
  openEnquiryConversation,
} from "~/server/admissions";
import { formatInstant, formatDate, formatMinutes } from "~/utils/datetime";
import { numberLocale } from "~/utils/digits";
import { getMessageFromError } from "~/utils/error";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/admissions/enquiries/$enquiryId")({
  staticData: { trail: <EnquiryTrail />, section: "/admissions/enquiries" },
  loader: async ({ context, params }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "admissions:read", "admissions:manage");
    const enquiry = await context.queryClient.ensureQueryData(
      enquiryQuery(params.enquiryId),
    );
    if (enquiry.threadId)
      await context.queryClient.ensureQueryData(threadQuery(enquiry.threadId));
  },
  component: EnquiryPage,
});

function EnquiryTrail() {
  const { enquiryId } = Route.useParams();
  const data = useSuspenseQuery(enquiryQuery(enquiryId)).data;
  return <BreadcrumbCurrent>{data.name}</BreadcrumbCurrent>;
}

/** Two days without an answer is when a family starts looking elsewhere. */
const WAITING_MINUTES = 2 * 24 * 60;

/** A wait in the largest unit that reads naturally: minutes and hours, then days. */
function waited(minutes: number) {
  if (minutes < 24 * 60) return formatMinutes(minutes);
  return new Intl.NumberFormat(numberLocale(), {
    style: "unit",
    unit: "day",
    unitDisplay: "long",
  }).format(Math.round(minutes / (24 * 60)));
}

interface EnquiryConversationProps {
  enquiry: {
    id: string;
    threadId: string | null;
    childName: string;
    manages: boolean;
  };
}

/**
 * The enquiry's conversation in the admissions mailbox, drawn by Messages:
 * the family's words, every reply, note, logged contact and change, and
 * the composer that writes to the family or for colleagues. An enquiry
 * whose arrival could not open one gets one when staff first work it.
 */
function EnquiryConversation({ enquiry }: EnquiryConversationProps) {
  const queryClient = useQueryClient();
  const open = useMutation({
    mutationFn: () => openEnquiryConversation({ data: { id: enquiry.id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admissions"] }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <RecordSection
      title={m.admSectionConversation()}
      description={m.admSectionConversationHint()}
    >
      {enquiry.threadId ? (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Conversation
            threadId={enquiry.threadId}
            embedded
            fields={{ child: enquiry.childName }}
          />
        </Suspense>
      ) : enquiry.manages ? (
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          disabled={open.isPending}
          onClick={() => open.mutate()}
        >
          <MessageSquarePlus aria-hidden />
          {m.admConversationStart()}
        </Button>
      ) : (
        <RecordEmpty>{m.admThreadEmpty()}</RecordEmpty>
      )}
    </RecordSection>
  );
}

type Sheet = "assign" | "close" | null;

function EnquiryPage() {
  const { enquiryId } = Route.useParams();
  const queryClient = useQueryClient();
  const enquiry = useSuspenseQuery(enquiryQuery(enquiryId)).data;
  const [sheet, setSheet] = useState<Sheet>(null);
  const open = (next: Sheet) => () => setSheet(next);
  const move = (state: EnquiryState) => async () => {
    await moveEnquiry({
      data: { id: enquiry.id, expectedVersion: enquiry.version, state },
    });
    await queryClient.invalidateQueries({ queryKey: ["admissions"] });
    toast.success(m.admMoved({ state: STATE_LABEL[state]() }));
  };
  const answeredIn = responseMinutes(
    enquiry.createdAt,
    enquiry.firstRespondedAt,
  );
  const moves: ActionItem[] = enquiry.moves.flatMap((state): ActionItem[] => {
    if (state === "closed")
      return [
        { label: m.admCloseAction(), icon: XCircle, onSelect: open("close") },
      ];
    if (state === "converted")
      return [
        {
          label: m.admConvertAction(),
          icon: CircleCheck,
          onSelect: move("converted"),
          confirm: {
            title: m.admConvertTitle({ name: enquiry.name }),
            body: m.admConvertBody(),
            label: m.admConvertAction(),
          },
        },
      ];
    return [
      {
        label:
          enquiry.state === "open" ? m.admStartAction() : m.admReopenAction(),
        icon: enquiry.state === "open" ? Clock : RotateCcw,
        onSelect: move(state),
      },
    ];
  });
  const erase = async () => {
    if (!enquiry.contactId) return;
    await eraseOutsideContact({
      data: {
        contactId: enquiry.contactId,
        basis: "data_subject_request",
        reference: m.admEraseReference({ name: enquiry.name }),
      },
    });
    await queryClient.invalidateQueries({ queryKey: ["admissions"] });
    toast.success(m.admErased());
  };
  const menu: ActionItem[] = [
    ...(enquiry.manages
      ? [
          {
            label: m.admAssignTitle(),
            icon: UserRound,
            onSelect: open("assign"),
          },
          ...moves,
        ]
      : []),
    ...(enquiry.canErase && enquiry.contactId
      ? [
          {
            label: m.admEraseAction(),
            icon: Trash2,
            destructive: true,
            onSelect: erase,
            confirm: {
              title: m.admEraseTitle({ name: enquiry.name }),
              body: m.admEraseBody(),
              label: m.admEraseAction(),
            },
          },
        ]
      : []),
  ];
  const target = {
    id: enquiry.id,
    version: enquiry.version,
    name: enquiry.name,
    childName: enquiry.childName,
    purpose: enquiry.purpose,
    locale: enquiry.locale,
    email: enquiry.email,
    assignee: enquiry.assignee,
    school: enquiry.school,
  };
  return (
    <Page width="record">
      <RecordHeader
        title={enquiry.name}
        status={{
          label: STATE_LABEL[enquiry.state](),
          tone: STATE_TONE[enquiry.state],
        }}
        facts={[
          {
            label: m.admFieldPurpose(),
            value: PURPOSE_LABEL[enquiry.purpose](),
          },
          { label: m.admColSource(), value: SOURCE_LABEL[enquiry.source]() },
          {
            label: m.admColReceived(),
            value: formatInstant(enquiry.createdAt),
          },
          {
            label: m.admColAssignee(),
            value: enquiry.assignee ? (
              <bdi>
                {inLocale(enquiry.assignee.nameEn, enquiry.assignee.nameAr)}
              </bdi>
            ) : (
              m.admNobody()
            ),
          },
          {
            label: m.admFirstResponse(),
            value:
              answeredIn === null
                ? m.admNotAnswered()
                : answeredIn < 1
                  ? m.admAnsweredAtOnce()
                  : m.admAnsweredIn({ time: waited(answeredIn) }),
          },
        ]}
        alerts={
          enquiry.state === "open" &&
          enquiry.waitingMinutes !== null &&
          enquiry.waitingMinutes >= WAITING_MINUTES
            ? [
                {
                  label: m.admWaiting({ time: waited(enquiry.waitingMinutes) }),
                  tone: "warning",
                  icon: Clock,
                },
              ]
            : []
        }
        menu={menu}
      />
      <RecordColumns
        main={
          <>
            <RecordSection title={m.admSectionEnquiry()}>
              <Facts>
                <Fact label={m.admFieldChild()}>{enquiry.childName}</Fact>
                <Fact label={m.admFieldYear()}>{enquiry.childYear}</Fact>
                {enquiry.state === "closed" && enquiry.closedReason ? (
                  <Fact label={m.admFieldReason()}>
                    {REASON_LABEL[enquiry.closedReason]()}
                  </Fact>
                ) : null}
                {enquiry.source === "website" ? (
                  <Fact label={m.admFieldPage()}>
                    {inLocale(enquiry.pageTitleEn, enquiry.pageTitleAr)}
                  </Fact>
                ) : (
                  <Fact label={m.admLoggedBy()}>
                    {enquiry.createdBy
                      ? inLocale(
                          enquiry.createdBy.nameEn,
                          enquiry.createdBy.nameAr,
                        )
                      : ""}
                  </Fact>
                )}
                <Fact label={m.admFieldMessage()} wide>
                  {enquiry.message ? (
                    <span dir="auto" className="whitespace-pre-line">
                      {enquiry.message}
                    </span>
                  ) : null}
                </Fact>
              </Facts>
            </RecordSection>
            {enquiry.answers.length ? (
              <RecordSection
                title={m.admSectionAnswers()}
                description={m.admSectionAnswersHint()}
              >
                <Facts>
                  {enquiry.answers.map((answer) => (
                    <Fact key={answer.id} label={answer.prompt}>
                      {answer.date ? formatDate(answer.text) : answer.text}
                    </Fact>
                  ))}
                </Facts>
              </RecordSection>
            ) : null}
            <EnquiryConversation enquiry={enquiry} />
          </>
        }
        aside={
          <>
            <RecordSection title={m.admSectionContact()}>
              <Facts>
                <Fact label={m.admFieldEmail()} wide>
                  {enquiry.email ? (
                    <a
                      href={`mailto:${enquiry.email}`}
                      dir="ltr"
                      className={`text-primary hover:underline ${phoneLink}`}
                    >
                      {enquiry.email}
                    </a>
                  ) : null}
                </Fact>
                <Fact label={m.admFieldPhone()} wide>
                  {enquiry.phone ? (
                    <a
                      href={`tel:${enquiry.phone.replaceAll(/[^\d+]/g, "")}`}
                      dir="ltr"
                      className={`text-primary hover:underline ${phoneLink}`}
                    >
                      {enquiry.phone}
                    </a>
                  ) : null}
                </Fact>
                <Fact label={m.admFieldLanguage()} wide>
                  {enquiry.locale === "ar"
                    ? m.admLanguageAr()
                    : m.admLanguageEn()}
                </Fact>
              </Facts>
            </RecordSection>
            <RecordSection
              title={m.admSectionRelated()}
              description={m.admSectionRelatedHint()}
            >
              {enquiry.related.length ? (
                <ul className="-my-2 divide-y">
                  {enquiry.related.map((row) => (
                    <li key={row.id} className="grid gap-0.5 py-2">
                      <Link
                        to="/admissions/enquiries/$enquiryId"
                        params={{ enquiryId: row.id }}
                        dir="auto"
                        className={`text-sm font-medium text-primary hover:underline ${phoneLink}`}
                      >
                        {row.name}
                      </Link>
                      <span className="flex flex-wrap items-center gap-x-2 text-[13px] leading-[18px] text-muted-foreground">
                        <StatusText tone={STATE_TONE[row.state]}>
                          {STATE_LABEL[row.state]()}
                        </StatusText>
                        <span>
                          {PURPOSE_LABEL[row.purpose]()} ·{" "}
                          {formatInstant(row.createdAt)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <RecordEmpty>{m.admRelatedNone()}</RecordEmpty>
              )}
            </RecordSection>
          </>
        }
      />
      {enquiry.manages ? (
        <>
          <AssignSheet
            enquiry={target}
            staff={enquiry.staff}
            open={sheet === "assign"}
            onOpenChange={(next) => setSheet(next ? "assign" : null)}
          />
          <CloseSheet
            enquiry={target}
            open={sheet === "close"}
            onOpenChange={(next) => setSheet(next ? "close" : null)}
          />
        </>
      ) : null}
    </Page>
  );
}
