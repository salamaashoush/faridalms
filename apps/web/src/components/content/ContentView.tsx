import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { MediaWatch } from "@faridalms/editor/player";
import type { ContentMark } from "@faridalms/editor/view";
import type { ReactNode } from "react";

import { ContentRenderer } from "@faridalms/editor/view";

import { RunnableCode } from "~/components/coding/RunnableCode";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

import { aiUseStrings, fileStrings } from "./strings";

export function ContentView({
  document,
  fileUrl,
  className,
  marks,
  activeMark,
  renderBlock,
  watch,
  predicted,
  runs = true,
}: {
  document: ContentDocument;
  fileUrl?: (fileId: string) => string;
  className?: string;
  marks?: ContentMark[];
  activeMark?: string | null;
  renderBlock?: (node: ContentNode, drawn: ReactNode) => ReactNode;
  watch?: (fileId: string) => MediaWatch | undefined;
  /**
   * Whether the question above this part of a lesson is answered, which a
   * code block waiting for a prediction needs before it runs.
   */
  predicted?: boolean;
  /** Whether code blocks marked to run do; on paper they are only code. */
  runs?: boolean;
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
      renderBlock={renderBlock}
      watch={watch}
      runnable={runs ? RunnableCode : undefined}
      predicted={predicted}
    />
  );
}
