import { getClassRecord } from "~/server/classes";
import {
  getGradeOptions,
  getGradeSettings,
  getStudentGrades,
} from "~/server/grade-levels";

export type GradeOptions = Awaited<ReturnType<typeof getGradeOptions>>;
export type StudentGrades = Awaited<ReturnType<typeof getStudentGrades>>;

export const gradeOptionsQuery = {
  queryKey: ["grade-levels", "options"],
  queryFn: () => getGradeOptions(),
};

export const studentGradesQuery = (studentId: string) => ({
  queryKey: ["grade-levels", "student", studentId],
  queryFn: () => getStudentGrades({ data: { studentId } }),
});

export const gradeSettingsQuery = {
  queryKey: ["grade-levels", "settings"],
  queryFn: () => getGradeSettings(),
};

/** What the class form reads for a class's grade: the school's grades and the class's own. */
export const classGradePartQuery = (classId: string | null) => ({
  queryKey: ["grade-levels", "class", classId ?? ""],
  queryFn: async () => ({
    options: await getGradeOptions(),
    gradeId: classId
      ? ((await getClassRecord({ data: { id: classId, on: "" } })).columns
          .grade ?? "")
      : "",
  }),
});
