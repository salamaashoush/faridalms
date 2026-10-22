import type { LessonBlock, Picture } from "./learning";

/**
 * Questions as QTI 3.0, 1EdTech's format for moving assessment items
 * between systems: each question an item that scores itself out of its
 * points, in a package with a manifest and a test for each lesson. What
 * QTI has no word for (a poll, close-enough spelling, hints, a word limit)
 * travels in `data-farida-*` attributes and in feedback no response sets,
 * which other systems pass over and this one reads back.
 */

export const QTI_NAMESPACE = "http://www.imsglobal.org/xsd/imsqtiasi_v3p0";
const QTI_SCHEMA =
  "https://purl.imsglobal.org/spec/qti/v3p0/schema/xsd/imsqti_asiv3p0p1_v1p0.xsd";
const MANIFEST_NAMESPACE =
  "http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1";
const MANIFEST_SCHEMA =
  "https://purl.imsglobal.org/spec/qti/v3p0/schema/xsd/imsqtiv3p0_imscpv1p2_v1p0.xsd";

/** A stored picture as a package holds it: its path there, and its size when known. */
export interface QtiPicture {
  href: string;
  width: number | null;
  height: number | null;
}

export interface QtiItemOptions {
  /** The item's identifier, a letter first as XML ids need. */
  identifier: string;
  title: string;
  /** Where a stored picture is in the package; none leaves it out. */
  picture: (fileId: string) => QtiPicture | null;
}

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Text as XML content, a line break where the words break a line. */
const lines = (value: string) => escape(value).replaceAll("\n", "<br/>");

const ARABIC = /[؀-ۿ]/u;

/** A question's language, which sets the direction its body reads in. */
export function qtiLanguage(block: LessonBlock): "ar" | "en" {
  return "prompt" in block && ARABIC.test(block.prompt) ? "ar" : "en";
}

/** A number as QTI writes it: no exponent and no needless digits. */
const number = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));

const base = (text: string, baseType: string) =>
  `<qti-base-value base-type="${baseType}">${escape(text)}</qti-base-value>`;

const declaration = (
  identifier: string,
  cardinality: string,
  baseType: string,
  inner = "",
) =>
  `<qti-response-declaration identifier="${identifier}" cardinality="${cardinality}" base-type="${baseType}">${inner}</qti-response-declaration>`;

const correct = (values: string[]) =>
  values.length
    ? `<qti-correct-response>${values.map((each) => `<qti-value>${escape(each)}</qti-value>`).join("")}</qti-correct-response>`
    : "";

const mapping = (
  entries: { key: string; value: number; caseSensitive?: boolean }[],
  bounds: { lower?: number; upper?: number } = {},
) =>
  `<qti-mapping default-value="0"${bounds.lower === undefined ? "" : ` lower-bound="${number(bounds.lower)}"`}${bounds.upper === undefined ? "" : ` upper-bound="${number(bounds.upper)}"`}>${entries
    .map(
      (entry) =>
        `<qti-map-entry map-key="${escape(entry.key)}" mapped-value="${number(entry.value)}"${entry.caseSensitive === undefined ? "" : ` case-sensitive="${entry.caseSensitive}"`}/>`,
    )
    .join("")}</qti-mapping>`;

const variable = (identifier: string) =>
  `<qti-variable identifier="${identifier}"/>`;

const answered = (identifier: string) =>
  `<qti-not><qti-is-null>${variable(identifier)}</qti-is-null></qti-not>`;

/** Sets the score when a condition holds. */
const when = (condition: string, score: string) =>
  `<qti-response-condition><qti-response-if>${condition}<qti-set-outcome-value identifier="SCORE">${score}</qti-set-outcome-value></qti-response-if></qti-response-condition>`;

const plus = (add: string) => `<qti-sum>${variable("SCORE")}${add}</qti-sum>`;

/** Full marks when a response matches its key. */
const fullWhenCorrect = (identifier = "RESPONSE") =>
  when(
    `<qti-match>${variable(identifier)}<qti-correct identifier="${identifier}"/></qti-match>`,
    variable("MAXSCORE"),
  );

/** What a mapping gives a response, added to the score once one is given. */
const mappedScore = (identifier = "RESPONSE") =>
  when(
    answered(identifier),
    plus(`<qti-map-response identifier="${identifier}"/>`),
  );

/** Equal shares of a question's points, one for each part marked. */
const share = (points: number, parts: number) =>
  parts > 0 ? points / parts : 0;

function picture(options: QtiItemOptions, shown: Picture | null | undefined) {
  if (!shown) return "";
  const stored = options.picture(shown.fileId);
  if (!stored) return "";
  const size =
    stored.width && stored.height
      ? ` width="${stored.width}" height="${stored.height}"`
      : "";
  return `<img src="${escape(stored.href)}" alt="${escape(shown.alt)}"${size}/>`;
}

/** A box across a picture, held as fractions, in the picture's own pixels. */
function rect(box: readonly number[], size: { width: number; height: number }) {
  const [left = 0, top = 0, width = 0, height = 0] = box;
  return [
    left * size.width,
    top * size.height,
    (left + width) * size.width,
    (top + height) * size.height,
  ]
    .map((each) => String(Math.round(each)))
    .join(",");
}

interface Parts {
  declarations: string;
  body: string;
  processing: string;
  /** Each option's own feedback, which the response sets. */
  optionFeedback?: boolean;
  /** Marked by a teacher, so the score is theirs to give. */
  human?: boolean;
}

const prompt = (text: string) => `<qti-prompt>${lines(text)}</qti-prompt>`;

function choiceParts(
  block: Extract<LessonBlock, { type: "choice" | "poll" }>,
  options: QtiItemOptions,
): Parts {
  const ids = new Map(
    block.options.map((option, index) => [option.id, `C${index + 1}`]),
  );
  const poll = block.type === "poll";
  const feedback = !poll && block.options.some((option) => option.feedback);
  const choices = block.options
    .map((option) => {
      const id = ids.get(option.id) ?? "";
      const own =
        feedback && option.feedback
          ? `<qti-feedback-inline outcome-identifier="FEEDBACK" identifier="${id}" show-hide="show">${escape(option.feedback)}</qti-feedback-inline>`
          : "";
      return `<qti-simple-choice identifier="${id}">${picture(options, option.picture)}${escape(option.text)}${own}</qti-simple-choice>`;
    })
    .join("");
  const pollFlags = poll
    ? ` data-farida-kind="poll"${block.classResults ? ' data-farida-class-results="true"' : ""}`
    : "";
  return {
    declarations: declaration(
      "RESPONSE",
      block.multiple ? "multiple" : "single",
      "identifier",
      poll
        ? ""
        : correct(block.correctOptionIds.map((id) => ids.get(id) ?? "")),
    ),
    body: `<qti-choice-interaction response-identifier="RESPONSE" max-choices="${block.multiple ? 0 : 1}" shuffle="${block.type === "choice" && block.shuffle}"${pollFlags}>${prompt(block.prompt)}${choices}</qti-choice-interaction>`,
    processing: poll
      ? ""
      : `${feedback ? `<qti-set-outcome-value identifier="FEEDBACK">${variable("RESPONSE")}</qti-set-outcome-value>` : ""}${fullWhenCorrect()}`,
    optionFeedback: feedback,
  };
}

function textParts(block: Extract<LessonBlock, { type: "text" }>): Parts {
  const flags = `${block.closeEnough ? ' data-farida-close-enough="true"' : ""}${block.tehMarbuta ? ' data-farida-teh-marbuta="true"' : ""}`;
  return {
    declarations: declaration(
      "RESPONSE",
      "single",
      "string",
      correct(block.answers.slice(0, 1)) +
        mapping(
          block.answers.map((answer) => ({
            key: answer,
            value: block.points,
            caseSensitive: block.caseSensitive,
          })),
          { upper: block.points },
        ),
    ),
    body: `<p>${lines(block.prompt)}</p><p><qti-text-entry-interaction response-identifier="RESPONSE"${flags}/></p>`,
    processing: mappedScore(),
  };
}

function mathParts(block: Extract<LessonBlock, { type: "math" }>): Parts {
  const tolerance = block.tolerance
    ? ` data-farida-tolerance="${number(block.tolerance)}"`
    : "";
  return {
    declarations: declaration(
      "RESPONSE",
      "single",
      "string",
      correct(block.answers.slice(0, 1)) +
        mapping(
          block.answers.map((answer) => ({ key: answer, value: block.points })),
          { upper: block.points },
        ),
    ),
    body: `<p>${lines(block.prompt)}</p><p><qti-text-entry-interaction response-identifier="RESPONSE" data-farida-kind="math"${tolerance}/></p>`,
    processing: mappedScore(),
  };
}

function numberParts(block: Extract<LessonBlock, { type: "number" }>): Parts {
  const test =
    block.mode === "range"
      ? `<qti-gte>${variable("RESPONSE")}${base(number(block.min), "float")}</qti-gte><qti-lte>${variable("RESPONSE")}${base(number(block.max), "float")}</qti-lte>`
      : `<qti-equal tolerance-mode="${block.tolerance ? (block.percent ? "relative" : "absolute") : "exact"}"${block.tolerance ? ` tolerance="${number(block.tolerance)}"` : ""}>${variable("RESPONSE")}<qti-correct identifier="RESPONSE"/></qti-equal>`;
  const line = block.line
    ? ` data-farida-line="${number(block.line.from)} ${number(block.line.to)} ${number(block.line.step)}"`
    : "";
  return {
    declarations: declaration(
      "RESPONSE",
      "single",
      "float",
      block.mode === "exact" ? correct([number(block.value)]) : "",
    ),
    body: `<p>${lines(block.prompt)}</p><p><qti-text-entry-interaction response-identifier="RESPONSE"${line}/></p>`,
    processing: when(
      `<qti-and>${answered("RESPONSE")}${test}</qti-and>`,
      variable("MAXSCORE"),
    ),
  };
}

function gapParts(block: Extract<LessonBlock, { type: "gaps" }>): Parts {
  const gaps = block.segments.filter((segment) => segment.type === "gap");
  const each = share(block.points, gaps.length);
  if (block.bank) {
    // One bank of words for every gap, extra words among them.
    const words = [
      ...new Set([...gaps.flatMap((gap) => gap.answers), ...block.bank]),
    ];
    const wordId = new Map(words.map((word, index) => [word, `W${index + 1}`]));
    const gapId = new Map(gaps.map((gap, index) => [gap.id, `G${index + 1}`]));
    const pairs = gaps.flatMap((gap) =>
      gap.answers.map((answer) => `${wordId.get(answer)} ${gapId.get(gap.id)}`),
    );
    const text = block.segments
      .map((segment) =>
        segment.type === "text"
          ? lines(segment.text)
          : `<qti-gap identifier="${gapId.get(segment.id)}"/>`,
      )
      .join("");
    return {
      declarations: declaration(
        "RESPONSE",
        "multiple",
        "directedPair",
        correct(
          gaps.map(
            (gap) => `${wordId.get(gap.answers[0] ?? "")} ${gapId.get(gap.id)}`,
          ),
        ) +
          mapping(
            pairs.map((pair) => ({ key: pair, value: each })),
            { lower: 0, upper: block.points },
          ),
      ),
      body: `<qti-gap-match-interaction response-identifier="RESPONSE" shuffle="true" max-associations="0">${prompt(block.prompt)}${words
        .map(
          (word) =>
            `<qti-gap-text identifier="${wordId.get(word)}" match-max="0">${escape(word)}</qti-gap-text>`,
        )
        .join("")}<p>${text}</p></qti-gap-match-interaction>`,
      processing: mappedScore(),
    };
  }
  let declarations = "";
  let processing = "";
  const text = block.segments
    .map((segment) => {
      if (segment.type === "text") return lines(segment.text);
      const id = `G${gaps.indexOf(segment) + 1}`;
      if (segment.options.length > 0) {
        const choice = new Map(
          segment.options.map((option, index) => [
            option,
            `${id}O${index + 1}`,
          ]),
        );
        declarations += declaration(
          id,
          "single",
          "identifier",
          correct(
            segment.answers
              .slice(0, 1)
              .map((answer) => choice.get(answer) ?? ""),
          ) +
            mapping(
              segment.answers.map((answer) => ({
                key: choice.get(answer) ?? "",
                value: each,
              })),
              { upper: each },
            ),
        );
        processing += mappedScore(id);
        return `<qti-inline-choice-interaction response-identifier="${id}" shuffle="true">${segment.options
          .map(
            (option) =>
              `<qti-inline-choice identifier="${choice.get(option)}">${escape(option)}</qti-inline-choice>`,
          )
          .join("")}</qti-inline-choice-interaction>`;
      }
      declarations += declaration(
        id,
        "single",
        "string",
        correct(segment.answers.slice(0, 1)) +
          mapping(
            segment.answers.map((answer) => ({
              key: answer,
              value: each,
              caseSensitive: block.caseSensitive,
            })),
            { upper: each },
          ),
      );
      processing += mappedScore(id);
      return `<qti-text-entry-interaction response-identifier="${id}"${block.closeEnough ? ' data-farida-close-enough="true"' : ""}/>`;
    })
    .join("");
  return {
    declarations,
    body: `<p>${lines(block.prompt)}</p><p>${text}</p>`,
    processing,
  };
}

function highlightParts(
  block: Extract<LessonBlock, { type: "highlight" }>,
): Parts {
  // Every word of the passage may be chosen, as in the lesson; only the
  // words to find count, and each other one chosen counts against.
  const targets = block.segments.filter((segment) => segment.type === "target");
  const each = share(block.points, targets.length);
  let others = 0;
  const entries: { key: string; value: number }[] = [];
  const text = block.segments
    .map((segment) => {
      if (segment.type === "target") {
        const id = `T${targets.indexOf(segment) + 1}`;
        entries.push({ key: id, value: each });
        return `<qti-hottext identifier="${id}">${escape(segment.text)}</qti-hottext>`;
      }
      return segment.text
        .split(/(\s+)/u)
        .map((part) => {
          if (!part.trim()) return lines(part);
          others += 1;
          const id = `W${others}`;
          entries.push({ key: id, value: -each });
          return `<qti-hottext identifier="${id}">${escape(part)}</qti-hottext>`;
        })
        .join("");
    })
    .join("");
  return {
    declarations: declaration(
      "RESPONSE",
      "multiple",
      "identifier",
      correct(targets.map((_, index) => `T${index + 1}`)) +
        mapping(entries, { lower: 0, upper: block.points }),
    ),
    body: `<qti-hottext-interaction response-identifier="RESPONSE" max-choices="0">${prompt(block.prompt)}<p>${text}</p></qti-hottext-interaction>`,
    processing: mappedScore(),
  };
}

function matchingParts(
  block: Extract<LessonBlock, { type: "matching" }>,
  options: QtiItemOptions,
): Parts {
  const each = share(block.points, block.pairs.length);
  const sources = block.pairs
    .map(
      (pair, index) =>
        `<qti-simple-associable-choice identifier="P${index + 1}" match-max="1">${picture(options, pair.promptPicture)}${escape(pair.prompt)}</qti-simple-associable-choice>`,
    )
    .join("");
  const targets = [
    ...block.pairs.map(
      (pair, index) =>
        `<qti-simple-associable-choice identifier="A${index + 1}" match-max="1">${picture(options, pair.answerPicture)}${escape(pair.answer)}</qti-simple-associable-choice>`,
    ),
    ...block.distractors.map(
      (distractor, index) =>
        `<qti-simple-associable-choice identifier="D${index + 1}" match-max="1">${picture(options, distractor.picture)}${escape(distractor.text)}</qti-simple-associable-choice>`,
    ),
  ].join("");
  const pairs = block.pairs.map((_, index) => `P${index + 1} A${index + 1}`);
  return {
    declarations: declaration(
      "RESPONSE",
      "multiple",
      "directedPair",
      correct(pairs) +
        mapping(
          pairs.map((pair) => ({ key: pair, value: each })),
          { lower: 0, upper: block.points },
        ),
    ),
    body: `<qti-match-interaction response-identifier="RESPONSE" max-associations="${block.pairs.length}" shuffle="true"${block.memory ? ' data-farida-memory="true"' : ""}>${prompt(block.prompt)}<qti-simple-match-set>${sources}</qti-simple-match-set><qti-simple-match-set>${targets}</qti-simple-match-set></qti-match-interaction>`,
    processing: mappedScore(),
  };
}

function sortingParts(
  block: Extract<LessonBlock, { type: "sorting" }>,
  options: QtiItemOptions,
): Parts {
  const each = share(block.points, block.items.length);
  const groupId = new Map(
    block.groups.map((group, index) => [group.id, `G${index + 1}`]),
  );
  const pairs = block.items.map(
    (item, index) => `I${index + 1} ${groupId.get(item.groupId)}`,
  );
  return {
    declarations: declaration(
      "RESPONSE",
      "multiple",
      "directedPair",
      correct(pairs) +
        mapping(
          pairs.map((pair) => ({ key: pair, value: each })),
          { lower: 0, upper: block.points },
        ),
    ),
    body: `<qti-match-interaction response-identifier="RESPONSE" max-associations="${block.items.length}" shuffle="true" data-farida-kind="sorting">${prompt(block.prompt)}<qti-simple-match-set>${block.items
      .map(
        (item, index) =>
          `<qti-simple-associable-choice identifier="I${index + 1}" match-max="1">${picture(options, item.picture)}${escape(item.text)}</qti-simple-associable-choice>`,
      )
      .join("")}</qti-simple-match-set><qti-simple-match-set>${block.groups
      .map(
        (group) =>
          `<qti-simple-associable-choice identifier="${groupId.get(group.id)}" match-max="0">${escape(group.name)}</qti-simple-associable-choice>`,
      )
      .join("")}</qti-simple-match-set></qti-match-interaction>`,
    processing: mappedScore(),
  };
}

function orderingParts(
  block: Extract<LessonBlock, { type: "ordering" }>,
  options: QtiItemOptions,
): Parts {
  const ids = block.items.map((_, index) => `O${index + 1}`);
  const neighbours = block.scoring === "neighbours";
  const each = share(block.points, ids.length - 1);
  return {
    declarations: declaration(
      "RESPONSE",
      "ordered",
      "identifier",
      correct(ids),
    ),
    body: `<qti-order-interaction response-identifier="RESPONSE" shuffle="true"${neighbours ? ' data-farida-scoring="neighbours"' : ""}>${prompt(block.prompt)}${block.items
      .map(
        (item, index) =>
          `<qti-simple-choice identifier="${ids[index]}">${picture(options, item.picture)}${escape(item.text)}</qti-simple-choice>`,
      )
      .join("")}</qti-order-interaction>`,
    // Credit for each pair placed next to each other in order, as the
    // lesson gives it, since QTI has no template for that.
    processing: neighbours
      ? ids
          .slice(1)
          .map((id, index) =>
            when(
              `<qti-contains>${variable("RESPONSE")}<qti-ordered>${base(ids[index] ?? "", "identifier")}${base(id, "identifier")}</qti-ordered></qti-contains>`,
              plus(base(number(each), "float")),
            ),
          )
          .join("")
      : fullWhenCorrect(),
  };
}

function hotspotParts(
  block: Extract<LessonBlock, { type: "hotspot" }>,
  options: QtiItemOptions,
): Parts | null {
  // Places are told in the picture's pixels, so its size must be known.
  const stored = block.picture ? options.picture(block.picture.fileId) : null;
  if (!stored?.width || !stored.height || !block.picture) return null;
  const size = { width: stored.width, height: stored.height };
  const finds = block.places.filter((place) => place.correct).length;
  const each = share(block.points, finds);
  const ids = block.places.map((_, index) => `H${index + 1}`);
  return {
    declarations: declaration(
      "RESPONSE",
      "multiple",
      "identifier",
      correct(ids.filter((_, index) => block.places[index]?.correct)) +
        mapping(
          block.places.map((place, index) => ({
            key: ids[index] ?? "",
            value: place.correct ? each : -each,
          })),
          { lower: 0, upper: block.points },
        ),
    ),
    body: `<qti-hotspot-interaction response-identifier="RESPONSE" max-choices="0">${prompt(block.prompt)}${picture(options, block.picture)}${block.places
      .map(
        (place, index) =>
          `<qti-hotspot-choice identifier="${ids[index]}" shape="rect" coords="${rect(place.box, size)}"${place.name ? ` hotspot-label="${escape(place.name)}"` : ""}/>`,
      )
      .join("")}</qti-hotspot-interaction>`,
    processing: mappedScore(),
  };
}

function labellingParts(
  block: Extract<LessonBlock, { type: "labelling" }>,
  options: QtiItemOptions,
): Parts | null {
  // Places are told in the picture's pixels, so its size must be known.
  const stored = block.picture ? options.picture(block.picture.fileId) : null;
  if (!stored?.width || !stored.height || !block.picture) return null;
  const size = { width: stored.width, height: stored.height };
  const each = share(block.points, block.places.length);
  const labels = [...block.places.map((place) => place.name), ...block.extras];
  const pairs = block.places.map((_, index) => `L${index + 1} B${index + 1}`);
  return {
    declarations: declaration(
      "RESPONSE",
      "multiple",
      "directedPair",
      correct(pairs) +
        mapping(
          pairs.map((pair) => ({ key: pair, value: each })),
          { lower: 0, upper: block.points },
        ),
    ),
    body: `<qti-graphic-gap-match-interaction response-identifier="RESPONSE" max-associations="0">${prompt(block.prompt)}${picture(options, block.picture)}${labels
      .map(
        (label, index) =>
          `<qti-gap-text identifier="L${index + 1}" match-max="1">${escape(label)}</qti-gap-text>`,
      )
      .join("")}${block.places
      .map(
        (place, index) =>
          `<qti-associable-hotspot identifier="B${index + 1}" match-max="1" shape="rect" coords="${rect(place.box, size)}"/>`,
      )
      .join("")}</qti-graphic-gap-match-interaction>`,
    processing: mappedScore(),
  };
}

function writtenParts(
  block: Extract<LessonBlock, { type: "written" }>,
  options: QtiItemOptions,
): Parts {
  const limit = block.wordLimit
    ? ` pattern-mask="^\\s*(\\S+\\s+){0,${block.wordLimit - 1}}\\S*\\s*$" data-patternmask-message="${block.wordLimit} words at most" data-farida-word-limit="${block.wordLimit}"`
    : "";
  const spoken = block.recordSeconds
    ? ` data-farida-record-seconds="${block.recordSeconds}"`
    : "";
  const passage = block.passage
    ? `<div data-farida-passage="true"><p>${lines(block.passage)}</p></div>`
    : "";
  return {
    declarations: declaration("RESPONSE", "single", "string"),
    body: `${picture(options, block.picture)}${passage}<qti-extended-text-interaction response-identifier="RESPONSE" format="plain"${limit}${spoken}>${prompt(block.prompt)}</qti-extended-text-interaction>`,
    processing: "",
    human: true,
  };
}

function partsOf(block: LessonBlock, options: QtiItemOptions): Parts | null {
  switch (block.type) {
    case "choice":
    case "poll":
      return choiceParts(block, options);
    case "text":
      return textParts(block);
    case "math":
      return mathParts(block);
    case "number":
      return numberParts(block);
    case "gaps":
      return gapParts(block);
    case "highlight":
      return highlightParts(block);
    case "matching":
      return matchingParts(block, options);
    case "sorting":
      return sortingParts(block, options);
    case "ordering":
      return orderingParts(block, options);
    case "hotspot":
      return hotspotParts(block, options);
    case "labelling":
      return labellingParts(block, options);
    case "written":
      return writtenParts(block, options);
    default:
      return null;
  }
}

/** The stored pictures a question shows, which its item needs packed beside it. */
export function qtiPictures(block: LessonBlock): string[] {
  const pictures: (Picture | null | undefined)[] = [];
  switch (block.type) {
    case "choice":
    case "poll":
      pictures.push(...block.options.map((option) => option.picture));
      break;
    case "matching":
      pictures.push(
        ...block.pairs.flatMap((pair) => [
          pair.promptPicture,
          pair.answerPicture,
        ]),
        ...block.distractors.map((distractor) => distractor.picture),
      );
      break;
    case "sorting":
    case "ordering":
      pictures.push(...block.items.map((item) => item.picture));
      break;
    case "hotspot":
    case "labelling":
    case "written":
      pictures.push(block.picture);
      break;
    default:
      break;
  }
  return [
    ...new Set(pictures.flatMap((shown) => (shown ? [shown.fileId] : []))),
  ];
}

/**
 * A question as a QTI 3.0 item, or none for a kind QTI cannot hold, such
 * as a coding exercise or a crossword.
 */
export function qtiItem(
  block: LessonBlock,
  options: QtiItemOptions,
): string | null {
  if (!("prompt" in block)) return null;
  const parts = partsOf(block, options);
  if (!parts) return null;
  const lang = qtiLanguage(block);
  const hints = block.hints
    .filter((hint) => hint.trim())
    .map(
      (hint, index) =>
        `<qti-feedback-block outcome-identifier="HINT" identifier="HINT${index + 1}" show-hide="show" data-farida-hint="${index + 1}"><qti-content-body><p>${lines(hint)}</p></qti-content-body></qti-feedback-block>`,
    )
    .join("");
  const explanation = block.explanation.trim()
    ? `<qti-modal-feedback outcome-identifier="FEEDBACK" identifier="GENERAL" show-hide="hide" data-farida-explanation="true"><qti-content-body><p>${lines(block.explanation)}</p></qti-content-body></qti-modal-feedback>`
    : "";
  const feedback = parts.optionFeedback || explanation;
  const points = number(block.points);
  return `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="${QTI_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${QTI_NAMESPACE} ${QTI_SCHEMA}" identifier="${options.identifier}" title="${escape(options.title)}" adaptive="false" time-dependent="false" xml:lang="${lang}">${parts.declarations}<qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float" normal-maximum="${points}"${parts.human ? ' external-scored="human"' : ""}><qti-default-value><qti-value>0</qti-value></qti-default-value></qti-outcome-declaration><qti-outcome-declaration identifier="MAXSCORE" cardinality="single" base-type="float"><qti-default-value><qti-value>${points}</qti-value></qti-default-value></qti-outcome-declaration>${feedback ? '<qti-outcome-declaration identifier="FEEDBACK" cardinality="single" base-type="identifier"/>' : ""}${hints ? '<qti-outcome-declaration identifier="HINT" cardinality="single" base-type="identifier"/>' : ""}<qti-item-body dir="${lang === "ar" ? "rtl" : "ltr"}">${parts.body}${hints}</qti-item-body>${parts.processing ? `<qti-response-processing>${parts.processing}</qti-response-processing>` : ""}${explanation}</qti-assessment-item>
`;
}

/** A test holding a lesson's items in their order. */
export function qtiTest(test: {
  identifier: string;
  title: string;
  items: { identifier: string; href: string }[];
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-test xmlns="${QTI_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${QTI_NAMESPACE} ${QTI_SCHEMA}" identifier="${test.identifier}" title="${escape(test.title)}"><qti-test-part identifier="${test.identifier}_part" navigation-mode="nonlinear" submission-mode="simultaneous"><qti-assessment-section identifier="${test.identifier}_section" title="${escape(test.title)}" visible="true">${test.items
    .map(
      (item) =>
        `<qti-assessment-item-ref identifier="${item.identifier}" href="${escape(item.href)}"/>`,
    )
    .join("")}</qti-assessment-section></qti-test-part></qti-assessment-test>
`;
}

/** The package's manifest: every item, every test, and the pictures they show. */
export function qtiManifest(manifest: {
  identifier: string;
  items: { identifier: string; href: string; media: string[] }[];
  tests: { identifier: string; href: string; items: string[] }[];
  media: string[];
}): string {
  const files = (hrefs: string[]) =>
    hrefs.map((href) => `<file href="${escape(href)}"/>`).join("");
  const media = manifest.media.length
    ? `<resource identifier="MEDIA" type="webcontent">${files(manifest.media)}</resource>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="${MANIFEST_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${MANIFEST_NAMESPACE} ${MANIFEST_SCHEMA}" identifier="${manifest.identifier}"><metadata><schema>QTI Package</schema><schemaversion>3.0.0</schemaversion></metadata><organizations/><resources>${manifest.tests
    .map(
      (test) =>
        `<resource identifier="${test.identifier}" type="imsqti_test_xmlv3p0" href="${escape(test.href)}"><file href="${escape(test.href)}"/>${test.items
          .map((item) => `<dependency identifierref="${item}"/>`)
          .join("")}</resource>`,
    )
    .join("")}${manifest.items
    .map(
      (item) =>
        `<resource identifier="${item.identifier}" type="imsqti_item_xmlv3p0" href="${escape(item.href)}"><file href="${escape(item.href)}"/>${item.media.length ? '<dependency identifierref="MEDIA"/>' : ""}</resource>`,
    )
    .join("")}${media}</resources></manifest>
`;
}
