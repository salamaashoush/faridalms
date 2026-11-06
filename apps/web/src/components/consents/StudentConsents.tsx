import type { OfficeMethod } from "@faridalms/domain/consents";
import type { FileSummary } from "@faridalms/domain/file";

import { Button } from "@faridalms/ui/button";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { ClipboardPen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FileField } from "~/components/system/FileField";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { studentConsentsQuery } from "~/queries/consents";
import { recordConsent } from "~/server/consents";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { DECISION_LABEL, DECISION_TONE } from "./format";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof studentConsentsQuery>["queryFn"]>>
>;
type Purpose = Data["purposes"][number];
type Answer = NonNullable<Purpose["current"]>;

const SCAN_BYTES = 10 * 1024 * 1024;

const METHOD_LABEL: Record<Answer["method"], () => string> = {
  electronic: m.consentByApp,
  electronic_signature: m.consentByApp,
  paper_scanned: m.consentByPaper,
  verbal_recorded: m.consentInPerson,
  import: m.consentImported,
};

const nameOf = (person: { nameEn: string | null; nameAr: string | null }) =>
  inLocale(person.nameEn, person.nameAr);

const purposeLabel = (purpose: Purpose) =>
  inLocale(purpose.labelEn, purpose.labelAr) || purpose.code;

interface AnswerLineProps {
  answer: Answer;
}

function AnswerLine({ answer }: AnswerLineProps) {
  return (
    <span className="text-[13px] leading-[18px] text-muted-foreground">
      {[
        answer.givenBy ? nameOf(answer.givenBy) : null,
        formatDate(answer.givenOn),
        METHOD_LABEL[answer.method](),
        answer.versionLabel
          ? m.consentFormVersionShort({ version: answer.versionLabel })
          : null,
        answer.recordedBy
          ? m.consentRecordedBy({ name: nameOf(answer.recordedBy) })
          : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      {answer.evidenceFileId ? (
        <>
          {" · "}
          <a
            href={`/files/${answer.evidenceFileId}`}
            target="_blank"
            rel="noopener"
            className="underline underline-offset-4 hover:text-foreground"
          >
            {m.consentSignedForm()}
          </a>
        </>
      ) : null}
    </span>
  );
}

export interface StudentConsentsProps {
  studentId: string;
}

/**
 * What the student's legal guardians agreed to, purpose by purpose, with who
 * answered, how and when. The office records answers given on paper or in
 * person; families answer in the app.
 */
export function StudentConsents({ studentId }: StudentConsentsProps) {
  const data = useSuspenseQuery(studentConsentsQuery(studentId)).data;
  const [sheet, setSheet] = useState<{
    purpose: Purpose | null;
    open: boolean;
    key: number;
  }>({ purpose: null, open: false, key: 0 });
  const recordable = data.canRecord && data.answerers.length > 0;
  return (
    <>
      <RecordSection
        title={m.consentsTitle()}
        description={
          data.canRecord && data.answerers.length === 0
            ? m.consentsNoAnswerer()
            : m.consentsHint()
        }
      >
        {data.purposes.length === 0 ? (
          <RecordEmpty>{m.consentsNoForms()}</RecordEmpty>
        ) : (
          <RecordList>
            {data.purposes.map((purpose) => {
              const answer = purpose.current;
              const due =
                answer?.refreshDueOn && answer.refreshDueOn <= data.today;
              return (
                <li key={purpose.id} className="flex items-start gap-3 py-3">
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-sm leading-5 font-medium">
                      {purposeLabel(purpose)}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 text-[13px] leading-[18px]">
                      <StatusText
                        tone={
                          answer ? DECISION_TONE[answer.decision] : "neutral"
                        }
                      >
                        {answer
                          ? DECISION_LABEL[answer.decision]()
                          : m.consentNotAnswered()}
                      </StatusText>
                      {due ? (
                        <StatusText tone="warning">
                          {m.consentAskAgain()}
                        </StatusText>
                      ) : answer &&
                        answer.versionLabel !== purpose.versionLabel ? (
                        <span className="text-muted-foreground">
                          {m.consentEarlierVersion()}
                        </span>
                      ) : answer?.refreshDueOn ? (
                        <span className="text-muted-foreground">
                          {m.consentAskAgainOn({
                            date: formatDate(answer.refreshDueOn),
                          })}
                        </span>
                      ) : null}
                    </span>
                    {answer ? <AnswerLine answer={answer} /> : null}
                    {answer?.note ? (
                      <span className="text-sm leading-5">
                        <bdi>{answer.note}</bdi>
                      </span>
                    ) : null}
                    {purpose.earlier.length > 0 ? (
                      <details className="mt-1 text-[13px] leading-[18px]">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          {m.consentEarlier({ count: purpose.earlier.length })}
                        </summary>
                        <ul className="mt-1 grid gap-1 ps-4">
                          {purpose.earlier.map((row) => (
                            <li key={row.id} className="grid">
                              <span>{DECISION_LABEL[row.decision]()}</span>
                              <AnswerLine answer={row} />
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                  {recordable ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="max-md:h-10"
                      aria-label={m.consentRecordFor({
                        purpose: purposeLabel(purpose),
                      })}
                      onClick={() =>
                        setSheet((current) => ({
                          purpose,
                          open: true,
                          key: current.key + 1,
                        }))
                      }
                    >
                      <ClipboardPen aria-hidden />
                      {m.consentRecord()}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </RecordList>
        )}
      </RecordSection>
      {recordable && sheet.purpose ? (
        <RecordSheet
          key={sheet.key}
          studentId={studentId}
          purpose={sheet.purpose}
          data={data}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </>
  );
}

interface RecordSheetProps {
  studentId: string;
  purpose: Purpose;
  data: Data;
  open: boolean;
  onClose: () => void;
}

function RecordSheet({
  studentId,
  purpose,
  data,
  open,
  onClose,
}: RecordSheetProps) {
  const queryClient = useQueryClient();
  const [relationshipId, setRelationshipId] = useState(
    data.answerers[0]?.relationshipId ?? "",
  );
  const [agreed, setAgreed] = useState<"yes" | "no" | "">("");
  const [method, setMethod] = useState<OfficeMethod>("paper_scanned");
  const [givenOn, setGivenOn] = useState(data.today);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const scan = files[0]?.id ?? "";
  const mutation = useMutation({
    mutationFn: () =>
      recordConsent({
        data: {
          studentId,
          purposeId: purpose.id,
          relationshipId,
          agreed: agreed === "yes",
          method,
          givenOn,
          fileId: method === "paper_scanned" ? scan : "",
          note,
        },
      }),
    meta: { inlineError: true },
  });
  const missingScan = method === "paper_scanned" && !scan;
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.consentRecordFor({ purpose: purposeLabel(purpose) })}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setChecked(true);
        if (!agreed || !givenOn || missingScan) return;
        await mutation.mutateAsync().then(
          async () => {
            await queryClient.invalidateQueries({ queryKey: ["consents"] });
            await queryClient.invalidateQueries({
              queryKey: ["people", "student", studentId],
            });
            toast.success(m.consentRecorded());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <SelectField
        id="consent-guardian"
        label={m.consentGuardian()}
        hint={m.consentGuardianHint()}
        value={relationshipId}
        options={data.answerers.map((row) => ({
          value: row.relationshipId,
          label: nameOf(row),
        }))}
        onChange={setRelationshipId}
        width="name"
      />
      <SelectField
        id="consent-answer"
        label={m.consentAnswer()}
        value={agreed}
        options={[
          { value: "", label: m.consentChooseAnswer() },
          { value: "yes", label: m.consentAnswerYes() },
          { value: "no", label: m.consentAnswerNo() },
        ]}
        onChange={setAgreed}
        errors={checked && !agreed ? [m.consentChooseAnswer()] : undefined}
        width="name"
      />
      <SelectField
        id="consent-method"
        label={m.consentHow()}
        value={method}
        options={[
          { value: "paper_scanned", label: m.consentByPaper() },
          { value: "verbal_recorded", label: m.consentInPerson() },
        ]}
        onChange={setMethod}
        width="name"
      />
      <TextField
        id="consent-given-on"
        label={m.consentGivenOn()}
        type="date"
        width="date"
        max={data.today}
        value={givenOn}
        onChange={(event) => setGivenOn(event.target.value)}
        errors={checked && !givenOn ? [m.validationRequired()] : undefined}
      />
      {method === "paper_scanned" ? (
        <div className="grid gap-1.5">
          <FileField
            id="consent-scan"
            label={m.consentScan()}
            hint={m.consentScanHint()}
            purpose="evidence"
            value={files}
            onChange={(update) => setFiles(update)}
            maxFiles={1}
            maxBytes={SCAN_BYTES}
          />
          {checked && missingScan ? (
            <p className="text-[13px] leading-[18px] text-destructive">
              {m.consentScanNeeded()}
            </p>
          ) : null}
        </div>
      ) : null}
      <FormField id="consent-note" label={m.consentNote()} optional>
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
