import { TextField } from "@faridalms/ui/system/form-field";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";

import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { attendanceSettingsQuery } from "~/queries/attendance";
import { saveAttendanceSettings } from "~/server/attendance";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

interface Draft {
  teacherEditDays: string;
  noticeDelayMinutes: string;
  chronicPercent: string;
  lateAfterMinutes: string;
  registerClosesMinutes: string;
}

const LIMITS: Record<keyof Draft, [number, number]> = {
  teacherEditDays: [0, 60],
  noticeDelayMinutes: [0, 1440],
  chronicPercent: [1, 50],
  lateAfterMinutes: [0, 60],
  registerClosesMinutes: [5, 240],
};

function issueOf(key: keyof Draft, value: string): string | null {
  const [low, high] = LIMITS[key];
  const number = Number(value);
  return value !== "" &&
    Number.isInteger(number) &&
    number >= low &&
    number <= high
    ? null
    : m.attRuleRange({ low, high });
}

/** The school's attendance rules: the teachers' edit window and thresholds. */
export function AttendanceRules() {
  const queryClient = useQueryClient();
  const words = useWords();
  const settings = useSuspenseQuery(attendanceSettingsQuery).data;
  const [initial, setInitial] = useState<Draft>(() => ({
    teacherEditDays: String(settings.teacherEditDays),
    noticeDelayMinutes: String(settings.noticeDelayMinutes),
    chronicPercent: String(settings.chronicPercent),
    lateAfterMinutes: String(settings.lateAfterMinutes),
    registerClosesMinutes: String(settings.registerClosesMinutes),
  }));
  const [draft, setDraft] = useState(initial);
  const [ways, setWays] = useState(() => ({
    checkInTouch: settings.checkInTouch,
    checkInQr: settings.checkInQr,
    checkInNfc: settings.checkInNfc,
    learnersReport: settings.learnersReport,
  }));
  const [savedWays, setSavedWays] = useState(ways);
  const [shown, setShown] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      saveAttendanceSettings({
        data: {
          expectedVersion: settings.version,
          teacherEditDays: Number(draft.teacherEditDays),
          noticeDelayMinutes: Number(draft.noticeDelayMinutes),
          chronicPercent: Number(draft.chronicPercent),
          lateAfterMinutes: Number(draft.lateAfterMinutes),
          registerClosesMinutes: Number(draft.registerClosesMinutes),
          ...ways,
        },
      }),
    meta: { inlineError: true },
  });
  const issues = {
    teacherEditDays: issueOf("teacherEditDays", draft.teacherEditDays),
    noticeDelayMinutes: issueOf("noticeDelayMinutes", draft.noticeDelayMinutes),
    chronicPercent: issueOf("chronicPercent", draft.chronicPercent),
    lateAfterMinutes: issueOf("lateAfterMinutes", draft.lateAfterMinutes),
    registerClosesMinutes:
      issueOf("registerClosesMinutes", draft.registerClosesMinutes) ??
      (Number(draft.registerClosesMinutes) <= Number(draft.lateAfterMinutes)
        ? m.attRuleClosesAfterLate()
        : null),
  };
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) ||
    JSON.stringify(ways) !== JSON.stringify(savedWays);
  const turn = (key: keyof typeof ways, on: boolean) => {
    setSaved(false);
    setWays((current) => ({ ...current, [key]: on }));
  };
  const set = (key: keyof Draft, value: string) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value.trim() }));
  };
  const errorsOf = (key: keyof Draft) =>
    shown && issues[key] ? [issues[key]] : undefined;
  return (
    <SettingsSection
      title={m.attRulesTitle()}
      description={m.attRulesHint()}
      onSubmit={async () => {
        setShown(true);
        if (Object.values(issues).some(Boolean)) return;
        await save.mutateAsync().then(
          async () => {
            await queryClient.invalidateQueries({ queryKey: ["attendance"] });
            setInitial(draft);
            setSavedWays(ways);
            setSaved(true);
          },
          () => undefined,
        );
      }}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      saved={saved && !dirty}
      isDirty={() => dirty}
    >
      <TextField
        id="attendance-edit-days"
        label={m.attRuleEditDays()}
        hint={m.attRuleEditDaysHint()}
        inputMode="numeric"
        width="score"
        value={draft.teacherEditDays}
        onChange={(event) => set("teacherEditDays", event.target.value)}
        errors={errorsOf("teacherEditDays")}
      />
      <TextField
        id="attendance-notice-delay"
        label={words(m.attRuleNoticeDelayCore)()}
        hint={m.attRuleNoticeDelayHint()}
        inputMode="numeric"
        width="score"
        value={draft.noticeDelayMinutes}
        onChange={(event) => set("noticeDelayMinutes", event.target.value)}
        errors={errorsOf("noticeDelayMinutes")}
      />
      <TextField
        id="attendance-chronic"
        label={m.attRuleChronic()}
        hint={m.attRuleChronicHint()}
        inputMode="numeric"
        width="score"
        value={draft.chronicPercent}
        onChange={(event) => set("chronicPercent", event.target.value)}
        errors={errorsOf("chronicPercent")}
      />
      <TextField
        id="attendance-late-after"
        label={m.attRuleLateAfter()}
        hint={words(m.attRuleLateAfterHintCore)()}
        inputMode="numeric"
        width="score"
        value={draft.lateAfterMinutes}
        onChange={(event) => set("lateAfterMinutes", event.target.value)}
        errors={errorsOf("lateAfterMinutes")}
      />
      <TextField
        id="attendance-closes"
        label={m.attRuleCloses()}
        hint={m.attRuleClosesHint()}
        inputMode="numeric"
        width="score"
        value={draft.registerClosesMinutes}
        onChange={(event) => set("registerClosesMinutes", event.target.value)}
        errors={errorsOf("registerClosesMinutes")}
      />
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm leading-5 font-medium">
          {m.attCheckInTitle()}
        </legend>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.attCheckInHint()}
        </p>
        <CheckboxRow
          label={m.attCheckInTouch()}
          hint={m.attCheckInTouchHint()}
          checked={ways.checkInTouch}
          onChange={(on) => turn("checkInTouch", on)}
        />
        <CheckboxRow
          label={m.attCheckInQr()}
          hint={m.attCheckInQrHint()}
          checked={ways.checkInQr}
          onChange={(on) => turn("checkInQr", on)}
        />
        <CheckboxRow
          label={m.attCheckInNfc()}
          hint={m.attCheckInNfcHint()}
          checked={ways.checkInNfc}
          onChange={(on) => turn("checkInNfc", on)}
        />
      </fieldset>
      <CheckboxRow
        label={m.attLearnersReport()}
        hint={words(m.attLearnersReportHintCore)()}
        checked={ways.learnersReport}
        onChange={(on) => turn("learnersReport", on)}
      />
    </SettingsSection>
  );
}
