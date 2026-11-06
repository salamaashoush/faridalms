import { EmptyState } from "@faridalms/ui/system/empty-state";
import { FormField } from "@faridalms/ui/system/form-field";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { Fact, Facts, RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MessageSquareWarning, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { displayName, labelOf } from "~/components/people/format";
import { ContactList } from "~/components/people/record-parts";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { childDetailsQuery } from "~/queries/home";
import { personRecordQuery } from "~/queries/students";
import { currentUserQuery } from "~/queries/user";
import { askCorrection } from "~/server/privacy";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

export const Route = createFileRoute("/_app/family/details")({
  staticData: {
    breadcrumb: m.familyDetails,
    section: "/family/children",
  },
  validateSearch: v.object({
    studentId: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    const me = await context.queryClient.ensureQueryData(
      personRecordQuery(user.id),
    );
    const child = deps.studentId ?? me.children[0]?.studentId;
    if (child)
      await context.queryClient.ensureQueryData(childDetailsQuery(child));
  },
  component: FamilyDetailsPage,
});

/**
 * Asks the school office to correct what it holds. The request joins the
 * office's register of records requests, which gives it a day to be
 * answered by; that day is told back once it is sent.
 */
function CorrectionSheet({
  studentId,
  name,
  onClose,
}: {
  studentId: string;
  name: string;
  onClose: () => void;
}) {
  const [details, setDetails] = useState("");
  const [missing, setMissing] = useState(false);
  const mutation = useMutation({
    mutationFn: () => askCorrection({ data: { studentId, details } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.correctionTitle({ name })}
      submitLabel={m.correctionSend()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (!details.trim()) {
          setMissing(true);
          return;
        }
        await mutation.mutateAsync().then(
          (sent) => {
            toast.success(m.correctionSent({ date: formatDate(sent.dueOn) }));
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <FormField
        id="correction-details"
        label={m.correctionDetails()}
        hint={m.correctionDetailsHint()}
        errors={missing ? [m.validationRequired()] : undefined}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={6}
            maxLength={2000}
            value={details}
            onChange={(event) => {
              setMissing(false);
              setDetails(event.target.value);
            }}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

/**
 * What the school holds about one child, as a guardian reads it: who the
 * child is and where they are placed, and how the school reaches this
 * guardian. A guardian who decides for the child can ask for a correction.
 */
function ChildDetails({ studentId }: { studentId: string }) {
  const user = useCurrentUser();
  const child = useSuspenseQuery(childDetailsQuery(studentId)).data;
  const me = useSuspenseQuery(personRecordQuery(user.id)).data;
  const [asking, setAsking] = useState(false);
  const name = displayName(child);
  return (
    <>
      <PageHeader
        title={m.familyDetailsTitle({ name })}
        description={
          child.decides
            ? m.familyDetailsHint({ name })
            : m.familyDetailsFollows({ name })
        }
        action={
          child.decides
            ? {
                label: m.correctionAsk(),
                icon: MessageSquareWarning,
                onClick: () => setAsking(true),
              }
            : undefined
        }
      />
      <div className="grid max-w-3xl gap-6">
        <RecordSection title={m.familyDetailsIdentity()}>
          <Facts>
            <Fact label={m.peopleNameEnglish()}>
              {child.fullNameEn ? (
                <span dir="ltr">{child.fullNameEn}</span>
              ) : null}
            </Fact>
            <Fact label={m.peopleNameArabic()}>
              {child.fullNameAr ? (
                <span dir="rtl">{child.fullNameAr}</span>
              ) : null}
            </Fact>
            <Fact label={m.familyDetailsKnownAs()}>
              {child.preferredGivenName ? (
                <span dir="auto">{child.preferredGivenName}</span>
              ) : null}
            </Fact>
            <Fact label={m.studentBirthdate()}>
              {child.birthDate ? formatDate(child.birthDate) : null}
            </Fact>
            <Fact label={m.peopleSex()}>{labelOf(child.sex)}</Fact>
          </Facts>
        </RecordSection>
        <RecordSection title={m.familyDetailsSchool()}>
          <Facts>
            <Fact label={m.adminReference()}>
              {child.reference ? (
                <span dir="ltr">{child.reference}</span>
              ) : null}
            </Fact>
            <Fact label={m.studentGrade()} notApplicable={!child.grade}>
              {labelOf(child.grade)}
            </Fact>
            <Fact label={m.studentsClass()} notApplicable={!child.homeroom}>
              {child.homeroom
                ? inLocale(child.homeroom.titleEn, child.homeroom.titleAr)
                : null}
            </Fact>
          </Facts>
        </RecordSection>
        <RecordSection
          title={m.familyDetailsYours()}
          description={m.familyDetailsYoursHint()}
        >
          <ContactList contacts={me.contacts ?? []} />
        </RecordSection>
      </div>
      {asking ? (
        <CorrectionSheet
          studentId={studentId}
          name={name}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </>
  );
}

function FamilyDetailsPage() {
  const search = Route.useSearch();
  const user = useCurrentUser();
  const children = useSuspenseQuery(personRecordQuery(user.id)).data.children;
  const studentId = search.studentId ?? children[0]?.studentId;
  if (!studentId)
    return (
      <>
        <PageHeader title={m.familyDetails()} />
        <EmptyState
          icon={Users}
          title={m.courseworkNoChildren()}
          description={m.courseworkNoChildrenBody()}
        />
      </>
    );
  return <ChildDetails key={studentId} studentId={studentId} />;
}
