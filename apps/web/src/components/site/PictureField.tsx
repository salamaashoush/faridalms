import { Button } from "@faridalms/ui/button";
import { ImagePlus, UsersRound, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";

/** Uploads a picture as document media and shows what is chosen. */
export function PictureField({
  fileId,
  label,
  onChange,
  onPeople,
}: {
  fileId: string | null;
  label: string;
  onChange: (fileId: string | null) => void;
  /** Names who the picture shows, where that decides where it may go. */
  onPeople?: (fileId: string) => void;
}) {
  const media = useDocumentMedia();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await media.upload(file, "image");
      onChange(uploaded.fileId);
    } catch {
      toast.error(m.siteUploadFailed());
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
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
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        className="max-md:h-10"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <ImagePlus aria-hidden />
        {fileId
          ? m.siteReplacePicture({ label })
          : m.siteChoosePicture({ label })}
      </Button>
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
  );
}
