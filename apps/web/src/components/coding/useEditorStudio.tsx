import type { ProjectFile, ProjectLanguage } from "@faridalms/domain/project";
import type { EditorMedia, EditorStudio } from "@faridalms/editor";
import type { ReactNode } from "react";

import { emptyProject, emptyPythonProject } from "@faridalms/domain/project";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";

import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { playQuery } from "~/queries/play";

import { CodingStudio, PROJECT_TYPE } from "./CodingStudio";
import { WebProjectStudio } from "./WebProjectStudio";

/**
 * The studios an editor opens to build a question's starter project: the
 * coding studio, saved through the document's own media, and the web
 * studio, whose files the question keeps itself. Absent where the cell has
 * no studio or the editor cannot store files, which keeps these questions
 * out of its menus.
 */
export function useEditorStudio(media: EditorMedia | undefined): {
  studio: EditorStudio | undefined;
  dialog: ReactNode;
} {
  const configured = Boolean(useQuery(playQuery).data);
  const [open, setOpen] = useState<{
    fileId: string | null;
    resolve: (fileId: string | null | undefined) => void;
  } | null>(null);
  const [writing, setWriting] = useState<{
    files: readonly ProjectFile[];
    language: ProjectLanguage;
    resolve: (files: ProjectFile[]) => void;
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
            editFiles: (files, language) =>
              new Promise((resolve) => {
                setWriting({ files, language, resolve });
              }),
          }
        : undefined,
    [configured, media],
  );
  const locale = getLocale();
  return {
    studio,
    dialog: (
      <>
        {open && media ? (
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
        ) : null}
        {writing ? (
          <WebProjectStudio
            title={m.studioStarterTitle()}
            files={
              writing.files.length > 0
                ? writing.files
                : writing.language === "python"
                  ? emptyPythonProject()
                  : emptyProject(locale, getTextDirection(locale) === "rtl")
            }
            onClose={(files) => {
              writing.resolve(files);
              setWriting(null);
            }}
          />
        ) : null}
      </>
    ),
  };
}
