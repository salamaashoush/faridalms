import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentMark } from "@faridalms/editor/view";

import { ContentRenderer } from "@faridalms/editor/view";

import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

import { aiUseStrings, fileStrings } from "./strings";

export function ContentView({
  document,
  fileUrl,
  className,
  marks,
  activeMark,
}: {
  document: ContentDocument;
  fileUrl?: (fileId: string) => string;
  className?: string;
  marks?: ContentMark[];
  activeMark?: string | null;
}) {
  return (
    <ContentRenderer
      document={document}
      strings={{
        ...fileStrings(),
        ...aiUseStrings(),
        checklist: m.editorCheckItem(),
        studentCopy: m.editorStudentCopy(),
        diagram: m.editorDiagram(),
        embedLoad: (provider) => m.editorEmbedLoad({ provider }),
        embedPrivacy: (provider) => m.editorEmbedPrivacy({ provider }),
        embedOpen: (provider) => m.editorEmbedOpen({ provider }),
      }}
      fileUrl={fileUrl}
      locale={getLocale()}
      className={className}
      marks={marks}
      activeMark={activeMark}
    />
  );
}
