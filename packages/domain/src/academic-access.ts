export type AssessmentScope =
  | { kind: "school" }
  | { kind: "teacher"; userId: string }
  | { kind: "none" };

export function canAssessOffering(
  scope: AssessmentScope,
  teacherId: string | null,
): boolean {
  return (
    scope.kind === "school" ||
    (scope.kind === "teacher" && scope.userId === teacherId)
  );
}
