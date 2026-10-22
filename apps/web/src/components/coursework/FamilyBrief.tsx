import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@faridalms/ui/sheet";
import { useQuery } from "@tanstack/react-query";

import { classTitle } from "~/components/classes/format";
import { ContentView } from "~/components/content/ContentView";
import { RecordEmpty } from "~/components/system/RecordPage";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { childBriefQuery } from "~/queries/coursework";

import { useBriefLanguage } from "./BriefLanguage";
import { formatInstant } from "./format";

const fileUrl = (fileId: string) => `/files/${fileId}`;

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof childBriefQuery>["queryFn"]>>
>;

function Read({ data }: { data: Data }) {
  const user = useCurrentUser();
  const reading = useBriefLanguage({
    title: data.assignment.title,
    brief: data.brief,
    language: data.assignment.language,
    translation: data.translation,
  });
  const facts = [
    data.assignment.class ? classTitle(data.assignment.class) : null,
    data.assignment.dueAt
      ? m.courseworkDueOn({
          date: formatInstant(data.assignment.dueAt, user.school.timeZone),
        })
      : null,
  ].filter(Boolean);
  return (
    <>
      <SheetHeader className="gap-1 border-b px-5 py-3.5 pe-14">
        <SheetTitle className="text-base leading-6 font-semibold">
          <bdi>{reading.title}</bdi>
        </SheetTitle>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {facts.join(" · ")}
        </p>
      </SheetHeader>
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 py-5">
        {reading.switcher}
        {reading.brief ? (
          <div lang={reading.lang} dir={reading.dir}>
            <ContentView document={reading.brief} fileUrl={fileUrl} />
          </div>
        ) : (
          <RecordEmpty>{m.courseworkNoBrief()}</RecordEmpty>
        )}
      </div>
    </>
  );
}

/** A piece of a child's work as their family reads it, in either language of its brief. */
export function FamilyBrief({
  studentId,
  assignmentId,
  title,
  onClose,
}: {
  studentId: string;
  assignmentId: string;
  /** Its title as the list gave it, while the brief is on its way. */
  title: string;
  onClose: () => void;
}) {
  const brief = useQuery(childBriefQuery(studentId, assignmentId));
  const end = getTextDirection(getLocale()) === "rtl" ? "left" : "right";
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={end}
        className="gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[640px] data-[side=right]:sm:max-w-[640px]"
      >
        {brief.data ? (
          <Read data={brief.data} />
        ) : (
          <SheetHeader className="border-b px-5 py-3.5 pe-14" aria-busy="true">
            <SheetTitle className="text-base leading-6 font-semibold">
              <bdi>{title}</bdi>
            </SheetTitle>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}
