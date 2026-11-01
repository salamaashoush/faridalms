import type { EntryKind, EnquiryState } from "@faridalms/domain/enquiries";
import type { LucideIcon } from "lucide-react";

import { responseMinutes } from "@faridalms/domain/enquiries";
import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { Button } from "@faridalms/ui/button";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  CircleCheck,
  Clock,
  Mail,
  MessageSquareReply,
  NotebookPen,
  Phone,
  RotateCcw,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { ActionItem } from "~/components/system/ActionMenu";

import {
  AssignSheet,
  CloseSheet,
  EntrySheet,
  ReplySheet,
} from "~/components/admissions/EnquirySheets";
import {
  ENTRY_LABEL,
  PURPOSE_LABEL,
  REASON_LABEL,
  SOURCE_LABEL,
  STATE_LABEL,
  STATE_TONE,
} from "~/components/admissions/labels";
import { BreadcrumbCurrent } from "~/components/app/WorkspaceBreadcrumb";
import { formatInstant } from "~/components/coursework/format";
import { FormField } from "~/components/system/field";
import {
  Fact,
  Facts,
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordSection,
} from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { enquiryQuery } from "~/queries/admissions";
import { currentUserQuery } from "~/queries/user";
import { addEnquiryEntry, moveEnquiry } from "~/server/admissions";
import { formatDate, formatMinutes } from "~/utils/datetime";
import { numberLocale } from "~/utils/digits";
import { getMessageFromError } from "~/utils/error";

export const Route = createFileRoute("/_app/admissions/enquiries/$enquiryId")({
  staticData: { trail: <EnquiryTrail />, section: "/admissions/enquiries" },
  loader: async ({ context, params }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (
      !user.capabilities.includes("admissions:read") &&
      !user.capabilities.includes("admissions:manage")
    )
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await context.queryClient.ensureQueryData(enquiryQuery(params.enquiryId));
  },
  component: EnquiryPage,
});

function EnquiryTrail() {
  const { enquiryId } = Route.useParams();
  const data = useSuspenseQuery(enquiryQuery(enquiryId)).data;
  return <BreadcrumbCurrent>{data.name}</BreadcrumbCurrent>;
}

type Enquiry = Awaited<
  ReturnType<NonNullable<ReturnType<typeof enquiryQuery>["queryFn"]>>
>;
type Entry = Enquiry["thread"][number];

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

const ENTRY_ICON: Record<EntryKind, LucideIcon> = {
  note: NotebookPen,
  call: Phone,
  email: Mail,
  meeting: Users,
  reply: MessageSquareReply,
  state: ArrowRightLeft,
  assigned: UserRound,
};

const isState = (value: unknown): value is EnquiryState =>
  typeof value === "string" && value in STATE_LABEL;

/** What a change of state or holder says, in the reader's language. */
function changeOf(entry: Entry): string {
  const details = entry.details;
  if (entry.kind === "assigned") {
    const name = inLocale(
      typeof details.nameEn === "string" ? details.nameEn : null,
      typeof details.nameAr === "string" ? details.nameAr : null,
    );
    return name ? m.admEntryAssignedTo({ name }) : m.admEntryUnassigned();
  }
  if (entry.kind === "state" && isState(details.to)) {
    const reason =
      typeof details.reason === "string" && details.reason in REASON_LABEL
        ? REASON_LABEL[details.reason as keyof typeof REASON_LABEL]()
        : "";
    const moved = details.automatic
      ? m.admEntryStarted()
      : m.admEntryMoved({ state: STATE_LABEL[details.to]() });
    return reason ? `${moved}: ${reason}` : moved;
  }
  return "";
}

function ThreadEntry({ entry, timeZone }: { entry: Entry; timeZone: string }) {
  const Icon = ENTRY_ICON[entry.kind];
  const change = changeOf(entry);
  const author = entry.author
    ? inLocale(entry.author.nameEn, entry.author.nameAr)
    : "";
  const subject =
    entry.kind === "reply" && typeof entry.details.subject === "string"
      ? entry.details.subject
      : "";
  return (
    <li className="flex gap-3 py-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm leading-5">
          <span className="font-medium">
            {change || ENTRY_LABEL[entry.kind]()}
          </span>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {author ? (
              <>
                <bdi>{author}</bdi>
                {" · "}
              </>
            ) : null}
            {formatInstant(entry.createdAt, timeZone)}
          </span>
        </p>
        {subject ? (
          <p dir="auto" className="text-sm leading-5 font-medium">
            {subject}
          </p>
        ) : null}
        {entry.body ? (
          <p
            dir="auto"
            className="text-sm leading-5 break-words whitespace-pre-line text-foreground/90"
          >
            {entry.body}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** A note for colleagues, written where the thread is read. */
function NoteComposer({ enquiryId }: { enquiryId: string }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      addEnquiryEntry({
        data: { id: enquiryId, kind: "note", body: body.trim() },
      }),
    meta: { inlineError: true },
  });
  return (
    <form
      noValidate
      className="grid gap-3 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (!body.trim()) return;
        void save
          .mutateAsync()
          .then(async () => {
            setBody("");
            setTried(false);
            await queryClient.invalidateQueries({ queryKey: ["admissions"] });
            toast.success(m.admEntrySaved());
          })
          .catch(() => undefined);
      }}
    >
      <FormField
        id="enquiry-note"
        label={m.admNoteLabel()}
        hint={m.admNoteHint()}
        errors={
          save.error
            ? [getMessageFromError(save.error)]
            : tried && !body.trim()
              ? [m.validationRequired()]
              : undefined
        }
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={4000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        )}
      </FormField>
      <Button
        type="submit"
        variant="outline"
        className="justify-self-start max-md:h-10"
        disabled={save.isPending}
      >
        {m.admNoteAdd()}
      </Button>
    </form>
  );
}

type Sheet = "reply" | "entry" | "assign" | "close" | null;

function EnquiryPage() {
  const { enquiryId } = Route.useParams();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const enquiry = useSuspenseQuery(enquiryQuery(enquiryId)).data;
  const [sheet, setSheet] = useState<Sheet>(null);
  const timeZone = user.school.timeZone;
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
  const menu: ActionItem[] = enquiry.manages
    ? [
        ...(enquiry.canEmail
          ? [{ label: m.admEntryTitle(), icon: Phone, onSelect: open("entry") }]
          : []),
        {
          label: m.admAssignTitle(),
          icon: UserRound,
          onSelect: open("assign"),
        },
        ...moves,
      ]
    : [];
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
    <>
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
            value: formatInstant(enquiry.createdAt, timeZone),
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
        action={
          enquiry.manages
            ? enquiry.canEmail
              ? {
                  label: m.admReplyAction(),
                  icon: Mail,
                  onClick: open("reply"),
                }
              : {
                  label: m.admEntryTitle(),
                  icon: Phone,
                  onClick: open("entry"),
                }
            : undefined
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
                    <Fact key={answer.id} label={answer.label}>
                      {answer.kind === "date"
                        ? formatDate(answer.value)
                        : answer.value}
                    </Fact>
                  ))}
                </Facts>
              </RecordSection>
            ) : null}
            <RecordSection
              title={m.admSectionThread()}
              description={m.admSectionThreadHint()}
            >
              {enquiry.thread.length ? (
                <ol
                  className="-my-3 divide-y"
                  aria-label={m.admSectionThread()}
                >
                  {enquiry.thread.map((entry) => (
                    <ThreadEntry
                      key={entry.id}
                      entry={entry}
                      timeZone={timeZone}
                    />
                  ))}
                </ol>
              ) : (
                <RecordEmpty>{m.admThreadEmpty()}</RecordEmpty>
              )}
              {enquiry.manages ? (
                <div className="mt-5">
                  <NoteComposer enquiryId={enquiry.id} />
                </div>
              ) : null}
            </RecordSection>
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
                          {formatInstant(row.createdAt, timeZone)}
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
          {enquiry.canEmail ? (
            <ReplySheet
              enquiry={target}
              open={sheet === "reply"}
              onOpenChange={(next) => setSheet(next ? "reply" : null)}
            />
          ) : null}
          <EntrySheet
            enquiry={target}
            open={sheet === "entry"}
            onOpenChange={(next) => setSheet(next ? "entry" : null)}
          />
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
    </>
  );
}
