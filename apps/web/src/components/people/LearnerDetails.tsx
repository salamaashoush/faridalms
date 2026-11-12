import { FormField } from "@faridalms/ui/system/form-field";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { Fact, Facts, RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { MessageSquareWarning } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { groupWords } from "~/components/classes/slots";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { learnerDetailsQuery } from "~/queries/home";
import { personRecordQuery } from "~/queries/students";
import { askCorrection } from "~/server/privacy";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { displayName, labelOf } from "./format";
import { ContactList } from "./record-parts";
import { placeWords } from "./slots";

interface CorrectionSheetProps {
  studentId: string;
  name: string;
  onClose: () => void;
}

/**
 * Asks the school office to correct what it holds. The request joins the
 * office's register of records requests, which gives it a day to be
 * answered by; that day is told back once it is sent.
 */
function CorrectionSheet({ studentId, name, onClose }: CorrectionSheetProps) {
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

export interface LearnerDetailsProps {
  studentId: string;
}

/**
 * What the school holds about a learner, as the learner or someone who
 * follows them reads it: who the learner is and where they are placed, and
 * how the school reaches the reader. Whoever decides for the learner, the
 * learner included once they decide for themself, can ask for a correction.
 */
export function LearnerDetails({ studentId }: LearnerDetailsProps) {
  const user = useCurrentUser();
  const child = useSuspenseQuery(learnerDetailsQuery(studentId)).data;
  const words = useSlot(groupWords)[0];
  const place = useSlot(placeWords)[0];
  const me = useSuspenseQuery(personRecordQuery(user.id)).data;
  const [asking, setAsking] = useState(false);
  const name = displayName(child);
  const self = studentId === user.id;
  return (
    <Page width="record">
      <PageHeader
        title={self ? m.myDetailsTitle() : m.familyDetailsTitle({ name })}
        description={
          self
            ? child.decides
              ? m.myDetailsHint()
              : m.myDetailsReads()
            : child.decides
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
            {place ? (
              <Fact label={place.place()} notApplicable={!child.place}>
                {child.place
                  ? inLocale(child.place.labelEn, child.place.labelAr)
                  : null}
              </Fact>
            ) : null}
            {words ? (
              <Fact label={words.group()} notApplicable={!child.group}>
                {child.group
                  ? inLocale(child.group.titleEn, child.group.titleAr)
                  : null}
              </Fact>
            ) : null}
          </Facts>
        </RecordSection>
        <RecordSection
          title={self ? m.personContactDetails() : m.familyDetailsYours()}
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
    </Page>
  );
}
