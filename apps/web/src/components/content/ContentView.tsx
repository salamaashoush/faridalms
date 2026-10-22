import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { MediaWatch } from "@faridalms/editor/player";
import type { ContentMark, Replace } from "@faridalms/editor/view";
import type { ReactNode } from "react";

import { ContentRenderer } from "@faridalms/editor/view";

import type { Locale } from "~/i18n/runtime";

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
  replace,
  locale = getLocale(),
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
  replace?: Replace;
  /** The language of the document's own labels, when not the reader's. */
  locale?: Locale;
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
        checklist: m.editorCheckItem({}, { locale }),
        studentCopy: m.editorStudentCopy({}, { locale }),
        diagram: m.editorDiagram({}, { locale }),
        embedLoad: (provider) => m.editorEmbedLoad({ provider }),
        embedPrivacy: (provider) => m.editorEmbedPrivacy({ provider }),
        embedOpen: (provider) => m.editorEmbedOpen({ provider }),
        drawTitle: m.editorDrawTitle({}, { locale }),
        drawSummary: (count, tag) =>
          m.editorDrawSummary({ count, tag }, { locale }),
        drawPointsEach: (points) =>
          m.editorDrawPointsEach({ count: points }, { locale }),
        drawNoTag: m.editorDrawNoTag({}, { locale }),
        standardsBlock: m.editorStandardsBlock({}, { locale }),
        cardTurn: m.editorCardTurn({}, { locale }),
        cardTurnBack: m.editorCardTurnBack({}, { locale }),
        pictureLabel: (number) =>
          m.editorPictureLabel({ number: String(number) }, { locale }),
        pictureLabelClose: m.editorPictureLabelClose({}, { locale }),
        compareBefore: m.editorCompareBefore({}, { locale }),
        compareAfter: m.editorCompareAfter({}, { locale }),
        compareSlider: m.editorCompareSlider({}, { locale }),
      }}
      fileUrl={fileUrl}
      locale={locale}
      className={className}
      marks={marks}
      activeMark={activeMark}
      renderBlock={renderBlock}
      replace={replace}
      watch={watch}
      runnable={runs ? RunnableCode : undefined}
      predicted={predicted}
    />
  );
}
