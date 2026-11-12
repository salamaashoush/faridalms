import type { MarkedStudioAnswerProps } from "~/components/questions/slots";

import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";

import { ProjectAnswer } from "./ProjectAnswer";
import { ProjectChecks, ProjectNotes } from "./ProjectChecks";
import { classGalleries } from "./slots";
import { WebProjectView } from "./WebProjectView";

/** A project answer as its teacher reads it, with its offer to the class gallery where it has one. */
export function MarkedProject({
  question,
  answer,
  name,
  remixOf,
}: MarkedStudioAnswerProps) {
  const gallery = useSlot(classGalleries)[0];
  const remix = answer.remixOf ? (
    <p className="text-[13px] leading-[18px] text-muted-foreground">
      {remixOf
        ? m.galleryRemixOf({ name: remixOf })
        : m.galleryRemixOfSomeone()}
    </p>
  ) : null;
  const offer =
    gallery && question.gallery ? (
      <gallery.Offer answer={answer} name={name} />
    ) : null;
  if (answer.files)
    return (
      <div className="grid gap-2">
        {remix}
        <WebProjectView files={answer.files} title={name} />
        {offer}
      </div>
    );
  if (!answer.project) return null;
  return (
    <div className="grid gap-2">
      {remix}
      <ProjectAnswer
        project={answer.project.fileId}
        stage={answer.thumbnail?.fileId ?? null}
        name={name}
      />
      <ProjectChecks asked={question.checks} has={answer.has} />
      <ProjectNotes notes={answer.notes} />
      {offer}
    </div>
  );
}
