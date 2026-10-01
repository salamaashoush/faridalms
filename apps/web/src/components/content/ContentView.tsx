import type { ContentDocument } from "@faridalms/domain/content";

import { ContentRenderer } from "@faridalms/editor/view";

import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

export function ContentView({
  document,
  fileUrl,
  className,
}: {
  document: ContentDocument;
  fileUrl?: (fileId: string) => string;
  className?: string;
}) {
  return (
    <ContentRenderer
      document={document}
      strings={{
        checklist: m.editorCheckItem(),
        downloadFile: m.editorDownloadFile(),
        openFile: m.fileOpen(),
        picture: m.filePicture(),
        copyFileLink: m.fileCopyLink(),
        fileLinkCopied: m.fileLinkCopied(),
        closeViewer: m.fileCloseViewer(),
        noPreview: m.fileNoPreview(),
        captions: m.editorCaptions(),
        diagram: m.editorDiagram(),
        embedLoad: (provider) => m.editorEmbedLoad({ provider }),
        embedPrivacy: (provider) => m.editorEmbedPrivacy({ provider }),
        embedOpen: (provider) => m.editorEmbedOpen({ provider }),
      }}
      fileUrl={fileUrl}
      locale={getLocale()}
      className={className}
    />
  );
}
