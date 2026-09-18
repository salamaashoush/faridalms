import { Link } from "@tanstack/react-router";

import { SubjectIcon } from "~/components/app/labels";
import { Value } from "~/components/app/primitives";
import { subjectLabel } from "~/components/family/format";

/** Subject and class under a record title, with the class linked to its own page. */
export function RecordContext({
  subject,
  schoolClass,
}: {
  subject: { name: string; nameAr?: string; icon: string } | null;
  schoolClass: { id: string; name: string } | null;
}) {
  return (
    <p className="-mt-6 mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {subject ? <SubjectIcon icon={subject.icon} /> : null}
      <Value>{subjectLabel(subject)}</Value>
      <span aria-hidden>·</span>
      {schoolClass ? (
        <Link
          to="/classes/$classId"
          params={{ classId: schoolClass.id }}
          search={{}}
          className="font-medium text-foreground hover:text-primary hover:underline"
        >
          {schoolClass.name}
        </Link>
      ) : (
        <Value>{null}</Value>
      )}
    </p>
  );
}
