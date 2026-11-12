import { Button } from "@faridalms/ui/button";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { studentCourseworkQuery } from "~/queries/coursework";

import { StudentReading } from "../reading/StudentReading";
import { TO_DO, WorkSection } from "./LearnerList";
import { studentWorkSections } from "./slots";

export interface StudentCourseworkProps {
  studentId: string;
}

/** A student's work and term results on their record: what is missing first. */
export function StudentCoursework({ studentId }: StudentCourseworkProps) {
  const { rows } = useSuspenseQuery(studentCourseworkQuery(studentId)).data;
  const props = { linked: false };
  const sections = useSlot(studentWorkSections);
  return (
    <div className="grid gap-6">
      <Button
        type="button"
        variant="outline"
        className="w-fit max-md:h-10"
        onClick={() => window.location.assign(`/exports/students/${studentId}`)}
      >
        <Download aria-hidden />
        {m.courseworkDownloadPortfolio()}
      </Button>
      <WorkSection
        title={m.courseworkFamilyMissing()}
        items={rows.filter((row) => row.state === "missing")}
        empty={m.courseworkNothingMissing()}
        {...props}
      />
      <WorkSection
        title={m.courseworkRecordToDo()}
        items={rows.filter((row) => TO_DO.includes(row.state))}
        empty={m.courseworkRecordNothingToDo()}
        {...props}
      />
      <WorkSection
        title={m.courseworkRecordHandedIn()}
        items={rows.filter(
          (row) => row.state === "handed_in" || row.state === "handed_in_late",
        )}
        empty={m.courseworkRecordNothingHandedIn()}
        {...props}
      />
      <WorkSection
        title={m.courseworkRecordReturned()}
        items={rows.filter((row) => row.state === "returned")}
        empty={m.courseworkNothingReturned()}
        {...props}
      />
      {sections.map(({ key, Section }) => (
        <Section key={key} studentId={studentId} />
      ))}
      <StudentReading studentId={studentId} />
    </div>
  );
}
