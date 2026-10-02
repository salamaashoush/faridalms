import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { ReactNode } from "react";

import { contentPlainText, textDirection } from "@faridalms/domain/content";
import { questionBlock } from "@faridalms/domain/lesson-content";
import { Button } from "@faridalms/ui/button";
import { Printer, X } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { QrCode } from "~/components/badges/QrCode";
import { ContentView } from "~/components/content/ContentView";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import { PaperQuestion } from "./PaperQuestion";

const fileUrl = (fileId: string) => `/files/${fileId}`;

/** Paper sizes in millimetres, upright. */
const PAPER = { A4: [210, 297], letter: [216, 279] } as const;
const MARGIN = 15;
/** RNIB asks for 14 pt, and never under 12. */
const SIZES = [12, 14, 16, 20] as const;

type Paper = keyof typeof PAPER;

const onResize = (change: () => void) => {
  window.addEventListener("resize", change);
  return () => window.removeEventListener("resize", change);
};
const screenWidth = () => window.innerWidth;

/** The document as paper reads it: every toggle open. */
function opened(node: ContentNode): ContentNode {
  return {
    ...node,
    ...(node.type === "toggle" ? { open: true } : {}),
    ...(node.children ? { children: node.children.map(opened) } : {}),
  };
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={option.value === value ? "secondary" : "ghost"}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </fieldset>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );
}

/**
 * A document laid out on paper, ready to print: the sheet covers the app
 * while open and is all that prints. Questions take their paper form; a
 * teacher may print a copy with each answer in place. The paper keeps its
 * own black on white, since a dark theme set by a class would print dark.
 */
export function PrintSheet({
  title,
  content,
  answers: canAnswer = false,
  link,
  onClose,
}: {
  title: string;
  content: ContentDocument;
  /** Whether this reader may print the answers, which only teachers hold. */
  answers?: boolean;
  /** The document's path in the app, for the codes on its media. */
  link?: string;
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const [paper, setPaper] = useState<Paper>("A4");
  const [landscape, setLandscape] = useState(false);
  const [size, setSize] = useState<number>(14);
  const [lines, setLines] = useState(true);
  const [school, setSchool] = useState(true);
  const [answers, setAnswers] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);
  const print = useRef<HTMLButtonElement>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const others = [...document.body.children].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== sheet.current,
    );
    for (const element of others) element.inert = true;
    print.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", escape);
    return () => {
      for (const element of others) element.inert = false;
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const rtl = textDirection(contentPlainText(content)) === "rtl";
  const paperContent = useMemo(() => {
    const root = opened(content.root);
    // Empty lines the editor keeps after the last block would start a page
    // of their own.
    const children = [...(root.children ?? [])];
    while (
      children.at(-1)?.type === "paragraph" &&
      !contentPlainText({
        root: { ...root, children: children.slice(-1) },
      }).trim()
    )
      children.pop();
    return { root: { ...root, children } };
  }, [content]);
  const numbers = useMemo(() => {
    const found = new Map<ContentNode, number>();
    for (const node of paperContent.root.children)
      if (node.type === "question") found.set(node, found.size + 1);
    return found;
  }, [paperContent]);
  const [upright, across] = PAPER[paper];
  const width = landscape ? across : upright;
  // On a narrow screen the page is shown smaller, as a print preview is;
  // it prints at its own size.
  const screen = useSyncExternalStore(onResize, screenWidth, () => 1280);
  const fit = Math.min(1, (screen - 16) / ((width / 25.4) * 96));
  const schoolName = inLocale(user.school.nameEn, user.school.nameAr);

  const block = (node: ContentNode, drawn: ReactNode) => {
    if (node.type === "gate") return null;
    if (node.type === "question") {
      const question = questionBlock(node);
      return question ? (
        <PaperQuestion
          block={question}
          number={numbers.get(node) ?? 0}
          answers={answers}
          rtl={rtl}
          fileUrl={fileUrl}
        />
      ) : null;
    }
    // A video or sound cannot play on paper: its caption stays, with a code
    // that opens it, the embed's own page or the document online.
    if (node.type === "media" || node.type === "embed") {
      const online =
        node.type === "embed"
          ? node.url
          : link
            ? new URL(link, window.location.origin).href
            : undefined;
      return (
        <div className="paper-question my-2 flex items-center gap-4 rounded-[4px] border border-neutral-400 p-3">
          {online ? (
            <QrCode value={online} className="size-[2.5cm] shrink-0" />
          ) : null}
          <div className="grid gap-1">
            <p className="font-semibold" dir="auto">
              {node.caption || node.title || node.name || node.provider}
            </p>
            {online ? (
              <p className="text-[0.85em] text-neutral-600">
                {m.printScanToWatch()}
              </p>
            ) : null}
          </div>
        </div>
      );
    }
    return <div className="paper-question">{drawn}</div>;
  };

  return createPortal(
    <dialog
      ref={sheet}
      open
      data-print-sheet
      aria-label={m.printTitle()}
      className="fixed inset-0 z-50 m-0 size-full max-h-none max-w-none overflow-auto border-0 bg-muted p-0 text-foreground print:static print:size-auto print:overflow-visible print:bg-white"
    >
      <style>
        {`@page { size: ${paper === "A4" ? "A4" : "letter"} ${landscape ? "landscape" : "portrait"}; margin: ${MARGIN}mm; @bottom-center { content: counter(page) " / " counter(pages); font: 9pt sans-serif; color: #555; } }`}
      </style>
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <h2 className="me-auto text-base leading-6 font-semibold">
            {m.printTitle()}
          </h2>
          <Choice
            label={m.printPaper()}
            value={paper}
            options={[
              { value: "A4", label: "A4" },
              { value: "letter", label: m.printLetter() },
            ]}
            onChange={setPaper}
          />
          <Choice
            label={m.printOrientation()}
            value={landscape ? 1 : 0}
            options={[
              { value: 0, label: m.printPortrait() },
              { value: 1, label: m.printLandscape() },
            ]}
            onChange={(value) => setLandscape(value === 1)}
          />
          <Choice
            label={m.printTextSize()}
            value={size}
            options={SIZES.map((value) => ({
              value,
              label: m.printPoints({ size: formatNumber(value) }),
            }))}
            onChange={setSize}
          />
          <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-2">
            <Toggle
              label={m.printNameLines()}
              checked={lines}
              onChange={setLines}
            />
            <Toggle
              label={m.printSchoolName()}
              checked={school}
              onChange={setSchool}
            />
            {canAnswer && numbers.size > 0 ? (
              <Toggle
                label={m.printAnswers()}
                checked={answers}
                onChange={setAnswers}
              />
            ) : null}
            <span className="me-auto" />
            <Button ref={print} type="button" onClick={() => window.print()}>
              <Printer aria-hidden />
              {m.printNow()}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              <X aria-hidden />
              {m.printClose()}
            </Button>
          </div>
        </div>
      </div>
      <article
        dir={rtl ? "rtl" : "ltr"}
        className="paper mx-auto my-6 bg-white text-black shadow-sm print:m-0 print:w-auto print:[zoom:1] print:p-0 print:shadow-none"
        style={{
          width: `${width}mm`,
          padding: `${MARGIN}mm`,
          fontSize: `${size}pt`,
          zoom: fit,
        }}
      >
        <header className="mb-4 grid gap-3 border-b border-neutral-400 pb-3">
          {school ? (
            <p className="text-[0.8em] text-neutral-600">{schoolName}</p>
          ) : null}
          <h1 dir="auto" className="text-[1.5em] leading-tight font-bold">
            {title}
          </h1>
          {answers ? (
            <p className="text-[0.85em] font-semibold text-neutral-600">
              {m.printAnswersCopy()}
            </p>
          ) : null}
          {lines ? (
            <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 text-[0.85em]">
              {[m.printName(), m.printClass(), m.printDate()].map((label) => (
                <p key={label} className="flex items-end gap-2">
                  <span>{label}</span>
                  <span className="h-[1.6em] flex-1 border-b border-neutral-500" />
                </p>
              ))}
            </div>
          ) : null}
        </header>
        <ContentView
          document={paperContent}
          fileUrl={fileUrl}
          className="fe-paper"
          renderBlock={block}
        />
      </article>
    </dialog>,
    document.body,
  );
}
