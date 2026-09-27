import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { formatDate } from "~/components/family/format";
import { ActionMenu } from "~/components/system/ActionMenu";
import { ComboboxField } from "~/components/system/ComboboxField";
import { SelectField, TextField } from "~/components/system/field";
import {
  Fact,
  Facts,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import { StatusBadge, StatusText } from "~/components/system/status";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import {
  custodyQuery,
  demographicsQuery,
  healthQuery,
} from "~/queries/records";
import { peopleOptionsQuery } from "~/queries/students";
import {
  removeHealth,
  saveCustody,
  saveDemographics,
  saveHealth,
} from "~/server/records";
import { formatList } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

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

const SEVERITY_LABEL: Record<"mild" | "moderate" | "severe", () => string> = {
  mild: m.healthSeverityMild,
  moderate: m.healthSeverityModerate,
  severe: m.healthSeveritySevere,
};

function HealthSheet({
  studentId,
  kinds,
  record,
  open,
  onClose,
}: {
  studentId: string;
  kinds: Health["kinds"];
  record: HealthRecord | null;
  open: boolean;
  onClose: () => void;
}) {
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

export function HealthSection({ studentId }: { studentId: string }) {
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
    </>
  );
}

// --- demographics ---------------------------------------------------------------

type Demographics = Awaited<
  ReturnType<NonNullable<ReturnType<typeof demographicsQuery>["queryFn"]>>
>;

function matching(search: string, list: { value: string; label: string }[]) {
  const needle = search.trim().toLocaleLowerCase();
  return list.filter((option) =>
    option.label.toLocaleLowerCase().includes(needle),
  );
}

function DemographicsSheet({
  studentId,
  data,
  open,
  onClose,
}: {
  studentId: string;
  data: Demographics;
  open: boolean;
  onClose: () => void;
}) {
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

export function DemographicsSection({ studentId }: { studentId: string }) {
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

function CustodySheet({
  studentId,
  link,
  open,
  onClose,
}: {
  studentId: string;
  link: CustodyLink;
  open: boolean;
  onClose: () => void;
}) {
  const refresh = useRefresh(studentId);
  const [rights, setRights] = useState(link.educationalRights);
  const [isolated, setIsolated] = useState(link.communicationIsolated);
  const [pickup, setPickup] = useState(link.pickup);
  const [restrictions, setRestrictions] = useState(
    link.contactRestrictions ?? "",
  );
  const mutation = useMutation({
    mutationFn: () =>
      saveCustody({
        data: {
          studentId,
          relationshipId: link.relationshipId,
          expectedVersion: link.version,
          contactRestrictions: restrictions,
          educationalRights: rights,
          communicationIsolated: isolated,
          pickup,
        },
      }),
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
        onChange={(value) =>
          setRights(value === "restricted" || value === "none" ? value : "full")
        }
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
    </SheetForm>
  );
}

export function CustodySection({ studentId }: { studentId: string }) {
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
