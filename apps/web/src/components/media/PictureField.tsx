import { mediaTypeFor } from "@faridalms/domain/file";
import { Button } from "@faridalms/ui/button";
import { FileDropZone, UploadQueue } from "@faridalms/ui/system/upload-queue";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, UsersRound, X } from "lucide-react";
import { useRef } from "react";

import { uploadDocumentFile, useDocumentMedia } from "~/hooks/useDocumentMedia";
import { useUploadQueue } from "~/hooks/useUploadQueue";
import * as m from "~/i18n/messages";
import { initiateUpload } from "~/server/files";

import { ChooseFromMedia } from "./ChooseFromMedia";

export interface PictureFieldProps {
  fileId: string | null;
  label: string;
  onChange: (fileId: string | null) => void;
  /** Names who the picture shows, where that decides where it may go. */
  onPeople?: (fileId: string) => void;
  /** Offers the school's media beside the upload, where the record shows the file where it is. */
  fromMedia?: boolean;
}

/**
 * Uploads a picture as document media and shows what is chosen. A picture
 * may be dropped on the field or pasted into it, and one a reload cut off
 * is picked up when the field opens again.
 */
export function PictureField({
  fileId,
  label,
  onChange,
  onPeople,
  fromMedia = false,
}: PictureFieldProps) {
  const media = useDocumentMedia();
  const initiate = useServerFn(initiateUpload);
  const input = useRef<HTMLInputElement>(null);
  const queue = useUploadQueue({
    scope:
      typeof window === "undefined"
        ? null
        : `picture:${window.location.pathname}:${label}`,
    upload: (file, options, keeping) =>
      uploadDocumentFile(
        initiate,
        file,
        undefined,
        options,
        "document_media",
        keeping,
      ),
    place: (uploaded) => {
      onChange(uploaded.fileId);
      return Promise.resolve();
    },
    precheck: (file) =>
      media.accept.image.includes(file.type || mediaTypeFor(file.name) || "")
        ? null
        : "file.content_mismatch",
  });
  // A field holds one picture: the last one given is the one it keeps.
  const take = (files: File[]) => {
    const last = files.at(-1);
    if (last) queue.add([last]);
  };
  return (
    <FileDropZone
      onFiles={take}
      label={m.siteDropPicture({ label })}
      disabled={queue.busy}
      className="grid gap-2 rounded-lg"
    >
      <div className="flex flex-wrap items-center gap-3">
        {fileId ? (
          <img
            src={`/files/${fileId}`}
            alt=""
            className="h-16 w-24 rounded-md border object-cover"
          />
        ) : null}
        <input
          ref={input}
          type="file"
          accept={media.accept.image.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            take([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          disabled={queue.busy}
          onClick={() => input.current?.click()}
        >
          <ImagePlus aria-hidden />
          {fileId
            ? m.siteReplacePicture({ label })
            : m.siteChoosePicture({ label })}
        </Button>
        <ChooseFromMedia
          media={fromMedia ? media.school : undefined}
          kind="image"
          size="default"
          onChoose={(chosen) => onChange(chosen.fileId)}
        />
        {fileId && onPeople ? (
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => onPeople(fileId)}
          >
            <UsersRound aria-hidden />
            {m.editorPicturePeople()}
          </Button>
        ) : null}
        {fileId ? (
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-10"
            onClick={() => onChange(null)}
          >
            <X aria-hidden />
            {m.siteRemovePicture()}
          </Button>
        ) : null}
      </div>
      <UploadQueue
        label={m.filesUploading()}
        items={queue.items}
        onCancel={queue.cancel}
        onRetry={queue.retry}
        onDismiss={queue.dismiss}
      />
    </FileDropZone>
  );
}
