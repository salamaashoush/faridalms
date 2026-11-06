import type { Arrangements } from "@faridalms/domain/arrangements";
import type { FileSummary } from "@faridalms/domain/file";
import type { AttachHealthReportInput } from "@faridalms/domain/people";

import {
  EXTRA_TIMES,
  hasArrangements,
  MAX_EXTENSION_DAYS,
} from "@faridalms/domain/arrangements";
import { linkRefusal } from "@faridalms/domain/family-roles";
import { MAX_FILE_BYTES } from "@faridalms/domain/file";
import { attachHealthReportSchema } from "@faridalms/domain/people";
import { Button } from "@faridalms/ui/button";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import {
  Fact,
  Facts,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { FileUp, Pencil, Plus, Share2, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SEVERITY_LABEL } from "~/components/health/labels";
import { FileField } from "~/components/system/FileField";
import { FileList } from "~/components/system/FileList";
import * as m from "~/i18n/messages";
import {
  arrangementsQuery,
  custodyQuery,
  demographicsQuery,
  healthQuery,
} from "~/queries/records";
import { peopleOptionsQuery } from "~/queries/students";
import {
  attachHealthReport,
  removeHealth,
  removeHealthReport,
  saveArrangements,
  attachCourtOrder,
  removeCourtOrder,
  saveCustody,
  saveDemographics,
  saveHealth,
  shareHealthReport,
} from "~/server/records";
import { formatDate, formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError, refusalOf } from "~/utils/error";
import { schemaErrors } from "~/utils/validation";

import { CheckboxRow } from "./fields";
import { displayName, labelOf } from "./format";
import {
  COUNTRY_CODES,
  countryName,
  LANGUAGE_CODES,
  languageName,
} from "./regions";

function useRefresh(studentId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: ["people", "student", studentId],
    });
}

function openSheet<T>(
  set: (
    update: (current: { value: T | null; open: boolean; key: number }) => {
      value: T | null;
      open: boolean;
      key: number;
    },
  ) => void,
  value: T | null,
) {
  set((current) => ({ value, open: true, key: current.key + 1 }));
}

// --- health ---------------------------------------------------------------------

type Health = Awaited<
  ReturnType<NonNullable<ReturnType<typeof healthQuery>["queryFn"]>>
>;
type HealthRecord = Health["records"][number];

interface HealthSheetProps {
  studentId: string;
  kinds: Health["kinds"];
  record: HealthRecord | null;
  open: boolean;
  onClose: () => void;
}

function HealthSheet({
  studentId,
  kinds,
  record,
  open,
  onClose,
}: HealthSheetProps) {
  const refresh = useRefresh(studentId);
  const [kindId, setKindId] = useState(record?.kindId ?? kinds[0]?.id ?? "");
  const [text, setText] = useState(record?.text ?? "");
  const [severity, setSeverity] = useState<"" | "mild" | "moderate" | "severe">(
    record?.severity ?? "",
  );
  const [actionPlan, setActionPlan] = useState(record?.actionPlan ?? "");
  const [hasAlert, setHasAlert] = useState(record?.hasAlert ?? false);
  const [recordedOn, setRecordedOn] = useState(record?.recordedOn ?? "");
  const [textError, setTextError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      saveHealth({
        data: {
          studentId,
          ...(record ? { id: record.id, expectedVersion: record.version } : {}),
          kindId,
          hasAlert,
          recordedOn,
          text,
          severity,
          actionPlan,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={record ? m.healthEdit() : m.healthAdd()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (!text.trim()) {
          setTextError(m.validationRequired());
          return;
        }
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.managementSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <SelectField
        id="health-kind"
        label={m.healthKind()}
        value={kindId}
        options={kinds.map((kind) => ({
          value: kind.id,
          label: labelOf(kind) ?? kind.code,
        }))}
        onChange={setKindId}
        width="name"
      />
      <TextField
        id="health-text"
        label={m.healthDetails()}
        hint={m.healthDetailsHint()}
        width="full"
        maxLength={2000}
        autoComplete="off"
        value={text}
        onChange={(event) => {
          setTextError(null);
          setText(event.target.value);
        }}
        errors={textError ? [textError] : undefined}
      />
      <SelectField
        id="health-severity"
        label={m.healthSeverity()}
        optional
        value={severity || "none"}
        options={[
          { value: "none", label: m.commonNotRecorded() },
          { value: "mild", label: m.healthSeverityMild() },
          { value: "moderate", label: m.healthSeverityModerate() },
          { value: "severe", label: m.healthSeveritySevere() },
        ]}
        onChange={(value) =>
          setSeverity(
            value === "mild" || value === "moderate" || value === "severe"
              ? value
              : "",
          )
        }
        width="name"
      />
      <TextField
        id="health-action"
        label={m.healthActionPlan()}
        hint={m.healthActionPlanHint()}
        optional
        width="full"
        maxLength={2000}
        autoComplete="off"
        value={actionPlan}
        onChange={(event) => setActionPlan(event.target.value)}
      />
      <TextField
        id="health-recorded"
        label={m.healthRecordedOn()}
        optional
        type="date"
        width="date"
        value={recordedOn}
        onChange={(event) => setRecordedOn(event.target.value)}
      />
      <CheckboxRow
        label={m.healthAlert()}
        hint={m.healthAlertHint()}
        checked={hasAlert}
        onChange={setHasAlert}
      />
    </SheetForm>
  );
}

interface ReportSheetProps {
  studentId: string;
  record: HealthRecord;
  open: boolean;
  onClose: () => void;
}

/**
 * Gives a health record its report, such as a doctor's letter, and says
 * whether the family may open it. The file is uploaded as a medical
 * report, so it rests encrypted for the school.
 */
function ReportSheet({ studentId, record, open, onClose }: ReportSheetProps) {
  const refresh = useRefresh(studentId);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [shared, setShared] = useState(record.report?.shared ?? false);
  const [errors, setErrors] = useState<{ report?: string }>({});
  const file = files[0];
  const input = {
    studentId,
    recordId: record.id,
    expectedVersion: record.version,
    report: file ? { fileId: file.id, name: file.name } : undefined,
    shared,
  };
  const mutation = useMutation({
    mutationFn: (data: AttachHealthReportInput) => attachHealthReport({ data }),
    meta: { inlineError: true },
  });
  const refusal = refusalOf(mutation.error, {});
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={record.report ? m.healthReportReplace() : m.healthReportAttach()}
      pending={mutation.isPending}
      error={refusal?.message ?? null}
      onSubmit={async () => {
        const found = schemaErrors(attachHealthReportSchema, input, (key) =>
          key === "report" ? "report" : undefined,
        );
        setErrors(found);
        if (Object.keys(found).length > 0 || !input.report) return;
        await mutation.mutateAsync({ ...input, report: input.report }).then(
          async () => {
            await refresh();
            toast.success(m.healthReportSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-sm text-muted-foreground">
        {m.healthReportIntro({ record: record.text })}
      </p>
      <FileField
        id="health-report-file"
        label={m.healthReportFile()}
        hint={m.healthReportFileHint()}
        purpose="health_report"
        value={files}
        onChange={(update) => {
          setErrors({});
          setFiles(update);
        }}
        maxFiles={1}
        maxBytes={MAX_FILE_BYTES}
        errors={errors.report ? [errors.report] : undefined}
      />
      <CheckboxRow
        label={m.healthReportShare()}
        hint={m.healthReportShareHint()}
        checked={shared}
        onChange={setShared}
      />
    </SheetForm>
  );
}

interface RecordReportProps {
  report: NonNullable<HealthRecord["report"]>;
}

/** A record's report as its card, and whether the family may open it. */
function RecordReport({ report }: RecordReportProps) {
  return (
    <div className="mt-2 grid gap-1.5">
      <FileList
        files={[
          {
            id: report.fileId,
            name: report.name,
            mediaType: report.mediaType,
            sizeBytes: report.sizeBytes,
          },
        ]}
      />
      <StatusText tone={report.shared ? "success" : "neutral"}>
        {report.shared ? m.healthReportShared() : m.healthReportNotShared()}
      </StatusText>
    </div>
  );
}

export interface HealthSectionProps {
  studentId: string;
}

export function HealthSection({ studentId }: HealthSectionProps) {
  const data = useSuspenseQuery(healthQuery(studentId)).data;
  const refresh = useRefresh(studentId);
  const [sheet, setSheet] = useState<{
    value: HealthRecord | null;
    open: boolean;
    key: number;
  }>({
    value: null,
    open: false,
    key: 0,
  });
  const [reporting, setReporting] = useState<{
    value: HealthRecord | null;
    open: boolean;
    key: number;
  }>({ value: null, open: false, key: 0 });
  const share = (record: HealthRecord, shared: boolean) => async () => {
    try {
      await shareHealthReport({
        data: {
          studentId,
          recordId: record.id,
          expectedVersion: record.version,
          shared,
        },
      });
    } catch (error) {
      throw new Error(getMessageFromError(error), { cause: error });
    }
    await refresh();
    toast.success(
      shared ? m.healthReportSharedDone() : m.healthReportUnsharedDone(),
    );
  };
  const removeReport = (record: HealthRecord) => async () => {
    try {
      await removeHealthReport({
        data: {
          studentId,
          recordId: record.id,
          expectedVersion: record.version,
        },
      });
    } catch (error) {
      throw new Error(getMessageFromError(error), { cause: error });
    }
    await refresh();
    toast.success(m.healthReportRemoved());
  };
  const remove = (record: HealthRecord) => async () => {
    try {
      await removeHealth({
        data: { studentId, id: record.id, expectedVersion: record.version },
      });
    } catch (error) {
      throw new Error(getMessageFromError(error), { cause: error });
    }
    await refresh();
    toast.success(m.healthRemoved());
  };
  return (
    <>
      <RecordSection
        title={m.healthTitle()}
        description={m.healthHint()}
        action={
          data.canWrite ? (
            <Button
              type="button"
              variant="ghost"
              className="max-md:h-10"
              onClick={() => openSheet(setSheet, null)}
            >
              <Plus aria-hidden />
              {m.healthAdd()}
            </Button>
          ) : undefined
        }
      >
        {data.records.length === 0 ? (
          <RecordEmpty>{m.healthEmpty()}</RecordEmpty>
        ) : (
          <RecordList>
            {data.records.map((record) => (
              <li key={record.id} className="flex items-start gap-3 py-3">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-[18px] text-muted-foreground">
                    {labelOf(record.kind) ?? m.healthKind()}
                    {record.hasAlert ? (
                      <StatusBadge tone="danger">
                        {m.healthAlertShort()}
                      </StatusBadge>
                    ) : null}
                  </span>
                  <span className="text-sm leading-5 font-medium">
                    <bdi>{record.text}</bdi>
                  </span>
                  {record.severity || record.recordedOn ? (
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {[
                        record.severity
                          ? SEVERITY_LABEL[record.severity]()
                          : null,
                        record.recordedOn
                          ? m.healthRecordedOnValue({
                              date: formatDate(record.recordedOn),
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                  {record.actionPlan ? (
                    <span className="flex flex-wrap gap-x-1.5 text-sm leading-5">
                      <span className="text-muted-foreground">
                        {m.healthActionPlan()}
                      </span>
                      <bdi>{record.actionPlan}</bdi>
                    </span>
                  ) : null}
                  {record.report ? (
                    <RecordReport report={record.report} />
                  ) : null}
                </div>
                {data.canWrite ? (
                  <ActionMenu
                    label={m.healthActions({ record: record.text })}
                    actions={[
                      {
                        label: m.healthEdit(),
                        icon: Pencil,
                        onSelect: () => openSheet(setSheet, record),
                      },
                      {
                        label: record.report
                          ? m.healthReportReplace()
                          : m.healthReportAttach(),
                        icon: FileUp,
                        onSelect: () => openSheet(setReporting, record),
                      },
                      ...(record.report
                        ? [
                            {
                              label: record.report.shared
                                ? m.healthReportUnshare()
                                : m.healthReportShare(),
                              icon: record.report.shared ? Users : Share2,
                              onSelect: share(record, !record.report.shared),
                            },
                            {
                              label: m.healthReportRemove(),
                              icon: Trash2,
                              destructive: true,
                              confirm: {
                                title: m.healthReportRemoveTitle(),
                                body: m.healthReportRemoveBody(),
                                label: m.healthReportRemove(),
                              },
                              onSelect: removeReport(record),
                            },
                          ]
                        : []),
                      {
                        label: m.healthRemove(),
                        icon: Trash2,
                        destructive: true,
                        confirm: {
                          title: m.healthRemoveTitle(),
                          body: m.healthRemoveBody(),
                          label: m.healthRemove(),
                        },
                        onSelect: remove(record),
                      },
                    ]}
                  />
                ) : null}
              </li>
            ))}
          </RecordList>
        )}
      </RecordSection>
      {data.canWrite ? (
        <HealthSheet
          key={sheet.key}
          studentId={studentId}
          kinds={data.kinds}
          record={sheet.value}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
      {data.canWrite && reporting.value ? (
        <ReportSheet
          key={reporting.key}
          studentId={studentId}
          record={reporting.value}
          open={reporting.open}
          onClose={() =>
            setReporting((current) => ({ ...current, open: false }))
          }
        />
      ) : null}
    </>
  );
}

// --- demographics ---------------------------------------------------------------

type Demographics = Awaited<
  ReturnType<NonNullable<ReturnType<typeof demographicsQuery>["queryFn"]>>
>;

export function matching(
  search: string,
  list: { value: string; label: string }[],
) {
  const needle = search.trim().toLocaleLowerCase();
  return list.filter((option) =>
    option.label.toLocaleLowerCase().includes(needle),
  );
}

interface DemographicsSheetProps {
  studentId: string;
  data: Demographics;
  open: boolean;
  onClose: () => void;
}

function DemographicsSheet({
  studentId,
  data,
  open,
  onClose,
}: DemographicsSheetProps) {
  const refresh = useRefresh(studentId);
  const options = useSuspenseQuery(peopleOptionsQuery).data;
  const religions = options.religions;
  const [birthCountry, setBirthCountry] = useState(data.birthCountryCode ?? "");
  const [birthCity, setBirthCity] = useState(data.birthCity ?? "");
  const [nationalities, setNationalities] = useState(data.nationalityCodes);
  const [religionId, setReligionId] = useState(data.religionId ?? "");
  const [languages, setLanguages] = useState(data.homeLanguages);
  const [countrySearch, setCountrySearch] = useState("");
  const [nationalitySearch, setNationalitySearch] = useState("");
  const [languageSearch, setLanguageSearch] = useState("");
  const countries = COUNTRY_CODES.map((code) => ({
    value: code,
    label: countryName(code),
  })).toSorted((a, b) => a.label.localeCompare(b.label));
  const languageOptions = LANGUAGE_CODES.map((code) => ({
    value: code,
    label: languageName(code),
  }));
  const mutation = useMutation({
    mutationFn: () =>
      saveDemographics({
        data: {
          userId: studentId,
          expectedVersion: data.version,
          birthCountryCode: birthCountry,
          birthCity,
          nationalityCodes: nationalities,
          religionId,
          homeLanguages: languages,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.demographicsEdit()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.managementSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <ComboboxField
        label={m.demographicsNationality()}
        hint={m.demographicsNationalityHint()}
        optional
        multiple
        options={matching(nationalitySearch, countries)}
        value={nationalities}
        onChange={(next) => setNationalities(next.slice(0, 4))}
        search={nationalitySearch}
        onSearchChange={setNationalitySearch}
      />
      <ComboboxField
        label={m.demographicsBirthCountry()}
        optional
        clearable
        options={matching(countrySearch, countries)}
        value={birthCountry ? [birthCountry] : []}
        onChange={(next) => setBirthCountry(next[0] ?? "")}
        search={countrySearch}
        onSearchChange={setCountrySearch}
      />
      <TextField
        id="demographics-city"
        label={m.demographicsBirthCity()}
        optional
        width="name"
        maxLength={100}
        autoComplete="off"
        value={birthCity}
        onChange={(event) => setBirthCity(event.target.value)}
      />
      <SelectField
        id="demographics-religion"
        label={m.demographicsReligion()}
        optional
        value={religionId || "none"}
        options={[
          ...religions.map((row) => ({
            value: row.id,
            label: labelOf(row) ?? row.code,
          })),
          { value: "none", label: m.commonNotRecorded() },
        ]}
        onChange={(value) => setReligionId(value === "none" ? "" : value)}
        width="name"
      />
      <ComboboxField
        label={m.demographicsLanguages()}
        optional
        multiple
        options={matching(languageSearch, languageOptions)}
        value={languages}
        onChange={(next) => setLanguages(next.slice(0, 6))}
        search={languageSearch}
        onSearchChange={setLanguageSearch}
      />
    </SheetForm>
  );
}

export interface DemographicsSectionProps {
  studentId: string;
}

export function DemographicsSection({ studentId }: DemographicsSectionProps) {
  const data = useSuspenseQuery(demographicsQuery(studentId)).data;
  const options = useSuspenseQuery(peopleOptionsQuery).data;
  const [sheet, setSheet] = useState({ open: false, key: 0 });
  const religion = options.religions.find((row) => row.id === data.religionId);
  return (
    <>
      <RecordSection
        title={m.demographicsTitle()}
        description={m.demographicsHint()}
        edit={
          data.canWrite
            ? {
                label: m.demographicsEdit(),
                onClick: () =>
                  setSheet((current) => ({ open: true, key: current.key + 1 })),
              }
            : undefined
        }
      >
        <Facts>
          <Fact label={m.demographicsNationality()}>
            {data.nationalityCodes.length
              ? formatList(data.nationalityCodes.map(countryName))
              : null}
          </Fact>
          <Fact label={m.demographicsBirthplace()}>
            {data.birthCountryCode || data.birthCity
              ? [
                  data.birthCity,
                  data.birthCountryCode
                    ? countryName(data.birthCountryCode)
                    : null,
                ]
                  .filter(Boolean)
                  .join(m.listComma())
              : null}
          </Fact>
          <Fact label={m.demographicsReligion()}>
            {religion ? labelOf(religion) : null}
          </Fact>
          <Fact label={m.demographicsLanguages()}>
            {data.homeLanguages.length
              ? formatList(data.homeLanguages.map(languageName))
              : null}
          </Fact>
        </Facts>
      </RecordSection>
      {data.canWrite ? (
        <DemographicsSheet
          key={sheet.key}
          studentId={studentId}
          data={data}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </>
  );
}

// --- access arrangements --------------------------------------------------------

type ArrangementsData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof arrangementsQuery>["queryFn"]>>
>;

const EXTRA_TIME_CHOICES = [
  "0",
  ...EXTRA_TIMES.filter((value) => value > 0).map(String),
  "unlimited",
];

function extraTimeLabel(value: string) {
  if (value === "unlimited") return m.arrangementsUnlimited();
  if (value === "0") return m.arrangementsNone();
  return m.arrangementsExtraPercent({ percent: formatNumber(Number(value)) });
}

const extraTimeOf = (arrangements: Arrangements) =>
  arrangements.unlimitedTime ? "unlimited" : String(arrangements.extraTime);

const EXTENSION_CHOICES = Array.from(
  { length: MAX_EXTENSION_DAYS + 1 },
  (_, days) => String(days),
);

const yesOrNo = (on: boolean) => (on ? m.commonYes() : m.commonNo());

const extensionLabel = (days: number) =>
  days === 0
    ? m.arrangementsNone()
    : m.arrangementsExtensionDays({ count: days });

interface ArrangementsSheetProps {
  studentId: string;
  data: ArrangementsData;
  open: boolean;
  onClose: () => void;
}

function ArrangementsSheet({
  studentId,
  data,
  open,
  onClose,
}: ArrangementsSheetProps) {
  const refresh = useRefresh(studentId);
  const [value, setValue] = useState(data.arrangements);
  const mutation = useMutation({
    mutationFn: () =>
      saveArrangements({
        data: {
          studentId,
          expectedVersion: data.version,
          arrangements: value,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.arrangementsEdit()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.managementSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <SelectField
        id="arrangements-extra-time"
        label={m.arrangementsExtraTime()}
        hint={m.arrangementsExtraTimeHint()}
        value={extraTimeOf(value)}
        options={EXTRA_TIME_CHOICES.map((choice) => ({
          value: choice,
          label: extraTimeLabel(choice),
        }))}
        onChange={(choice) =>
          setValue({
            ...value,
            unlimitedTime: choice === "unlimited",
            extraTime: EXTRA_TIMES.find((time) => String(time) === choice) ?? 0,
          })
        }
        width="name"
      />
      <SelectField
        id="arrangements-extension"
        label={m.arrangementsExtension()}
        hint={m.arrangementsExtensionHint()}
        value={String(value.extensionDays)}
        options={EXTENSION_CHOICES.map((choice) => ({
          value: choice,
          label: extensionLabel(Number(choice)),
        }))}
        onChange={(choice) =>
          setValue({ ...value, extensionDays: Number(choice) })
        }
        width="name"
      />
      <CheckboxRow
        label={m.arrangementsReadAloud()}
        hint={m.arrangementsReadAloudHint()}
        checked={value.readAloud}
        onChange={(readAloud) => setValue({ ...value, readAloud })}
      />
      <CheckboxRow
        label={m.arrangementsFewerChoices()}
        hint={m.arrangementsFewerChoicesHint()}
        checked={value.fewerChoices}
        onChange={(fewerChoices) => setValue({ ...value, fewerChoices })}
      />
      <CheckboxRow
        label={m.arrangementsRestBreaks()}
        hint={m.arrangementsRestBreaksHint()}
        checked={value.restBreaks}
        onChange={(restBreaks) => setValue({ ...value, restBreaks })}
      />
    </SheetForm>
  );
}

export interface ArrangementsSectionProps {
  studentId: string;
}

/** A student's access arrangements, which their quizzes and due dates apply. */
export function ArrangementsSection({ studentId }: ArrangementsSectionProps) {
  const data = useSuspenseQuery(arrangementsQuery(studentId)).data;
  const [sheet, setSheet] = useState({ open: false, key: 0 });
  const value = data.arrangements;
  return (
    <>
      <RecordSection
        title={m.arrangementsTitle()}
        description={m.arrangementsHint()}
        edit={
          data.canWrite
            ? {
                label: m.arrangementsEdit(),
                onClick: () =>
                  setSheet((current) => ({ open: true, key: current.key + 1 })),
              }
            : undefined
        }
      >
        {hasArrangements(value) ? (
          <Facts>
            <Fact label={m.arrangementsExtraTime()}>
              {extraTimeLabel(extraTimeOf(value))}
            </Fact>
            <Fact label={m.arrangementsExtension()}>
              {extensionLabel(value.extensionDays)}
            </Fact>
            <Fact label={m.arrangementsReadAloud()}>
              {yesOrNo(value.readAloud)}
            </Fact>
            <Fact label={m.arrangementsFewerChoices()}>
              {yesOrNo(value.fewerChoices)}
            </Fact>
            <Fact label={m.arrangementsRestBreaks()}>
              {yesOrNo(value.restBreaks)}
            </Fact>
          </Facts>
        ) : (
          <RecordEmpty>{m.arrangementsEmpty()}</RecordEmpty>
        )}
      </RecordSection>
      {data.canWrite ? (
        <ArrangementsSheet
          key={sheet.key}
          studentId={studentId}
          data={data}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </>
  );
}

// --- custody --------------------------------------------------------------------

type Custody = Awaited<
  ReturnType<NonNullable<ReturnType<typeof custodyQuery>["queryFn"]>>
>;
type CustodyLink = Custody["links"][number];

const RIGHTS_LABEL: Record<CustodyLink["educationalRights"], () => string> = {
  full: m.custodyRightsFull,
  restricted: m.custodyRightsRestricted,
  none: m.custodyRightsNone,
};

const PICKUP_LABEL: Record<
  "allowed" | "not_allowed" | "ask_office",
  () => string
> = {
  allowed: m.custodyPickupAllowed,
  not_allowed: m.custodyPickupNotAllowed,
  ask_office: m.custodyPickupAskOffice,
};

interface CustodySheetProps {
  studentId: string;
  link: CustodyLink;
  open: boolean;
  onClose: () => void;
}

function CustodySheet({ studentId, link, open, onClose }: CustodySheetProps) {
  const refresh = useRefresh(studentId);
  const [rights, setRights] = useState(link.educationalRights);
  const [rightsError, setRightsError] = useState<string | null>(null);
  const [isolated, setIsolated] = useState(link.communicationIsolated);
  const [pickup, setPickup] = useState(link.pickup);
  const [restrictions, setRestrictions] = useState(
    link.contactRestrictions ?? "",
  );
  const [order, setOrder] = useState<FileSummary[]>(
    link.courtOrder
      ? [
          {
            id: link.courtOrder.fileId,
            name: link.courtOrder.name,
            mediaType: link.courtOrder.mediaType,
            sizeBytes: link.courtOrder.sizeBytes,
          },
        ]
      : [],
  );
  const mutation = useMutation({
    mutationFn: async () => {
      await saveCustody({
        data: {
          studentId,
          relationshipId: link.relationshipId,
          expectedVersion: link.version,
          contactRestrictions: restrictions,
          educationalRights: rights,
          communicationIsolated: isolated,
          pickup,
        },
      });
      const kept = order[0];
      if (kept?.id === (link.courtOrder?.fileId ?? undefined)) return;
      const which = { studentId, relationshipId: link.relationshipId };
      await (kept
        ? attachCourtOrder({
            data: { ...which, order: { fileId: kept.id, name: kept.name } },
          })
        : removeCourtOrder({ data: which }));
    },
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.custodyEditFor({ name: displayName(link) })}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        const refused = linkRefusal(link.relationMeaning, {
          portalAccess: link.portalAccess,
          educationalRights: rights,
          accessBasis: link.accessBasis,
        });
        const said = refused ? getMessageFromError({ message: refused }) : null;
        setRightsError(said);
        if (said) return;
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.managementSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <SelectField
        id="custody-pickup"
        label={m.guardianPickup()}
        value={pickup ?? "unknown"}
        options={[
          { value: "allowed", label: m.guardianPickupAllowed() },
          { value: "not_allowed", label: m.guardianPickupNotAllowed() },
          { value: "ask_office", label: m.guardianPickupAskOffice() },
          { value: "unknown", label: m.commonNotRecorded() },
        ]}
        onChange={(value) =>
          setPickup(
            value === "allowed" ||
              value === "not_allowed" ||
              value === "ask_office"
              ? value
              : null,
          )
        }
        width="name"
      />
      <SelectField
        id="custody-rights"
        label={m.custodyRights()}
        hint={m.custodyRightsHint()}
        value={rights}
        options={[
          { value: "full", label: m.custodyRightsFull() },
          { value: "restricted", label: m.custodyRightsRestricted() },
          { value: "none", label: m.custodyRightsNone() },
        ]}
        onChange={(value) => {
          setRightsError(null);
          setRights(
            value === "restricted" || value === "none" ? value : "full",
          );
        }}
        errors={rightsError ? [rightsError] : undefined}
        width="name"
      />
      <CheckboxRow
        label={m.custodyIsolated()}
        hint={m.custodyIsolatedHint()}
        checked={isolated}
        onChange={setIsolated}
      />
      <TextField
        id="custody-restrictions"
        label={m.custodyRestrictions()}
        hint={m.custodyRestrictionsHint()}
        optional
        width="full"
        maxLength={250}
        autoComplete="off"
        value={restrictions}
        onChange={(event) => setRestrictions(event.target.value)}
      />
      <FileField
        id="custody-order"
        label={m.custodyOrder()}
        hint={m.custodyOrderHint()}
        purpose="legal_document"
        value={order}
        onChange={setOrder}
        maxFiles={1}
        maxBytes={MAX_FILE_BYTES}
        optional
      />
    </SheetForm>
  );
}

export interface CustodySectionProps {
  studentId: string;
}

export function CustodySection({ studentId }: CustodySectionProps) {
  const data = useSuspenseQuery(custodyQuery(studentId)).data;
  const [sheet, setSheet] = useState<{
    value: CustodyLink | null;
    open: boolean;
    key: number;
  }>({
    value: null,
    open: false,
    key: 0,
  });
  return (
    <>
      <RecordSection title={m.custodyTitle()} description={m.custodyHint()}>
        {data.links.length === 0 ? (
          <RecordEmpty>{m.studentNoGuardians()}</RecordEmpty>
        ) : (
          <RecordList>
            {data.links.map((link) => {
              const flagged =
                link.pickup === "not_allowed" ||
                link.educationalRights !== "full" ||
                link.communicationIsolated;
              return (
                <li
                  key={link.relationshipId}
                  className="flex items-start gap-3 py-3"
                >
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span dir="auto" className="text-sm leading-5 font-medium">
                      {displayName(link)}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 text-[13px] leading-[18px]">
                      <StatusText tone={flagged ? "warning" : "neutral"}>
                        {link.pickup
                          ? PICKUP_LABEL[link.pickup]()
                          : m.custodyPickupUnknown()}
                      </StatusText>
                      <span className="text-muted-foreground">
                        {RIGHTS_LABEL[link.educationalRights]()}
                      </span>
                      {link.communicationIsolated ? (
                        <span className="text-muted-foreground">
                          {m.custodyIsolatedShort()}
                        </span>
                      ) : null}
                    </span>
                    {link.contactRestrictions ? (
                      <span className="text-sm leading-5">
                        <bdi>{link.contactRestrictions}</bdi>
                      </span>
                    ) : null}
                    {link.courtOrder ? (
                      <div className="mt-1.5">
                        <FileList
                          files={[
                            {
                              id: link.courtOrder.fileId,
                              name: link.courtOrder.name,
                              mediaType: link.courtOrder.mediaType,
                              sizeBytes: link.courtOrder.sizeBytes,
                            },
                          ]}
                        />
                      </div>
                    ) : null}
                  </div>
                  {data.canWrite ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="max-md:h-10"
                      aria-label={m.custodyEditFor({ name: displayName(link) })}
                      onClick={() => openSheet(setSheet, link)}
                    >
                      <Pencil aria-hidden />
                      {m.recordEdit()}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </RecordList>
        )}
      </RecordSection>
      {data.canWrite && sheet.value ? (
        <CustodySheet
          key={sheet.key}
          studentId={studentId}
          link={sheet.value}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </>
  );
}
