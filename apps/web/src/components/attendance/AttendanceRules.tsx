import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";

import { TextField } from "~/components/system/field";
import { SettingsSection } from "~/components/system/SettingsSection";
import * as m from "~/i18n/messages";
import { attendanceSettingsQuery } from "~/queries/attendance";
import { saveAttendanceSettings } from "~/server/attendance";
import { getMessageFromError } from "~/utils/error";

interface Draft {
  teacherEditDays: string;
  noticeDelayMinutes: string;
  chronicPercent: string;
}

const LIMITS: Record<keyof Draft, [number, number]> = {
  teacherEditDays: [0, 60],
  noticeDelayMinutes: [0, 1440],
  chronicPercent: [1, 50],
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
  const settings = useSuspenseQuery(attendanceSettingsQuery).data;
  const [initial, setInitial] = useState<Draft>(() => ({
    teacherEditDays: String(settings.teacherEditDays),
    noticeDelayMinutes: String(settings.noticeDelayMinutes),
    chronicPercent: String(settings.chronicPercent),
  }));
  const [draft, setDraft] = useState(initial);
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
        },
      }),
    meta: { inlineError: true },
  });
  const issues = {
    teacherEditDays: issueOf("teacherEditDays", draft.teacherEditDays),
    noticeDelayMinutes: issueOf("noticeDelayMinutes", draft.noticeDelayMinutes),
    chronicPercent: issueOf("chronicPercent", draft.chronicPercent),
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
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
        label={m.attRuleNoticeDelay()}
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
    </SettingsSection>
  );
}
