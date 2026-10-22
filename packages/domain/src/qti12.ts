import * as v from "valibot";

import type { ReadQuestion, StoredQtiPicture } from "./qti-read";

import { plainContent } from "./content-conversion";
import {
  lessonBlockSchema,
  MAX_ACCEPTED_ANSWERS,
  MAX_CHOICE_OPTIONS,
  MAX_DISTRACTORS,
  MAX_GAPS,
  MAX_PAIRS,
} from "./learning";

/**
 * Questions from QTI 1.2, as Common Cartridge quizzes and Canvas, Moodle,
 * Blackboard and Respondus exports hold them: CC's six profiled kinds, and
 * Canvas's own matching, fill-in-the-blanks, dropdowns and numerical
 * questions, which its exports name in item metadata. A Canvas text-only
 * item is reading, not a question.
 */

export interface Qti12Options {
  /** A picture an option shows, by its address; none leaves it out. */
  picture: (src: string) => StoredQtiPicture | null;
}

const childrenNamed = (element: Element, name: string) =>
  Array.from(element.children).filter((child) => child.localName === name);
const within = (element: Element, name: string) =>
  Array.from(element.getElementsByTagName("*")).filter(
    (child) => child.localName === name,
  );
const first = (element: Element, name: string) => within(element, name)[0];

const cut = (text: string, max: number) => text.trim().slice(0, max).trim();
const newId = () => crypto.randomUUID();

const BLOCKS = new Set([
  "p",
  "div",
  "li",
  "br",
  "tr",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
]);

/** The words HTML shows, a line where a block ends. */
function htmlWords(html: string): string {
  const page = new DOMParser().parseFromString(html, "text/html");
  let text = "";
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      text += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    const name = element.localName;
    if (name === "script" || name === "style") return;
    if (name === "br") {
      text += "\n";
      return;
    }
    for (const child of Array.from(element.childNodes)) walk(child);
    if (BLOCKS.has(name)) text += "\n";
  };
  walk(page.body);
  return text
    .split("\n")
    .map((line) => line.replaceAll(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** A material's words and the first picture it shows. */
function materialOf(element: Element | undefined) {
  const text = element ? first(element, "mattext") : undefined;
  const raw = text?.textContent ?? "";
  const html = (text?.getAttribute("texttype") ?? "").includes("html");
  const image = element ? first(element, "matimage") : undefined;
  let src = image?.getAttribute("uri") ?? "";
  if (html && !src) {
    const page = new DOMParser().parseFromString(raw, "text/html");
    src = page.querySelector("img")?.getAttribute("src") ?? "";
  }
  return { words: html ? htmlWords(raw) : raw.trim(), src };
}

function metadataOf(item: Element) {
  const fields = new Map<string, string>();
  for (const field of within(item, "qtimetadatafield")) {
    const label = first(field, "fieldlabel")?.textContent.trim() ?? "";
    const entry = first(field, "fieldentry")?.textContent.trim() ?? "";
    if (label) fields.set(label, entry);
  }
  return fields;
}

/** Feedback by its ident, in words. */
function feedbacksOf(item: Element) {
  const found = new Map<string, string>();
  for (const feedback of childrenNamed(item, "itemfeedback"))
    found.set(
      feedback.getAttribute("ident") ?? "",
      materialOf(first(feedback, "material")).words,
    );
  return found;
}

/** The values a response must equal for full marks, each condition's own. */
function scoringConditions(item: Element) {
  return within(item, "respcondition").filter((condition) =>
    within(condition, "setvar").some(
      (setvar) =>
        Number(setvar.textContent) > 0 &&
        (setvar.getAttribute("varname") ?? "SCORE").toUpperCase() === "SCORE",
    ),
  );
}

/** What a condition accepts for a response: values it must equal, not those it must not. */
function acceptedIn(condition: Element, respident?: string) {
  return within(condition, "varequal")
    .filter(
      (varequal) =>
        (!respident || varequal.getAttribute("respident") === respident) &&
        !varequal.parentElement?.localName.includes("not"),
    )
    .map((varequal) => varequal.textContent.trim());
}

function pointsOf(fields: Map<string, string>) {
  const stated = Number(
    fields.get("points_possible") ?? fields.get("cc_weighting"),
  );
  if (!Number.isFinite(stated) || stated < 0) return 1;
  return Math.min(100, Math.max(stated > 0 ? 1 : 0, Math.round(stated)));
}

function distinct(texts: string[]) {
  const seen = new Set<string>();
  return texts.filter((text) => {
    const key = text.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Reads one QTI 1.2 item into the question it asks, or the reading it is. */
export function questionOfQti12(
  item: Element,
  options: Qti12Options,
): ReadQuestion | null {
  const fields = metadataOf(item);
  const kind = fields.get("question_type") ?? "";
  const profile = fields.get("cc_profile") ?? "";
  const presentation = childrenNamed(item, "presentation")[0];
  if (!presentation) return null;
  const stem = materialOf(
    childrenNamed(presentation, "material")[0] ??
      first(presentation, "material"),
  );
  const title = cut(item.getAttribute("title") ?? "", 1000);
  const prompt = cut(stem.words || title, 1000) || "?";
  const feedbacks = feedbacksOf(item);
  const common = {
    id: newId(),
    points: pointsOf(fields),
    hints: [],
    explanation: cut(feedbacks.get("general_fb") ?? "", 1000),
    tries: null,
  };
  const finish = (
    block: Record<string, unknown>,
    note?: ReadQuestion["note"],
  ) => {
    const parsed = v.safeParse(lessonBlockSchema, block);
    if (parsed.success)
      return note ? { block: parsed.output, note } : { block: parsed.output };
    const fallback = v.safeParse(lessonBlockSchema, {
      ...common,
      type: "written",
      prompt,
      wordLimit: null,
    });
    return fallback.success
      ? { block: fallback.output, note: "unsupported" as const }
      : null;
  };

  if (kind === "text_only_question" || fields.get("passage") === "true")
    return {
      block: {
        id: newId(),
        type: "content",
        content: plainContent(stem.words || title),
      },
    };

  const lids = within(presentation, "response_lid");
  const strs = within(presentation, "response_str");
  const conditions = scoringConditions(item);

  // Each left-hand item its own response, choosing among every match.
  if (kind === "matching_question") {
    const right = new Map<string, string>();
    const pairs = lids.slice(0, MAX_PAIRS).flatMap((lid) => {
      const ident = lid.getAttribute("ident") ?? "";
      const labels = within(lid, "response_label");
      for (const label of labels)
        right.set(
          label.getAttribute("ident") ?? "",
          materialOf(first(label, "material")).words,
        );
      const match = conditions.flatMap((condition) =>
        acceptedIn(condition, ident),
      )[0];
      const answer = match ? right.get(match) : undefined;
      const left = materialOf(childrenNamed(lid, "material")[0]).words;
      return answer && left
        ? [{ id: newId(), prompt: cut(left, 300), answer: cut(answer, 300) }]
        : [];
    });
    const used = new Set(pairs.map((pair) => pair.answer));
    return finish({
      ...common,
      type: "matching",
      prompt,
      pairs,
      distractors: distinct(
        [...right.values()].filter((text) => !used.has(cut(text, 300))),
      )
        .slice(0, MAX_DISTRACTORS)
        .map((text) => ({ id: newId(), text: cut(text, 300) })),
    });
  }

  // Blanks named in the question's words, as [name], each a response.
  if (
    kind === "fill_in_multiple_blanks_question" ||
    kind === "multiple_dropdowns_question" ||
    (lids.length > 1 && /\[[^\]]+\]/u.test(stem.words))
  ) {
    const typed = kind === "fill_in_multiple_blanks_question";
    const blanks = new Map(
      lids.map((lid) => {
        const ident = lid.getAttribute("ident") ?? "";
        const name =
          materialOf(childrenNamed(lid, "material")[0]).words ||
          ident.replace(/^response_/u, "");
        const labels = within(lid, "response_label").map((label) => ({
          ident: label.getAttribute("ident") ?? "",
          text: cut(materialOf(first(label, "material")).words, 100),
        }));
        const right = new Set(
          conditions.flatMap((condition) => acceptedIn(condition, ident)),
        );
        return [
          name,
          typed
            ? {
                answers: distinct(labels.map((label) => label.text)).slice(
                  0,
                  MAX_ACCEPTED_ANSWERS,
                ),
                options: [],
              }
            : {
                answers: labels
                  .filter((label) => right.has(label.ident))
                  .map((label) => label.text),
                options: distinct(labels.map((label) => label.text)).slice(
                  0,
                  MAX_CHOICE_OPTIONS,
                ),
              },
        ] as const;
      }),
    );
    const segments: Record<string, unknown>[] = [];
    for (const part of stem.words.split(/(\[[^\]]+\])/u)) {
      const name = /^\[([^\]]+)\]$/u.exec(part)?.[1];
      const blank = name ? blanks.get(name) : undefined;
      if (blank) segments.push({ type: "gap", id: newId(), ...blank });
      else if (part) segments.push({ type: "text", text: part.slice(0, 2000) });
    }
    if (segments.filter((segment) => segment.type === "gap").length > MAX_GAPS)
      return finish({});
    return finish({
      ...common,
      type: "gaps",
      prompt: cut(title, 1000) || "?",
      segments,
      caseSensitive: false,
      closeEnough: false,
      tehMarbuta: false,
    });
  }

  if (kind === "numerical_question" || kind === "calculated_question") {
    const condition = conditions[0];
    const number = (name: string) =>
      Number(condition ? first(condition, name)?.textContent : Number.NaN);
    const exact = number("varequal");
    const low = Number.isFinite(number("vargte"))
      ? number("vargte")
      : number("vargt");
    const high = number("varlte");
    if (Number.isFinite(exact))
      return finish(
        {
          ...common,
          type: "number",
          prompt,
          mode: "exact",
          value: exact,
          tolerance:
            Number.isFinite(low) && Number.isFinite(high)
              ? Math.abs((high - low) / 2)
              : 0,
          percent: false,
          min: exact,
          max: exact,
        },
        kind === "calculated_question" ? "approximate" : undefined,
      );
    if (Number.isFinite(low) && Number.isFinite(high))
      return finish({
        ...common,
        type: "number",
        prompt,
        mode: "range",
        value: 0,
        tolerance: 0,
        percent: false,
        min: low,
        max: high,
      });
    return finish({});
  }

  const [lid] = lids;
  if (lid) {
    const ident = lid.getAttribute("ident") ?? "";
    const labels = within(lid, "response_label").slice(0, MAX_CHOICE_OPTIONS);
    const right = new Set(
      conditions.flatMap((condition) => acceptedIn(condition, ident)),
    );
    const ids = new Map(labels.map((label) => [label, newId()]));
    const optionsRead = labels.map((label) => {
      const shown = materialOf(first(label, "material"));
      const stored = shown.src ? options.picture(shown.src) : null;
      return {
        id: ids.get(label) ?? newId(),
        text: cut(shown.words, 300),
        picture: stored
          ? { fileId: stored.fileId, alt: cut(shown.words, 300) }
          : null,
        feedback: cut(
          feedbacks.get(`${label.getAttribute("ident") ?? ""}_fb`) ?? "",
          300,
        ),
      };
    });
    const multiple =
      kind === "multiple_answers_question" ||
      profile === "cc.multiple_response.v0p1" ||
      lid.getAttribute("rcardinality") === "Multiple";
    const correctOptionIds = labels
      .filter((label) => right.has(label.getAttribute("ident") ?? ""))
      .map((label) => ids.get(label) ?? "");
    return finish({
      ...common,
      type: "choice",
      prompt,
      options: optionsRead,
      correctOptionIds: multiple
        ? correctOptionIds
        : correctOptionIds.slice(0, 1),
      multiple,
      shuffle: first(lid, "render_choice")?.getAttribute("shuffle") === "Yes",
    });
  }

  if (strs.length > 0) {
    const answers = distinct(
      conditions.flatMap((condition) => [
        ...acceptedIn(condition),
        ...within(condition, "varsubstring").map((each) =>
          each.textContent.trim(),
        ),
      ]),
    )
      .slice(0, MAX_ACCEPTED_ANSWERS)
      .map((answer) => cut(answer, 200));
    const essay =
      kind === "essay_question" ||
      profile === "cc.essay.v0p1" ||
      fields.get("qmd_computerscored") === "No" ||
      answers.length === 0;
    if (essay)
      return finish({ ...common, type: "written", prompt, wordLimit: null });
    return finish(
      {
        ...common,
        type: "text",
        prompt,
        answers,
        caseSensitive: within(item, "varequal").some(
          (each) => each.getAttribute("case") === "Yes",
        ),
        closeEnough: false,
        tehMarbuta: false,
      },
      profile === "cc.pattern_match.v0p1" ? "approximate" : undefined,
    );
  }
  return finish({});
}

/** The items a QTI 1.2 file asks, quiz or bank, in their order. */
export function qti12Items(document: Document): Element[] {
  return Array.from(document.getElementsByTagName("*")).filter(
    (element) => element.localName === "item",
  );
}

/** A QTI 1.2 quiz's title, when it names one. */
export function qti12Title(document: Document): string {
  return (
    Array.from(document.getElementsByTagName("*"))
      .find(
        (element) =>
          element.localName === "assessment" ||
          element.localName === "objectbank",
      )
      ?.getAttribute("title") ?? ""
  ).trim();
}
