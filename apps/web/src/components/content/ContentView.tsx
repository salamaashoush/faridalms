import type {
  ContentDocument,
  ContentNode,
  Mention,
} from "@faridalms/domain/content";
import type { MediaWatch } from "@faridalms/editor/player";
import type { ContentMark, Replace } from "@faridalms/editor/view";
import type { ReactNode } from "react";

import { ContentRenderer } from "@faridalms/editor/view";
import { useQuery } from "@tanstack/react-query";

import type { Locale } from "~/i18n/runtime";

import { RunnableCode } from "~/components/coding/RunnableCode";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { sharedBlockQuery } from "~/queries/shared";

import { aiUseStrings, fileStrings } from "./strings";

/**
 * A shared block as part of the page, drawn as it now is: whoever reads the
 * document reads it, and a change to it shows the next time it is read.
 */
export function SharedBlock({ id }: { id: string }) {
  const block = useQuery(sharedBlockQuery(id));
  if (block.isPending) return <div aria-busy="true" className="min-h-12" />;
  if (!block.data)
    return <p className="text-sm text-muted-foreground">{m.sharedGone()}</p>;
  return <ContentView document={block.data.content} />;
}

/**
 * Where a mention opens. A person's opens nothing, as not every reader may
 * see a person's page; a class, module, lesson or assignment opens its own,
 * which says so if the reader may not.
 */
function mentionHref(mention: Mention): string | null {
  switch (mention.kind) {
    case "class":
      return `/classes/${mention.id}`;
    case "module":
      return `/modules/${mention.id}`;
    case "lesson":
      return `/lessons/${mention.id}`;
    case "assignment":
      return `/assignments/${mention.id}`;
    default:
      return null;
  }
}

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
        footnotes: m.editorFootnotes({}, { locale }),
        footnoteRef: (number) =>
          m.editorFootnoteRef({ number: String(number) }, { locale }),
        footnoteBack: (number) =>
          m.editorFootnoteBack({ number: String(number) }, { locale }),
        cardTurn: m.editorCardTurn({}, { locale }),
        cardTurnBack: m.editorCardTurnBack({}, { locale }),
        pictureLabel: (number) =>
          m.editorPictureLabel({ number: String(number) }, { locale }),
        pictureLabelClose: m.editorPictureLabelClose({}, { locale }),
        compareBefore: m.editorCompareBefore({}, { locale }),
        compareAfter: m.editorCompareAfter({}, { locale }),
        compareSlider: m.editorCompareSlider({}, { locale }),
        chartData: m.editorChartData({}, { locale }),
        chartSeries: m.editorChartSeries({}, { locale }),
        chartCategory: m.editorChartCategory({}, { locale }),
        chartOther: m.editorChartOther({}, { locale }),
        chartEmpty: m.editorChartEmpty({}, { locale }),
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
      shared={SharedBlock}
      mentionHref={mentionHref}
    />
  );
}
