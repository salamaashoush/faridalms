import type { EditorMedia, EditorStudio } from "@faridalms/editor";
import type { ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";

import * as m from "~/i18n/messages";
import { studioQuery } from "~/queries/studio";

import { CodingStudio, PROJECT_TYPE } from "./CodingStudio";

/**
 * The studio an editor opens to build a coding question's starter project,
 * saved through the document's own media. Absent where the cell has no
 * studio or the editor cannot store files, which keeps coding questions
 * out of its menus.
 */
export function useEditorStudio(media: EditorMedia | undefined): {
  studio: EditorStudio | undefined;
  dialog: ReactNode;
} {
  const configured = Boolean(useQuery(studioQuery).data);
  const [open, setOpen] = useState<{
    fileId: string | null;
    resolve: (fileId: string | null | undefined) => void;
  } | null>(null);
  const kept = useRef<string | undefined>(undefined);
  const studio = useMemo<EditorStudio | undefined>(
    () =>
      configured && media
        ? {
            edit: (fileId) =>
              new Promise((resolve) => {
                kept.current = undefined;
                setOpen({ fileId, resolve });
              }),
          }
        : undefined,
    [configured, media],
  );
  return {
    studio,
    dialog:
      open && media ? (
        <CodingStudio
          projectUrl={open.fileId ? media.url(open.fileId) : null}
          mode="editor"
          title={m.studioStarterTitle()}
          onSave={async (project) => {
            const uploaded = await media.upload(
              new File([project], "starter.sb3", { type: PROJECT_TYPE }),
              "file",
            );
            kept.current = uploaded.fileId;
          }}
          onClose={() => {
            open.resolve(kept.current);
            setOpen(null);
          }}
        />
      ) : null,
  };
}
