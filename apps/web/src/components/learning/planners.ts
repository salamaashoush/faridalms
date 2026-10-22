import type { ContentDocument, ContentNode } from "@faridalms/domain/content";

import * as m from "~/i18n/messages";

/**
 * Unit planners in the shape each framework publishes, for a module's plan:
 * the IB's MYP, DP and PYP planners (Inquiry, Action, Reflection), Wiggins
 * and McTighe's Understanding by Design (desired results, evidence, learning
 * plan), a Cambridge scheme of work, and a plain plan. Each field carries
 * the question it answers; the plan's standards sit in a Standards block
 * where the framework names its goals, so the module can show which of
 * them its questions assess. The IB's key concepts, global contexts and
 * themes are chosen in Standards blocks too, which the curriculum map
 * reads across the year's units.
 */

type Text = { en: string; ar: string };

export interface Planner {
  key: string;
  title: () => string;
  hint: () => string;
  build: (say: (text: Text) => string) => ContentNode[];
}

const text = (words: string, format = 0): ContentNode => ({
  type: "text",
  version: 1,
  format,
  detail: 0,
  mode: "normal",
  style: "",
  text: words,
});

const heading = (tag: "h2" | "h3", words: string): ContentNode => ({
  type: "heading",
  version: 1,
  tag,
  children: [text(words)],
  direction: null,
  format: "",
  indent: 0,
});

const paragraph = (words = "", format = 0): ContentNode => ({
  type: "paragraph",
  version: 1,
  children: words ? [text(words, format)] : [],
  direction: null,
  format: "",
  indent: 0,
  textFormat: 0,
  textStyle: "",
});

const ITALIC = 2;

/** A field: its name, the question it answers in italics, and a line to write on. */
const field = (name: string, question: string): ContentNode[] => [
  heading("h3", name),
  paragraph(question, ITALIC),
  paragraph(),
];

const standards = (): ContentNode => ({
  type: "standards",
  version: 1,
  targets: [],
});

/**
 * A field answered by choosing from the school's frameworks, such as a key
 * concept or a global context, so a coordinator can read it across units,
 * with a line beneath for what the choice alone does not say.
 */
const chosenField = (
  name: string,
  question: string,
  line = true,
): ContentNode[] => [
  heading("h3", name),
  paragraph(question, ITALIC),
  standards(),
  ...(line ? [paragraph()] : []),
];

export const PLANNERS: Planner[] = [
  {
    key: "ib-myp",
    title: m.plannerMyp,
    hint: m.plannerMypHint,
    build: (say) => [
      ...field(
        say({
          en: "Subject group, year and duration",
          ar: "مجموعة المادة والسنة والمدة",
        }),
        say({
          en: "The subject group and discipline, the MYP year, and the hours the unit takes.",
          ar: "مجموعة المادة والتخصص، وسنة برنامج السنوات المتوسطة، وعدد ساعات الوحدة.",
        }),
      ),
      heading(
        "h2",
        say({
          en: "Inquiry: establishing the purpose of the unit",
          ar: "الاستقصاء: تحديد الغرض من الوحدة",
        }),
      ),
      ...chosenField(
        say({ en: "Key concept", ar: "المفهوم الرئيسي" }),
        say({
          en: "The one key concept that drives the unit.",
          ar: "المفهوم الرئيسي الواحد الذي يقود الوحدة.",
        }),
        false,
      ),
      ...field(
        say({ en: "Related concepts", ar: "المفاهيم ذات الصلة" }),
        say({
          en: "Concepts from the discipline that ground the key concept.",
          ar: "مفاهيم من التخصص ترسّخ المفهوم الرئيسي.",
        }),
      ),
      ...chosenField(
        say({ en: "Global context", ar: "السياق العالمي" }),
        say({
          en: "The global context, and the exploration of it the unit takes.",
          ar: "السياق العالمي، والجانب الذي تستكشفه الوحدة منه.",
        }),
      ),
      ...field(
        say({ en: "Statement of inquiry", ar: "عبارة الاستقصاء" }),
        say({
          en: "The key concept, related concepts and global context as one idea that transfers.",
          ar: "المفهوم الرئيسي والمفاهيم ذات الصلة والسياق العالمي في فكرة واحدة قابلة للنقل.",
        }),
      ),
      ...field(
        say({ en: "Inquiry questions", ar: "أسئلة الاستقصاء" }),
        say({
          en: "Factual, conceptual and debatable questions drawn from the statement of inquiry.",
          ar: "أسئلة واقعية ومفاهيمية وجدلية مستمدة من عبارة الاستقصاء.",
        }),
      ),
      heading("h3", say({ en: "Objectives", ar: "الأهداف" })),
      paragraph(
        say({
          en: "The subject's objectives and strands this unit addresses.",
          ar: "أهداف المادة وفروعها التي تتناولها هذه الوحدة.",
        }),
        ITALIC,
      ),
      standards(),
      ...field(
        say({ en: "Summative assessment", ar: "التقييم الختامي" }),
        say({
          en: "The task, the criteria it is assessed against, and how it relates to the statement of inquiry.",
          ar: "المهمة، والمعايير التي تُقيَّم بها، وصلتها بعبارة الاستقصاء.",
        }),
      ),
      ...field(
        say({ en: "Approaches to learning", ar: "مناهج التعلّم" }),
        say({
          en: "The skills students develop, and how the unit develops them.",
          ar: "المهارات التي يطوّرها الطلاب، وكيف تطوّرها الوحدة.",
        }),
      ),
      heading(
        "h2",
        say({
          en: "Action: teaching and learning through inquiry",
          ar: "العمل: التعليم والتعلّم من خلال الاستقصاء",
        }),
      ),
      ...field(
        say({ en: "Content", ar: "المحتوى" }),
        say({
          en: "What students learn, as the subject guide sets it out.",
          ar: "ما يتعلّمه الطلاب كما يحدّده دليل المادة.",
        }),
      ),
      ...field(
        say({
          en: "Learning experiences and teaching strategies",
          ar: "خبرات التعلّم واستراتيجيات التدريس",
        }),
        say({
          en: "How students will inquire, and how the teaching supports it.",
          ar: "كيف سيستقصي الطلاب، وكيف يدعم التدريس ذلك.",
        }),
      ),
      ...field(
        say({ en: "Formative assessment", ar: "التقييم التكويني" }),
        say({
          en: "How learning is checked along the way, and what changes as a result.",
          ar: "كيف يُتحقَّق من التعلّم خلال الوحدة، وما الذي يتغيّر بناءً عليه.",
        }),
      ),
      ...field(
        say({ en: "Differentiation", ar: "التمايز" }),
        say({
          en: "How the unit reaches every student, including those with access arrangements.",
          ar: "كيف تصل الوحدة إلى كل طالب، بمن فيهم أصحاب الترتيبات الخاصة.",
        }),
      ),
      ...field(
        say({ en: "Resources", ar: "المصادر" }),
        say({
          en: "Texts, materials, people and places the unit draws on.",
          ar: "النصوص والمواد والأشخاص والأماكن التي تعتمد عليها الوحدة.",
        }),
      ),
      heading(
        "h2",
        say({
          en: "Reflection: considering the planning, process and impact of the inquiry",
          ar: "التأمّل: النظر في التخطيط وسير الاستقصاء وأثره",
        }),
      ),
      ...field(
        say({ en: "Before teaching the unit", ar: "قبل تدريس الوحدة" }),
        say({
          en: "What students bring, and what the plan expects to be hard.",
          ar: "ما يحمله الطلاب من معرفة، وما يتوقّع التخطيط أن يكون صعبًا.",
        }),
      ),
      ...field(
        say({ en: "While teaching the unit", ar: "أثناء تدريس الوحدة" }),
        say({
          en: "What students asked and did, and what was changed.",
          ar: "ما سأله الطلاب وما فعلوه، وما الذي تغيّر.",
        }),
      ),
      ...field(
        say({ en: "After teaching the unit", ar: "بعد تدريس الوحدة" }),
        say({
          en: "What the evidence shows, and what to keep or change next time.",
          ar: "ما تُظهره الأدلة، وما يُبقى عليه أو يُغيَّر في المرة القادمة.",
        }),
      ),
    ],
  },
  {
    key: "ib-dp",
    title: m.plannerDp,
    hint: m.plannerDpHint,
    build: (say) => [
      ...field(
        say({
          en: "Course part, level and dates",
          ar: "جزء المقرر والمستوى والتواريخ",
        }),
        say({
          en: "The part of the course and topic, SL or HL, and when it is taught.",
          ar: "جزء المقرر والموضوع، والمستوى العادي أو العالي، وموعد التدريس.",
        }),
      ),
      ...field(
        say({ en: "Unit description and texts", ar: "وصف الوحدة والنصوص" }),
        say({
          en: "What the unit covers, and the texts it reads.",
          ar: "ما تغطّيه الوحدة، والنصوص التي تُقرأ فيها.",
        }),
      ),
      ...field(
        say({ en: "DP assessment", ar: "تقييم برنامج الدبلوما" }),
        say({
          en: "The DP assessment this unit prepares students for.",
          ar: "تقييم برنامج الدبلوما الذي تُعِدّ له هذه الوحدة.",
        }),
      ),
      heading(
        "h2",
        say({
          en: "Inquiry: establishing the purpose of the unit",
          ar: "الاستقصاء: تحديد الغرض من الوحدة",
        }),
      ),
      ...field(
        say({ en: "Transfer goals", ar: "أهداف النقل" }),
        say({
          en: "What students will be able to do with their learning on their own, beyond this unit.",
          ar: "ما سيقدر الطلاب على فعله بتعلّمهم بأنفسهم خارج هذه الوحدة.",
        }),
      ),
      heading(
        "h2",
        say({
          en: "Action: teaching and learning through inquiry",
          ar: "العمل: التعليم والتعلّم من خلال الاستقصاء",
        }),
      ),
      heading(
        "h3",
        say({ en: "Essential understandings", ar: "الفهم الأساسي" }),
      ),
      paragraph(
        say({
          en: "Students will know… Students will be able to…",
          ar: "سيعرف الطلاب… وسيقدرون على…",
        }),
        ITALIC,
      ),
      standards(),
      ...field(
        say({ en: "Learning process", ar: "عملية التعلّم" }),
        say({
          en: "Learning experiences and strategies, formative and summative assessment, and differentiation.",
          ar: "خبرات التعلّم واستراتيجياته، والتقييم التكويني والختامي، والتمايز.",
        }),
      ),
      ...field(
        say({ en: "Approaches to learning", ar: "مناهج التعلّم" }),
        say({
          en: "The thinking, social, communication, self-management and research skills the unit develops.",
          ar: "مهارات التفكير والتواصل والمهارات الاجتماعية وإدارة الذات والبحث التي تطوّرها الوحدة.",
        }),
      ),
      ...field(
        say({ en: "Language and learning", ar: "اللغة والتعلّم" }),
        say({
          en: "How the unit builds students' language for learning.",
          ar: "كيف تبني الوحدة لغة التعلّم لدى الطلاب.",
        }),
      ),
      ...field(
        say({
          en: "Theory of knowledge connections",
          ar: "الصلة بنظرية المعرفة",
        }),
        say({
          en: "Questions about knowing that the unit raises.",
          ar: "أسئلة المعرفة التي تثيرها الوحدة.",
        }),
      ),
      ...field(
        say({
          en: "Creativity, activity, service connections",
          ar: "الصلة بالإبداع والنشاط والخدمة",
        }),
        say({
          en: "Where the unit leads into creativity, activity or service.",
          ar: "أين تقود الوحدة إلى الإبداع أو النشاط أو الخدمة.",
        }),
      ),
      ...field(
        say({ en: "Resources", ar: "المصادر" }),
        say({
          en: "Texts, materials and tools the unit uses.",
          ar: "النصوص والمواد والأدوات التي تستخدمها الوحدة.",
        }),
      ),
      heading(
        "h2",
        say({
          en: "Reflection: considering the planning, process and impact of the inquiry",
          ar: "التأمّل: النظر في التخطيط وسير الاستقصاء وأثره",
        }),
      ),
      ...field(
        say({ en: "What worked well", ar: "ما نجح" }),
        say({ en: "What to keep.", ar: "ما يُبقى عليه." }),
      ),
      ...field(
        say({ en: "What did not work well", ar: "ما لم ينجح" }),
        say({ en: "What to change, and why.", ar: "ما يُغيَّر، ولماذا." }),
      ),
      ...field(
        say({ en: "Notes for next time", ar: "ملاحظات للمرة القادمة" }),
        say({
          en: "Changes and suggestions for whoever teaches it next.",
          ar: "تغييرات واقتراحات لمن يدرّسها لاحقًا.",
        }),
      ),
    ],
  },
  {
    key: "ib-pyp",
    title: m.plannerPyp,
    hint: m.plannerPypHint,
    build: (say) => [
      heading(
        "h2",
        say({ en: "Reflecting and planning", ar: "التأمّل والتخطيط" }),
      ),
      ...chosenField(
        say({ en: "Transdisciplinary theme", ar: "المحور العابر للمواد" }),
        say({
          en: "The theme, and the part of its description the unit explores.",
          ar: "المحور، والجزء الذي تستكشفه الوحدة من وصفه.",
        }),
      ),
      ...field(
        say({ en: "Central idea", ar: "الفكرة المركزية" }),
        say({
          en: "The idea students come to understand, in one sentence.",
          ar: "الفكرة التي يصل الطلاب إلى فهمها، في جملة واحدة.",
        }),
      ),
      ...field(
        say({ en: "Lines of inquiry", ar: "خطوط الاستقصاء" }),
        say({
          en: "The three or so directions the inquiry takes.",
          ar: "الاتجاهات الثلاثة تقريبًا التي يسلكها الاستقصاء.",
        }),
      ),
      ...chosenField(
        say({
          en: "Key and related concepts",
          ar: "المفاهيم الرئيسية وذات الصلة",
        }),
        say({
          en: "The concepts that frame the inquiry.",
          ar: "المفاهيم التي تؤطّر الاستقصاء.",
        }),
      ),
      ...field(
        say({ en: "Learner profile attributes", ar: "سمات ملف المتعلّم" }),
        say({
          en: "The attributes the unit gives students the chance to develop.",
          ar: "السمات التي تتيح الوحدة للطلاب فرصة تطويرها.",
        }),
      ),
      ...field(
        say({ en: "Approaches to learning", ar: "مناهج التعلّم" }),
        say({
          en: "The skills the unit develops, and where.",
          ar: "المهارات التي تطوّرها الوحدة، وأين.",
        }),
      ),
      heading(
        "h3",
        say({
          en: "Learning goals and success criteria",
          ar: "أهداف التعلّم ومعايير النجاح",
        }),
      ),
      paragraph(
        say({
          en: "What students will learn, and how they and their teachers will know they have.",
          ar: "ما سيتعلّمه الطلاب، وكيف سيعرفون هم ومعلّموهم أنهم تعلّموه.",
        }),
        ITALIC,
      ),
      standards(),
      ...field(
        say({ en: "Prior knowledge", ar: "المعرفة السابقة" }),
        say({
          en: "What students already know, and how it will be found out.",
          ar: "ما يعرفه الطلاب مسبقًا، وكيف سيُكتشَف ذلك.",
        }),
      ),
      heading("h2", say({ en: "Designing", ar: "التصميم" })),
      ...field(
        say({ en: "Teacher and student questions", ar: "أسئلة المعلّم والطلاب" }),
        say({
          en: "The questions that will move the inquiry forward.",
          ar: "الأسئلة التي ستدفع الاستقصاء إلى الأمام.",
        }),
      ),
      ...field(
        say({ en: "Learning experiences", ar: "خبرات التعلّم" }),
        say({
          en: "Provocations, engagements and the order they come in.",
          ar: "المثيرات والأنشطة وترتيبها.",
        }),
      ),
      ...field(
        say({ en: "Supporting student agency", ar: "دعم فاعلية الطلاب" }),
        say({
          en: "Where students choose, voice their ideas and own their learning.",
          ar: "أين يختار الطلاب ويعبّرون عن أفكارهم ويتولّون تعلّمهم.",
        }),
      ),
      ...field(
        say({ en: "Ongoing assessment", ar: "التقييم المستمر" }),
        say({
          en: "How learning is monitored, documented and measured.",
          ar: "كيف يُتابَع التعلّم ويُوثَّق ويُقاس.",
        }),
      ),
      ...field(
        say({ en: "Resources", ar: "المصادر" }),
        say({
          en: "Books, people, places and materials.",
          ar: "الكتب والأشخاص والأماكن والمواد.",
        }),
      ),
      heading("h2", say({ en: "Reflecting", ar: "التأمّل" })),
      ...field(
        say({ en: "Teacher reflections", ar: "تأمّلات المعلّمين" }),
        say({
          en: "What went well, what was learned, and what to change.",
          ar: "ما نجح، وما تُعلِّم، وما يجب تغييره.",
        }),
      ),
      ...field(
        say({ en: "Student reflections", ar: "تأمّلات الطلاب" }),
        say({
          en: "What students say they learned, and how.",
          ar: "ما يقول الطلاب إنهم تعلّموه، وكيف.",
        }),
      ),
      ...field(
        say({ en: "Action", ar: "العمل" }),
        say({
          en: "What students chose to do with their learning.",
          ar: "ما اختار الطلاب فعله بتعلّمهم.",
        }),
      ),
    ],
  },
  {
    key: "ubd",
    title: m.plannerUbd,
    hint: m.plannerUbdHint,
    build: (say) => [
      heading(
        "h2",
        say({
          en: "Stage 1: Desired results",
          ar: "المرحلة الأولى: النتائج المرغوبة",
        }),
      ),
      heading("h3", say({ en: "Established goals", ar: "الأهداف المعتمدة" })),
      paragraph(
        say({
          en: "The standards this unit addresses.",
          ar: "المعايير التي تتناولها هذه الوحدة.",
        }),
        ITALIC,
      ),
      standards(),
      ...field(
        say({ en: "Transfer", ar: "النقل" }),
        say({
          en: "Students will be able to independently use their learning to…",
          ar: "سيقدر الطلاب على استخدام تعلّمهم باستقلالية من أجل…",
        }),
      ),
      ...field(
        say({ en: "Understandings", ar: "الفهم العميق" }),
        say({
          en: "Students will understand that…",
          ar: "سيفهم الطلاب أن…",
        }),
      ),
      ...field(
        say({ en: "Essential questions", ar: "الأسئلة الجوهرية" }),
        say({
          en: "Students will keep considering…",
          ar: "سيظلّ الطلاب يتأمّلون…",
        }),
      ),
      ...field(
        say({ en: "Knowledge", ar: "المعرفة" }),
        say({ en: "Students will know…", ar: "سيعرف الطلاب…" }),
      ),
      ...field(
        say({ en: "Skills", ar: "المهارات" }),
        say({
          en: "Students will be skilled at…",
          ar: "سيتقن الطلاب…",
        }),
      ),
      heading(
        "h2",
        say({ en: "Stage 2: Evidence", ar: "المرحلة الثانية: الأدلة" }),
      ),
      ...field(
        say({ en: "Evaluative criteria", ar: "معايير الحكم" }),
        say({
          en: "What the evidence of each goal will be judged by.",
          ar: "ما سيُحكم به على أدلة كل هدف.",
        }),
      ),
      ...field(
        say({ en: "Performance tasks", ar: "مهام الأداء" }),
        say({
          en: "Students will show that they really understand by evidence of…",
          ar: "سيُظهر الطلاب أنهم فهموا حقًّا من خلال…",
        }),
      ),
      ...field(
        say({ en: "Other evidence", ar: "أدلة أخرى" }),
        say({
          en: "Students will show they have achieved Stage 1 goals by…",
          ar: "سيُظهر الطلاب أنهم حققوا أهداف المرحلة الأولى من خلال…",
        }),
      ),
      heading(
        "h2",
        say({
          en: "Stage 3: Learning plan",
          ar: "المرحلة الثالثة: خطة التعلّم",
        }),
      ),
      ...field(
        say({ en: "Pre-assessment", ar: "التقييم القبلي" }),
        say({
          en: "How students' prior knowledge and misconceptions will be found out.",
          ar: "كيف ستُكتشف معرفة الطلاب السابقة ومفاهيمهم الخاطئة.",
        }),
      ),
      ...field(
        say({ en: "Learning events", ar: "أحداث التعلّم" }),
        say({
          en: "The key learning events and teaching, in order, and how progress is monitored.",
          ar: "أحداث التعلّم والتدريس الرئيسية بالترتيب، وكيف يُتابَع التقدّم.",
        }),
      ),
    ],
  },
  {
    key: "cambridge",
    title: m.plannerCambridge,
    hint: m.plannerCambridgeHint,
    build: (say) => [
      ...field(
        say({ en: "Syllabus and teaching time", ar: "المنهج ووقت التدريس" }),
        say({
          en: "The syllabus or curriculum framework, and the suggested hours.",
          ar: "المنهج أو إطار المنهج، والساعات المقترحة.",
        }),
      ),
      ...field(
        say({ en: "Prior knowledge", ar: "المعرفة السابقة" }),
        say({
          en: "What students need to know before they start.",
          ar: "ما يحتاج الطلاب إلى معرفته قبل البدء.",
        }),
      ),
      heading("h2", say({ en: "Learning objectives", ar: "أهداف التعلّم" })),
      paragraph(
        say({
          en: "The syllabus learning objectives this unit covers.",
          ar: "أهداف التعلّم في المنهج التي تغطيها هذه الوحدة.",
        }),
        ITALIC,
      ),
      standards(),
      ...field(
        say({
          en: "Key concepts and vocabulary",
          ar: "المفاهيم الأساسية والمفردات",
        }),
        say({
          en: "The ideas and words students need to use.",
          ar: "الأفكار والكلمات التي يحتاج الطلاب إلى استخدامها.",
        }),
      ),
      ...field(
        say({
          en: "Suggested teaching activities",
          ar: "أنشطة التدريس المقترحة",
        }),
        say({
          en: "Each activity, the objective it serves, and how learning is checked.",
          ar: "كل نشاط، والهدف الذي يخدمه، وكيف يُتحقَّق من التعلّم.",
        }),
      ),
      ...field(
        say({ en: "Assessment for learning", ar: "التقييم من أجل التعلّم" }),
        say({
          en: "How students and teachers will see where learning stands.",
          ar: "كيف سيرى الطلاب والمعلّمون أين وصل التعلّم.",
        }),
      ),
      ...field(
        say({ en: "Common misconceptions", ar: "المفاهيم الخاطئة الشائعة" }),
        say({
          en: "What students often get wrong, and how to address it.",
          ar: "ما يخطئ فيه الطلاب غالبًا، وكيف يُعالَج.",
        }),
      ),
      ...field(
        say({ en: "Resources", ar: "المصادر" }),
        say({
          en: "Endorsed resources, past papers and materials.",
          ar: "المصادر المعتمدة والاختبارات السابقة والمواد.",
        }),
      ),
    ],
  },
  {
    key: "plain",
    title: m.plannerPlain,
    hint: m.plannerPlainHint,
    build: (say) => [
      heading("h3", say({ en: "Goals", ar: "الأهداف" })),
      paragraph(
        say({
          en: "The standards students work toward in this unit.",
          ar: "المعايير التي يسعى إليها الطلاب في هذه الوحدة.",
        }),
        ITALIC,
      ),
      standards(),
      ...field(
        say({ en: "Big idea", ar: "الفكرة الكبرى" }),
        say({
          en: "What students should understand and remember.",
          ar: "ما ينبغي أن يفهمه الطلاب ويتذكّروه.",
        }),
      ),
      ...field(
        say({ en: "Assessment", ar: "التقييم" }),
        say({
          en: "How students will show what they learned.",
          ar: "كيف سيُظهر الطلاب ما تعلّموه.",
        }),
      ),
      ...field(
        say({ en: "Learning sequence", ar: "تسلسل التعلّم" }),
        say({
          en: "The lessons and activities, in order.",
          ar: "الدروس والأنشطة بالترتيب.",
        }),
      ),
      ...field(
        say({ en: "Differentiation", ar: "التمايز" }),
        say({
          en: "Support and stretch for different students.",
          ar: "الدعم والتحدّي لمختلف الطلاب.",
        }),
      ),
      ...field(
        say({ en: "Resources", ar: "المصادر" }),
        say({ en: "What the unit uses.", ar: "ما تستخدمه الوحدة." }),
      ),
      ...field(
        say({ en: "Reflection", ar: "التأمّل" }),
        say({
          en: "What worked, and what to change next time.",
          ar: "ما نجح، وما يُغيَّر في المرة القادمة.",
        }),
      ),
    ],
  },
];

/** A planner as a plan document, written in the given language. */
export function plannerContent(
  planner: Planner,
  say: (text: Text) => string,
): ContentDocument {
  return {
    root: {
      type: "root",
      version: 1,
      children: planner.build(say),
      direction: null,
      format: "",
      indent: 0,
    },
  };
}
