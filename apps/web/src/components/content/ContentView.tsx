import type {
  ContentDocument,
  ContentNode,
  Mention,
} from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { MediaWatch } from "@faridalms/editor/player";
import type { ContentMark, Replace } from "@faridalms/editor/view";
import type { ReactNode } from "react";

import { partsNotesBefore, partsSources } from "@faridalms/domain/bibliography";
import { partsTerms } from "@faridalms/domain/glossary";
import { ContentRenderer, WholeDocumentProvider } from "@faridalms/editor/view";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { Locale } from "~/i18n/runtime";

import { RunnableCode } from "~/components/coding/RunnableCode";
import { ReadAloud } from "~/components/learning/ReadAloud";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { sharedBlockQuery } from "~/queries/shared";
import { digits } from "~/utils/digits";

import { useLtiHref } from "./lti";
import { useMentionNames } from "./mentions";
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

/** A defined word read aloud by the browser's voice, where it speaks the word's language. */
const termSpeaker = (text: string) => (
  <ReadAloud text={text} className="size-8 [&_svg]:size-4" />
);

/**
 * Where a mention opens. A person's opens nothing, as not every reader may
 * see a person's page; anything else opens its own page, which says so if
 * the reader may not.
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
    case "news":
      return `/news/${mention.id}`;
    case "announcement":
      return `/announcements/${mention.id}`;
    case "event":
      return `/calendar/${mention.id}`;
    default:
      return null;
  }
}

/**
 * A document handed out in parts, as a lesson's blocks are: each part drawn
 * inside it lists the whole document's terms in its glossary and sources in
 * its bibliography, numbers its footnotes on from the parts before, and
 * reads in the language its author set.
 */
export function WholeDocument({
  parts,
  lang,
  children,
}: {
  parts: readonly { type: string; content?: ContentDocument }[];
  lang?: ContentLocale | null;
  children: ReactNode;
}) {
  const whole = useMemo(
    () => ({
      terms: partsTerms(parts),
      lang: lang ?? undefined,
      notesBefore: partsNotesBefore(parts),
      sources: partsSources(parts),
    }),
    [parts, lang],
  );
  return (
    <WholeDocumentProvider value={whole}>{children}</WholeDocumentProvider>
  );
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
  lang,
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
  /** The language the document is written in; without it, read from its words. */
  lang?: ContentLocale;
}) {
  const ltiHref = useLtiHref();
  const mentionName = useMentionNames(document);
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
        glossary: m.editorGlossary({}, { locale }),
        referencesApa: m.editorReferencesApa({}, { locale }),
        referencesMla: m.editorReferencesMla({}, { locale }),
        referencesChicago: m.editorReferencesChicago({}, { locale }),
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
        ltiOpen: m.ltiOpen({}, { locale }),
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
      mentionName={mentionName}
      speaker={termSpeaker}
      digits={digits()}
      ltiHref={ltiHref}
      lang={lang}
    />
  );
}
