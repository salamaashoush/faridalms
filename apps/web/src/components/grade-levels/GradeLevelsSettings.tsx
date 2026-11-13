import type { Column, RowAction } from "@faridalms/ui/system/data-table";

import { Button } from "@faridalms/ui/button";
import { DataTable } from "@faridalms/ui/system/data-table";
import { TextField } from "@faridalms/ui/system/form-field";
import { SettingsPage } from "@faridalms/ui/system/settings-section";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GraduationCap, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { gradeSettingsQuery } from "~/queries/grade-levels";
import {
  orderGradeLevels,
  retireGradeLevel,
  saveGradeLevel,
} from "~/server/grade-levels";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

import type { GradeWords } from "./words";

import { GradeTermSection } from "./GradeTermSection";
import { useGradeWords } from "./words";

type Settings = Awaited<
  ReturnType<NonNullable<(typeof gradeSettingsQuery)["queryFn"]>>
>;
type Level = Settings["rows"][number];

type Editing = { kind: "new" } | { kind: "rename"; level: Level } | null;

// Built per render: headers read the request's locale.
function levelColumns(words: GradeWords): Column<Level>[] {
  return [
    {
      id: "name",
      header: words.name(),
      primary: true,
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-x-3">
          <span>{inLocale(row.labelEn, row.labelAr) || row.code}</span>
          {row.retired ? (
            <StatusText tone="neutral">{words.retired()}</StatusText>
          ) : null}
        </span>
      ),
    },
    {
      id: "classes",
      header: m.gradeLevelsClasses(),
      className: "text-end",
      cell: (row) => (
        <span className="tabular-nums">{formatNumber(row.classes)}</span>
      ),
    },
    {
      id: "students",
      header: m.gradeLevelsStudents(),
      className: "text-end",
      cell: (row) => (
        <span className="tabular-nums">{formatNumber(row.students)}</span>
      ),
    },
  ];
}

/** The school's grades or levels: their names, their order, and those it stopped using. */
export function GradeLevelsSettings() {
  const inWords = useWords();
  const { rows } = useSuspenseQuery(gradeSettingsQuery).data;
  const words = useGradeWords();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Editing>(null);
  const [key, setKey] = useState(0);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["grade-levels"] });
  const open = (next: Editing) => {
    setKey((value) => value + 1);
    setEditing(next);
  };
  const move = async (level: Level, by: -1 | 1) => {
    const ids = rows.map((row) => row.id);
    const at = ids.indexOf(level.id);
    const other = ids[at + by];
    if (other === undefined) return;
    ids[at + by] = level.id;
    ids[at] = other;
    await orderGradeLevels({ data: { ids } });
    await refresh();
  };
  const rowActions = (row: Level): RowAction[] => [
    {
      label: m.gradeLevelsRename(),
      icon: Pencil,
      onSelect: () => open({ kind: "rename", level: row }),
    },
    {
      label: m.gradeLevelsMoveUp(),
      icon: ArrowUp,
      onSelect: () => move(row, -1),
    },
    {
      label: m.gradeLevelsMoveDown(),
      icon: ArrowDown,
      onSelect: () => move(row, 1),
    },
    ...(row.retired
      ? []
      : [
          {
            label: m.gradeLevelsRetire(),
            destructive: true as const,
            confirm: {
              title: m.gradeLevelsRetireTitle({
                name: inLocale(row.labelEn, row.labelAr) || row.code,
              }),
              body: words.retireBody(),
              label: m.gradeLevelsRetire(),
            },
            onSelect: async () => {
              await retireGradeLevel({ data: { id: row.id } }).then(
                async () => {
                  await refresh();
                  toast.success(m.managementSaved());
                },
                (error: unknown) => {
                  toast.error(getMessageFromError(error, inWords));
                },
              );
            },
          },
        ]),
  ];
  return (
    <SettingsPage>
      <GradeTermSection />
      <DataTable
        caption={words.caption()}
        rows={rows}
        columns={levelColumns(words)}
        rowLabel={(row) => inLocale(row.labelEn, row.labelAr) || row.code}
        rowActions={rowActions}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => open({ kind: "new" })}
          >
            <Plus aria-hidden />
            {words.add()}
          </Button>
        }
        card={{
          title: (row) => inLocale(row.labelEn, row.labelAr) || row.code,
          fact: (row) =>
            m.gradeLevelsCounts({
              classes: row.classes,
              students: row.students,
            }),
        }}
        empty={{
          icon: GraduationCap,
          title: words.emptyTitle(),
          description: m.gradeLevelsEmptyBody(),
          action: (
            <Button type="button" onClick={() => open({ kind: "new" })}>
              <Plus aria-hidden />
              {words.add()}
            </Button>
          ),
        }}
      />
      {editing ? (
        <LevelSheet
          key={key}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
          words={words}
        />
      ) : null}
    </SettingsPage>
  );
}

interface LevelSheetProps {
  editing: NonNullable<Editing>;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  words: GradeWords;
}

/** Adds a grade or level of the school's own, or renames one. */
function LevelSheet({ editing, onClose, onSaved, words }: LevelSheetProps) {
  const inWords = useWords();
  const level = editing.kind === "rename" ? editing.level : null;
  const [labelEn, setLabelEn] = useState(level?.labelEn ?? "");
  const [labelAr, setLabelAr] = useState(level?.labelAr ?? "");
  const [code, setCode] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      saveGradeLevel({
        data: level
          ? {
              id: level.id,
              labelEn,
              labelAr,
              expected: {
                labelEn: level.labelEn ?? "",
                labelAr: level.labelAr ?? "",
              },
            }
          : { code, labelEn, labelAr },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={level ? m.gradeLevelsRename() : words.add()}
      pending={mutation.isPending}
      error={
        mutation.error ? getMessageFromError(mutation.error, inWords) : null
      }
      onSubmit={async () => {
        await mutation.mutateAsync().then(
          async () => {
            await onSaved();
            toast.success(m.managementSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <TextField
        id="grade-level-name-ar"
        label={m.gradeLevelsNameArabic()}
        dir="rtl"
        width="name"
        maxLength={75}
        value={labelAr}
        onChange={(event) => setLabelAr(event.target.value)}
      />
      <TextField
        id="grade-level-name-en"
        label={m.gradeLevelsNameEnglish()}
        dir="ltr"
        width="name"
        maxLength={75}
        value={labelEn}
        onChange={(event) => setLabelEn(event.target.value)}
      />
      {level ? null : (
        <TextField
          id="grade-level-code"
          label={m.gradeLevelsCode()}
          hint={m.gradeLevelsCodeHint()}
          dir="ltr"
          width="reference"
          maxLength={40}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      )}
    </SheetForm>
  );
}
