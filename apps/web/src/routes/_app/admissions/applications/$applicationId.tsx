import type {
  ItemState,
  NeedsKind,
  WithdrawReason,
} from "@faridalms/domain/admissions";

import { NEEDS_KINDS, WITHDRAW_REASONS } from "@faridalms/domain/admissions";
import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { Button } from "@faridalms/ui/button";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CalendarX, Eye, FileText, PlayCircle, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { ActionItem } from "~/components/system/ActionMenu";

import {
  AGE_LABEL,
  APPLICATION_STATE_LABEL,
  APPLICATION_STATE_TONE,
  ITEM_MOVE_LABEL,
  ITEM_STATE_LABEL,
  ITEM_STATE_TONE,
  NEEDS_LABEL,
  PRIORITY_LABEL,
  WITHDRAW_LABEL,
} from "~/components/admissions/application-labels";
import { FamilyConversation } from "~/components/admissions/FamilyConversation";
import { BreadcrumbCurrent } from "~/components/app/WorkspaceBreadcrumb";
import { formatInstant } from "~/components/coursework/format";
import { ActionMenu } from "~/components/system/ActionMenu";
import { FormField, SelectField } from "~/components/system/field";
import {
  Fact,
  Facts,
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordSection,
} from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import { StatusText } from "~/components/system/status";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { applicationQuery } from "~/queries/admissions";
import { currentUserQuery } from "~/queries/user";
import {
  getApplicationNeeds,
  moveApplication,
  moveItem,
  noteApplication,
  withdrawForFamily,
} from "~/server/admissions";
import { formatDate, formatList } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

export const Route = createFileRoute(
  "/_app/admissions/applications/$applicationId",
)({
  staticData: {
    trail: <ApplicationTrail />,
    section: "/admissions/applications",
  },
  loader: async ({ context, params }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (
      !user.capabilities.includes("admissions:read") &&
      !user.capabilities.includes("admissions:manage")
    )
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await context.queryClient.ensureQueryData(
      applicationQuery(params.applicationId),
    );
  },
  component: ApplicationPage,
});

function ApplicationTrail() {
  const { applicationId } = Route.useParams();
  const row = useSuspenseQuery(applicationQuery(applicationId)).data;
  return (
    <BreadcrumbCurrent>
      {inLocale(row.child.nameEn, row.child.nameAr)}
    </BreadcrumbCurrent>
  );
}

type Application = Awaited<
  ReturnType<NonNullable<ReturnType<typeof applicationQuery>["queryFn"]>>
>;

const label = (
  value: { labelEn: string | null; labelAr: string | null } | null,
) => (value ? inLocale(value.labelEn, value.labelAr) : "");

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["admissions"] });
}

function ApplicationPage() {
  const { applicationId } = Route.useParams();
  const row = useSuspenseQuery(applicationQuery(applicationId)).data;
  const user = useCurrentUser();
  const timeZone = user.school.timeZone;
  const refresh = useRefresh();
  const [withdrawing, setWithdrawing] = useState(false);
  const review = useMutation({
    mutationFn: () =>
      moveApplication({
        data: {
          id: row.id,
          expectedVersion: row.version,
          state: "in_review",
          note: "",
        },
      }),
  });
  const menu: ActionItem[] =
    row.manages && row.moves.includes("withdrawn")
      ? [
          {
            label: m.aplWithdrawAction(),
            icon: Undo2,
            onSelect: () => setWithdrawing(true),
          },
        ]
      : [];
  return (
    <>
      <RecordHeader
        title={inLocale(row.child.nameEn, row.child.nameAr)}
        initials={inLocale(row.child.nameEn, row.child.nameAr).slice(0, 1)}
        status={{
          label: APPLICATION_STATE_LABEL[row.state](),
          tone: APPLICATION_STATE_TONE[row.state],
        }}
        facts={[
          ...(row.reference
            ? [{ label: m.aplFieldNumber(), value: row.reference }]
            : []),
          {
            label: m.aplColGrade(),
            value: m.itkEditTitle({
              grade: inLocale(row.intake.gradeEn, row.intake.gradeAr),
              year: inLocale(row.intake.yearTitleEn, row.intake.yearTitleAr),
            }),
          },
          {
            label: m.aplColFamily(),
            value: inLocale(row.family.nameEn, row.family.nameAr),
          },
        ]}
        alerts={
          row.child.age === "young" || row.child.age === "old"
            ? [
                {
                  tone: "warning",
                  icon: CalendarX,
                  label: AGE_LABEL[row.child.age](),
                },
              ]
            : []
        }
        action={
          row.manages && row.moves.includes("in_review")
            ? {
                label: m.aplStartReview(),
                icon: PlayCircle,
                onClick: () =>
                  void review.mutateAsync().then(
                    async () => {
                      await refresh();
                      toast.success(m.aplReviewStarted());
                    },
                    (error: unknown) => toast.error(getMessageFromError(error)),
                  ),
              }
            : undefined
        }
        menu={menu}
      />
      <RecordColumns
        main={
          <>
            <ChildSection row={row} />
            <FamilySection row={row} />
            <RecordSection title={m.aplSectionSchools()}>
              {row.schools.length ? (
                <ul className="-my-2 divide-y">
                  {row.schools.map((school, index) => (
                    <li
                      key={`${school.name}-${String(index)}`}
                      className="grid gap-0.5 py-2"
                    >
                      <span dir="auto" className="text-sm font-medium">
                        {school.name}
                      </span>
                      <span className="text-[13px] leading-[18px] text-muted-foreground">
                        {[
                          school.city,
                          school.country,
                          school.grade,
                          school.fromYear
                            ? `${String(school.fromYear)}–${school.toYear ? String(school.toYear) : m.aplNow()}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {school.leaving ? (
                        <span dir="auto" className="text-sm">
                          {school.leaving}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <RecordEmpty>{m.aplSchoolsNone()}</RecordEmpty>
              )}
            </RecordSection>
            <RecordSection
              title={m.aplSectionAnswers()}
              description={m.admSectionAnswersHint()}
            >
              {row.answers.length ? (
                <Facts>
                  {row.answers.map((answer) => (
                    <Fact key={answer.id} label={answer.label} wide>
                      <span dir="auto" className="whitespace-pre-line">
                        {answer.kind === "date"
                          ? formatDate(answer.value)
                          : answer.value}
                      </span>
                    </Fact>
                  ))}
                </Facts>
              ) : (
                <RecordEmpty>{m.aplAnswersNone()}</RecordEmpty>
              )}
            </RecordSection>
            <ChecklistSection row={row} />
            <NeedsSection row={row} />
            <FamilyConversation
              familyUserId={row.family.id}
              applicationId={row.id}
            />
            <HistorySection row={row} timeZone={timeZone} />
          </>
        }
        aside={<Aside row={row} timeZone={timeZone} />}
      />
      {row.manages ? (
        <WithdrawSheet
          row={row}
          open={withdrawing}
          onOpenChange={setWithdrawing}
        />
      ) : null}
    </>
  );
}

function ChildSection({ row }: { row: Application }) {
  return (
    <RecordSection title={m.aplSectionChild()}>
      <Facts>
        <Fact label={m.aplFieldNameEn()}>
          {row.child.nameEn ? <bdi dir="ltr">{row.child.nameEn}</bdi> : null}
        </Fact>
        <Fact label={m.aplFieldNameAr()}>
          {row.child.nameAr ? <bdi dir="rtl">{row.child.nameAr}</bdi> : null}
        </Fact>
        <Fact label={m.aplFieldBirthDate()}>
          {row.child.birthDate ? formatDate(row.child.birthDate) : null}
        </Fact>
        <Fact label={m.aplFieldSex()}>{label(row.child.sex)}</Fact>
        <Fact label={m.aplFieldAge()} wide>
          <StatusText tone={row.child.age === "fits" ? "success" : "warning"}>
            {AGE_LABEL[row.child.age]()}
          </StatusText>
          <span className="ms-2 text-[13px] text-muted-foreground">
            {m.aplCutoffOn({ date: formatDate(row.intake.ageCutoffOn) })}
          </span>
        </Fact>
        {row.child.documents.map((document) => (
          <Fact key={document.id} label={label(document.system)}>
            <bdi dir="ltr">{document.shown}</bdi>
            {document.issuingCountry ? ` · ${document.issuingCountry}` : ""}
          </Fact>
        ))}
      </Facts>
    </RecordSection>
  );
}

function ContactFacts({
  email,
  phone,
}: {
  email: string | null;
  phone: string | null;
}) {
  return (
    <>
      <Fact label={m.admFieldEmail()} wide>
        {email ? (
          <a
            href={`mailto:${email}`}
            dir="ltr"
            className={`text-primary hover:underline ${phoneLink}`}
          >
            {email}
          </a>
        ) : null}
      </Fact>
      <Fact label={m.admFieldPhone()} wide>
        {phone ? (
          <a
            href={`tel:${phone.replaceAll(/[^\d+]/g, "")}`}
            dir="ltr"
            className={`text-primary hover:underline ${phoneLink}`}
          >
            {phone}
          </a>
        ) : null}
      </Fact>
    </>
  );
}

function FamilySection({ row }: { row: Application }) {
  return (
    <RecordSection
      title={m.aplSectionFamily()}
      description={m.aplSectionFamilyHint()}
    >
      <Facts>
        <Fact label={m.aplFieldApplicant()}>
          <bdi>{inLocale(row.family.nameEn, row.family.nameAr)}</bdi>
        </Fact>
        <Fact label={m.aplFieldRelation()}>{label(row.family.relation)}</Fact>
        <Fact label={m.aplFieldResponsible()}>
          {row.family.responsible ? m.aplYes() : m.aplNo()}
        </Fact>
        <ContactFacts email={row.family.email} phone={row.family.phone} />
      </Facts>
      {row.other ? (
        <div className="mt-6 border-t pt-4">
          <h3 className="mb-3 text-sm font-semibold">{m.aplOtherGuardian()}</h3>
          <Facts>
            <Fact label={m.aplFieldName()}>
              <bdi>
                {inLocale(
                  [row.other.names.en.given, row.other.names.en.family]
                    .filter(Boolean)
                    .join(" ") || null,
                  [
                    row.other.names.ar.given,
                    row.other.names.ar.middle,
                    row.other.names.ar.family,
                  ]
                    .filter(Boolean)
                    .join(" ") || null,
                )}
              </bdi>
            </Fact>
            <Fact label={m.aplFieldRelation()}>
              {label(row.other.relation)}
            </Fact>
            <Fact label={m.aplFieldLivesWith()}>
              {row.other.livesWithChild ? m.aplYes() : m.aplNo()}
            </Fact>
            <ContactFacts
              email={row.other.email || null}
              phone={row.other.phone || null}
            />
          </Facts>
        </div>
      ) : null}
    </RecordSection>
  );
}

function ChecklistSection({ row }: { row: Application }) {
  const refresh = useRefresh();
  const move = useMutation({
    mutationFn: (input: {
      itemId: string;
      version: number;
      state: ItemState;
    }) =>
      moveItem({
        data: {
          applicationId: row.id,
          itemId: input.itemId,
          expectedVersion: input.version,
          state: input.state,
          note: "",
        },
      }),
  });
  return (
    <RecordSection
      title={m.aplSectionChecklist()}
      description={m.aplSectionChecklistHint()}
    >
      {row.items.length ? (
        <ul className="-my-3 divide-y" aria-label={m.aplSectionChecklist()}>
          {row.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <div className="grid min-w-0 flex-1 gap-1">
                <span className="text-sm font-medium" dir="auto">
                  {inLocale(item.labelEn || null, item.labelAr || null)}
                  {item.required ? null : (
                    <span className="ms-1.5 font-normal text-muted-foreground">
                      {m.formOptionalSuffix()}
                    </span>
                  )}
                </span>
                <StatusText tone={ITEM_STATE_TONE[item.state]}>
                  {ITEM_STATE_LABEL[item.state]()}
                </StatusText>
                {item.files.length ? (
                  <ul className="grid gap-1">
                    {item.files.map((file) => (
                      <li key={file.id}>
                        <a
                          href={`/files/${file.id}`}
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          <FileText aria-hidden className="size-4" />
                          <bdi>{file.name}</bdi>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {row.manages && row.state !== "draft" && item.moves.length ? (
                <ActionMenu
                  label={m.aplItemActions({
                    item: inLocale(item.labelEn || null, item.labelAr || null),
                  })}
                  actions={item.moves.map((state) => ({
                    label: ITEM_MOVE_LABEL[state](),
                    onSelect: () =>
                      move
                        .mutateAsync({
                          itemId: item.id,
                          version: item.version,
                          state,
                        })
                        .then(async () => {
                          await refresh();
                          toast.success(m.aplItemMoved());
                        }),
                  }))}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <RecordEmpty>{m.aplChecklistNone()}</RecordEmpty>
      )}
    </RecordSection>
  );
}

/** Health and needs stay closed until asked for, since each look is recorded. */
function NeedsSection({ row }: { row: Application }) {
  const read = useMutation({
    mutationFn: () => getApplicationNeeds({ data: { id: row.id } }),
  });
  const needs = read.data as Record<NeedsKind, string> | undefined;
  return (
    <RecordSection
      title={m.aplSectionNeeds()}
      description={m.aplSectionNeedsHint()}
      action={
        needs ? undefined : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={read.isPending}
            onClick={() => read.mutate()}
          >
            <Eye aria-hidden className="size-4" />
            {m.aplShowNeeds()}
          </Button>
        )
      }
    >
      {read.error ? (
        <p className="text-sm text-destructive">
          {getMessageFromError(read.error)}
        </p>
      ) : needs ? (
        <Facts>
          {NEEDS_KINDS.map((kind) => (
            <Fact key={kind} label={NEEDS_LABEL[kind]()} wide>
              {needs[kind] ? (
                <span dir="auto" className="whitespace-pre-line">
                  {needs[kind]}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {m.aplNoneGiven()}
                </span>
              )}
            </Fact>
          ))}
        </Facts>
      ) : (
        <p className="text-sm text-muted-foreground">
          {row.additionalNeeds ? m.aplNeedsDeclared() : m.aplNeedsHidden()}
        </p>
      )}
    </RecordSection>
  );
}

/** A label from a map by a key read from stored details, empty for one no longer known. */
function pick<K extends string>(
  labels: Record<K, () => string>,
  key: unknown,
): string {
  return typeof key === "string" && key in labels ? labels[key as K]() : "";
}

function entryText(entry: Application["entries"][number]): string {
  const details = entry.details;
  if (entry.kind === "state") {
    const reason = pick(WITHDRAW_LABEL, details.reason);
    return `${m.aplEntryState({ state: pick(APPLICATION_STATE_LABEL, details.to) })}${reason ? ` · ${reason}` : ""}`;
  }
  if (entry.kind === "item")
    return m.aplEntryItem({
      item: inLocale(
        typeof details.labelEn === "string" ? details.labelEn || null : null,
        typeof details.labelAr === "string" ? details.labelAr || null : null,
      ),
      state: pick(ITEM_STATE_LABEL, details.to),
    });
  return m.aplEntryNote();
}

function HistorySection({
  row,
  timeZone,
}: {
  row: Application;
  timeZone: string;
}) {
  return (
    <RecordSection
      title={m.aplSectionHistory()}
      description={m.aplSectionHistoryHint()}
    >
      {row.entries.length ? (
        <ol className="-my-3 divide-y" aria-label={m.aplSectionHistory()}>
          {row.entries.map((entry) => (
            <li key={entry.id} className="grid gap-1 py-3">
              <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{entryText(entry)}</span>
                <span className="text-[13px] text-muted-foreground">
                  {entry.author
                    ? `${inLocale(entry.author.nameEn, entry.author.nameAr)} · `
                    : ""}
                  {formatInstant(entry.createdAt, timeZone)}
                </span>
              </span>
              {entry.body ? (
                <p dir="auto" className="text-sm whitespace-pre-line">
                  {entry.body}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <RecordEmpty>{m.aplHistoryNone()}</RecordEmpty>
      )}
      {row.manages ? <NoteComposer applicationId={row.id} /> : null}
    </RecordSection>
  );
}

function NoteComposer({ applicationId }: { applicationId: string }) {
  const refresh = useRefresh();
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      noteApplication({ data: { id: applicationId, body: body.trim() } }),
  });
  return (
    <form
      noValidate
      className="mt-5 grid gap-3 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (!body.trim()) return;
        void save
          .mutateAsync()
          .then(async () => {
            setBody("");
            setTried(false);
            await refresh();
            toast.success(m.aplNoteSaved());
          })
          .catch(() => undefined);
      }}
    >
      <FormField
        id="application-note"
        label={m.aplNoteLabel()}
        hint={m.aplNoteHint()}
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
        className="justify-self-start"
        disabled={save.isPending}
      >
        {m.aplNoteSave()}
      </Button>
    </form>
  );
}

function Aside({ row, timeZone }: { row: Application; timeZone: string }) {
  const found =
    row.matches.students.length +
    row.matches.guardians.length +
    row.matches.siblings.length;
  return (
    <>
      <RecordSection title={m.aplSectionApplication()}>
        <Facts>
          <Fact label={m.aplFieldNumber()} wide>
            {row.reference ? <bdi dir="ltr">{row.reference}</bdi> : null}
          </Fact>
          <Fact label={m.aplColSent()} wide>
            {row.submittedAt ? formatInstant(row.submittedAt, timeZone) : null}
          </Fact>
          <Fact label={m.aplFieldForm()} wide>
            {row.formNumber === null
              ? null
              : m.aplFormVersion({ number: String(row.formNumber) })}
          </Fact>
          <Fact label={m.aplColPriorities()} wide>
            {row.priorities.length
              ? formatList(row.priorities.map((rule) => PRIORITY_LABEL[rule]()))
              : m.aplNoPriority()}
          </Fact>
          <Fact label={m.admFieldLanguage()} wide>
            {row.locale === "ar" ? m.admLanguageAr() : m.admLanguageEn()}
          </Fact>
          {row.enquiryId ? (
            <Fact label={m.aplFieldEnquiry()} wide>
              <Link
                to="/admissions/enquiries/$enquiryId"
                params={{ enquiryId: row.enquiryId }}
                className="text-primary hover:underline"
              >
                {m.aplOpenEnquiry()}
              </Link>
            </Fact>
          ) : null}
        </Facts>
      </RecordSection>
      <RecordSection
        title={m.aplSectionMatches()}
        description={m.aplSectionMatchesHint()}
      >
        {found || row.matches.staffParent ? (
          <ul className="-my-2 grid gap-0 divide-y text-sm">
            {row.matches.students.map((each) => (
              <li key={`s-${each.id}`} className="grid gap-0.5 py-2">
                <Link
                  to="/students/$studentId"
                  params={{ studentId: each.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {inLocale(each.nameEn, each.nameAr)}
                </Link>
                <span className="text-[13px] text-muted-foreground">
                  {m.aplMatchStudent()}
                </span>
              </li>
            ))}
            {row.matches.siblings.map((each) => (
              <li key={`b-${each.id}`} className="grid gap-0.5 py-2">
                <Link
                  to="/students/$studentId"
                  params={{ studentId: each.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {inLocale(each.nameEn, each.nameAr)}
                </Link>
                <span className="text-[13px] text-muted-foreground">
                  {m.aplMatchSibling()}
                </span>
              </li>
            ))}
            {row.matches.guardians.map((each) => (
              <li key={`g-${each.id}`} className="grid gap-0.5 py-2">
                <Link
                  to="/people/$userId"
                  params={{ userId: each.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {inLocale(each.nameEn, each.nameAr)}
                </Link>
                <span className="text-[13px] text-muted-foreground">
                  {each.as === "applicant"
                    ? m.aplMatchApplicant()
                    : m.aplMatchOther()}
                </span>
              </li>
            ))}
            {row.matches.staffParent ? (
              <li className="py-2 text-[13px] text-muted-foreground">
                {m.aplMatchStaff()}
              </li>
            ) : null}
          </ul>
        ) : (
          <RecordEmpty>
            {row.state === "draft" ? m.aplMatchesLater() : m.aplMatchesNone()}
          </RecordEmpty>
        )}
      </RecordSection>
      <RecordSection title={m.aplSectionConsents()}>
        {row.consents.length ? (
          <ul className="-my-2 divide-y">
            {row.consents.map((consent, index) => (
              <li key={String(index)} className="grid gap-0.5 py-2">
                <span className="text-sm">{label(consent.purpose)}</span>
                <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                  <StatusText
                    tone={
                      consent.decision === "granted" ? "success" : "neutral"
                    }
                  >
                    {consent.decision === "granted"
                      ? m.aplConsentGranted()
                      : m.aplConsentRefused()}
                  </StatusText>
                  {formatDate(consent.givenOn)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <RecordEmpty>{m.aplConsentsNone()}</RecordEmpty>
        )}
      </RecordSection>
    </>
  );
}

function WithdrawSheet({
  row,
  open,
  onOpenChange,
}: {
  row: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const refresh = useRefresh();
  const [reason, setReason] = useState<WithdrawReason>("family_request");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () =>
      withdrawForFamily({
        data: {
          id: row.id,
          expectedVersion: row.version,
          reason,
          note: note.trim(),
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) save.reset();
        onOpenChange(next);
      }}
      title={m.aplWithdrawTitle()}
      submitLabel={m.aplWithdrawAction()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        try {
          await save.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.aplWithdrawn());
        onOpenChange(false);
      }}
    >
      <SelectField
        id="withdraw-reason"
        label={m.aplWithdrawReason()}
        value={reason}
        options={WITHDRAW_REASONS.map((value) => ({
          value,
          label: WITHDRAW_LABEL[value](),
        }))}
        onChange={setReason}
      />
      <FormField id="withdraw-note" label={m.admFieldNote()} optional>
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}
