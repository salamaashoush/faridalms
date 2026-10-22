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
const QTI = "http://www.imsglobal.org/xsd/ims_qtiasiv1p2";
const LTI_XSD = "http://www.imsglobal.org/xsd/lti/ltiv1p0";
const CANVAS = "http://canvas.instructure.com/xsd/cccv1p0";

/**
 * CC 1.1 is the version Moodle imports, and checks against its schema;
 * CC 1.3 adds what Canvas reads beyond it, chiefly assignments.
 */
export type CcVersion = "1.1" | "1.3";

/** Each version's names: its namespaces, schema files and role vocabulary. */
const SPEC = {
  "1.1": {
    tag: "v1p1",
    schemaversion: "1.1.0",
    roles: "IMSGLC_CC_Rolesv1p1",
  },
  "1.3": {
    tag: "v1p3",
    schemaversion: "1.3.0",
    roles: "IMSGLC_CC_Rolesv1p2",
  },
} as const;

const namesOf = (version: CcVersion) => {
  const { tag } = SPEC[version];
  return {
    cc: `http://www.imsglobal.org/xsd/imscc${tag}/imscp_v1p1`,
    lomResource: `http://ltsc.ieee.org/xsd/imscc${tag}/LOM/resource`,
    lomManifest: `http://ltsc.ieee.org/xsd/imscc${tag}/LOM/manifest`,
    profile: `http://www.imsglobal.org/profile/cc/cc${tag}`,
    cpx: `http://www.imsglobal.org/xsd/imscc${tag}/imscp_extensionv1p2`,
    topic: `http://www.imsglobal.org/xsd/imscc${tag}/imsdt_${tag}`,
    file: `cc${tag}`,
  };
};

/** CC's own reference to a file from inside a descriptor, as Moodle and Canvas resolve it. */
export const CC_FILEBASE = "$IMS-CC-FILEBASE$";

/** The resource types a CC 1.1 package names, as its schema lists them. */
export const CC_TYPES = {
  page: "webcontent",
  quiz: "imsqti_xmlv1p2/imscc_xmlv1p1/assessment",
  link: "imswl_xmlv1p1",
  tool: "imsbasiclti_xmlv1p0",
  topic: "imsdt_xmlv1p1",
  bank: "imsqti_xmlv1p2/imscc_xmlv1p1/question-bank",
  kept: "associatedcontent/imscc_xmlv1p1/learning-application-resource",
} as const;

/**
 * The resource types of CC 1.3, as its schema lists them, which disagrees
 * with its own prose on the quiz's.
 */
export const CC13_TYPES = {
  page: "webcontent",
  quiz: "imsqti_xmlv1p2/imscc_xmlv1p3/assessment",
  link: "imswl_xmlv1p3",
  tool: "imsbasiclti_xmlv1p3",
  topic: "imsdt_xmlv1p3",
  bank: "imsqti_xmlv1p2/imscc_xmlv1p3/question-bank",
  assignment: "assignment_xmlv1p0",
  kept: "associatedcontent/imscc_xmlv1p3/learning-application-resource",
} as const;

/** A version's resource types. */
export const ccTypesOf = (version: CcVersion) =>
  version === "1.3" ? CC13_TYPES : CC_TYPES;

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
  version?: CcVersion;
}): string {
  const { profile, file } = namesOf(quiz.version ?? "1.1");
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="${QTI}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${QTI} ${profile}/${file}_qtiasiv1p2p1_v1p0.xsd"><assessment ident="${quiz.ident}" title="${escape(quiz.title)}"><qtimetadata>${field("cc_profile", "cc.exam.v0p1")}${field("qmd_assessmenttype", "Examination")}${field("qmd_scoretype", "Percentage")}${field("qmd_feedbackpermitted", "Yes")}${field("qmd_hintspermitted", "No")}${field("qmd_solutionspermitted", "Yes")}${field("cc_maxattempts", "unlimited")}</qtimetadata><section ident="${quiz.ident}_section">${quiz.items.join("")}</section></assessment></questestinterop>
`;
}

/**
 * A bank of questions in CC's profile, outside the course, which Canvas
 * and Moodle each keep as a bank of their own; named in a field Canvas
 * reads, as the profile allows the bank no title.
 */
export function ccBank(bank: {
  ident: string;
  title: string;
  items: string[];
  version?: CcVersion;
}): string {
  const { profile, file } = namesOf(bank.version ?? "1.1");
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="${QTI}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${QTI} ${profile}/${file}_qtiasiv1p2p1_v1p0.xsd"><objectbank ident="${bank.ident}"><qtimetadata>${field("bank_title", bank.title)}</qtimetadata>${bank.items.join("")}</objectbank></questestinterop>
`;
}

/** A link to an outside tool as CC 1.1 carries one; the tool must be registered again where it lands. */
export function ccToolLink(link: {
  title: string;
  description: string;
  url: string;
  custom: Record<string, string>;
  version?: CcVersion;
}): string {
  const root =
    link.version === "1.3"
      ? "http://www.imsglobal.org/xsd/imslticc_v1p3"
      : "http://www.imsglobal.org/xsd/imslticc_v1p0";
  const custom = Object.entries(link.custom);
  return `<?xml version="1.0" encoding="UTF-8"?>
<cartridge_basiclti_link xmlns="${root}" xmlns:blti="http://www.imsglobal.org/xsd/imsbasiclti_v1p0" xmlns:lticm="http://www.imsglobal.org/xsd/imslticm_v1p0" xmlns:lticp="http://www.imsglobal.org/xsd/imslticp_v1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${root} ${link.version === "1.3" ? "http://www.imsglobal.org/xsd/imslticc_v1p3.xsd" : `${LTI_XSD}/imslticc_v1p0.xsd`} http://www.imsglobal.org/xsd/imsbasiclti_v1p0 ${LTI_XSD}/imsbasiclti_v1p0p1.xsd http://www.imsglobal.org/xsd/imslticm_v1p0 ${LTI_XSD}/imslticm_v1p0.xsd http://www.imsglobal.org/xsd/imslticp_v1p0 ${LTI_XSD}/imslticp_v1p0.xsd"><blti:title>${escape(link.title)}</blti:title><blti:description>${escape(link.description)}</blti:description>${custom.length ? `<blti:custom>${custom.map(([name, value]) => `<lticm:property name="${escape(name)}">${escape(value)}</lticm:property>`).join("")}</blti:custom>` : ""}<blti:launch_url>${escape(link.url)}</blti:launch_url><blti:secure_launch_url>${escape(link.url)}</blti:secure_launch_url><blti:vendor><lticp:code>farida</lticp:code><lticp:name>Farida</lticp:name></blti:vendor></cartridge_basiclti_link>
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
  type:
    | (typeof CC_TYPES)[keyof typeof CC_TYPES]
    | (typeof CC13_TYPES)[keyof typeof CC13_TYPES];
  href?: string;
  files: string[];
  dependencies?: string[];
  /** Hidden from students where it lands. */
  instructorOnly?: boolean;
  /** CC 1.3: what to show where this resource's own type is not read. */
  variantOf?: string;
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
  version?: CcVersion;
}): string {
  const version = manifest.version ?? "1.1";
  const names = namesOf(version);
  const schema = names.file;
  const lang = langOf(manifest.title);
  const role = `<metadata><lom:lom><lom:educational><lom:intendedEndUserRole><lom:source>${SPEC[version].roles}</lom:source><lom:value>Instructor</lom:value></lom:intendedEndUserRole></lom:educational></lom:lom></metadata>`;
  const cpx =
    version === "1.3"
      ? {
          declared: ` xmlns:cpx="${names.cpx}"`,
          located: ` ${names.cpx} ${names.profile}/${schema}_cpextensionv1p2_v1p0.xsd`,
        }
      : { declared: "", located: "" };
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="${names.cc}" xmlns:lom="${names.lomResource}" xmlns:lomimscc="${names.lomManifest}"${cpx.declared} xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="${manifest.identifier}" xsi:schemaLocation="${names.cc} ${names.profile}/${schema}_imscp_v1p2_v1p0.xsd ${names.lomResource} ${names.profile}/LOM/${schema}_lomresource_v1p0.xsd ${names.lomManifest} ${names.profile}/LOM/${schema}_lommanifest_v1p0.xsd${cpx.located}"><metadata><schema>IMS Common Cartridge</schema><schemaversion>${SPEC[version].schemaversion}</schemaversion><lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string language="${lang}">${escape(manifest.title)}</lomimscc:string></lomimscc:title><lomimscc:language>${lang}</lomimscc:language></lomimscc:general></lomimscc:lom></metadata><organizations><organization identifier="org_1" structure="rooted-hierarchy"><item identifier="LearningModules">${manifest.modules
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
          .join("")}${
          // The schema takes extensions such as a variant after the files.
          resource.variantOf && version === "1.3"
            ? `<cpx:variant identifier="${resource.identifier}_variant" identifierref="${resource.variantOf}"><cpx:metadata/></cpx:variant>`
            : ""
        }</resource>`,
    )
    .join("")}</resources></manifest>
`;
}

/** How students hand work in, as CC 1.3 and Canvas name the ways. */
export type CcSubmission = "online" | "files" | "both" | "none";

const CC_FORMATS: Record<CcSubmission, string[]> = {
  online: ["html"],
  files: ["file"],
  both: ["html", "file"],
  none: [],
};

const CANVAS_TYPES: Record<CcSubmission, string> = {
  online: "online_text_entry",
  files: "online_upload",
  both: "online_text_entry,online_upload",
  none: "none",
};

/**
 * An assignment as CC 1.3 carries one, with Canvas's own block beside it
 * for what CC has no place for: when it is due, and how it is graded.
 */
export function ccAssignment(assignment: {
  identifier: string;
  title: string;
  html: string;
  points: number | null;
  dueAt: string | null;
  submission: CcSubmission;
}): string {
  const due = assignment.dueAt
    ? `<due_at>${assignment.dueAt.slice(0, 19)}</due_at>`
    : "";
  const graded = assignment.points !== null;
  return `<?xml version="1.0" encoding="UTF-8"?>
<assignment xmlns="http://www.imsglobal.org/xsd/imscc_extensions/assignment" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="${assignment.identifier}" xsi:schemaLocation="http://www.imsglobal.org/xsd/imscc_extensions/assignment http://www.imsglobal.org/profile/cc/cc_extensions/cc_extresource_assignmentv1p0_v1p0.xsd"><title>${escape(assignment.title)}</title><text texttype="text/html">${escape(assignment.html)}</text><instructor_text texttype="text/plain"></instructor_text><gradable${graded ? ` points_possible="${assignment.points}"` : ""}>${graded}</gradable><submission_formats>${CC_FORMATS[
    assignment.submission
  ]
    .map((format) => `<format type="${format}"/>`)
    .join(
      "",
    )}</submission_formats><extensions platform="canvas.instructure.com"><assignment xmlns="${CANVAS}" identifier="${assignment.identifier}_canvas"><title>${escape(assignment.title)}</title>${due}${graded ? `<points_possible>${assignment.points}</points_possible>` : ""}<grading_type>${graded ? "points" : "not_graded"}</grading_type><submission_types>${CANVAS_TYPES[assignment.submission]}</submission_types><workflow_state>unpublished</workflow_state></assignment></extensions></assignment>
`;
}

/** A discussion's opening post as a CC topic. */
export function ccTopic(topic: {
  title: string;
  html: string;
  version?: CcVersion;
}): string {
  const names = namesOf(topic.version ?? "1.1");
  return `<?xml version="1.0" encoding="UTF-8"?>
<topic xmlns="${names.topic}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${names.topic} ${names.profile}/${names.file}_imsdt_${SPEC[topic.version ?? "1.1"].tag}.xsd"><title>${escape(topic.title)}</title><text texttype="text/html">${escape(topic.html)}</text></topic>
`;
}

// --- Canvas's own QTI 1.2 --------------------------------------------------

/** The most words a highlight offers as choices before it goes as an essay. */
const MOST_WORDS = 30;

/** An item's own numbers for its answers, as Canvas numbers them. */
function numbering() {
  let next = 0;
  return () => String((next += 1));
}

const lid = (
  ident: string,
  labels: { id: string; content: string }[],
  lang: string,
  options: { cardinality?: "Single" | "Multiple"; prompt?: string } = {},
) =>
  `<response_lid ident="${ident}"${options.cardinality ? ` rcardinality="${options.cardinality}"` : ""}>${options.prompt === undefined ? "" : material(options.prompt, "text/html", lang)}<render_choice>${labels
    .map(
      (label) =>
        `<response_label ident="${label.id}">${material(label.content, "text/html", lang)}</response_label>`,
    )
    .join("")}</render_choice></response_lid>`;

const typedResponse = (fibtype = "") =>
  `<response_str ident="response1" rcardinality="Single"><render_fib${fibtype ? ` fibtype="${fibtype}"` : ""}><response_label ident="answer1" rshuffle="No"/></render_fib></response_str>`;

const setScore = (condition: string) =>
  `<respcondition continue="No"><conditionvar>${condition}</conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>`;

const addScore = (condition: string, share: number) =>
  `<respcondition><conditionvar>${condition}</conditionvar><setvar action="Add" varname="SCORE">${share.toFixed(2)}</setvar></respcondition>`;

const equal = (respident: string, value: string) =>
  `<varequal respident="${respident}">${escape(value)}</varequal>`;

/** The distinct words of a highlight's passage, its targets among them. */
function wordsOf(segments: { type: string; text: string }[]): string[] {
  const words = segments.flatMap((segment) =>
    segment.type === "target"
      ? [segment.text.trim()]
      : segment.text
          .split(/\s+/u)
          .map((word) => word.replaceAll(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, ""))
          .filter(Boolean),
  );
  // One choice a word, however its first letter was written.
  const seen = new Set<string>();
  return words.filter((word) => {
    const key = word.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A question as Canvas writes its own quizzes in QTI 1.2, the form Canvas's
 * quizzes and New Quizzes import with every kind they have: choices, true
 * or false, short answers, numbers, blanks typed or chosen, and matching,
 * sorting going as matching to its groups. Any other kind goes as an essay
 * that shows its parts, the key in the feedback the student reads after.
 * Points are the question's own; the score is a share of a hundred.
 */
export function canvasItem(
  block: LessonBlock,
  options: CcItemOptions,
): string | null {
  if (!("prompt" in block)) return null;
  const lang = langOf(block.prompt);
  const prompt = `<p dir="${dirOf(block.prompt)}">${html(block.prompt)}</p>`;
  const id = numbering();
  const item = (shape: {
    type: string;
    points: number;
    answers: string[];
    stem?: string;
    presentation: string;
    processing: string | null;
    feedbacks?: string;
    explanation?: string;
  }) => {
    const said = [block.explanation.trim(), shape.explanation ?? ""]
      .filter(Boolean)
      .map((text) => (text.startsWith("<") ? text : `<p>${html(text)}</p>`))
      .join("");
    return `<item ident="${options.ident}" title="${escape(block.prompt.slice(0, 80))}"><itemmetadata><qtimetadata>${field("question_type", shape.type)}${field("points_possible", String(shape.points))}${field("original_answer_ids", shape.answers.join(","))}</qtimetadata></itemmetadata><presentation>${material(`<div>${prompt}${shape.stem ?? ""}</div>`, "text/html", lang)}${shape.presentation}</presentation>${
      shape.processing === null
        ? ""
        : `<resprocessing>${SCORED}${said ? showFeedback("general_fb") : ""}${shape.processing}</resprocessing>`
    }${said ? feedback("general_fb", said, lang) : ""}${shape.feedbacks ?? ""}</item>`;
  };
  const essay = (stem: string, key: string) =>
    item({
      type: "essay_question",
      points: block.points,
      answers: [],
      stem,
      presentation: typedResponse(),
      processing: `<respcondition continue="No"><conditionvar><other/></conditionvar></respcondition>`,
      explanation: key,
    });

  switch (block.type) {
    case "choice":
    case "poll": {
      const texts = block.options.map((option) =>
        option.text.trim().toLocaleLowerCase(),
      );
      const multiple = block.type === "choice" && block.multiple;
      const trueFalse =
        block.type === "choice" &&
        !multiple &&
        block.options.length === 2 &&
        texts.some((text) => TRUE.has(text)) &&
        texts.some((text) => FALSE.has(text));
      const labels = block.options.map((option) => ({
        id: id(),
        content: `${pictureHtml(options, option.picture)}${html(option.text)}`,
        right:
          block.type === "choice" && block.correctOptionIds.includes(option.id),
        feedback: block.type === "choice" ? option.feedback.trim() : "",
      }));
      const said = labels.filter((label) => label.feedback);
      const answerFeedback = said
        .map((label) =>
          showFeedback(`${label.id}_fb`, equal("response1", label.id)),
        )
        .join("");
      const right = labels.filter((label) => label.right);
      const scoring =
        block.type === "poll"
          ? ""
          : multiple
            ? setScore(
                `<and>${labels
                  .map((label) =>
                    label.right
                      ? equal("response1", label.id)
                      : `<not>${equal("response1", label.id)}</not>`,
                  )
                  .join("")}</and>`,
              )
            : right[0]
              ? setScore(equal("response1", right[0].id))
              : "";
      return item({
        type: trueFalse
          ? "true_false_question"
          : multiple
            ? "multiple_answers_question"
            : "multiple_choice_question",
        // A poll asks without marking, so it is worth nothing.
        points: block.type === "poll" ? 0 : block.points,
        answers: labels.map((label) => label.id),
        presentation: lid("response1", labels, lang, {
          cardinality: multiple ? "Multiple" : "Single",
        }),
        processing: `${answerFeedback}${scoring}`,
        feedbacks: said
          .map((label) =>
            feedback(`${label.id}_fb`, `<p>${html(label.feedback)}</p>`, lang),
          )
          .join(""),
      });
    }
    case "text":
    case "math": {
      const answers = block.answers.map((answer) => ({
        id: id(),
        text: answer,
      }));
      return item({
        type: "short_answer_question",
        points: block.points,
        answers: answers.map((answer) => answer.id),
        presentation: typedResponse(),
        processing: setScore(
          answers.map((answer) => equal("response1", answer.text)).join(""),
        ),
      });
    }
    case "number": {
      const margin = block.percent
        ? Math.abs(block.value) * (block.tolerance / 100)
        : block.tolerance;
      const condition =
        block.mode === "range"
          ? `<vargte respident="response1">${block.min}</vargte><varlte respident="response1">${block.max}</varlte>`
          : `<or>${equal("response1", String(block.value))}${
              margin > 0
                ? `<and><vargte respident="response1">${block.value - margin}</vargte><varlte respident="response1">${block.value + margin}</varlte></and>`
                : ""
            }</or>`;
      return item({
        type: "numerical_question",
        points: block.points,
        answers: [id()],
        presentation: typedResponse("Decimal"),
        processing: setScore(condition),
      });
    }
    case "gaps": {
      const gaps = block.segments.filter((segment) => segment.type === "gap");
      const typed =
        !block.bank && gaps.every((gap) => gap.options.length === 0);
      const chosen =
        Boolean(block.bank) || gaps.every((gap) => gap.options.length > 0);
      if (!typed && !chosen) break;
      const bank = block.bank
        ? alphabetical([
            ...new Set([
              ...gaps.flatMap((gap) => gap.answers.slice(0, 1)),
              ...block.bank,
            ]),
          ])
        : [];
      let place = 0;
      const text = block.segments
        .map((segment) =>
          segment.type === "text"
            ? html(segment.text)
            : `[blank${(place += 1)}]`,
        )
        .join("");
      const blanks = gaps.map((gap, index) => {
        const words = typed ? gap.answers : block.bank ? bank : gap.options;
        const labels = words.map((word) => ({
          id: id(),
          content: html(word),
          word,
        }));
        return {
          name: `blank${index + 1}`,
          labels,
          right: typed
            ? labels[0]
            : labels.find((label) => label.word === gap.answers[0]),
        };
      });
      return item({
        type: typed
          ? "fill_in_multiple_blanks_question"
          : "multiple_dropdowns_question",
        points: block.points,
        answers: blanks.flatMap((blank) =>
          blank.labels.map((label) => label.id),
        ),
        stem: `<p dir="${dirOf(text)}">${text}</p>`,
        presentation: blanks
          .map((blank) =>
            lid(`response_${blank.name}`, blank.labels, lang, {
              prompt: blank.name,
            }),
          )
          .join(""),
        processing: blanks
          .map((blank) =>
            blank.right
              ? addScore(
                  equal(`response_${blank.name}`, blank.right.id),
                  100 / blanks.length,
                )
              : "",
          )
          .join(""),
      });
    }
    case "matching":
    case "sorting": {
      const lefts =
        block.type === "matching"
          ? block.pairs.map((pair) => ({
              content: `${pictureHtml(options, pair.promptPicture)}${html(pair.prompt)}`,
              match: partName({
                text: pair.answer,
                picture: pair.answerPicture,
              }),
            }))
          : block.items.map((each) => ({
              content: `${pictureHtml(options, each.picture)}${html(each.text)}`,
              match:
                block.groups.find((group) => group.id === each.groupId)?.name ??
                "",
            }));
      const offered =
        block.type === "matching"
          ? alphabetical([
              ...new Set([
                ...lefts.map((left) => left.match),
                ...block.distractors.map((distractor) => partName(distractor)),
              ]),
            ])
          : block.groups.map((group) => group.name);
      const matches = offered.map((text) => ({
        id: id(),
        content: html(text),
        text,
      }));
      const rows = lefts.map((left) => ({ ...left, id: id() }));
      return item({
        type: "matching_question",
        points: block.points,
        answers: rows.map((row) => row.id),
        presentation: rows
          .map((row) =>
            lid(`response_${row.id}`, matches, lang, { prompt: row.content }),
          )
          .join(""),
        processing: rows
          .map((row) => {
            const match = matches.find((each) => each.text === row.match);
            return match
              ? addScore(
                  equal(`response_${row.id}`, match.id),
                  100 / rows.length,
                )
              : "";
          })
          .join(""),
      });
    }
    case "highlight": {
      const words = wordsOf(block.segments);
      if (words.length > MOST_WORDS) break;
      const targets = new Set(
        block.segments.flatMap((segment) =>
          segment.type === "target" ? [segment.text.trim()] : [],
        ),
      );
      const labels = words.map((word) => ({
        id: id(),
        content: html(word),
        right: targets.has(word),
      }));
      return item({
        type: "multiple_answers_question",
        points: block.points,
        answers: labels.map((label) => label.id),
        stem: `<p>${block.segments.map((segment) => html(segment.text)).join("")}</p>`,
        presentation: lid("response1", labels, lang, {
          cardinality: "Multiple",
        }),
        processing: setScore(
          `<and>${labels
            .map((label) =>
              label.right
                ? equal("response1", label.id)
                : `<not>${equal("response1", label.id)}</not>`,
            )
            .join("")}</and>`,
        ),
      });
    }
    default:
      break;
  }
  const { stem, key } = essayOf(block, options);
  return essay(stem, key);
}

/** A quiz of Canvas's own items, in one section as Canvas writes it. */
export function canvasAssessment(quiz: {
  ident: string;
  title: string;
  items: string[];
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="${QTI}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${QTI} http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd"><assessment ident="${quiz.ident}" title="${escape(quiz.title)}"><qtimetadata>${field("cc_maxattempts", "unlimited")}</qtimetadata><section ident="root_section">${quiz.items.join("")}</section></assessment></questestinterop>
`;
}

/** What Canvas keeps of a quiz beside its questions: a practice quiz, unpublished, worth its questions' points. */
export function canvasQuizMeta(quiz: {
  ident: string;
  title: string;
  points: number;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<quiz xmlns="${CANVAS}" identifier="${quiz.ident}"><title>${escape(quiz.title)}</title><description></description><shuffle_answers>false</shuffle_answers><scoring_policy>keep_highest</scoring_policy><hide_results></hide_results><quiz_type>practice_quiz</quiz_type><points_possible>${quiz.points}</points_possible><show_correct_answers>true</show_correct_answers><allowed_attempts>-1</allowed_attempts><one_question_at_a_time>false</one_question_at_a_time><cant_go_back>false</cant_go_back><available>false</available><one_time_results>false</one_time_results></quiz>
`;
}

/**
 * The manifest of a package of quizzes as Canvas exports one for QTI: each
 * quiz a QTI 1.2 resource leaning on its Canvas settings, and the pictures
 * they show as files.
 */
export function canvasQtiManifest(manifest: {
  identifier: string;
  title: string;
  quizzes: { ident: string; href: string; meta: string }[];
  media: string[];
}): string {
  const lang = langOf(manifest.title);
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${manifest.identifier}" xmlns="${CC}" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${CC} http://www.imsglobal.org/xsd/imscp_v1p1.xsd http://www.imsglobal.org/xsd/imsmd_v1p2 http://www.imsglobal.org/xsd/imsmd_v1p2p2.xsd"><metadata><schema>IMS Content</schema><schemaversion>1.1.3</schemaversion><imsmd:lom><imsmd:general><imsmd:title><imsmd:string xml:lang="${lang}">${escape(manifest.title)}</imsmd:string></imsmd:title></imsmd:general></imsmd:lom></metadata><organizations/><resources>${manifest.quizzes
    .map(
      (quiz) =>
        `<resource identifier="${quiz.ident}" type="imsqti_xmlv1p2"><file href="${escape(quiz.href)}"/><dependency identifierref="${quiz.ident}_meta"/></resource><resource identifier="${quiz.ident}_meta" type="${CC_TYPES.kept}" href="${escape(quiz.meta)}"><file href="${escape(quiz.meta)}"/></resource>`,
    )
    .join("")}${manifest.media
    .map(
      (href, index) =>
        `<resource identifier="media_${index + 1}" type="webcontent" href="${escape(href)}"><file href="${escape(href)}"/></resource>`,
    )
    .join("")}</resources></manifest>
`;
}
