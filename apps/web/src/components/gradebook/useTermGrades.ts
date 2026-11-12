import type { GridIssue } from "@faridalms/ui/system/data-grid";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { displayName } from "~/components/people/format";
import { useAutosave } from "~/hooks/useAutosave";
import * as m from "~/i18n/messages";
import { releasePeriodGrades, savePeriodGrades } from "~/server/gradebook";

import type { Book, TermDraft } from "./book";

import {
  calculatedScore,
  NO_DRAFT,
  savedGradeOf,
  TERM_MAXIMUM,
  termCellId,
} from "./book";

type Drafts = Record<string, TermDraft>;

function storedDrafts(book: Book): Drafts {
  return Object.fromEntries(
    book.students.map((student) => {
      const grade = savedGradeOf(book, student.id);
      return [
        student.id,
        { score: grade?.score ?? null, comment: grade?.comment ?? "" },
      ];
    }),
  );
}

const fits = (row: TermDraft) =>
  row.score === null || row.score <= TERM_MAXIMUM;

/** What the server keeps of a row: it trims a comment. */
const kept = (row: TermDraft): TermDraft => ({
  score: row.score,
  comment: row.comment.trim(),
});

const same = (a: TermDraft, b: TermDraft) =>
  a.score === b.score && a.comment === b.comment;

export function termIssues(book: Book, drafts: Drafts): GridIssue[] {
  return book.students.flatMap((student) =>
    fits(drafts[student.id] ?? NO_DRAFT)
      ? []
      : [
          {
            target: termCellId(student.id),
            message: m.gradebookScoreTooHigh({ name: displayName(student) }),
          },
        ],
  );
}

/**
 * A class's term grades and comments as typed, saved as they are typed: a
 * row is sent once it changes and holds a grade the server takes, so a
 * grade over the maximum waits, marked, while every other row still saves.
 * Releasing saves what is waiting first.
 */
export function useTermGrades(book: Book, editable: boolean) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Drafts>(() => storedDrafts(book));
  const stored = useRef<Drafts>(storedDrafts(book));
  const classId = book.class.id;
  const periodId = book.term?.periodId ?? "";
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["gradebook"] }),
    [queryClient],
  );
  const save = useCallback(
    async (next: Drafts) => {
      const changed = Object.entries(next).flatMap(([studentId, row]) => {
        const want = kept(row);
        return fits(want) && !same(want, stored.current[studentId] ?? NO_DRAFT)
          ? [{ studentId, ...want }]
          : [];
      });
      if (changed.length === 0) return;
      await savePeriodGrades({
        data: { classId, periodId, grades: changed },
      });
      for (const { studentId, score, comment } of changed)
        stored.current[studentId] = { score, comment };
      await refresh();
    },
    [classId, periodId, refresh],
  );
  const autosave = useAutosave({
    value: drafts,
    save,
    enabled: editable,
    delay: 800,
  });
  const release = useMutation({
    mutationFn: () => releasePeriodGrades({ data: { classId, periodId } }),
  });
  const issues = editable ? termIssues(book, drafts) : [];
  const setRow = useCallback(
    (studentId: string, change: Partial<TermDraft>) =>
      setDrafts((current) => ({
        ...current,
        [studentId]: { ...(current[studentId] ?? NO_DRAFT), ...change },
      })),
    [],
  );
  const applyCalculated = () =>
    setDrafts((current) =>
      Object.fromEntries(
        book.students.map((student) => {
          const row = current[student.id] ?? NO_DRAFT;
          const score = calculatedScore(book, student.id);
          return [student.id, score === null ? row : { ...row, score }];
        }),
      ),
    );
  /** Saves what is waiting, then releases; throws where either fails. */
  const releaseAll = async () => {
    if (!(await autosave.saveNow())) throw new Error(m.docSaveFailed());
    const result = await release.mutateAsync();
    await refresh();
    return result.released;
  };
  return {
    drafts,
    rowOf: (studentId: string) => drafts[studentId] ?? NO_DRAFT,
    setRow,
    applyCalculated,
    issues,
    autosave,
    releaseAll,
    /** Typed but not saved: waiting, saving, failed or refused. */
    unsaved: () => autosave.busy() || issues.length > 0,
  };
}

export type TermGrades = ReturnType<typeof useTermGrades>;
