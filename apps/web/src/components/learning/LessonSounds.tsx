import { RecordSection } from "@faridalms/ui/system/record-page";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { ClassRecordSectionProps } from "~/components/classes/slots";

import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { classSoundsQuery } from "~/queries/learning";
import { changeClassSounds } from "~/server/learning";

/**
 * Whether lessons tick and chime as a young class's children answer. A room
 * of tablets is loud; words still play, since children who cannot read need
 * them.
 */
export function LessonSoundsSection({
  classId,
  young,
  keeps,
}: ClassRecordSectionProps) {
  const queryClient = useQueryClient();
  const shown = young && keeps;
  const sounds = useQuery({ ...classSoundsQuery(classId), enabled: shown });
  const change = useServerFn(changeClassSounds);
  const save = useMutation({
    mutationFn: (on: boolean) => change({ data: { classId, on } }),
    onSuccess: (result) =>
      queryClient.setQueryData(classSoundsQuery(classId).queryKey, result),
  });
  if (!shown || !sounds.data) return null;
  return (
    <RecordSection title={m.classesLessons()}>
      <CheckboxRow
        label={m.classesLessonSounds()}
        hint={m.classesLessonSoundsHint()}
        checked={save.isPending ? save.variables : sounds.data.on}
        onChange={(on) => save.mutate(on)}
      />
    </RecordSection>
  );
}
