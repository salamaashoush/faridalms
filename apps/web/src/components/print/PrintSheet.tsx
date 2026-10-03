import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { LessonBlock } from "@faridalms/domain/learning";
import type { CSSProperties, ReactNode } from "react";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { contentPlainText, textDirection } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { questionBlock } from "@faridalms/domain/lesson-content";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@faridalms/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@faridalms/ui/tooltip";
import { Printer, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useId, useMemo, useRef, useState } from "react";

import type { Locale } from "~/i18n/runtime";

import { QrCode } from "~/components/badges/QrCode";
import { ContentView } from "~/components/content/ContentView";
import { CheckboxRow } from "~/components/people/fields";
import { PanelGroup, Segmented } from "~/components/system/panel";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useMedia } from "~/hooks/useMedia";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { formatNumber } from "~/utils/datetime";

import { keyOf, PaperQuestion } from "./PaperQuestion";

const fileUrl = (fileId: string) => `/files/${fileId}`;

/** Paper sizes in millimetres, upright. */
const PAPER = { A4: [210, 297], letter: [215.9, 279.4] } as const;
const MARGIN = 15;
/** The space between pages in the preview, in millimetres. */
const GAP = 8;
const PX_PER_MM = 96 / 25.4;
/** RNIB asks for 14 pt, and never under 12. */
const SIZES = ["12", "14", "16", "20"] as const;

type Paper = keyof typeof PAPER;
type Size = (typeof SIZES)[number];
type AnswerMode = "none" | "inline" | "key";

const EMPTY = emptyContent();
const NOT_QUESTIONS = new Set(["content", "media", "gate"]);

/** The document as paper reads it: every toggle open. */
function opened(node: ContentNode): ContentNode {
  return {
    ...node,
    ...(node.type === "toggle" ? { open: true } : {}),
    ...(node.children ? { children: node.children.map(opened) } : {}),
  };
}

function blank(node: ContentNode | undefined): boolean {
  return (
    node?.type === "paragraph" &&
    !contentPlainText({
      root: { type: "root", version: 1, children: [node] },
    }).trim()
  );
}

/**
 * The blocks as they go onto paper. A page break with nothing before it,
 * another right after it, or nothing after it would print an empty page, so
 * only breaks between content are kept; the empty lines around a break or
 * at the end would spill onto a page of their own, so they go too.
 */
function onPaper(content: ContentDocument): ContentDocument {
  const root = opened(content.root);
  const children: ContentNode[] = [];
  let pending = false;
  for (const node of root.children ?? []) {
    if (node.type === "pagebreak") {
      while (blank(children.at(-1))) children.pop();
      pending = children.length > 0;
      continue;
    }
    if (pending && !blank(node)) {
      children.push({ type: "pagebreak", version: 1 });
      pending = false;
    }
    if (!pending) children.push(node);
  }
  while (blank(children.at(-1))) children.pop();
  return { root: { ...root, children } };
}

/** Whether this browser can lay pages out itself, so the preview is exact. */
function canPaginate(): boolean {
  return typeof CSS !== "undefined" && CSS.supports("column-wrap", "wrap");
}

/**
 * A video or sound cannot play on paper: its caption stays, with a code that
 * opens it, the embed's own page or the document online.
 */
function OnlineOnly({
  label,
  online,
  locale,
}: {
  label: string | undefined;
  online: string | undefined;
  locale: Locale;
}) {
  return (
    <div className="paper-question my-2 flex items-center gap-4 rounded-[4px] border border-neutral-400 p-3">
      {online ? (
        <QrCode value={online} className="size-[2.5cm] shrink-0" />
      ) : null}
      <div className="grid gap-1">
        <p className="font-semibold" dir="auto">
          {label}
        </p>
        {online ? (
          <p className="text-[0.85em] text-neutral-600">
            {m.printScanToWatch({}, { locale })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** What a print shows of the person it is for, at the top of the paper. */
function PaperHeader({
  title,
  facts,
  school,
  logo,
  lines,
  name,
  note,
  locale,
}: {
  title: string;
  facts: readonly string[];
  school: string | null;
  logo: string | null;
  lines: boolean;
  name?: string;
  note?: string;
  locale: Locale;
}) {
  return (
    <header
      className={cn(
        "paper-header mb-[1.2em] grid gap-[0.6em]",
        !lines && "border-b border-neutral-400 pb-[0.8em]",
      )}
    >
      {school ? (
        <div className="flex items-center gap-3">
          {logo ? (
            <img
              src={fileUrl(logo)}
              alt=""
              className="max-h-[1.6cm] w-auto object-contain"
            />
          ) : null}
          <p className="text-[0.8em] text-neutral-600">{school}</p>
        </div>
      ) : null}
      <h1 dir="auto" className="text-[1.5em] leading-tight font-bold">
        {title}
      </h1>
      {facts.length > 0 ? (
        <p dir="auto" className="text-[0.85em] text-neutral-600">
          {facts.join(" · ")}
        </p>
      ) : null}
      {note ? (
        <p className="text-[0.85em] font-semibold text-neutral-600">{note}</p>
      ) : null}
      {lines ? (
        <div className="mt-[0.2em] grid grid-cols-[2fr_1fr_1fr] rounded-[4px] border border-neutral-400">
          {[
            m.printName({}, { locale }),
            m.printClass({}, { locale }),
            m.printDate({}, { locale }),
          ].map((label, index) => (
            <div
              key={label}
              className="grid min-h-[1.2cm] content-start gap-[0.1em] border-neutral-400 px-[0.6em] py-[0.3em] not-first:border-s"
            >
              <span className="text-[0.7em] leading-tight text-neutral-600">
                {label}
              </span>
              <span dir="auto" className="text-[0.95em] leading-snug">
                {index === 0 && name ? name : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </header>
  );
}

/**
 * The answers after the questions, numbered as the questions are: a letter,
 * a number or the words for each, and the picture itself where the answer
 * is a place on it.
 */
function AnswerKey({
  title,
  questions,
  rtl,
  locale,
}: {
  title: string;
  questions: { node: ContentNode; number: number }[];
  rtl: boolean;
  locale: Locale;
}) {
  return (
    <section className="grid gap-3">
      <h1 dir="auto" className="text-[1.5em] leading-tight font-bold">
        {m.printKeyTitle({ title }, { locale })}
      </h1>
      <ol className="grid gap-2">
        {questions.map(({ node, number }) => {
          const question = questionBlock(node);
          if (!question) return null;
          const answer = keyOf(question, rtl);
          if (question.type === "hotspot" || question.type === "parsons")
            return (
              <li key={number}>
                <PaperQuestion
                  block={question}
                  number={number}
                  answers
                  rtl={rtl}
                  fileUrl={fileUrl}
                />
              </li>
            );
          return (
            <li key={number} className="paper-question flex gap-2">
              <span className="font-semibold">{number}.</span>
              <span dir="auto">
                {answer ?? m.printKeyTeacher({}, { locale })}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * One copy as it prints, page by page. Where the browser can, the copy is
 * laid out as columns one page high that wrap onto new rows, so the preview
 * breaks exactly where the paper will; the frames behind it are the sheets,
 * and carry the footer that names a loose page. The copy is drawn smaller to
 * fit a narrow screen by scaling, which leaves its line breaks, and so its
 * page breaks, as they print.
 */
function PaperCopy({
  paged,
  page,
  gap,
  scale,
  dir,
  footer,
  children,
}: {
  paged: boolean;
  /** A page's height and the space between pages on screen, in pixels. */
  page: number;
  gap: number;
  scale: number;
  dir: "ltr" | "rtl";
  footer: (page: number, pages: number) => ReactNode;
  children: ReactNode;
}) {
  const [flow, setFlow] = useState(0);
  const measure = useCallback((element: HTMLDivElement | null) => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setFlow(entry.borderBoxSize[0]?.blockSize ?? 0);
    });
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const pages = paged
    ? Math.max(1, Math.round((flow + gap) / (page + gap)))
    : 1;
  const height = paged ? pages * page + (pages - 1) * gap : flow;
  return (
    <div
      className="paper-copy relative h-(--copy-height) w-(--copy-width) print:h-auto print:w-auto"
      style={
        {
          "--copy-width": `calc(var(--page-width) * ${scale})`,
          "--copy-height": `${height * scale}px`,
        } as CSSProperties
      }
    >
      <div
        className="paper absolute start-0 top-0 w-(--page-width) origin-top-left [transform:scale(var(--copy-scale))] rtl:origin-top-right print:static print:transform-none"
        style={{ "--copy-scale": scale } as CSSProperties}
      >
        {paged
          ? Array.from({ length: pages }, (_, index) => (
              <div
                key={index}
                dir={dir}
                aria-hidden
                className="paper-frame"
                style={{ "--page": index } as CSSProperties}
              >
                {pages > 1 ? (
                  <div className="paper-foot">{footer(index + 1, pages)}</div>
                ) : null}
              </div>
            ))
          : null}
        <div ref={measure} dir={dir} className="paper-flow">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * A print preview: the pages as they will print, beside the settings for
 * them, covering the app while open; only the pages print. Questions take
 * their paper form; a teacher may print the answers in place or as a key at
 * the end, and print one copy for each student with their name on it. The
 * paper keeps its own black on white, since a dark theme set by a class
 * would print dark, and its own words follow the document's language rather
 * than the reader's.
 */
export function PrintSheet({
  title,
  facts,
  content = EMPTY,
  lesson,
  answers: canAnswer = false,
  link,
  copies = [],
  onClose,
}: {
  title: string;
  /** What the paper says under the title, in the paper's language. */
  facts?: (locale: Locale) => readonly string[];
  content?: ContentDocument;
  /** A lesson as its student received it, printed in place of a document. */
  lesson?: readonly LessonBlock[];
  /** Whether this reader may print the answers, which only teachers hold. */
  answers?: boolean;
  /** The document's path in the app, for the codes on its media. */
  link?: string;
  /** The students a teacher may print a named copy for, one each. */
  copies?: readonly string[];
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const [paper, setPaper] = useState<Paper>("A4");
  const [landscape, setLandscape] = useState(false);
  const [size, setSize] = useState<Size>("14");
  // A newsletter or a letter home is read, not filled in, so only a paper
  // with questions on it starts with lines for the student's name.
  const [lines, setLines] = useState(
    () =>
      lesson !== undefined ||
      (content.root.children ?? []).some((node) => node.type === "question"),
  );
  const [school, setSchool] = useState(true);
  const [answers, setAnswers] = useState<AnswerMode>("none");
  const [named, setNamed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paged] = useState(canPaginate);
  const [room, setRoom] = useState(0);
  const print = useRef<HTMLButtonElement>(null);
  const settingsTitle = useRef<HTMLHeadingElement>(null);
  const answersId = useId();
  const wideScreen = useMedia("(min-width: 64rem)");
  const measure = useCallback((element: HTMLDivElement | null) => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRoom(entry.contentRect.width);
    });
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The paper takes the document's direction, then its title's, and only
  // the reader's when neither has words.
  const rtl =
    (textDirection(
      lesson
        ? lesson
            .map((item) =>
              item.type === "content"
                ? contentPlainText(item.content)
                : "prompt" in item
                  ? item.prompt
                  : "",
            )
            .join("\n")
        : contentPlainText(content),
    ) ??
      textDirection(title) ??
      getTextDirection(getLocale())) === "rtl";
  const dir = rtl ? "rtl" : "ltr";
  const locale: Locale = rtl ? "ar" : "en";
  const paperContent = useMemo(() => onPaper(content), [content]);
  const numbers = useMemo(() => {
    const found = new Map<ContentNode, number>();
    for (const node of paperContent.root.children ?? [])
      if (node.type === "question") found.set(node, found.size + 1);
    return found;
  }, [paperContent]);
  const [upright, across] = PAPER[paper];
  const [width, height] = landscape ? [across, upright] : [upright, across];
  const scale = room > 0 ? Math.min(1, room / (width * PX_PER_MM)) : 1;
  const schoolName = school
    ? rtl
      ? user.school.nameAr || user.school.nameEn
      : user.school.nameEn || user.school.nameAr
    : null;
  const logo = school ? user.school.logoFileId : null;
  const names = named && copies.length > 0 ? copies : [undefined];
  const online = link ? new URL(link, window.location.origin).href : undefined;
  const paperFacts = facts?.(locale) ?? [];
  const lessonNumbers = lesson
    ? new Map(
        lesson
          .filter((item) => !NOT_QUESTIONS.has(item.type))
          .map((item, index) => [item.id, index + 1]),
      )
    : null;
  const block = (node: ContentNode, drawn: ReactNode) => {
    if (node.type === "gate") return null;
    if (node.type === "question") {
      const question = questionBlock(node);
      return question ? (
        <PaperQuestion
          block={question}
          number={numbers.get(node) ?? 0}
          answers={answers === "inline"}
          rtl={rtl}
          fileUrl={fileUrl}
        />
      ) : null;
    }
    if (node.type === "media" || node.type === "embed")
      return (
        <OnlineOnly
          label={node.caption || node.title || node.name || node.provider}
          online={node.type === "embed" ? node.url : online}
          locale={locale}
        />
      );
    return drawn;
  };

  const body = lesson ? (
    <div className="fe fe-paper grid gap-2">
      {lesson.map((item) =>
        item.type === "content" ? (
          <ContentView
            key={item.id}
            document={{ root: opened(item.content.root) }}
            fileUrl={fileUrl}
            className="fe-paper"
            renderBlock={block}
          />
        ) : item.type === "media" ? (
          <OnlineOnly
            key={item.id}
            label={item.caption || item.name}
            online={online}
            locale={locale}
          />
        ) : item.type === "gate" ? null : (
          <PaperQuestion
            key={item.id}
            block={item}
            number={lessonNumbers?.get(item.id) ?? 0}
            answers={false}
            rtl={rtl}
            fileUrl={fileUrl}
          />
        ),
      )}
    </div>
  ) : (
    <ContentView
      document={paperContent}
      fileUrl={fileUrl}
      className="fe-paper"
      renderBlock={block}
    />
  );

  const footer =
    (label: string) =>
    (page: number, pages: number): ReactNode => (
      <>
        <span dir="auto" className="min-w-0 truncate">
          {label}
        </span>
        <span className="shrink-0">
          {m.printPageOf(
            {
              page: formatNumber(page),
              pages: formatNumber(pages),
            },
            { locale },
          )}
        </span>
      </>
    );
  const geometry = {
    "--page-width": `${width}mm`,
    "--page-height": `${height}mm`,
    "--page-margin": `${MARGIN}mm`,
    "--page-gap": `${GAP}mm`,
    "--paper-text": `${size}pt`,
  } as CSSProperties;
  const copiesCount = named ? copies.length : 0;
  const answerModes = [
    {
      value: "none",
      label: m.printAnswersNone(),
      hint: m.printAnswersNoneHint(),
    },
    {
      value: "inline",
      label: m.printAnswersInPlace(),
      hint: m.printAnswersInPlaceHint(),
    },
    { value: "key", label: m.printAnswersKey(), hint: m.printAnswersKeyHint() },
  ] as const;

  const settings = (
    <>
      <PanelGroup title={m.printPaper()}>
        <Segmented
          label={m.printPaperSize()}
          value={paper}
          options={[
            { value: "A4", label: "A4" },
            { value: "letter", label: m.printLetter() },
          ]}
          onChange={setPaper}
        />
        <Segmented
          label={m.printOrientation()}
          value={landscape ? "landscape" : "portrait"}
          options={[
            { value: "portrait", label: m.printPortrait() },
            { value: "landscape", label: m.printLandscape() },
          ]}
          onChange={(next) => setLandscape(next === "landscape")}
        />
      </PanelGroup>
      <PanelGroup title={m.printTextSize()} hint={m.printTextSizeHint()}>
        <Segmented
          label={m.printTextSize()}
          value={size}
          options={SIZES.map((value) => ({
            value,
            label: m.printPoints({ size: formatNumber(Number(value)) }),
          }))}
          onChange={setSize}
        />
      </PanelGroup>
      <PanelGroup title={m.printOnPage()}>
        <CheckboxRow
          label={m.printSchoolName()}
          hint={user.school.logoFileId ? undefined : m.printNoLogo()}
          checked={school}
          onChange={setSchool}
        />
        <CheckboxRow
          label={m.printNameLines()}
          hint={m.printNameLinesHint()}
          checked={lines}
          onChange={setLines}
        />
      </PanelGroup>
      {copies.length > 0 ? (
        <PanelGroup title={m.printCopiesTitle()}>
          <CheckboxRow
            label={m.printCopies()}
            hint={m.printCopiesHint({
              count: copies.length,
              value: formatNumber(copies.length),
            })}
            checked={named}
            onChange={(next) => {
              setNamed(next);
              if (next) setLines(true);
            }}
          />
        </PanelGroup>
      ) : null}
      {canAnswer && numbers.size > 0 ? (
        <PanelGroup title={m.printAnswersLabel()}>
          <RadioGroup
            aria-label={m.printAnswersLabel()}
            value={answers}
            onValueChange={(next) => {
              const mode = answerModes.find((item) => item.value === next);
              if (mode) setAnswers(mode.value);
            }}
          >
            {answerModes.map((mode) => (
              <label
                key={mode.value}
                htmlFor={`${answersId}-${mode.value}`}
                className="flex items-start gap-3"
              >
                <RadioGroupItem
                  id={`${answersId}-${mode.value}`}
                  value={mode.value}
                  className="mt-0.5"
                />
                <span className="grid gap-0.5">
                  <span className="text-sm leading-5 font-medium">
                    {mode.label}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {mode.hint}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </PanelGroup>
      ) : null}
    </>
  );

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal data-print-sheet>
        <DialogPrimitive.Popup
          initialFocus={print}
          className="fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none print:static print:block print:bg-white"
        >
          <style>
            {`@page { size: ${paper === "A4" ? "A4" : "letter"} ${landscape ? "landscape" : "portrait"}; margin: ${paged ? 0 : `${MARGIN}mm`}; } @media print { html, body { overflow: visible !important; height: auto !important; background: #fff !important; } }`}
          </style>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 lg:px-3 print:hidden">
            <Tooltip>
              <TooltipTrigger
                render={
                  <DialogPrimitive.Close
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="max-md:size-10"
                        aria-label={m.printClose()}
                      />
                    }
                  />
                }
              >
                <X aria-hidden />
              </TooltipTrigger>
              <TooltipContent>{m.printClose()}</TooltipContent>
            </Tooltip>
            <div className="grid min-w-0 flex-1">
              <DialogPrimitive.Title className="text-sm leading-5 font-semibold">
                {m.printTitle()}
              </DialogPrimitive.Title>
              <p className="truncate text-[13px] leading-[18px] text-muted-foreground">
                <bdi>{title}</bdi>
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10 lg:hidden"
              onClick={() => setSettingsOpen(true)}
            >
              <SlidersHorizontal aria-hidden />
              <span className="max-sm:sr-only">{m.printSettings()}</span>
            </Button>
            <Button
              ref={print}
              type="button"
              className="max-md:h-10"
              onClick={() => window.print()}
            >
              <Printer aria-hidden />
              {copiesCount > 0
                ? m.printNowCopies({
                    count: copiesCount,
                    value: formatNumber(copiesCount),
                  })
                : m.printNow()}
            </Button>
          </header>
          <div className="flex min-h-0 flex-1 print:block">
            <div className="min-w-0 flex-1 overflow-auto bg-muted/50 px-4 py-6 sm:px-8 sm:py-8 print:overflow-visible print:bg-transparent print:p-0">
              <div
                ref={measure}
                className="grid justify-items-center gap-8 print:block"
                style={geometry}
              >
                {names.map((name, index) => (
                  <PaperCopy
                    key={name ?? index}
                    paged={paged}
                    page={height * PX_PER_MM}
                    gap={GAP * PX_PER_MM}
                    scale={scale}
                    dir={dir}
                    footer={footer(name ? `${name} · ${title}` : title)}
                  >
                    <PaperHeader
                      title={title}
                      facts={paperFacts}
                      school={schoolName}
                      logo={logo}
                      lines={lines}
                      name={name}
                      note={
                        answers === "inline"
                          ? m.printAnswersCopy({}, { locale })
                          : undefined
                      }
                      locale={locale}
                    />
                    {body}
                  </PaperCopy>
                ))}
                {answers === "key" ? (
                  <PaperCopy
                    paged={paged}
                    page={height * PX_PER_MM}
                    gap={GAP * PX_PER_MM}
                    scale={scale}
                    dir={dir}
                    footer={footer(m.printKeyTitle({ title }, { locale }))}
                  >
                    <AnswerKey
                      title={title}
                      questions={[...numbers].map(([node, number]) => ({
                        node,
                        number,
                      }))}
                      rtl={rtl}
                      locale={locale}
                    />
                  </PaperCopy>
                ) : null}
              </div>
            </div>
            {wideScreen ? (
              <aside
                aria-label={m.printSettings()}
                className="w-80 shrink-0 overflow-y-auto border-s bg-background print:hidden"
              >
                {settings}
              </aside>
            ) : null}
          </div>
          {wideScreen ? null : (
            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetContent
                side="bottom"
                initialFocus={settingsTitle}
                className="max-h-[88dvh] gap-0 rounded-t-xl p-0"
              >
                <SheetHeader className="border-b px-4 py-3.5 pe-14">
                  <SheetTitle
                    ref={settingsTitle}
                    tabIndex={-1}
                    className="text-base leading-6 font-semibold outline-none"
                  >
                    {m.printSettings()}
                  </SheetTitle>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto">{settings}</div>
                <SheetFooter className="border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <Button
                    type="button"
                    className="h-10 w-full"
                    onClick={() => setSettingsOpen(false)}
                  >
                    {m.docDone()}
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
