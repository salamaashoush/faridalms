import type { ClassWebsite } from "@faridalms/domain/site-classes";

import {
  MAX_CLASS_DESCRIPTION,
  MAX_CLASS_LEVEL,
  MAX_CLASS_TITLE,
} from "@faridalms/domain/site-classes";
import { Button } from "@faridalms/ui/button";
import { FormField, TextField } from "@faridalms/ui/system/form-field";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import type { ClassRecordSectionProps } from "~/components/classes/slots";
import type { getClassWebsite } from "~/server/site";

import { PictureField } from "~/components/media/PictureField";
import { CheckboxRow } from "~/components/people/fields";
import { useCapability } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classWebsiteQuery } from "~/queries/site";
import { saveClassWebsite } from "~/server/site";
import { getMessageFromError } from "~/utils/error";

type Form = Omit<ClassWebsite, "classId" | "expectedVersion">;

type Read = Awaited<ReturnType<typeof getClassWebsite>>;

const formOf = (read: Read): Form => ({
  shown: read.shown,
  titleEn: read.titleEn,
  titleAr: read.titleAr,
  descriptionEn: read.descriptionEn,
  descriptionAr: read.descriptionAr,
  levelEn: read.levelEn,
  levelAr: read.levelAr,
  pictureFileId: read.pictureFileId,
  pictureAltEn: read.pictureAltEn,
  pictureAltAr: read.pictureAltAr,
});

const field = (name: string) => `class-website-${name}`;

/**
 * Whether a class is on the school's website and what a visitor reads of
 * it, for whoever keeps the school's classes or its website. A class is
 * never on the site until the school says so.
 */
export function ClassWebsiteSection({ classId }: ClassRecordSectionProps) {
  const keepsClasses = useCapability("classes:manage");
  const keepsSite = useCapability("site:manage");
  const shown = keepsClasses || keepsSite;
  const read = useQuery({ ...classWebsiteQuery(classId), enabled: shown });
  if (!shown || !read.data) return null;
  return (
    <ClassWebsiteForm
      key={read.data.version}
      classId={classId}
      read={read.data}
    />
  );
}

interface ClassWebsiteFormProps {
  classId: string;
  read: Read;
}

function ClassWebsiteForm({ classId, read }: ClassWebsiteFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(() => formOf(read));
  const save = useServerFn(saveClassWebsite);
  const saving = useMutation({
    mutationFn: () =>
      save({
        data: { ...form, classId, expectedVersion: read.version },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: classWebsiteQuery(classId).queryKey,
      });
      toast.success(m.classWebsiteSaved());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const set = (change: Partial<Form>) =>
    setForm((before) => ({ ...before, ...change }));
  return (
    <RecordSection
      title={m.classWebsiteTitle()}
      description={m.classWebsiteHint()}
    >
      <div className="grid gap-4">
        <CheckboxRow
          label={m.classWebsiteShown()}
          hint={read.live ? undefined : m.classWebsiteNotLive()}
          checked={form.shown}
          onChange={(on) => set({ shown: on })}
        />
        {form.shown ? (
          <>
            <TextField
              id={field("title-en")}
              label={m.classWebsitePublicTitleEn()}
              hint={m.classWebsitePublicTitleHint()}
              lang="en"
              dir="ltr"
              maxLength={MAX_CLASS_TITLE}
              placeholder={read.classTitleEn ?? read.classTitleAr ?? ""}
              value={form.titleEn}
              onChange={(event) => set({ titleEn: event.target.value })}
            />
            <TextField
              id={field("title-ar")}
              label={m.classWebsitePublicTitleAr()}
              lang="ar"
              dir="rtl"
              maxLength={MAX_CLASS_TITLE}
              placeholder={read.classTitleAr ?? read.classTitleEn ?? ""}
              value={form.titleAr}
              onChange={(event) => set({ titleAr: event.target.value })}
            />
            <FormField
              id={field("description-en")}
              label={m.classWebsiteDescriptionEn()}
            >
              {(control) => (
                <Textarea
                  {...control}
                  lang="en"
                  dir="ltr"
                  rows={3}
                  maxLength={MAX_CLASS_DESCRIPTION}
                  value={form.descriptionEn}
                  onChange={(event) =>
                    set({ descriptionEn: event.target.value })
                  }
                />
              )}
            </FormField>
            <FormField
              id={field("description-ar")}
              label={m.classWebsiteDescriptionAr()}
            >
              {(control) => (
                <Textarea
                  {...control}
                  lang="ar"
                  dir="rtl"
                  rows={3}
                  maxLength={MAX_CLASS_DESCRIPTION}
                  value={form.descriptionAr}
                  onChange={(event) =>
                    set({ descriptionAr: event.target.value })
                  }
                />
              )}
            </FormField>
            <TextField
              id={field("level-en")}
              label={m.classWebsiteLevelEn()}
              hint={m.classWebsiteLevelHint()}
              optional
              lang="en"
              dir="ltr"
              maxLength={MAX_CLASS_LEVEL}
              value={form.levelEn}
              onChange={(event) => set({ levelEn: event.target.value })}
            />
            <TextField
              id={field("level-ar")}
              label={m.classWebsiteLevelAr()}
              optional
              lang="ar"
              dir="rtl"
              maxLength={MAX_CLASS_LEVEL}
              value={form.levelAr}
              onChange={(event) => set({ levelAr: event.target.value })}
            />
            <PictureField
              fileId={form.pictureFileId}
              label={m.classWebsitePicture()}
              fromMedia
              onChange={(fileId) => set({ pictureFileId: fileId })}
            />
            {form.pictureFileId ? (
              <>
                <TextField
                  id={field("alt-en")}
                  label={m.classWebsitePictureAltEn()}
                  lang="en"
                  dir="ltr"
                  maxLength={300}
                  value={form.pictureAltEn}
                  onChange={(event) =>
                    set({ pictureAltEn: event.target.value })
                  }
                />
                <TextField
                  id={field("alt-ar")}
                  label={m.classWebsitePictureAltAr()}
                  lang="ar"
                  dir="rtl"
                  maxLength={300}
                  value={form.pictureAltAr}
                  onChange={(event) =>
                    set({ pictureAltAr: event.target.value })
                  }
                />
              </>
            ) : null}
          </>
        ) : null}
        <Button
          type="button"
          className="justify-self-start max-md:h-10"
          disabled={saving.isPending}
          onClick={() => saving.mutate()}
        >
          {m.classWebsiteSave()}
        </Button>
      </div>
    </RecordSection>
  );
}
