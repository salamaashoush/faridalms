import type { LessonBlock, Picture } from "./learning";

import { partName } from "./learning";

/**
 * A module as an IMS Common Cartridge 1.1, the version Moodle and Canvas
 * both import: its lessons as pages, each lesson's questions as a quiz
 * after it, its links to outside tools, and the files they show. Questions
 * take CC's QTI 1.2.1 profile where it has a form for them; any other kind
 * goes as a teacher-marked essay that shows its parts, with the key for
 * the marker. Beside them, out of the course's way, every lesson is kept
 * whole, for this app to bring back without loss.
 */

const CC = "http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1";
const LOM_RESOURCE = "http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource";
const LOM_MANIFEST = "http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest";
const QTI = "http://www.imsglobal.org/xsd/ims_qtiasiv1p2";
const PROFILE = "http://www.imsglobal.org/profile/cc/ccv1p1";
const LTI_XSD = "http://www.imsglobal.org/xsd/lti/ltiv1p0";

/** CC's own reference to a file from inside a descriptor, as Moodle and Canvas resolve it. */
export const CC_FILEBASE = "$IMS-CC-FILEBASE$";

/** The resource types a CC 1.1 package names, as its schema lists them. */
export const CC_TYPES = {
  page: "webcontent",
  quiz: "imsqti_xmlv1p2/imscc_xmlv1p1/assessment",
  link: "imswl_xmlv1p1",
  tool: "imsbasiclti_xmlv1p0",
  kept: "associatedcontent/imscc_xmlv1p1/learning-application-resource",
} as const;

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const ARABIC = /[؀-ۿ]/u;
const langOf = (text: string) => (ARABIC.test(text) ? "ar" : "en");
const dirOf = (text: string) => (ARABIC.test(text) ? "rtl" : "ltr");

/** Words as HTML, a line break where the words break a line. */
const html = (text: string) => escape(text).replaceAll("\n", "<br/>");

/** An NCName-safe, ASCII file name, its extension kept, for paths every LMS resolves alike. */
export function plainFileName(name: string, fallback: string): string {
  const dot = name.lastIndexOf(".");
  const extension =
    dot > 0 ? name.slice(dot + 1).replaceAll(/[^A-Za-z0-9]/g, "") : "";
  const stem = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replaceAll(/[^A-Za-z0-9._-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${stem || fallback}${extension ? `.${extension.toLowerCase()}` : ""}`;
}

export interface CcItemOptions {
  /** The item's ident, unique in its quiz. */
  ident: string;
  /** Where a stored picture is, from the quiz's descriptor; none leaves it out. */
  picture: (fileId: string) => string | null;
}

const field = (label: string, entry: string) =>
  `<qtimetadatafield><fieldlabel>${label}</fieldlabel><fieldentry>${escape(entry)}</fieldentry></qtimetadatafield>`;

const material = (
  content: string,
  type: "text/plain" | "text/html",
  lang: string,
) =>
  `<material><mattext texttype="${type}" xml:lang="${lang}">${escape(content)}</mattext></material>`;

const feedback = (ident: string, content: string, lang: string) =>
  `<itemfeedback ident="${ident}"><flow_mat>${material(content, "text/html", lang)}</flow_mat></itemfeedback>`;

const showFeedback = (ident: string, condition = "<other/>") =>
  `<respcondition continue="Yes"><conditionvar>${condition}</conditionvar><displayfeedback feedbacktype="Response" linkrefid="${ident}"/></respcondition>`;

const SCORED = `<outcomes><decvar varname="SCORE" vartype="Decimal" minvalue="0" maxvalue="100"/></outcomes>`;

/** Points as CC weighs a question: a whole number up to 99. */
const weighting = (points: number) =>
  Math.min(99, Math.max(0, Math.round(points)));

const alphabetical = (texts: string[]) =>
  texts.toSorted((a, b) => a.localeCompare(b));

function pictureHtml(
  options: CcItemOptions,
  shown: Picture | null | undefined,
) {
  if (!shown) return "";
  const href = options.picture(shown.fileId);
  return href ? `<img src="${escape(href)}" alt="${escape(shown.alt)}"/>` : "";
}

const list = (items: string[]) =>
  items.length
    ? `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`
    : "";

/**
 * What a kind with no CC form shows a student in its essay, its parts in no
 * telling order, and what the marker reads as the key.
 */
function essayOf(
  block: LessonBlock,
  options: CcItemOptions,
): { stem: string; key: string } {
  switch (block.type) {
    case "number":
      return {
        stem: "",
        key:
          block.mode === "range"
            ? `${block.min} – ${block.max}`
            : `${block.value}${block.tolerance ? ` ± ${block.tolerance}${block.percent ? "%" : ""}` : ""}`,
      };
    case "gaps": {
      const words = block.segments
        .map((segment) =>
          segment.type === "text" ? html(segment.text) : "______",
        )
        .join("");
      const bank = block.bank
        ? alphabetical([
            ...block.segments.flatMap((segment) =>
              segment.type === "gap" ? segment.answers.slice(0, 1) : [],
            ),
            ...block.bank,
          ])
        : [];
      return {
        stem: `<p>${words}</p>${list(bank.map(html))}`,
        key: list(
          block.segments.flatMap((segment) =>
            segment.type === "gap" ? [html(segment.answers.join(" / "))] : [],
          ),
        ),
      };
    }
    case "highlight":
      return {
        stem: `<p>${block.segments.map((segment) => html(segment.text)).join("")}</p>`,
        key: list(
          block.segments.flatMap((segment) =>
            segment.type === "target" ? [html(segment.text)] : [],
          ),
        ),
      };
    case "matching":
      return {
        stem:
          list(
            block.pairs.map(
              (pair) =>
                `${pictureHtml(options, pair.promptPicture)}${html(pair.prompt)}`,
            ),
          ) +
          list(
            alphabetical([
              ...block.pairs.map((pair) =>
                partName({ text: pair.answer, picture: pair.answerPicture }),
              ),
              ...block.distractors.map((distractor) => partName(distractor)),
            ]).map(html),
          ),
        key: list(
          block.pairs.map(
            (pair) =>
              `${html(partName({ text: pair.prompt, picture: pair.promptPicture }))} → ${html(partName({ text: pair.answer, picture: pair.answerPicture }))}`,
          ),
        ),
      };
    case "ordering":
      return {
        stem: list(
          alphabetical(block.items.map((item) => partName(item))).map(html),
        ),
        key: `<ol>${block.items.map((item) => `<li>${html(partName(item))}</li>`).join("")}</ol>`,
      };
    case "sorting":
      return {
        stem:
          list(
            block.groups.map((group) => `<strong>${html(group.name)}</strong>`),
          ) +
          list(
            alphabetical(block.items.map((item) => partName(item))).map(html),
          ),
        key: list(
          block.items.map(
            (item) =>
              `${html(partName(item))} → ${html(block.groups.find((group) => group.id === item.groupId)?.name ?? "")}`,
          ),
        ),
      };
    case "hotspot":
      return {
        stem: pictureHtml(options, block.picture),
        key: list(
          block.places
            .filter((place) => place.correct)
            .map((place) => html(place.name)),
        ),
      };
    case "labelling":
      return {
        stem:
          pictureHtml(options, block.picture) +
          list(
            alphabetical([
              ...block.places.map((place) => place.name),
              ...block.extras,
            ]).map(html),
          ),
        key: list(block.places.map((place) => html(place.name))),
      };
    case "written":
      return {
        stem: `${pictureHtml(options, block.picture)}${block.passage ? `<blockquote>${html(block.passage)}</blockquote>` : ""}`,
        key: "",
      };
    default:
      return { stem: "", key: "" };
  }
}

const TRUE = new Set(["true", "صواب", "صح", "صحيح"]);
const FALSE = new Set(["false", "خطأ", "خاطئ"]);

/**
 * A question as an item of CC's QTI profile: a choice as multiple choice,
 * multiple response or true and false, a typed answer as fill in the blank,
 * and any other kind as an essay. Hints have no place in the profile.
 */
export function ccItem(
  block: LessonBlock,
  options: CcItemOptions,
): string | null {
  if (!("prompt" in block)) return null;
  const lang = langOf(block.prompt);
  const stemOf = (extra: string) =>
    material(
      `<p dir="${dirOf(block.prompt)}">${html(block.prompt)}</p>${extra}`,
      "text/html",
      lang,
    );
  const general = block.explanation.trim()
    ? feedback("general_fb", `<p>${html(block.explanation)}</p>`, lang)
    : "";
  const generalShown = general ? showFeedback("general_fb") : "";
  const item = (
    profile: string,
    presentation: string,
    processing: string,
    feedbacks: string,
    more = "",
  ) =>
    `<item ident="${options.ident}" title="${escape(block.prompt.slice(0, 80))}"><itemmetadata><qtimetadata>${field("cc_profile", profile)}${field("cc_weighting", String(block.type === "poll" ? 0 : weighting(block.points)))}${more}</qtimetadata></itemmetadata><presentation>${presentation}</presentation>${
      // An essay with nothing to show after answering is marked by hand
      // and has no processing; the profile allows none, but not an empty one.
      processing ? `<resprocessing>${SCORED}${processing}</resprocessing>` : ""
    }${feedbacks}</item>`;

  if (block.type === "choice" || block.type === "poll") {
    const texts = block.options.map((option) =>
      option.text.trim().toLocaleLowerCase(),
    );
    const trueFalse =
      block.type === "choice" &&
      !block.multiple &&
      block.options.length === 2 &&
      texts.some((text) => TRUE.has(text)) &&
      texts.some((text) => FALSE.has(text));
    const ident = (index: number) =>
      trueFalse
        ? TRUE.has(texts[index] ?? "")
          ? "true"
          : "false"
        : `a${index + 1}`;
    const right =
      block.type === "poll"
        ? block.options.map((_, index) => ident(index))
        : block.options.flatMap((option, index) =>
            block.correctOptionIds.includes(option.id) ? [ident(index)] : [],
          );
    const multiple = block.type === "poll" ? false : block.multiple;
    const labels = block.options
      .map((option, index) => {
        const shown = pictureHtml(options, option.picture);
        return `<response_label ident="${ident(index)}">${shown ? material(`${shown}${html(option.text)}`, "text/html", lang) : material(option.text, "text/plain", lang)}</response_label>`;
      })
      .join("");
    const presentation = `${stemOf("")}<response_lid ident="response1" rcardinality="${multiple ? "Multiple" : "Single"}"><render_choice shuffle="${block.type === "choice" && block.shuffle ? "Yes" : "No"}">${labels}</render_choice></response_lid>`;
    const own =
      block.type === "choice"
        ? block.options.flatMap((option, index) =>
            option.feedback.trim()
              ? [
                  {
                    ident: `${ident(index)}_fb`,
                    label: ident(index),
                    text: option.feedback,
                  },
                ]
              : [],
          )
        : [];
    const correctCondition = multiple
      ? `<and>${block.options
          .map((_, index) =>
            right.includes(ident(index))
              ? `<varequal case="Yes" respident="response1">${ident(index)}</varequal>`
              : `<not><varequal case="Yes" respident="response1">${ident(index)}</varequal></not>`,
          )
          .join("")}</and>`
      : right
          .map((each) => `<varequal respident="response1">${each}</varequal>`)
          .join("");
    const scoring =
      block.type === "poll"
        ? `<respcondition continue="No"><conditionvar><other/></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>`
        : `<respcondition continue="No"><conditionvar>${correctCondition}</conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>`;
    return item(
      trueFalse
        ? "cc.true_false.v0p1"
        : multiple
          ? "cc.multiple_response.v0p1"
          : "cc.multiple_choice.v0p1",
      presentation,
      `${generalShown}${own
        .map((each) =>
          showFeedback(
            each.ident,
            `<varequal respident="response1">${each.label}</varequal>`,
          ),
        )
        .join("")}${scoring}`,
      `${general}${own.map((each) => feedback(each.ident, `<p>${html(each.text)}</p>`, lang)).join("")}`,
    );
  }

  const blank = (answers: string[], caseSensitive: boolean) =>
    item(
      "cc.fib.v0p1",
      `${stemOf("")}<response_str ident="response1" rcardinality="Single"><render_fib rows="1"/></response_str>`,
      `${generalShown}<respcondition continue="No"><conditionvar>${answers
        .map(
          (answer) =>
            `<varequal case="${caseSensitive ? "Yes" : "No"}" respident="response1">${escape(answer)}</varequal>`,
        )
        .join(
          "",
        )}</conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>`,
      general,
    );
  if (block.type === "text") return blank(block.answers, block.caseSensitive);
  if (block.type === "math") return blank(block.answers, true);
  if (block.type === "number" && block.mode === "exact" && !block.tolerance)
    return blank([String(block.value)], false);

  const { stem, key } = essayOf(block, options);
  const solution = key
    ? `<itemfeedback ident="solution"><solution><solutionmaterial>${material(key, "text/html", lang)}</solutionmaterial></solution></itemfeedback>`
    : "";
  return item(
    "cc.essay.v0p1",
    `${stemOf(stem)}<response_str ident="response1" rcardinality="Single"><render_fib rows="${block.type === "written" ? 8 : 3}"/></response_str>`,
    generalShown,
    `${general}${solution}`,
    `${field("qmd_scoringpermitted", "Yes")}${field("qmd_computerscored", "No")}`,
  );
}

/** A quiz of items, one section, as CC's profile asks. */
export function ccAssessment(quiz: {
  ident: string;
  title: string;
  items: string[];
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="${QTI}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${QTI} ${PROFILE}/ccv1p1_qtiasiv1p2p1_v1p0.xsd"><assessment ident="${quiz.ident}" title="${escape(quiz.title)}"><qtimetadata>${field("cc_profile", "cc.exam.v0p1")}${field("qmd_assessmenttype", "Examination")}${field("qmd_scoretype", "Percentage")}${field("qmd_feedbackpermitted", "Yes")}${field("qmd_hintspermitted", "No")}${field("qmd_solutionspermitted", "Yes")}${field("cc_maxattempts", "unlimited")}</qtimetadata><section ident="${quiz.ident}_section">${quiz.items.join("")}</section></assessment></questestinterop>
`;
}

/** A link to an outside tool as CC 1.1 carries one; the tool must be registered again where it lands. */
export function ccToolLink(link: {
  title: string;
  description: string;
  url: string;
  custom: Record<string, string>;
}): string {
  const custom = Object.entries(link.custom);
  return `<?xml version="1.0" encoding="UTF-8"?>
<cartridge_basiclti_link xmlns="http://www.imsglobal.org/xsd/imslticc_v1p0" xmlns:blti="http://www.imsglobal.org/xsd/imsbasiclti_v1p0" xmlns:lticm="http://www.imsglobal.org/xsd/imslticm_v1p0" xmlns:lticp="http://www.imsglobal.org/xsd/imslticp_v1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imslticc_v1p0 ${LTI_XSD}/imslticc_v1p0.xsd http://www.imsglobal.org/xsd/imsbasiclti_v1p0 ${LTI_XSD}/imsbasiclti_v1p0p1.xsd http://www.imsglobal.org/xsd/imslticm_v1p0 ${LTI_XSD}/imslticm_v1p0.xsd http://www.imsglobal.org/xsd/imslticp_v1p0 ${LTI_XSD}/imslticp_v1p0.xsd"><blti:title>${escape(link.title)}</blti:title><blti:description>${escape(link.description)}</blti:description>${custom.length ? `<blti:custom>${custom.map(([name, value]) => `<lticm:property name="${escape(name)}">${escape(value)}</lticm:property>`).join("")}</blti:custom>` : ""}<blti:launch_url>${escape(link.url)}</blti:launch_url><blti:secure_launch_url>${escape(link.url)}</blti:secure_launch_url><blti:vendor><lticp:code>farida</lticp:code><lticp:name>Farida</lticp:name></blti:vendor></cartridge_basiclti_link>
`;
}

/** A lesson as a page, in its own language and direction. */
export function ccPage(page: {
  title: string;
  body: string;
  kept: string;
}): string {
  const lang = langOf(`${page.title} ${page.body}`);
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${escape(page.title)}</title><meta name="farida-lesson" content="${escape(page.kept)}"></head><body><h1>${escape(page.title)}</h1>${page.body}</body></html>
`;
}

export interface CcResource {
  identifier: string;
  type: (typeof CC_TYPES)[keyof typeof CC_TYPES];
  href?: string;
  files: string[];
  dependencies?: string[];
  /** Hidden from students where it lands. */
  instructorOnly?: boolean;
}

/** A module's items under the course's single organization. */
export interface CcModule {
  identifier: string;
  title: string;
  items: { identifier: string; title: string; resource: string }[];
}

export function ccManifest(manifest: {
  identifier: string;
  title: string;
  modules: CcModule[];
  resources: CcResource[];
}): string {
  const lang = langOf(manifest.title);
  const role = `<metadata><lom:lom><lom:educational><lom:intendedEndUserRole><lom:source>IMSGLC_CC_Rolesv1p1</lom:source><lom:value>Instructor</lom:value></lom:intendedEndUserRole></lom:educational></lom:lom></metadata>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="${CC}" xmlns:lom="${LOM_RESOURCE}" xmlns:lomimscc="${LOM_MANIFEST}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="${manifest.identifier}" xsi:schemaLocation="${CC} ${PROFILE}/ccv1p1_imscp_v1p2_v1p0.xsd ${LOM_RESOURCE} ${PROFILE}/LOM/ccv1p1_lomresource_v1p0.xsd ${LOM_MANIFEST} ${PROFILE}/LOM/ccv1p1_lommanifest_v1p0.xsd"><metadata><schema>IMS Common Cartridge</schema><schemaversion>1.1.0</schemaversion><lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string language="${lang}">${escape(manifest.title)}</lomimscc:string></lomimscc:title><lomimscc:language>${lang}</lomimscc:language></lomimscc:general></lomimscc:lom></metadata><organizations><organization identifier="org_1" structure="rooted-hierarchy"><item identifier="LearningModules">${manifest.modules
    .map(
      (module) =>
        `<item identifier="${module.identifier}"><title>${escape(module.title)}</title>${module.items
          .map(
            (item) =>
              `<item identifier="${item.identifier}" identifierref="${item.resource}"><title>${escape(item.title)}</title></item>`,
          )
          .join("")}</item>`,
    )
    .join(
      "",
    )}</item></organization></organizations><resources>${manifest.resources
    .map(
      (resource) =>
        `<resource identifier="${resource.identifier}" type="${resource.type}"${resource.href ? ` href="${escape(resource.href)}"` : ""}>${resource.instructorOnly ? role : ""}${resource.files
          .map((file) => `<file href="${escape(file)}"/>`)
          .join("")}${(resource.dependencies ?? [])
          .map((dependency) => `<dependency identifierref="${dependency}"/>`)
          .join("")}</resource>`,
    )
    .join("")}</resources></manifest>
`;
}
