import * as v from "valibot";

import type { LessonBlock, Picture } from "./learning";

import {
  lessonBlockSchema,
  MAX_CHOICE_OPTIONS,
  MAX_DISTRACTORS,
  MAX_GAPS,
  MAX_HINTS,
  MAX_LABEL_EXTRAS,
  MAX_ORDER_ITEMS,
  MAX_PAIRS,
  MAX_PASSAGE,
  MAX_PLACE_NAME,
  MAX_PLACES,
  MAX_SORT_GROUPS,
  MAX_SORT_ITEMS,
  MAX_TARGETS,
  RECORD_SECONDS,
} from "./learning";

/**
 * Questions from QTI items, version 3.0 or 2.x: each item read into the
 * question it asks here, scored out of its own maximum. QTI 3 writes its
 * names `qti-` and kebab-case and 2.x camel-case, so both are read by the
 * 2.x name. What has no question here (drawing, a slider, a point on a
 * picture) comes as a written question with the item's words, to look at.
 */

/** A picture an item shows, once stored here, with its size. */
export interface StoredQtiPicture {
  fileId: string;
  width: number;
  height: number;
}

export interface QtiReadOptions {
  /** A picture by the address the item gives it; none leaves it out. */
  picture: (src: string) => StoredQtiPicture | null;
}

export interface ReadQuestion {
  block: LessonBlock;
  /** Read as near as could be, or kept only as words, for a teacher to check. */
  note?: "approximate" | "unsupported";
}

/** An element's name as QTI 2.x writes it, whichever version wrote it. */
export function qtiName(element: Element): string {
  const name = element.localName;
  if (!name.startsWith("qti-")) return name;
  return name
    .slice(4)
    .replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

const kebab = (name: string) =>
  name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

function attr(element: Element, name: string): string | null {
  return element.getAttribute(name) ?? element.getAttribute(kebab(name));
}

const childrenNamed = (element: Element, name: string) =>
  Array.from(element.children).filter((child) => qtiName(child) === name);

const within = (element: Element, name: string) =>
  Array.from(element.getElementsByTagName("*")).filter(
    (child) => qtiName(child) === name,
  );

const first = (element: Element, name: string) => within(element, name)[0];

const BLOCKS = new Set([
  "p",
  "div",
  "li",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "tr",
  "blockquote",
  "contentBody",
]);
const UNSAID = new Set([
  "feedbackInline",
  "feedbackBlock",
  "modalFeedback",
  "rubricBlock",
  "templateBlock",
  "templateInline",
  "printedVariable",
]);

/** The words an element shows, a line where a block ends, leaving out what is skipped. */
function wordsOf(
  node: Node,
  skip: (element: Element) => boolean = () => false,
): string {
  let text = "";
  const walk = (current: Node) => {
    if (current.nodeType === 3) {
      text += current.textContent ?? "";
      return;
    }
    if (current.nodeType !== 1) return;
    const element = current as Element;
    const name = qtiName(element);
    if (UNSAID.has(name) || skip(element)) return;
    if (name === "br") {
      text += "\n";
      return;
    }
    for (const child of Array.from(element.childNodes)) walk(child);
    if (BLOCKS.has(name)) text += "\n";
  };
  walk(node);
  return text
    .split("\n")
    .map((line) => line.replaceAll(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const cut = (text: string, max: number) => text.trim().slice(0, max).trim();

interface Declaration {
  cardinality: string;
  baseType: string;
  correct: string[];
  mapping: { key: string; value: number; caseSensitive: boolean | null }[];
}

function declarationsOf(item: Element): Map<string, Declaration> {
  const found = new Map<string, Declaration>();
  for (const element of childrenNamed(item, "responseDeclaration")) {
    const correctResponse = childrenNamed(element, "correctResponse")[0];
    const map = childrenNamed(element, "mapping")[0];
    found.set(attr(element, "identifier") ?? "", {
      cardinality: attr(element, "cardinality") ?? "single",
      baseType: attr(element, "baseType") ?? "identifier",
      correct: correctResponse
        ? childrenNamed(correctResponse, "value").map((each) =>
            each.textContent.trim(),
          )
        : [],
      mapping: map
        ? childrenNamed(map, "mapEntry").map((entry) => {
            const sensitive = attr(entry, "caseSensitive");
            return {
              key: attr(entry, "mapKey") ?? "",
              value: Number(attr(entry, "mappedValue") ?? 0),
              caseSensitive: sensitive === null ? null : sensitive === "true",
            };
          })
        : [],
    });
  }
  return found;
}

/** What a response must be to count: its key, and what its mapping credits. */
const keyed = (declaration: Declaration | undefined) => [
  ...new Set([
    ...(declaration?.correct ?? []),
    ...(declaration?.mapping ?? [])
      .filter((entry) => entry.value > 0)
      .map((entry) => entry.key),
  ]),
];

function pointsOf(item: Element, declarations: Map<string, Declaration>) {
  let points: number | null = null;
  for (const outcome of childrenNamed(item, "outcomeDeclaration")) {
    const id = attr(outcome, "identifier");
    const defaultValue = childrenNamed(outcome, "defaultValue")[0];
    const stated = defaultValue
      ? Number(childrenNamed(defaultValue, "value")[0]?.textContent)
      : Number.NaN;
    if (id === "MAXSCORE" && Number.isFinite(stated)) points = stated;
    const normal = Number(attr(outcome, "normalMaximum"));
    if (
      id === "SCORE" &&
      points === null &&
      Number.isFinite(normal) &&
      normal > 0
    )
      points = normal;
  }
  if (points === null) {
    const mapped = [...declarations.values()]
      .flatMap((declaration) => declaration.mapping)
      .filter((entry) => entry.value > 0)
      .reduce((sum, entry) => sum + entry.value, 0);
    points = mapped > 0 ? mapped : 1;
  }
  // A fraction of a point still counts for something here, where points are whole.
  return Math.min(100, Math.max(points > 0 ? 1 : 0, Math.round(points)));
}

function picturesOf(element: Element, options: QtiReadOptions) {
  const image = within(element, "img")[0] ?? within(element, "object")[0];
  if (!image) return null;
  const src = image.getAttribute("src") ?? image.getAttribute("data") ?? "";
  const stored = options.picture(src);
  if (!stored) return null;
  const width = Number(image.getAttribute("width")) || stored.width;
  const height = Number(image.getAttribute("height")) || stored.height;
  return {
    picture: {
      fileId: stored.fileId,
      alt: cut(image.getAttribute("alt") ?? "", 300),
    } satisfies Picture,
    width,
    height,
  };
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Whether any accepted answer counts only in its own case. */
const sensitive = (declaration: Declaration | undefined) =>
  (declaration?.mapping ?? []).some((entry) => entry.caseSensitive === true);

/** A shape on a picture as the box around it, in fractions of the picture. */
function boxOf(
  shape: string,
  coords: string,
  size: { width: number; height: number },
): [number, number, number, number] | null {
  const numbers = coords
    .split(/[\s,]+/u)
    .filter(Boolean)
    .map(Number);
  if (numbers.some((each) => !Number.isFinite(each))) return null;
  let left: number;
  let top: number;
  let right: number;
  let bottom: number;
  if (shape === "circle" && numbers.length >= 3) {
    const [x = 0, y = 0, r = 0] = numbers;
    [left, top, right, bottom] = [x - r, y - r, x + r, y + r];
  } else if (shape === "ellipse" && numbers.length >= 4) {
    const [x = 0, y = 0, rx = 0, ry = 0] = numbers;
    [left, top, right, bottom] = [x - rx, y - ry, x + rx, y + ry];
  } else if (numbers.length >= 4) {
    const xs = numbers.filter((_, index) => index % 2 === 0);
    const ys = numbers.filter((_, index) => index % 2 === 1);
    [left, top, right, bottom] = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];
  } else return null;
  const x = clamp(left / size.width);
  const y = clamp(top / size.height);
  const width = clamp(right / size.width) - x;
  const height = clamp(bottom / size.height) - y;
  return width > 0 && height > 0 ? [x, y, width, height] : null;
}

const newId = () => crypto.randomUUID();

/** The same text once, whatever its case, keeping the first written. */
function distinct(texts: string[]) {
  const seen = new Set<string>();
  return texts.filter((text) => {
    const key = text.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Reads one item. The interactions decide the kind; anything QTI asks that
 * has no question here is kept as a written question with its words.
 */
export function questionOfQti(
  item: Element,
  options: QtiReadOptions,
): ReadQuestion | null {
  const found = childrenNamed(item, "itemBody")[0];
  if (!found) return null;
  const body: Element = found;
  const declarations = declarationsOf(item);
  const interactions = Array.from(body.getElementsByTagName("*")).filter(
    (element) =>
      qtiName(element).endsWith("Interaction") &&
      qtiName(element) !== "endAttemptInteraction",
  );
  const title = cut(attr(item, "title") ?? "", 1000);
  const isInteraction = (element: Element) =>
    qtiName(element).endsWith("Interaction");
  const promptOf = (interaction?: Element) => {
    const own = interaction
      ? childrenNamed(interaction, "prompt")[0]
      : undefined;
    const words = own
      ? wordsOf(own)
      : wordsOf(body, (element) => isInteraction(element));
    return cut(words || title, 1000);
  };
  const hints = within(body, "feedbackBlock")
    .filter(
      (block) =>
        block.hasAttribute("data-farida-hint") ||
        /hint/iu.test(attr(block, "outcomeIdentifier") ?? ""),
    )
    .map((block) =>
      cut(wordsOf(block, () => false) || block.textContent || "", 500),
    )
    .filter(Boolean)
    .slice(0, MAX_HINTS);
  const explanation = cut(
    childrenNamed(item, "modalFeedback")
      .map((feedback) => feedback.textContent.replaceAll(/\s+/gu, " ").trim())
      .filter(Boolean)
      .join("\n"),
    1000,
  );
  const common = {
    id: newId(),
    points: pointsOf(item, declarations),
    hints,
    explanation,
    tries: null,
  };
  const written = (prompt: string, note: ReadQuestion["note"]) =>
    finish(
      {
        ...common,
        type: "written",
        prompt: prompt || title || "?",
        wordLimit: null,
      },
      note,
    );
  const declarationFor = (interaction: Element) =>
    declarations.get(attr(interaction, "responseIdentifier") ?? "");

  const [only] = interactions;
  if (!only) return null;
  const kinds = new Set(interactions.map(qtiName));
  const kind = qtiName(only);

  // Gaps typed or chosen in the words: several inline interactions, or one.
  const inline = interactions.every(
    (interaction) =>
      qtiName(interaction) === "textEntryInteraction" ||
      qtiName(interaction) === "inlineChoiceInteraction",
  );
  if (
    inline &&
    (interactions.length > 1 || kinds.has("inlineChoiceInteraction"))
  )
    return finish(gapsOf(), "approximate");

  switch (kind) {
    case "choiceInteraction":
      return finish(choiceOf(only));
    case "textEntryInteraction":
      return finish(entryOf(only));
    case "gapMatchInteraction":
      return finish(bankOf(only));
    case "hottextInteraction":
      return finish(highlightOf(only));
    case "matchInteraction":
      return finish(matchOf(only));
    case "associateInteraction":
      return finish(associateOf(only), "approximate");
    case "orderInteraction":
    case "graphicOrderInteraction":
      return finish(
        orderOf(only),
        kind === "orderInteraction" ? undefined : "approximate",
      );
    case "hotspotInteraction":
      return finish(hotspotOf(only));
    case "graphicGapMatchInteraction":
      return finish(labellingOf(only));
    case "extendedTextInteraction":
      return finish(extendedOf(only));
    case "uploadInteraction":
    case "drawingInteraction":
      return written(promptOf(only), "approximate");
    default:
      return written(promptOf(only), "unsupported");
  }

  function finish(
    block: Record<string, unknown> | null,
    note?: ReadQuestion["note"],
  ): ReadQuestion | null {
    if (!block) return written(promptOf(only), "unsupported");
    const parsed = v.safeParse(lessonBlockSchema, block);
    if (parsed.success)
      return note ? { block: parsed.output, note } : { block: parsed.output };
    if (block.type === "written") return null;
    return written(promptOf(only), "unsupported");
  }

  function choiceOf(interaction: Element) {
    const declaration = declarationFor(interaction);
    const right = new Set(keyed(declaration));
    const choices = childrenNamed(interaction, "simpleChoice").slice(
      0,
      MAX_CHOICE_OPTIONS,
    );
    const ids = new Map(choices.map((choice) => [choice, newId()]));
    const optionsRead = choices.map((choice) => {
      const shown = picturesOf(choice, options);
      return {
        id: ids.get(choice) ?? newId(),
        text: cut(wordsOf(choice), 300),
        picture: shown?.picture ?? null,
        feedback: cut(
          within(choice, "feedbackInline")
            .map((feedback) => feedback.textContent)
            .join(" "),
          300,
        ),
      };
    });
    const multiple =
      (declaration?.cardinality ?? "single") !== "single" ||
      attr(interaction, "maxChoices") !== "1";
    const poll =
      interaction.getAttribute("data-farida-kind") === "poll" ||
      right.size === 0;
    const prompt = promptOf(interaction);
    if (poll)
      return {
        ...common,
        type: "poll",
        points: 0,
        prompt,
        options: optionsRead,
        multiple,
        classResults:
          interaction.getAttribute("data-farida-class-results") === "true",
      };
    const correctIds = choices
      .filter((choice) => right.has(attr(choice, "identifier") ?? ""))
      .map((choice) => ids.get(choice) ?? "");
    return {
      ...common,
      type: "choice",
      prompt,
      options: optionsRead,
      correctOptionIds: multiple ? correctIds : correctIds.slice(0, 1),
      multiple,
      shuffle: attr(interaction, "shuffle") === "true",
    };
  }

  function answersOf(declaration: Declaration | undefined) {
    return distinct(keyed(declaration))
      .slice(0, 10)
      .map((answer) => cut(answer, 200));
  }

  function entryOf(interaction: Element) {
    const declaration = declarationFor(interaction);
    const prompt = promptOf(interaction);
    const baseType = declaration?.baseType ?? "string";
    if (baseType === "float" || baseType === "integer") {
      const processing = childrenNamed(item, "responseProcessing")[0];
      const equal = processing ? first(processing, "equal") : undefined;
      const lowest = processing ? first(processing, "gte") : undefined;
      const highest = processing ? first(processing, "lte") : undefined;
      const bound = (element: Element | undefined) =>
        element
          ? Number(within(element, "baseValue")[0]?.textContent ?? Number.NaN)
          : Number.NaN;
      const exact = Number(declaration?.correct[0] ?? Number.NaN);
      const lineAttr = interaction.getAttribute("data-farida-line");
      const [from, to, step] = (lineAttr ?? "").split(" ").map(Number);
      const line =
        lineAttr && from !== undefined && to !== undefined && step !== undefined
          ? { from, to, step }
          : undefined;
      if (
        !Number.isFinite(exact) &&
        Number.isFinite(bound(lowest)) &&
        Number.isFinite(bound(highest))
      )
        return {
          ...common,
          type: "number",
          prompt,
          mode: "range",
          value: 0,
          tolerance: 0,
          percent: false,
          min: bound(lowest),
          max: bound(highest),
          ...(line ? { line } : {}),
        };
      if (!Number.isFinite(exact)) return null;
      const mode = equal ? attr(equal, "toleranceMode") : "exact";
      const tolerance = Number(
        (equal ? (attr(equal, "tolerance") ?? "0") : "0").split(/\s+/u)[0],
      );
      return {
        ...common,
        type: "number",
        prompt,
        mode: "exact",
        value: exact,
        tolerance:
          Number.isFinite(tolerance) && mode !== "exact"
            ? Math.abs(tolerance)
            : 0,
        percent: mode === "relative",
        min: exact,
        max: exact,
        ...(line ? { line } : {}),
      };
    }
    const answers = answersOf(declaration);
    if (interaction.getAttribute("data-farida-kind") === "math")
      return {
        ...common,
        type: "math",
        prompt,
        answers,
        tolerance:
          Number(interaction.getAttribute("data-farida-tolerance") ?? 0) || 0,
      };
    return {
      ...common,
      type: "text",
      prompt,
      answers,
      caseSensitive: sensitive(declaration),
      closeEnough:
        interaction.getAttribute("data-farida-close-enough") === "true",
      tehMarbuta:
        interaction.getAttribute("data-farida-teh-marbuta") === "true",
    };
  }

  /** The passage around gaps, each gap read by what fills it. */
  function segmentsOf(
    root: Element,
    gapOf: (element: Element) => Record<string, unknown> | null,
    skip: (element: Element) => boolean,
  ) {
    const segments: Record<string, unknown>[] = [];
    let text = "";
    const flush = () => {
      const words = text.replaceAll(/[ \t]+/gu, " ").replace(/^\n+|\n+$/gu, "");
      if (words.trim())
        segments.push({ type: "text", text: words.slice(0, 2000) });
      text = "";
    };
    const walk = (current: Node) => {
      if (current.nodeType === 3) {
        text += (current.textContent ?? "").replaceAll(/\s+/gu, " ");
        return;
      }
      if (current.nodeType !== 1) return;
      const element = current as Element;
      const name = qtiName(element);
      if (UNSAID.has(name) || skip(element)) return;
      const gap = gapOf(element);
      if (gap) {
        flush();
        segments.push(gap);
        return;
      }
      if (name === "br") text += "\n";
      for (const child of Array.from(element.childNodes)) walk(child);
      if (BLOCKS.has(name) && text && !text.endsWith("\n")) text += "\n";
    };
    walk(root);
    flush();
    return segments;
  }

  function gapsOf() {
    const holding = new Set<Element>();
    for (const interaction of interactions) {
      let parent = interaction.parentElement;
      while (parent && parent.parentElement !== body)
        parent = parent.parentElement;
      holding.add(parent ?? interaction);
    }
    const prompt = cut(
      wordsOf(
        body,
        (element) => holding.has(element) || isInteraction(element),
      ) ||
        title ||
        "",
      1000,
    );
    const segments = segmentsOf(
      body,
      (element) => {
        const name = qtiName(element);
        if (
          name !== "textEntryInteraction" &&
          name !== "inlineChoiceInteraction"
        )
          return null;
        const declaration = declarationFor(element);
        if (name === "textEntryInteraction")
          return {
            type: "gap",
            id: newId(),
            answers: answersOf(declaration),
            options: [],
          };
        const choices = childrenNamed(element, "inlineChoice");
        const right = new Set(keyed(declaration));
        const texts = choices.map((choice) => cut(wordsOf(choice), 100));
        return {
          type: "gap",
          id: newId(),
          answers: choices
            .filter((choice) => right.has(attr(choice, "identifier") ?? ""))
            .map((choice) => cut(wordsOf(choice), 100)),
          options: distinct(texts).slice(0, MAX_CHOICE_OPTIONS),
        };
      },
      (element) => !holding.has(element) && element.parentElement === body,
    );
    if (segments.filter((segment) => segment.type === "gap").length > MAX_GAPS)
      return null;
    return {
      ...common,
      type: "gaps",
      prompt: prompt || "?",
      segments,
      caseSensitive: interactions.some((interaction) =>
        sensitive(declarationFor(interaction)),
      ),
      closeEnough: false,
      tehMarbuta: false,
    };
  }

  /** Pairs of identifiers the response must hold, from its key and its mapping. */
  function pairsOf(interaction: Element) {
    return keyed(declarationFor(interaction)).flatMap((pair) => {
      const [from = "", to = ""] = pair.trim().split(/\s+/u);
      return from && to ? [{ from, to }] : [];
    });
  }

  function bankOf(interaction: Element) {
    const words = new Map(
      childrenNamed(interaction, "gapText").map((gapText) => [
        attr(gapText, "identifier") ?? "",
        cut(wordsOf(gapText), 100),
      ]),
    );
    const pairs = pairsOf(interaction);
    const used = new Set<string>();
    const segments = segmentsOf(
      interaction,
      (element) => {
        if (qtiName(element) !== "gap") return null;
        const id = attr(element, "identifier") ?? "";
        const answers = distinct(
          pairs
            .filter((pair) => pair.to === id)
            .map((pair) => words.get(pair.from) ?? ""),
        );
        for (const answer of answers) used.add(answer);
        return {
          type: "gap",
          id: newId(),
          answers: answers.slice(0, 10),
          options: [],
        };
      },
      (element) =>
        qtiName(element) === "gapText" || qtiName(element) === "prompt",
    );
    return {
      ...common,
      type: "gaps",
      prompt: promptOf(interaction),
      segments,
      caseSensitive: false,
      closeEnough: false,
      tehMarbuta: false,
      bank: distinct(
        [...words.values()].filter((word) => !used.has(word)),
      ).slice(0, MAX_CHOICE_OPTIONS),
    };
  }

  function highlightOf(interaction: Element) {
    const right = new Set(keyed(declarationFor(interaction)));
    const segments = segmentsOf(
      interaction,
      (element) =>
        qtiName(element) === "hottext" &&
        right.has(attr(element, "identifier") ?? "")
          ? { type: "target", id: newId(), text: cut(wordsOf(element), 80) }
          : null,
      (element) => qtiName(element) === "prompt",
    );
    if (
      segments.filter((segment) => segment.type === "target").length >
      MAX_TARGETS
    )
      return null;
    return {
      ...common,
      type: "highlight",
      prompt: promptOf(interaction),
      segments,
    };
  }

  function associableOf(set: Element) {
    return childrenNamed(set, "simpleAssociableChoice").map((choice) => ({
      id: attr(choice, "identifier") ?? "",
      text: cut(wordsOf(choice), 300),
      picture: picturesOf(choice, options)?.picture ?? null,
      matchMax: Number(attr(choice, "matchMax") ?? 1),
    }));
  }

  function matchOf(interaction: Element) {
    const [sourceSet, targetSet] = childrenNamed(interaction, "simpleMatchSet");
    if (!sourceSet || !targetSet) return null;
    const sources = associableOf(sourceSet);
    const targets = associableOf(targetSet);
    const pairs = pairsOf(interaction);
    const targetOf = new Map(pairs.map((pair) => [pair.from, pair.to]));
    const shared = targets.some(
      (target) => pairs.filter((pair) => pair.to === target.id).length > 1,
    );
    const prompt = promptOf(interaction);
    if (interaction.getAttribute("data-farida-kind") === "sorting" || shared) {
      const groups = targets.slice(0, MAX_SORT_GROUPS).map((target) => ({
        id: newId(),
        name: cut(target.text || target.id, 100),
        key: target.id,
      }));
      const groupOf = new Map(groups.map((group) => [group.key, group.id]));
      return {
        ...common,
        type: "sorting",
        prompt,
        groups: groups.map(({ id, name }) => ({ id, name })),
        items: sources
          .filter((source) => groupOf.has(targetOf.get(source.id) ?? ""))
          .slice(0, MAX_SORT_ITEMS)
          .map((source) => ({
            id: newId(),
            text: source.text,
            picture: source.picture,
            groupId: groupOf.get(targetOf.get(source.id) ?? "") ?? "",
          })),
      };
    }
    const byId = new Map(targets.map((target) => [target.id, target]));
    const paired = sources
      .filter((source) => byId.has(targetOf.get(source.id) ?? ""))
      .slice(0, MAX_PAIRS);
    const usedTargets = new Set(
      paired.map((source) => targetOf.get(source.id)),
    );
    return {
      ...common,
      type: "matching",
      prompt,
      ...(interaction.getAttribute("data-farida-memory") === "true"
        ? { memory: true }
        : {}),
      pairs: paired.map((source) => {
        const target = byId.get(targetOf.get(source.id) ?? "");
        return {
          id: newId(),
          prompt: source.text,
          promptPicture: source.picture,
          answer: target?.text ?? "",
          answerPicture: target?.picture ?? null,
        };
      }),
      distractors: targets
        .filter((target) => !usedTargets.has(target.id))
        .slice(0, MAX_DISTRACTORS)
        .map((target) => ({
          id: newId(),
          text: target.text,
          picture: target.picture,
        })),
    };
  }

  function associateOf(interaction: Element) {
    const choices = new Map(
      childrenNamed(interaction, "simpleAssociableChoice").map((choice) => [
        attr(choice, "identifier") ?? "",
        {
          text: cut(wordsOf(choice), 300),
          picture: picturesOf(choice, options)?.picture ?? null,
        },
      ]),
    );
    return {
      ...common,
      type: "matching",
      prompt: promptOf(interaction),
      pairs: pairsOf(interaction)
        .filter((pair) => choices.has(pair.from) && choices.has(pair.to))
        .slice(0, MAX_PAIRS)
        .map((pair) => ({
          id: newId(),
          prompt: choices.get(pair.from)?.text ?? "",
          promptPicture: choices.get(pair.from)?.picture ?? null,
          answer: choices.get(pair.to)?.text ?? "",
          answerPicture: choices.get(pair.to)?.picture ?? null,
        })),
      distractors: [],
    };
  }

  function orderOf(interaction: Element) {
    const choices = new Map(
      childrenNamed(interaction, "simpleChoice").map((choice) => [
        attr(choice, "identifier") ?? "",
        choice,
      ]),
    );
    const order = declarationFor(interaction)?.correct ?? [];
    const sequence = (order.length ? order : [...choices.keys()])
      .map((id) => choices.get(id))
      .filter((choice): choice is Element => Boolean(choice))
      .slice(0, MAX_ORDER_ITEMS);
    const processing = childrenNamed(item, "responseProcessing")[0];
    return {
      ...common,
      type: "ordering",
      prompt: promptOf(interaction),
      items: sequence.map((choice) => ({
        id: newId(),
        text: cut(wordsOf(choice), 300),
        picture: picturesOf(choice, options)?.picture ?? null,
      })),
      scoring:
        interaction.getAttribute("data-farida-scoring") === "neighbours" ||
        (processing && first(processing, "contains"))
          ? "neighbours"
          : "all",
    };
  }

  function hotspotOf(interaction: Element) {
    const shown = picturesOf(interaction, options);
    if (!shown) return null;
    const right = new Set(keyed(declarationFor(interaction)));
    const places = childrenNamed(interaction, "hotspotChoice")
      .slice(0, MAX_PLACES)
      .flatMap((choice) => {
        const box = boxOf(
          attr(choice, "shape") ?? "rect",
          attr(choice, "coords") ?? "",
          shown,
        );
        return box
          ? [
              {
                box,
                name: cut(attr(choice, "hotspotLabel") ?? "", MAX_PLACE_NAME),
                correct: right.has(attr(choice, "identifier") ?? ""),
              },
            ]
          : [];
      });
    return {
      ...common,
      type: "hotspot",
      prompt: promptOf(interaction),
      picture: shown.picture,
      places,
    };
  }

  function labellingOf(interaction: Element) {
    const shown = picturesOf(interaction, options);
    if (!shown) return null;
    const labels = new Map(
      childrenNamed(interaction, "gapText").map((gapText) => [
        attr(gapText, "identifier") ?? "",
        cut(wordsOf(gapText), MAX_PLACE_NAME),
      ]),
    );
    const labelOf = new Map(
      pairsOf(interaction).map((pair) => [pair.to, pair.from]),
    );
    const used = new Set<string>();
    const places = childrenNamed(interaction, "associableHotspot")
      .slice(0, MAX_PLACES)
      .flatMap((spot) => {
        const label = labelOf.get(attr(spot, "identifier") ?? "");
        const name = label ? labels.get(label) : undefined;
        const box = boxOf(
          attr(spot, "shape") ?? "rect",
          attr(spot, "coords") ?? "",
          shown,
        );
        if (!name || !box || used.has(name.toLocaleLowerCase())) return [];
        used.add(name.toLocaleLowerCase());
        return [{ box, name }];
      });
    return {
      ...common,
      type: "labelling",
      prompt: promptOf(interaction),
      picture: shown.picture,
      places,
      extras: distinct(
        [...labels.values()].filter(
          (label) => !used.has(label.toLocaleLowerCase()),
        ),
      ).slice(0, MAX_LABEL_EXTRAS),
    };
  }

  function extendedOf(interaction: Element) {
    const limit = Number(interaction.getAttribute("data-farida-word-limit"));
    const seconds = Number(
      interaction.getAttribute("data-farida-record-seconds"),
    );
    const passage = Array.from(body.getElementsByTagName("*")).find((element) =>
      element.hasAttribute("data-farida-passage"),
    );
    return {
      ...common,
      type: "written",
      prompt: promptOf(interaction),
      wordLimit:
        Number.isInteger(limit) && limit >= 10 && limit <= 5000 ? limit : null,
      ...((RECORD_SECONDS as readonly number[]).includes(seconds)
        ? { recordSeconds: seconds }
        : {}),
      ...(passage ? { passage: cut(wordsOf(passage), MAX_PASSAGE) } : {}),
    };
  }
}

/** The pictures an item shows, by the address it gives each, to store first. */
export function qtiItemPictures(item: Element): string[] {
  return [
    ...new Set(
      [...within(item, "img"), ...within(item, "object")]
        .map(
          (image) =>
            image.getAttribute("src") ?? image.getAttribute("data") ?? "",
        )
        .filter(Boolean),
    ),
  ];
}

/** A package's items and tests as its manifest lists them, QTI 3 or 2.x. */
export function qtiManifestOf(manifest: Document): {
  items: { identifier: string; href: string }[];
  tests: { identifier: string; href: string }[];
} {
  const resources = Array.from(manifest.getElementsByTagName("*")).filter(
    (element) => element.localName === "resource",
  );
  const listed = (pattern: RegExp) =>
    resources
      .filter((resource) => pattern.test(resource.getAttribute("type") ?? ""))
      .map((resource) => ({
        identifier: resource.getAttribute("identifier") ?? "",
        href:
          resource.getAttribute("href") ??
          Array.from(resource.children)
            .find((child) => child.localName === "file")
            ?.getAttribute("href") ??
          "",
      }))
      .filter((resource) => resource.href);
  return {
    items: listed(/^imsqti_item_xmlv(?:2p|3p)/u),
    tests: listed(/^imsqti_test_xmlv(?:2p|3p)/u),
  };
}

/** The items a test asks, in its order, by the address each is at from the test. */
export function qtiTestItems(test: Element): string[] {
  return Array.from(test.getElementsByTagName("*"))
    .filter((element) => qtiName(element) === "assessmentItemRef")
    .map((ref) => ref.getAttribute("href") ?? "")
    .filter(Boolean);
}
