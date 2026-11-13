import type { ModuleId } from "./modules";
import type {
  IconId,
  PageSection,
  SectionOf,
  SectionType,
  SiteLocale,
} from "./site-sections";
import type { SiteChrome, ThemeId } from "./site-theme";

import { plainContent } from "./content-conversion";
import { MODULE_IDS } from "./modules";
import { formDocument } from "./questions";
import {
  askedBy,
  defaultStyle,
  newSection,
  sectionModule,
} from "./site-sections";

/** Words in both languages; a template is written once and built in either. */
type Words = readonly [en: string, ar: string];

/** Which modules the school a site is built for has on. */
export type SiteModules = Readonly<Record<ModuleId, boolean>>;

export const siteModules = (on: readonly ModuleId[]): SiteModules =>
  Object.fromEntries(
    MODULE_IDS.map((module) => [module, on.includes(module)]),
  ) as Record<ModuleId, boolean>;

/**
 * A sentence that names what modules own (families, a grade), with the
 * neutral sentence a school without one of them reads instead. The choice is
 * made once, as the page is built: from then on the page is the school's own.
 */
interface Worded {
  needs: readonly ModuleId[];
  words: Words;
  neutral: Words;
}

type Said = Words | Worded;

const naming = (
  needs: readonly ModuleId[],
  words: Words,
  neutral: Words,
): Worded => ({ needs, words, neutral });

interface Builder {
  /** The same sequence of ids in every language, so the two stay aligned. */
  id: () => string;
  w: (words: Said) => string;
}

type Section = <T extends SectionType>(
  type: T,
  variant: SectionOf<T>["variant"],
  data: (b: Builder) => Partial<SectionOf<T>["data"]>,
  style?: Partial<PageSection["style"]>,
) => (b: Builder) => PageSection;

/** A builder that reads every sentence in one language, as the school's modules choose it. */
function builder(
  ids: readonly string[],
  locale: SiteLocale,
  has: (needs: readonly ModuleId[]) => boolean,
): Builder {
  let cursor = 0;
  return {
    id: () => ids[cursor++] ?? crypto.randomUUID(),
    w: (said) => {
      const words =
        "needs" in said ? (has(said.needs) ? said.words : said.neutral) : said;
      return locale === "ar" ? words[1] : words[0];
    },
  };
}

type Make = (b: Builder) => PageSection;

/** A section whose words speak of what modules own, built only for a school with them all. */
interface Needing {
  needs: readonly ModuleId[];
  make: Make;
}
type Part = Make | Needing;

const only = (needs: readonly ModuleId[], make: Make): Needing => ({
  needs,
  make,
});

const section: Section = (type, variant, data, style) => (b) => {
  const blank = newSection(type);
  return {
    ...blank,
    id: b.id(),
    variant,
    style: { ...defaultStyle(), ...style },
    data: { ...blank.data, ...data(b) },
  };
};

/**
 * A section as it sits on one page: the same words, in that page's colour
 * rhythm and, where the page wants it, another of the section's layouts.
 */
const on =
  (
    make: (b: Builder) => PageSection,
    style: Partial<PageSection["style"]>,
    variant?: string,
  ) =>
  (b: Builder): PageSection => {
    const made = make(b);
    return {
      ...made,
      ...(variant ? { variant } : {}),
      style: { ...made.style, ...style },
    } as PageSection;
  };

const link = (b: Builder, label: Said, href: string) => ({
  id: b.id(),
  label: b.w(label),
  href,
});
const noImage = { fileId: null, alt: "" };
const card = (
  b: Builder,
  title: Said,
  text: Said,
  icon: IconId,
  href = "",
) => ({
  id: b.id(),
  title: b.w(title),
  text: b.w(text),
  image: noImage,
  icon,
  href,
});

/** A plan card's words, its button and whether it is the one most chosen. */
const planCard = (
  b: Builder,
  words: {
    label: Said;
    value: Said;
    note: Said;
    includes: Said;
    link: Said;
    href: string;
    chosen?: boolean;
  },
) => ({
  id: b.id(),
  label: b.w(words.label),
  value: b.w(words.value),
  note: b.w(words.note),
  includes: b.w(words.includes),
  mark: words.chosen ? ("chosen" as const) : ("plain" as const),
  link: [link(b, words.link, words.href)],
});

const HERO_HOME = section("hero", "fullbleed", (b) => ({
  eyebrow: b.w(["Welcome", "أهلًا بكم"]),
  heading: b.w(
    naming(
      ["families"],
      [
        "Where every child is *known* and *challenged*",
        "مدرسة يُعرف فيها *كل طفل* ويُتحدّى",
      ],
      [
        "Where every student is *known* and *challenged*",
        "مدرسة يُعرف فيها *كل طالب* ويُتحدّى",
      ],
    ),
  ),
  text: b.w(
    naming(
      ["families"],
      [
        "A caring community with high expectations, from the early years to graduation.",
        "مجتمع يرعى أبناءه ويتوقّع منهم الكثير، من السنوات الأولى حتى التخرّج.",
      ],
      [
        "A caring community with high expectations, from the early years to graduation.",
        "مجتمع يرعى طلابه ويتوقّع منهم الكثير، من السنوات الأولى حتى التخرّج.",
      ],
    ),
  ),
  actions: [
    link(b, ["Enquire", "استفسر"], "/pages/admissions"),
    link(b, ["Book a visit", "احجز زيارة"], "/pages/visit"),
  ],
  height: "l" as const,
}));

/** The home page's opening, filling the first screen. */
const WELCOME_HERO = (b: Builder): PageSection => {
  const made = HERO_HOME(b);
  return made.type === "hero"
    ? { ...made, data: { ...made.data, height: "screen" } }
    : made;
};

const ADMISSIONS_TRIAD = section(
  "admissions",
  "triad",
  (b) => ({
    source: "typed" as const,
    heading: b.w(["Join our school", "انضم إلى مدرستنا"]),
    text: b.w(
      naming(
        ["families"],
        ["Three steps to a place for your child.", "ثلاث خطوات نحو مقعد لطفلك."],
        ["Three steps to a place with us.", "ثلاث خطوات نحو مقعدك لدينا."],
      ),
    ),
    items: [
      {
        id: b.id(),
        title: b.w(["Enquire", "استفسر"]),
        text: b.w([
          "Ask us anything about joining.",
          "اسألنا عن كل ما يخص الالتحاق.",
        ]),
        actions: [
          link(b, ["Send an enquiry", "أرسل استفسارًا"], "/pages/admissions"),
        ],
      },
      {
        id: b.id(),
        title: b.w(["Visit", "زُرنا"]),
        text: b.w([
          "See a school day for yourself.",
          "شاهد يومًا دراسيًا بنفسك.",
        ]),
        actions: [link(b, ["Book a tour", "احجز جولة"], "/pages/visit")],
      },
      {
        id: b.id(),
        title: b.w(["Apply", "قدّم"]),
        text: b.w([
          "Start your application online.",
          "ابدأ طلب الالتحاق عبر الإنترنت.",
        ]),
        actions: [
          link(b, ["Start applying", "ابدأ التقديم"], "/pages/admissions"),
        ],
      },
    ],
  }),
  { scheme: "brand" },
);

/** The intakes open and coming, read from admissions: each grade's dates and fees. */
const ADMISSIONS_INTAKES = section("admissions", "triad", (b) => ({
  source: "intakes" as const,
  heading: b.w(["Places for next year", "المقاعد المتاحة للعام القادم"]),
  text: b.w([
    "Each grade's dates and fees, as the admissions office has set them.",
    "مواعيد كل صف ورسومه كما حدّدها مكتب القبول.",
  ]),
}));

/** Where the header's actions lead: the forms themselves, not the pages the menu already lists. */
const ANCHOR = {
  enquiry: "enquire",
  visit: "book-a-visit",
  general: "message",
  apply: "apply",
} as const;

const REGISTER_APPLY = section(
  "registerApply",
  "banner",
  (b) => ({
    eyebrow: b.w(["Admissions", "القبول"]),
    heading: b.w(["Ready to *apply*?", "هل أنتم مستعدون *للتقديم*؟"]),
    text: b.w(
      naming(
        ["families"],
        [
          "Register as a family once, then apply for each child and come back to the application whenever you like.",
          "سجّلوا أسرتكم مرة واحدة، ثم قدّموا لكل طفل وعودوا إلى الطلب متى شئتم.",
        ],
        [
          "Register once, then apply and come back to your application whenever you like.",
          "سجّلوا مرة واحدة، ثم قدّموا طلبكم وعودوا إليه متى شئتم.",
        ],
      ),
    ),
    intake: "",
    button: b.w(["Register and apply", "سجّل وقدّم"]),
    closed: [
      link(
        b,
        ["Ask about joining", "اسألوا عن الالتحاق"],
        `/pages/admissions#${ANCHOR.enquiry}`,
      ),
    ],
  }),
  { scheme: "brand", anchor: ANCHOR.apply },
);

const STATS = section(
  "stats",
  "row",
  (b) => ({
    heading: b.w(["Our school in numbers", "مدرستنا بالأرقام"]),
    items: [
      {
        id: b.id(),
        value: "1,200",
        label: b.w(["students", "طالب وطالبة"]),
        caption: "",
      },
      {
        id: b.id(),
        value: "45",
        label: b.w(["nationalities", "جنسية"]),
        caption: "",
      },
      {
        id: b.id(),
        value: "12:1",
        label: b.w(["students per teacher", "طالبًا لكل معلّم"]),
        caption: "",
      },
      {
        id: b.id(),
        value: "98%",
        label: b.w(["university offers", "قبولًا جامعيًا"]),
        caption: "",
      },
    ],
    source: "",
  }),
  { scheme: "soft", align: "center" },
);

const DIVISIONS = section("divisions", "tall", (b) => ({
  heading: b.w(["Our schools", "مراحلنا الدراسية"]),
  text: b.w(["Each stage builds on the last.", "تبني كل مرحلة على ما قبلها."]),
  items: [
    {
      id: b.id(),
      title: b.w(["Early years", "رياض الأطفال"]),
      ages: b.w(["Ages 3 to 5", "من 3 إلى 5 سنوات"]),
      text: b.w([
        "Learning through play, stories and discovery, indoors and out.",
        "التعلّم باللعب والقصص والاكتشاف، داخل الفصل وخارجه.",
      ]),
      image: noImage,
      href: "/pages/academics",
    },
    {
      id: b.id(),
      title: b.w(["Primary", "الابتدائية"]),
      ages: b.w(["Ages 5 to 11", "من 5 إلى 11 سنة"]),
      text: b.w([
        "Strong foundations in reading, number and science, in two languages.",
        "أسس متينة في القراءة والحساب والعلوم، بلغتين.",
      ]),
      image: noImage,
      href: "/pages/academics",
    },
    {
      id: b.id(),
      title: b.w(["Secondary", "الثانوية"]),
      ages: b.w(["Ages 11 to 18", "من 11 إلى 18 سنة"]),
      text: b.w([
        "Ambitious study and guidance towards the university of their choice.",
        "دراسة طموحة وإرشاد نحو الجامعة التي يختارونها.",
      ]),
      image: noImage,
      href: "/pages/academics",
    },
  ],
}));

const WELCOME = section("welcome", "portraitStart", (b) => ({
  heading: b.w(["A welcome from our *principal*", "كلمة *مديرة* المدرسة"]),
  body: plainContent(
    b.w(
      naming(
        ["families"],
        [
          "Thank you for your interest in our school. We are a community where curiosity is encouraged, kindness is expected and every child is known well by the adults who teach them.\nThe best way to understand a school is to see it on an ordinary day. Come and visit: our students will show you round, and we will answer every question you bring.",
          "شكرًا لاهتمامكم بمدرستنا. نحن مجتمع يشجّع الفضول ويتوقّع اللطف، ويعرف فيه المعلّمون كل طفل معرفة جيدة.\nأفضل طريقة لفهم أي مدرسة أن تروها في يوم عادي. زورونا وسيرافقكم طلابنا في جولة، وسنجيب عن كل أسئلتكم.",
        ],
        [
          "Thank you for your interest in our school. We are a community where curiosity is encouraged, kindness is expected and every student is known well by the people who teach them.\nThe best way to understand a school is to see it on an ordinary day. Come and visit: our students will show you round, and we will answer every question you bring.",
          "شكرًا لاهتمامكم بمدرستنا. نحن مجتمع يشجّع الفضول ويتوقّع اللطف، ويعرف فيه المعلّمون كل طالب معرفة جيدة.\nأفضل طريقة لفهم أي مدرسة أن تروها في يوم عادي. زورونا وسيرافقكم طلابنا في جولة، وسنجيب عن كل أسئلتكم.",
        ],
      ),
    ),
  ),
  portrait: noImage,
  name: b.w(["Dr Amal Nasser", "د. أمل ناصر"]),
  role: b.w(["Principal", "مديرة المدرسة"]),
}));

const VOICES = section(
  "voices",
  "grid",
  (b) => ({
    heading: b.w(["Voices from our community", "أصوات من مجتمعنا"]),
    items: [
      {
        id: b.id(),
        quote: b.w([
          "My children run in every morning. The teachers know them well and tell us how they are doing before we have to ask.",
          "يدخل أطفالي المدرسة كل صباح وهم متحمّسون. المعلّمون يعرفونهم جيدًا ويخبروننا بأحوالهم قبل أن نسأل.",
        ]),
        name: b.w(["Layla Hassan", "ليلى حسن"]),
        role: b.w(["Parent of two", "أمّ لطفلين"]),
        audience: "parent" as const,
        portrait: noImage,
      },
      {
        id: b.id(),
        quote: b.w([
          "Teachers here really listen. When I wanted to start a robotics club, they helped me find the room and the kit.",
          "المعلّمون هنا يستمعون حقًا. حين أردت تأسيس نادٍ للروبوتات ساعدوني في إيجاد القاعة والأدوات.",
        ]),
        name: b.w(["Omar Saleh", "عمر صالح"]),
        role: b.w(
          naming(
            ["grade_levels"],
            ["Student, Grade 10", "طالب في الصف العاشر"],
            ["Student", "طالب"],
          ),
        ),
        audience: "student" as const,
        portrait: noImage,
      },
      {
        id: b.id(),
        quote: b.w([
          "It is a place where I keep growing as a teacher, with colleagues who share what works and time to plan together.",
          "مكان أواصل فيه النمو كمعلّمة، مع زملاء يتبادلون ما ينجح ووقت للتخطيط معًا.",
        ]),
        name: b.w(["Sara Mansour", "سارة منصور"]),
        role: b.w(["Head of science", "رئيسة قسم العلوم"]),
        audience: "staff" as const,
        portrait: noImage,
      },
    ],
  }),
  { scheme: "soft" },
);

const NEWS = section("news", "grid", (b) => ({
  heading: b.w(["Latest news", "آخر الأخبار"]),
  count: 3,
  category: "",
}));

const PILLARS = section("pillars", "icons", (b) => ({
  heading: b.w(["What we value", "قيمنا"]),
  text: "",
  items: [
    {
      id: b.id(),
      title: b.w(["Curiosity", "الفضول"]),
      text: b.w(
        naming(
          ["families"],
          [
            "Children learn to ask good questions and to enjoy finding the answers out for themselves.",
            "يتعلّم الأطفال طرح الأسئلة الجيدة ويستمتعون بالبحث عن إجاباتها بأنفسهم.",
          ],
          [
            "Students learn to ask good questions and to enjoy finding the answers out for themselves.",
            "يتعلّم الطلاب طرح الأسئلة الجيدة ويستمتعون بالبحث عن إجاباتها بأنفسهم.",
          ],
        ),
      ),
      icon: "lightbulb" as const,
      image: noImage,
    },
    {
      id: b.id(),
      title: b.w(["Kindness", "اللطف"]),
      text: b.w(
        naming(
          ["families"],
          [
            "We look after one another, and every child is known by name by the adults around them.",
            "يرعى بعضنا بعضًا، ويعرف الكبار من حول كل طفل اسمه وما يحتاج إليه.",
          ],
          [
            "We look after one another, and every student is known by name by the people who teach them.",
            "يرعى بعضنا بعضًا، ويعرف المعلّمون كل طالب باسمه وبما يحتاج إليه.",
          ],
        ),
      ),
      icon: "heart" as const,
      image: noImage,
    },
    {
      id: b.id(),
      title: b.w(["Ambition", "الطموح"]),
      text: b.w([
        "High expectations in every subject, with the support each learner needs to meet them.",
        "توقّعات عالية في كل مادة، مع الدعم الذي يحتاجه كل متعلّم ليبلغها.",
      ]),
      icon: "star" as const,
      image: noImage,
    },
    {
      id: b.id(),
      title: b.w(["Belonging", "الانتماء"]),
      text: b.w(
        naming(
          ["families"],
          [
            "Families, students and staff work as one community, in two languages and many cultures.",
            "تعمل الأسر والطلاب والمعلّمون مجتمعًا واحدًا، بلغتين وثقافات كثيرة.",
          ],
          [
            "Students and staff work as one community, in two languages and many cultures.",
            "يعمل الطلاب والمعلّمون مجتمعًا واحدًا، بلغتين وثقافات كثيرة.",
          ],
        ),
      ),
      icon: "users" as const,
      image: noImage,
    },
  ],
}));

const PAGE_HEADER = (title: Said, text: Said) =>
  section(
    "pageHeader",
    "banner",
    (b) => ({
      eyebrow: "",
      heading: b.w(title),
      text: b.w(text),
      media: {
        kind: "image" as const,
        fileId: null,
        alt: "",
        posterFileId: null,
        captionsFileId: null,
      },
    }),
    { scheme: "soft" },
  );

const STEPS = section("steps", "horizontal", (b) => ({
  heading: b.w(["How to apply", "خطوات التقديم"]),
  text: "",
  items: [
    {
      id: b.id(),
      title: b.w(["Enquire", "استفسر"]),
      text: b.w(
        naming(
          ["families", "grade_levels"],
          [
            "Tell us about your child and the year they would join. We reply within two working days.",
            "أخبرنا عن طفلك والصف الذي سيلتحق به، وسنرد خلال يومي عمل.",
          ],
          [
            "Tell us a little about yourself and when you would like to start. We reply within two working days.",
            "أخبرنا قليلًا عن نفسك ومتى تودّ أن تبدأ، وسنرد خلال يومي عمل.",
          ],
        ),
      ),
    },
    {
      id: b.id(),
      title: b.w(["Visit", "زُرنا"]),
      text: b.w([
        "Tour the school with our students and meet the head of the stage your child would join.",
        "تجوّل في المدرسة مع طلابنا وقابل رئيس المرحلة التي سيلتحق بها طفلك.",
      ]),
    },
    {
      id: b.id(),
      title: b.w(["Assessment", "التقييم"]),
      text: b.w(
        naming(
          ["families"],
          [
            "A relaxed morning with us, so we can understand how your child learns best.",
            "صباح هادئ معنا لنفهم كيف يتعلّم طفلك على أفضل وجه.",
          ],
          [
            "A relaxed morning with us, so we can understand how you learn best.",
            "صباح هادئ معنا لنفهم كيف تتعلّم على أفضل وجه.",
          ],
        ),
      ),
    },
    {
      id: b.id(),
      title: b.w(["Offer", "القبول"]),
      text: b.w([
        "We confirm your child's place and help you prepare for the first day.",
        "نؤكّد مقعد طفلك ونساعدكم على الاستعداد لليوم الأول.",
      ]),
    },
  ],
}));

const FEES = section("fees", "table", (b) => ({
  heading: b.w(["Fees", "الرسوم"]),
  text: b.w([
    "Annual tuition for the coming year.",
    "الرسوم الدراسية السنوية للعام القادم.",
  ]),
  items: [
    {
      id: b.id(),
      label: b.w(["Early years", "رياض الأطفال"]),
      value: "—",
      note: "",
    },
    { id: b.id(), label: b.w(["Primary", "الابتدائية"]), value: "—", note: "" },
    { id: b.id(), label: b.w(["Secondary", "الثانوية"]), value: "—", note: "" },
  ],
}));

const PLANS = section("fees", "plans", (b) => ({
  heading: b.w(["Plans", "الخطط"]),
  text: b.w([
    "Start free, then choose how you want to learn.",
    "ابدأ مجانًا، ثم اختر الطريقة التي تناسبك في التعلّم.",
  ]),
  items: [
    planCard(b, {
      label: ["Taster", "تجربة"],
      value: ["Free", "مجانًا"],
      note: ["Try it before you decide.", "جرّب قبل أن تقرّر."],
      includes: [
        "The first lessons of any course\nCaptions in Arabic and English",
        "الدروس الأولى من أي دورة\nترجمة مكتوبة بالعربية والإنجليزية",
      ],
      link: ["Start free", "ابدأ مجانًا"],
      href: "/pages/contact",
    }),
    planCard(b, {
      label: ["Monthly", "شهري"],
      value: ["— a month", "— شهريًا"],
      note: ["Stop whenever you like.", "توقف متى شئت."],
      includes: [
        "Every course\nNew courses as they come out\nA certificate for each course",
        "كل الدورات\nالدورات الجديدة فور صدورها\nشهادة لكل دورة",
      ],
      chosen: true,
      link: ["Choose monthly", "اختر الشهري"],
      href: "/pages/contact",
    }),
    planCard(b, {
      label: ["Yearly", "سنوي"],
      value: ["— a year", "— سنويًا"],
      note: ["Two months free.", "شهران مجانًا."],
      includes: [
        "Everything in monthly\nOne session a term with a tutor",
        "كل ما في الشهري\nجلسة مع معلّم كل فصل",
      ],
      link: ["Choose yearly", "اختر السنوي"],
      href: "/pages/contact",
    }),
  ],
}));

const FAQ = section("accordion", "accordion", (b) => ({
  heading: b.w(
    naming(
      ["families"],
      ["Questions families ask", "أسئلة تطرحها الأسر"],
      ["Questions people ask", "أسئلة يطرحها كثيرون"],
    ),
  ),
  text: "",
  items: [
    {
      id: b.id(),
      title: b.w([
        "When does the school day start?",
        "متى يبدأ اليوم الدراسي؟",
      ]),
      text: b.w([
        "Doors open at 7:30 and lessons begin at 8:00. The day ends at 14:30, with clubs running until 16:00.",
        "تُفتح الأبواب الساعة 7:30 وتبدأ الحصص الساعة 8:00. ينتهي اليوم الدراسي الساعة 14:30، وتستمر الأندية حتى الساعة 16:00.",
      ]),
    },
    {
      id: b.id(),
      title: b.w(["Is there a bus service?", "هل توجد حافلات؟"]),
      text: b.w([
        "Yes. Supervised buses cover most of the city, and the transport office can tell you the nearest stop.",
        "نعم. تغطي حافلات بإشراف مرافقين معظم أنحاء المدينة، ويرشدكم مكتب النقل إلى أقرب محطة.",
      ]),
    },
    {
      id: b.id(),
      title: b.w(
        naming(
          ["families"],
          [
            "Can my child join during the year?",
            "هل يمكن لطفلي الالتحاق خلال العام؟",
          ],
          ["Can I join during the year?", "هل يمكن الالتحاق خلال العام؟"],
        ),
      ),
      text: b.w([
        "Often, yes. Where a class has room we welcome new students at any point, after a visit and an assessment morning.",
        "نعم في الغالب. حين يتوفّر مقعد في الفصل نرحّب بالطلاب الجدد في أي وقت، بعد زيارة وصباح تقييم.",
      ]),
    },
    {
      id: b.id(),
      title: b.w(
        naming(
          ["families"],
          [
            "How do you support children learning in a new language?",
            "كيف تدعمون الأطفال الذين يتعلّمون بلغة جديدة؟",
          ],
          [
            "How do you support students learning in a new language?",
            "كيف تدعمون الطلاب الذين يتعلّمون بلغة جديدة؟",
          ],
        ),
      ),
      text: b.w(
        naming(
          ["families"],
          [
            "Specialist teachers work with small groups each day until a child is confident in class.",
            "يعمل معلّمون متخصّصون مع مجموعات صغيرة كل يوم حتى يشعر الطفل بالثقة داخل الفصل.",
          ],
          [
            "Specialist teachers work with small groups each day until each student is confident in class.",
            "يعمل معلّمون متخصّصون مع مجموعات صغيرة كل يوم حتى يشعر كل طالب بالثقة داخل الفصل.",
          ],
        ),
      ),
    },
  ],
}));

const CONTACT = section("contact", "details", (b) => ({
  heading: b.w(["Get in touch", "تواصل معنا"]),
  text: b.w([
    "Our office is open Sunday to Thursday, 7:30 to 15:30.",
    "مكتبنا مفتوح من الأحد إلى الخميس، من 7:30 إلى 15:30.",
  ]),
  mapHref: "",
}));

const CONTACT_MAP = section("contact", "map", (b) => ({
  heading: b.w(["How to *find* us", "كيف *تصلون* إلينا"]),
  text: b.w([
    "Our office is open Sunday to Thursday, 7:30 to 15:30. Visitors sign in at the main gate.",
    "مكتبنا مفتوح من الأحد إلى الخميس، من 7:30 إلى 15:30. يسجّل الزوّار دخولهم عند البوابة الرئيسية.",
  ]),
  mapHref: "",
}));

const VISIT_STORY = section("imageText", "mediaEnd", (b) => ({
  eyebrow: b.w(["Open mornings", "أيام الأبواب المفتوحة"]),
  heading: b.w(["See a *school day* for yourself", "شاهد *يومًا دراسيًا* بنفسك"]),
  body: plainContent(
    b.w(
      naming(
        ["families"],
        [
          "Tours run every Tuesday and Thursday morning and take about an hour. Our students show you round, so you see classes, clubs and lunch as they really are.\nAfterwards you meet the head of the stage your child would join, and we answer every question you bring.",
          "تُقام الجولات صباح كل ثلاثاء وخميس وتستغرق نحو ساعة. يرافقكم طلابنا لتروا الفصول والأندية والغداء كما هي فعلًا.\nبعد الجولة تقابلون رئيس المرحلة التي سيلتحق بها طفلكم، ونجيب عن كل أسئلتكم.",
        ],
        [
          "Tours run every Tuesday and Thursday morning and take about an hour. Our students show you round, so you see classes, clubs and lunch as they really are.\nAfterwards you meet the head of the stage you are interested in, and we answer every question you bring.",
          "تُقام الجولات صباح كل ثلاثاء وخميس وتستغرق نحو ساعة. يرافقكم طلابنا لتروا الفصول والأندية والغداء كما هي فعلًا.\nبعد الجولة تقابلون رئيس المرحلة التي تهمّكم، ونجيب عن كل أسئلتكم.",
        ],
      ),
    ),
  ),
  media: {
    kind: "image" as const,
    fileId: null,
    alt: "",
    posterFileId: null,
    captionsFileId: null,
  },
  actions: [
    link(b, ["Book a visit", "احجز زيارة"], `/pages/visit#${ANCHOR.visit}`),
  ],
}));

const STATEMENT = section(
  "text",
  "statement",
  (b) => ({
    eyebrow: b.w(["Who we are", "من نحن"]),
    heading: b.w(
      naming(
        ["families"],
        [
          "A school where every child is *known well*, taught with *ambition* and sent out ready to shape the world.",
          "مدرسة يُعرف فيها كل طفل *معرفة حقيقية*، ويتعلّم *بطموح*، ويتخرّج مستعدًا ليصنع عالمه.",
        ],
        [
          "A school where every student is *known well*, taught with *ambition* and sent out ready to shape the world.",
          "مدرسة يُعرف فيها كل طالب *معرفة حقيقية*، ويتعلّم *بطموح*، ويتخرّج مستعدًا ليصنع عالمه.",
        ],
      ),
    ),
    body: plainContent(
      b.w([
        "From the first morning in the early years to the last examination, our teachers know each student, their strengths and what will stretch them next.",
        "من الصباح الأول في رياض الأطفال حتى آخر امتحان، يعرف معلّمونا كل طالب ونقاط قوّته وما يحتاج إليه ليتقدّم.",
      ]),
    ),
  }),
  { scheme: "brand", align: "center" },
);

const TEXT = (heading: Said, body: Said) =>
  section("text", "narrow", (b) => ({
    eyebrow: "",
    heading: b.w(heading),
    body: plainContent(b.w(body)),
  }));

const QUICK_LINKS = section("quickLinks", "tiles", (b) => ({
  heading: b.w(["For families", "للأسر"]),
  items: [
    {
      id: b.id(),
      title: b.w(["Term dates", "مواعيد الفصول"]),
      text: b.w(["Holidays and key days", "العطل والأيام المهمة"]),
      icon: "calendar" as const,
      href: "/news",
    },
    {
      id: b.id(),
      title: b.w(["Uniform", "الزيّ المدرسي"]),
      text: b.w(["What to wear, and where", "ماذا يُلبس ومن أين"]),
      icon: "shield" as const,
      href: "",
    },
    {
      id: b.id(),
      title: b.w(["Transport", "المواصلات"]),
      text: b.w(["Bus routes and stops", "خطوط الحافلات ومحطاتها"]),
      icon: "bus" as const,
      href: "",
    },
    {
      id: b.id(),
      title: b.w(["Lunch menu", "قائمة الغداء"]),
      text: b.w(["This week's meals", "وجبات هذا الأسبوع"]),
      icon: "utensils" as const,
      href: "",
    },
  ],
}));

const CARDS_PROGRAMMES = section("cards", "icons", (b) => ({
  heading: b.w(["Learning *here*", "التعلّم *هنا*"]),
  text: b.w([
    "A broad curriculum, taught in small classes by teachers who know each child.",
    "منهج واسع، في فصول صغيرة، مع معلّمين يعرفون كل طفل.",
  ]),
  columns: "3" as const,
  items: [
    card(
      b,
      ["Languages", "اللغات"],
      [
        "Arabic and English every day from the early years, with French added in primary.",
        "العربية والإنجليزية يوميًا منذ السنوات الأولى، وتُضاف الفرنسية في المرحلة الابتدائية.",
      ],
      "globe",
    ),
    card(
      b,
      ["Science and technology", "العلوم والتقنية"],
      [
        "Hands-on laboratories, robotics and coding, from first experiments to university-level projects.",
        "مختبرات عملية وروبوتات وبرمجة، من التجارب الأولى إلى مشاريع بمستوى جامعي.",
      ],
      "flask",
    ),
    card(
      b,
      ["Arts and sport", "الفنون والرياضة"],
      [
        "Music, drama, art and a full sports programme, with performances and fixtures every term.",
        "موسيقى ومسرح وفنون وبرنامج رياضي متكامل، مع عروض ومباريات في كل فصل.",
      ],
      "palette",
    ),
  ],
}));

const ANNOUNCEMENT = section(
  "announcement",
  "strip",
  (b) => ({
    text: b.w([
      "Open morning on Saturday: meet our teachers and see the school at work.",
      "يوم مفتوح يوم السبت: قابل معلّمينا وشاهد المدرسة في يوم عمل.",
    ]),
    date: "",
    actions: [link(b, ["Book a place", "احجز مكانًا"], "/pages/visit")],
  }),
  { scheme: "accent", spacing: "s" },
);

const IMAGE_TEXT = section("imageText", "mediaStart", (b) => ({
  eyebrow: b.w(["Beyond the classroom", "خارج الفصل"]),
  heading: b.w([
    "Clubs, trips and teams for every interest",
    "أندية ورحلات وفرق لكل اهتمام",
  ]),
  body: plainContent(
    b.w([
      "More than sixty activities run each week, from robotics and debating to choir and football.\nEvery student finds something they love, and many find something they did not know they could do.",
      "أكثر من ستين نشاطًا كل أسبوع، من الروبوتات والمناظرات إلى الكورال وكرة القدم.\nيجد كل طالب ما يحبّه، ويكتشف كثيرون ما لم يعرفوا أنهم قادرون عليه.",
    ]),
  ),
  actions: [link(b, ["Explore activities", "اكتشف الأنشطة"], "/pages/about")],
}));

const QUOTE = section(
  "quote",
  "large",
  (b) => ({
    quote: b.w([
      "Pupils are articulate, confident and kind, and they leave ready for the world.",
      "الطلاب فصحاء وواثقون ولطفاء، ويتخرّجون مستعدّين للعالم.",
    ]),
    name: b.w(["Inspection report", "تقرير التفتيش"]),
    role: "",
    portrait: noImage,
    badge: "none" as const,
  }),
  { scheme: "brand", align: "center" },
);

const person = (b: Builder, name: Said, role: Said) => ({
  id: b.id(),
  portrait: noImage,
  name: b.w(name),
  role: b.w(role),
  text: "",
});

const PEOPLE = section("people", "grid", (b) => ({
  heading: b.w(["Our leadership", "فريق القيادة"]),
  text: "",
  items: [
    person(b, ["Principal", "المدير"], ["Whole school", "المدرسة كلها"]),
    person(
      b,
      ["Head of primary", "رئيس المرحلة الابتدائية"],
      ["Primary", "الابتدائية"],
    ),
    person(
      b,
      ["Head of secondary", "رئيس المرحلة الثانوية"],
      ["Secondary", "الثانوية"],
    ),
    person(b, ["Head of admissions", "مسؤول القبول"], ["Admissions", "القبول"]),
  ],
}));

const VIDEO = section(
  "video",
  "inset",
  (b) => ({
    heading: b.w(["A day with us", "يوم معنا"]),
    text: b.w([
      "Three minutes of a school day, filmed by our students.",
      "ثلاث دقائق من يوم دراسي، صوّرها طلابنا.",
    ]),
    actions: [],
  }),
  { align: "center" },
);

const GALLERY = section("gallery", "grid", (b) => ({
  heading: b.w(["Life at school", "الحياة في المدرسة"]),
  items: Array.from({ length: 6 }, () => ({ id: b.id(), image: noImage })),
}));

const milestone = (b: Builder, year: string, title: Said, text: Said) => ({
  id: b.id(),
  year,
  title: b.w(title),
  text: b.w(text),
});

/** A class as a courses section's sample shows it, while the school shows none of its own. */
const sampleClass = (
  b: Builder,
  title: Said,
  text: Said,
  when: Said,
  level: Said = ["", ""],
) => ({
  id: b.id(),
  title: b.w(title),
  text: b.w(text),
  when: b.w(when),
  level: b.w(level),
});

const COURSES = section("courses", "grid", (b) => ({
  heading: b.w(["Courses starting *soon*", "دورات تبدأ *قريبًا*"]),
  text: b.w([
    "Small groups, taught by people who practise what they teach.",
    "مجموعات صغيرة، يعلّمها من يمارسون ما يعلّمونه.",
  ]),
  action: [link(b, ["Ask about a place", "اسأل عن مقعد"], "/pages/contact")],
  items: [
    sampleClass(
      b,
      ["Introduction to programming", "مدخل إلى البرمجة"],
      [
        "Ten evenings from your first line of code to a program that works.",
        "عشر أمسيات من أول سطر برمجي إلى برنامج يعمل.",
      ],
      ["Starts 6 December", "تبدأ 6 ديسمبر"],
      ["Beginner", "للمبتدئين"],
    ),
    sampleClass(
      b,
      ["Public speaking", "فن الإلقاء"],
      [
        "Six Saturdays of short talks, with notes on each one you give.",
        "ستة أيام سبت من الكلمات القصيرة، مع ملاحظات على كل كلمة تلقيها.",
      ],
      ["Running now, joins any time", "قائمة الآن، والانضمام في أي وقت"],
      ["All levels", "لكل المستويات"],
    ),
    sampleClass(
      b,
      ["Drawing from life", "الرسم من الطبيعة"],
      [
        "Eight mornings with pencil and charcoal, a model and a teacher beside you.",
        "ثمانية صباحات بالقلم والفحم، مع نموذج ومعلّم بجانبك.",
      ],
      ["Starts 10 January", "تبدأ 10 يناير"],
      ["Beginner", "للمبتدئين"],
    ),
  ],
}));

const TIMELINE = section("timeline", "vertical", (b) => ({
  heading: b.w(["Our story", "قصتنا"]),
  items: [
    milestone(
      b,
      "1998",
      ["Founded", "التأسيس"],
      [
        "Opened in a converted house with forty pupils and six teachers.",
        "افتُتحت في منزل مُجدَّد بأربعين طالبًا وستة معلّمين.",
      ],
    ),
    milestone(
      b,
      "2010",
      ["Secondary opens", "افتتاح الثانوية"],
      [
        "Our first graduates leave for universities at home and abroad.",
        "أول دفعة من الخريجين تلتحق بجامعات في الداخل والخارج.",
      ],
    ),
    milestone(
      b,
      "2024",
      ["New campus", "حرم جديد"],
      [
        "Laboratories, library and sports hall.",
        "مختبرات ومكتبة وصالة رياضية.",
      ],
    ),
  ],
}));

const LOGOS = section(
  "logos",
  "row",
  (b) => ({
    heading: b.w(["Accredited by", "معتمدون من"]),
    items: ["CIS", "NEASC", "IB"].map((name) => ({
      id: b.id(),
      image: noImage,
      name,
      href: "",
    })),
  }),
  { spacing: "s" },
);

const EVENTS = section("events", "list", (b) => ({
  heading: b.w(["Coming up", "قريبًا"]),
  items: [
    {
      id: b.id(),
      date: "",
      title: b.w(["Open morning", "يوم مفتوح"]),
      location: b.w(["Main campus", "الحرم الرئيسي"]),
      href: "/pages/visit",
    },
    {
      id: b.id(),
      date: "",
      title: b.w(["Winter concert", "الحفل الشتوي"]),
      location: b.w(["School theatre", "مسرح المدرسة"]),
      href: "",
    },
  ],
}));

const EMBED = section("embed", "inset", (b) => ({
  heading: b.w(["Take a tour", "جولة في المدرسة"]),
  embed: null,
}));

const slide = (
  b: Builder,
  eyebrow: Said,
  heading: Said,
  text: Said,
  action: [Said, string],
) => ({
  id: b.id(),
  image: noImage,
  eyebrow: b.w(eyebrow),
  heading: b.w(heading),
  text: b.w(text),
  actions: [link(b, action[0], action[1])],
});

const SLIDES = section("slides", "fullbleed", (b) => ({
  height: "l" as const,
  interval: "7" as const,
  items: [
    slide(
      b,
      ["Admissions open", "القبول مفتوح"],
      ["A place for every kind of *curious*", "مكان لكل عقل *فضولي*"],
      [
        "Applications for next September are open. Visit us and see a school day.",
        "باب التقديم لشهر سبتمبر القادم مفتوح. زُرنا وشاهد يومًا دراسيًا.",
      ],
      [["Book a visit", "احجز زيارة"], "/pages/visit"],
    ),
    slide(
      b,
      ["Results", "النتائج"],
      ["Our best results in a decade", "أفضل نتائجنا منذ عشر سنوات"],
      [
        "Nine in ten students reached their first-choice university.",
        "تسعة من كل عشرة طلاب التحقوا بجامعتهم الأولى.",
      ],
      [["See the results", "اطّلع على النتائج"], "/news"],
    ),
    slide(
      b,
      ["Community", "المجتمع"],
      ["Families at the heart of school life", "الأسر في قلب الحياة المدرسية"],
      [
        "Concerts, fairs and open mornings bring us together all year.",
        "الحفلات والمعارض والأيام المفتوحة تجمعنا طوال العام.",
      ],
      [["Latest news", "آخر الأخبار"], "/news"],
    ),
  ],
}));

const BLOCKS = section("blocks", "columns", (b) => ({
  eyebrow: "",
  heading: "",
  text: "",
  layout: "2-1" as const,
  valign: "center" as const,
  columns: [
    {
      id: b.id(),
      blocks: [
        {
          id: b.id(),
          type: "heading" as const,
          data: {
            eyebrow: b.w(["Why families choose us", "لماذا تختارنا الأسر"]),
            text: b.w([
              "Small classes, *big* ambitions",
              "فصول صغيرة وطموحات *كبيرة*",
            ]),
            size: "l" as const,
          },
        },
        {
          id: b.id(),
          type: "paragraph" as const,
          data: {
            body: plainContent(
              b.w([
                "Every teacher knows every child by name. That is where good learning starts.",
                "كل معلّم يعرف كل طفل باسمه، ومن هنا يبدأ التعلّم الجيد.",
              ]),
            ),
          },
        },
        {
          id: b.id(),
          type: "list" as const,
          data: {
            items: [
              {
                id: b.id(),
                icon: "users" as const,
                text: b.w([
                  "Classes of twenty or fewer",
                  "فصول من عشرين طالبًا أو أقل",
                ]),
              },
              {
                id: b.id(),
                icon: "globe" as const,
                text: b.w([
                  "Bilingual from the first day",
                  "ثنائية اللغة منذ اليوم الأول",
                ]),
              },
              {
                id: b.id(),
                icon: "trophy" as const,
                text: b.w([
                  "Sixty clubs and teams a week",
                  "ستون ناديًا وفريقًا كل أسبوع",
                ]),
              },
            ],
          },
        },
        {
          id: b.id(),
          type: "buttons" as const,
          data: {
            actions: [link(b, ["Book a visit", "احجز زيارة"], "/pages/visit")],
          },
        },
      ],
    },
    {
      id: b.id(),
      blocks: [
        {
          id: b.id(),
          type: "image" as const,
          data: {
            image: noImage,
            shape: "theme" as const,
            ratio: "portrait" as const,
          },
        },
        {
          id: b.id(),
          type: "stat" as const,
          data: {
            value: "20",
            label: b.w([
              "students per class, at most",
              "طالبًا في الفصل كحدّ أقصى",
            ]),
          },
        },
      ],
    },
  ],
}));

const FORM = (
  purpose: "enquiry" | "visit" | "general",
  heading: Said,
  text: Said,
) =>
  section(
    "form",
    "split",
    (b) => ({
      eyebrow: b.w(["Write to us", "راسلونا"]),
      heading: b.w(heading),
      text: b.w(text),
      purpose,
      email: "require" as const,
      phone: "ask" as const,
      child: purpose === "enquiry" ? ("ask" as const) : ("hide" as const),
      grade: purpose === "general" ? ("hide" as const) : ("ask" as const),
      questions: formDocument(
        purpose === "enquiry"
          ? [
              {
                id: b.id(),
                type: "choice",
                prompt: b.w(["How did you hear about us?", "كيف عرفتم بنا؟"]),
                points: 0,
                hints: [],
                explanation: "",
                tries: null,
                options: (
                  [
                    ["A friend or relative", "صديق أو قريب"],
                    ["Social media", "وسائل التواصل الاجتماعي"],
                    ["A search online", "البحث على الإنترنت"],
                    ["An event or open day", "فعالية أو يوم مفتوح"],
                    ["Somewhere else", "مصدر آخر"],
                  ] as const
                ).map((words) => ({
                  id: b.id(),
                  text: b.w(words),
                  feedback: "",
                })),
                correctOptionIds: [],
                multiple: false,
                shuffle: false,
              },
            ]
          : [],
      ),
      submit: b.w(
        purpose === "visit"
          ? ["Request a visit", "اطلب زيارة"]
          : ["Send", "أرسل"],
      ),
      thanks: b.w([
        "Thank you. We will reply within two working days.",
        "شكرًا لك. سنرد خلال يومي عمل.",
      ]),
    }),
    { scheme: "soft", anchor: ANCHOR[purpose] },
  );

const ENQUIRY_FORM = FORM(
  "enquiry",
  ["Ask us anything", "اسألنا عن أي شيء"],
  [
    "Tell us a little about your child and we will be in touch.",
    "أخبرنا قليلًا عن طفلك وسنتواصل معك.",
  ],
);

const EY_HERO = section("hero", "split", (b) => ({
  eyebrow: b.w(["Nursery, ages 2 to 6", "للأطفال من سنتين إلى ست سنوات"]),
  heading: b.w(["A happy place to *start*", "مكان سعيد *للبداية*"]),
  text: b.w(
    naming(
      ["families"],
      [
        "A warm, bilingual nursery where children play, wonder and grow in confidence, with a team who know every child well.",
        "روضة دافئة ثنائية اللغة، يلعب فيها الأطفال ويكتشفون وتنمو ثقتهم بأنفسهم، مع فريق يعرف كل طفل جيدًا.",
      ],
      [
        "A warm, bilingual nursery where young learners play, wonder and grow in confidence, with a team who know each of them well.",
        "روضة دافئة ثنائية اللغة، يلعب فيها المتعلّمون الصغار ويكتشفون وتنمو ثقتهم بأنفسهم، مع فريق يعرف كلًّا منهم جيدًا.",
      ],
    ),
  ),
  actions: [
    link(b, ["Book a visit", "احجزوا زيارة"], `/pages/visit#${ANCHOR.visit}`),
    link(
      b,
      ["Ask a question", "اسألونا"],
      `/pages/admissions#${ANCHOR.enquiry}`,
    ),
  ],
  height: "m" as const,
}));

const EY_NOTICE = section(
  "announcement",
  "strip",
  (b) => ({
    text: b.w(
      naming(
        ["families"],
        [
          "Stay-and-play mornings every Saturday this term: come with your child and meet the team.",
          "صباحات لعب مفتوحة كل سبت في هذا الفصل: تعالوا مع طفلكم وتعرّفوا على الفريق.",
        ],
        [
          "Stay-and-play mornings every Saturday this term: come and meet the team.",
          "صباحات لعب مفتوحة كل سبت في هذا الفصل: تعالوا وتعرّفوا على الفريق.",
        ],
      ),
    ),
    date: "",
    actions: [
      link(b, ["Book a place", "احجزوا مكانًا"], `/pages/visit#${ANCHOR.visit}`),
    ],
  }),
  { scheme: "accent", spacing: "s" },
);

/** Where the parents page's own quick links lead. */
const PARENTS_ANCHOR = { day: "school-day", questions: "questions" } as const;

const quickLink = (
  b: Builder,
  title: Said,
  text: Said,
  icon: IconId,
  href: string,
) => ({ id: b.id(), title: b.w(title), text: b.w(text), icon, href });

const EY_QUICK_LINKS = section("quickLinks", "tiles", (b) => ({
  heading: b.w(["For our *families*", "في خدمة *أسرنا*"]),
  items: [
    quickLink(
      b,
      ["Book a visit", "احجزوا زيارة"],
      ["Come and see a morning at play", "تعالوا وشاهدوا صباحًا من اللعب"],
      "map",
      `/pages/visit#${ANCHOR.visit}`,
    ),
    quickLink(
      b,
      ["Our day", "يومنا"],
      ["From drop-off to home time", "من الوصول حتى العودة إلى البيت"],
      "clock",
      `/pages/parents#${PARENTS_ANCHOR.day}`,
    ),
    quickLink(
      b,
      ["News and term dates", "الأخبار ومواعيد الفصول"],
      [
        "Holidays, events and letters home",
        "العطل والفعاليات والرسائل إلى الأسر",
      ],
      "calendar",
      "/news",
    ),
    quickLink(
      b,
      ["Ask a question", "اسألونا"],
      ["We reply within two working days", "نرد خلال يومي عمل"],
      "mail",
      `/pages/admissions#${ANCHOR.enquiry}`,
    ),
  ],
}));

const EY_LEARNING = section("cards", "icons", (b) => ({
  heading: b.w(
    naming(
      ["families"],
      ["How children *learn* here", "كيف *يتعلّم* أطفالنا"],
      ["How we *learn* here", "كيف *نتعلّم* هنا"],
    ),
  ),
  text: b.w([
    "Days built around play, with gentle routines and plenty of time outdoors.",
    "أيام تقوم على اللعب، بروتين هادئ ووقت وافر في الهواء الطلق.",
  ]),
  columns: "4" as const,
  items: [
    card(
      b,
      ["Play with a purpose", "لعب له هدف"],
      naming(
        ["families"],
        [
          "Sand, water, blocks and role play, each set up so children explore, count and talk as they go.",
          "رمل وماء ومكعّبات ولعب أدوار، يُهيّأ كل منها ليستكشف الأطفال ويعدّوا ويتحدّثوا وهم يلعبون.",
        ],
        [
          "Sand, water, blocks and role play, each set up so young learners explore, count and talk as they go.",
          "رمل وماء ومكعّبات ولعب أدوار، يُهيّأ كل منها ليستكشف المتعلّمون الصغار ويعدّوا ويتحدّثوا وهم يلعبون.",
        ],
      ),
      "sparkles",
    ),
    card(
      b,
      ["Two languages, every day", "لغتان كل يوم"],
      [
        "Songs, stories and conversation in Arabic and English, so both feel like home.",
        "أغانٍ وقصص وأحاديث بالعربية والإنجليزية، حتى تصبح اللغتان مألوفتين كلغة البيت.",
      ],
      "book",
    ),
    card(
      b,
      ["Outdoors in every season", "في الهواء الطلق طوال العام"],
      [
        "A shaded garden for digging, planting, climbing and running, every single day.",
        "حديقة مظلّلة للحفر والزراعة والتسلّق والجري، كل يوم.",
      ],
      "leaf",
    ),
    card(
      b,
      ["Music and making", "موسيقى وصنع"],
      naming(
        ["families"],
        [
          "Singing, painting, clay and simple instruments, with something small to take home most weeks.",
          "غناء ورسم وصلصال وآلات بسيطة، ومعظم الأسابيع يعود الطفل إلى البيت بشيء صنعه بيديه.",
        ],
        [
          "Singing, painting, clay and simple instruments, with something small to take home most weeks.",
          "غناء ورسم وصلصال وآلات بسيطة، وفي معظم الأسابيع شيء صغير مصنوع باليد يُؤخذ إلى البيت.",
        ],
      ),
      "music",
    ),
  ],
}));

const EY_STATS = section(
  "stats",
  "row",
  (b) => ({
    heading: b.w(
      naming(
        ["families"],
        ["Small enough to know *every* child", "صغيرة بما يكفي لنعرف *كل* طفل"],
        ["Small enough to know *everyone*", "صغيرة بما يكفي لنعرف *الجميع*"],
      ),
    ),
    items: [
      {
        id: b.id(),
        value: "1:4",
        label: b.w(
          naming(
            ["families"],
            [
              "adults to children under three",
              "بالغ لكل أربعة أطفال دون الثالثة",
            ],
            [
              "adults to learners under three",
              "بالغ لكل أربعة متعلّمين دون الثالثة",
            ],
          ),
        ),
        caption: "",
      },
      {
        id: b.id(),
        value: "16",
        label: b.w(
          naming(
            ["families"],
            ["children in a class, at most", "طفلًا في الفصل كحدّ أقصى"],
            ["learners in a class, at most", "متعلّمًا في الفصل كحدّ أقصى"],
          ),
        ),
        caption: "",
      },
      {
        id: b.id(),
        value: "10",
        label: b.w(["years caring for little ones", "سنوات في رعاية الصغار"]),
        caption: "",
      },
      {
        id: b.id(),
        value: "3,000",
        label: b.w([
          "square metres of garden and play",
          "متر مربع من الحدائق والملاعب",
        ]),
        caption: "",
      },
    ],
    source: "",
  }),
  { scheme: "brand", align: "center" },
);

const EY_GALLERY = section("gallery", "masonry", (b) => ({
  heading: b.w(["Everyday *moments*", "لحظات من *يومنا*"]),
  items: Array.from({ length: 6 }, () => ({ id: b.id(), image: noImage })),
}));

const parentVoice = (b: Builder, quote: Said, name: Said, role: Said) => ({
  id: b.id(),
  quote: b.w(quote),
  name: b.w(name),
  role: b.w(role),
  audience: "parent" as const,
  portrait: noImage,
});

const EY_VOICES = section(
  "voices",
  "grid",
  (b) => ({
    heading: b.w(["What parents *say*", "ماذا تقول *الأسر*"]),
    items: [
      parentVoice(
        b,
        [
          "Our daughter cried on the first morning and ran in on the third. The team made settling in easy for all of us.",
          "بكت ابنتنا في الصباح الأول، وفي الثالث دخلت راكضة. جعل الفريق التأقلم سهلًا علينا جميعًا.",
        ],
        ["Nour Haddad", "نور حدّاد"],
        ["Parent, Kindergarten 1", "أمّ لطفلة في الروضة الأولى"],
      ),
      parentVoice(
        b,
        [
          "Every afternoon we get a photo and a few lines about his day. It is the moment I look forward to most.",
          "تصلنا كل يوم صورة وبضعة أسطر عن يومه، وهي اللحظة التي أنتظرها أكثر من غيرها.",
        ],
        ["Karim Aziz", "كريم عزيز"],
        ["Parent, Nursery", "أب لطفل في الحضانة"],
      ),
      parentVoice(
        b,
        [
          "He comes home singing in two languages and telling us about the snails in the garden.",
          "يعود إلى البيت يغنّي بلغتين ويحكي لنا عن الحلزونات في الحديقة.",
        ],
        ["Mona Fahmy", "منى فهمي"],
        ["Parent of two", "أمّ لطفلين"],
      ),
      parentVoice(
        b,
        [
          "We moved here in the middle of the year. Within a week our son had a best friend and a favourite song.",
          "انتقلنا إلى هنا في منتصف العام، وخلال أسبوع صار لابننا صديق مقرّب وأغنية مفضّلة.",
        ],
        ["Hana Saeed", "هناء سعيد"],
        ["Parent, Kindergarten 2", "أمّ لطفل في الروضة الثانية"],
      ),
    ],
  }),
  { scheme: "soft" },
);

const EY_STEPS = section("steps", "horizontal", (b) => ({
  heading: b.w(["Joining us, *step by step*", "الانضمام إلينا *خطوة بخطوة*"]),
  text: b.w(
    naming(
      ["families"],
      [
        "Most children start in September, and we welcome new families all year whenever a place is free.",
        "يبدأ معظم الأطفال في سبتمبر، ونرحّب بأسر جديدة طوال العام كلما توفّر مقعد.",
      ],
      [
        "Most start in September, and we welcome newcomers all year whenever a place is free.",
        "يبدأ معظم المتعلّمين في سبتمبر، ونرحّب بالقادمين الجدد طوال العام كلما توفّر مقعد.",
      ],
    ),
  ),
  items: [
    {
      id: b.id(),
      title: b.w(["Come and play", "تعالوا والعبوا معنا"]),
      text: b.w(
        naming(
          ["families"],
          [
            "Visit with your child on a stay-and-play morning and see the rooms, the garden and the team.",
            "زوروا الروضة مع طفلكم في صباح لعب مفتوح، وتعرّفوا على الغرف والحديقة والفريق.",
          ],
          [
            "Visit on a stay-and-play morning and see the rooms, the garden and the team.",
            "زوروا الروضة في صباح لعب مفتوح، وتعرّفوا على الغرف والحديقة والفريق.",
          ],
        ),
      ),
    },
    {
      id: b.id(),
      title: b.w(
        naming(
          ["families"],
          ["Tell us about your child", "حدّثونا عن طفلكم"],
          ["Tell us about yourself", "حدّثونا عن أنفسكم"],
        ),
      ),
      text: b.w(
        naming(
          ["families"],
          [
            "Register online and tell us about routines, languages at home and what helps your child feel settled.",
            "سجّلوا عبر الإنترنت وأخبرونا عن روتين طفلكم واللغات في البيت وما يساعده على الاطمئنان.",
          ],
          [
            "Register online and tell us about routines, languages at home and what helps you feel settled.",
            "سجّلوا عبر الإنترنت وأخبرونا عن الروتين واللغات في البيت وما يساعد على الاطمئنان.",
          ],
        ),
      ),
    },
    {
      id: b.id(),
      title: b.w(["Settling in gently", "تأقلم بهدوء"]),
      text: b.w(
        naming(
          ["families"],
          [
            "Short sessions with a parent close by, growing a little longer each day.",
            "جلسات قصيرة بقرب أحد الوالدين، تطول قليلًا كل يوم.",
          ],
          [
            "Short sessions at first, growing a little longer each day.",
            "جلسات قصيرة في البداية، تطول قليلًا كل يوم.",
          ],
        ),
      ),
    },
    {
      id: b.id(),
      title: b.w(["A full, happy day", "يوم كامل وسعيد"]),
      text: b.w(
        naming(
          ["families"],
          [
            "When your child is ready they stay the whole day, and you hear how it went at the end of each one.",
            "حين يصبح طفلكم مستعدًا يبقى اليوم كله، ونخبركم في نهاية كل يوم كيف مضى.",
          ],
          [
            "When the time is right the sessions run the whole day, and you hear how it went at the end of each one.",
            "حين يحين الوقت تمتدّ الجلسات اليوم كله، ونخبركم في نهاية كل يوم كيف مضى.",
          ],
        ),
      ),
    },
  ],
}));

const PARENTS_NOTICE = section(
  "announcement",
  "strip",
  (b) => ({
    text: b.w([
      "Parent and teacher meetings are next week. Send us a message to choose a time that suits you.",
      "لقاءات أولياء الأمور والمعلّمين في الأسبوع القادم. راسلونا لاختيار الوقت الذي يناسبكم.",
    ]),
    date: "",
    actions: [
      link(
        b,
        ["Choose a time", "اختاروا موعدًا"],
        `/pages/parents#${ANCHOR.general}`,
      ),
    ],
  }),
  { scheme: "accent", spacing: "s" },
);

const PARENTS_LINKS = section("quickLinks", "tiles", (b) => ({
  heading: b.w(["Everyday *essentials*", "ما تحتاجونه *كل يوم*"]),
  items: [
    quickLink(
      b,
      ["The school day", "اليوم الدراسي"],
      ["Times from drop-off to home time", "المواعيد من الوصول حتى الانصراف"],
      "clock",
      `/pages/parents#${PARENTS_ANCHOR.day}`,
    ),
    quickLink(
      b,
      ["News and term dates", "الأخبار ومواعيد الفصول"],
      [
        "Holidays, events and letters home",
        "العطل والفعاليات والرسائل إلى الأسر",
      ],
      "calendar",
      "/news",
    ),
    quickLink(
      b,
      ["Report an absence", "الإبلاغ عن غياب"],
      ["Let us know before 8:30", "أخبرونا قبل الساعة 8:30"],
      "heart",
      `/pages/parents#${ANCHOR.general}`,
    ),
    quickLink(
      b,
      naming(
        ["families"],
        ["Questions families ask", "أسئلة تطرحها الأسر"],
        ["Questions people ask", "أسئلة يطرحها كثيرون"],
      ),
      ["Buses, joining mid-year and more", "الحافلات والالتحاق خلال العام وغيرها"],
      "lightbulb",
      `/pages/parents#${PARENTS_ANCHOR.questions}`,
    ),
    quickLink(
      b,
      ["A place for a sibling", "مقعد لأخ أو أخت"],
      ["Brothers and sisters apply first", "الأولوية في القبول للإخوة"],
      "users",
      "/pages/admissions",
    ),
    quickLink(
      b,
      ["The office", "مكتب المدرسة"],
      ["Phone, email and opening hours", "الهاتف والبريد ومواعيد العمل"],
      "phone",
      "/pages/contact",
    ),
  ],
}));

const moment = (b: Builder, time: string, title: Said, text: Said) => ({
  id: b.id(),
  year: time,
  title: b.w(title),
  text: b.w(text),
});

const PARENTS_DAY = section(
  "timeline",
  "vertical",
  (b) => ({
    heading: b.w(["A day at *school*", "يوم في *المدرسة*"]),
    items: [
      moment(
        b,
        "7:30",
        ["Doors open", "تُفتح الأبواب"],
        [
          "Breakfast club and a calm start, with staff at the gate to greet every child.",
          "نادي الإفطار وبداية هادئة، ويستقبل فريقنا كل طفل عند البوابة.",
        ],
      ),
      moment(
        b,
        "8:00",
        ["Learning begins", "يبدأ التعلّم"],
        [
          "The morning's main lessons, while everyone is fresh.",
          "دروس الصباح الأساسية والجميع في كامل نشاطهم.",
        ],
      ),
      moment(
        b,
        "11:30",
        ["Lunch and play", "الغداء واللعب"],
        [
          "A hot lunch cooked on site, then time outside.",
          "غداء ساخن يُطهى في المدرسة، ثم وقت في الساحة.",
        ],
      ),
      moment(
        b,
        "14:30",
        ["Home time", "وقت الانصراف"],
        [
          "Collection from the main gate, or the bus home.",
          "الاستلام من البوابة الرئيسية، أو العودة بالحافلة.",
        ],
      ),
      moment(
        b,
        "16:00",
        ["Clubs finish", "تنتهي الأندية"],
        [
          "After-school clubs and supervised homework end for the day.",
          "تنتهي أندية ما بعد المدرسة والدراسة بإشراف.",
        ],
      ),
    ],
  }),
  { scheme: "soft", anchor: PARENTS_ANCHOR.day },
);

const PARENTS_MESSAGE = FORM(
  "general",
  ["Message the *office*", "راسلوا *المكتب*"],
  [
    "Tell us about an absence, ask for a meeting or send any question. The office reads every message the same day.",
    "أخبرونا عن غياب، أو اطلبوا لقاءً، أو أرسلوا أي سؤال. يقرأ المكتب كل رسالة في اليوم نفسه.",
  ],
);

/** A school that is still to open: one message, said large, before any picture. */
const LAUNCH_HERO = section("hero", "type", (b) => ({
  eyebrow: b.w(["Opening September 2027", "نفتح أبوابنا في سبتمبر 2027"]),
  heading: b.w([
    "A new school for *curious* minds",
    "مدرسة جديدة *للعقول* الفضولية",
  ]),
  text: b.w([
    "We open next September with small classes, two languages and a founding team of teachers. Come and meet us before the doors open.",
    "نفتتح في سبتمبر القادم بفصول صغيرة ولغتين وفريق مؤسِّس من المعلّمين. تعالوا للقائنا قبل أن تُفتح الأبواب.",
  ]),
  actions: [
    link(
      b,
      ["Register interest", "سجّلوا اهتمامكم"],
      `/pages/admissions#${ANCHOR.enquiry}`,
    ),
    link(b, ["Book a visit", "احجزوا زيارة"], `/pages/visit#${ANCHOR.visit}`),
  ],
  height: "l" as const,
}));

const LAUNCH_STORY = section("imageText", "overlap", (b) => ({
  eyebrow: b.w(["Before we open", "قبل الافتتاح"]),
  heading: b.w(["Meet the *founding* team", "تعرّفوا على *الفريق المؤسِّس*"]),
  body: plainContent(
    b.w([
      "Come to an information morning at the new campus. Walk the classrooms as they take shape, meet the principal and the teachers who will start the school, and ask everything you want to know.\nMornings run every Saturday from 10:00 until the doors open.",
      "احضروا صباحًا تعريفيًا في الحرم الجديد. تجوّلوا في الفصول وهي تكتمل، وقابلوا المديرة والمعلّمين الذين سيبدؤون المدرسة، واسألوا عن كل ما تريدون معرفته.\nتُقام اللقاءات صباح كل سبت من الساعة 10:00 حتى يوم الافتتاح.",
    ]),
  ),
  media: {
    kind: "image" as const,
    fileId: null,
    alt: "",
    posterFileId: null,
    captionsFileId: null,
  },
  actions: [
    link(b, ["Book a morning", "احجزوا موعدًا"], `/pages/visit#${ANCHOR.visit}`),
  ],
}));

const LAUNCH_STATS = section("stats", "row", (b) => ({
  heading: b.w(["Small by *design*", "صغيرة *عن قصد*"]),
  items: [
    {
      id: b.id(),
      value: "20",
      label: b.w(
        naming(
          ["families"],
          ["children in a class, at most", "طفلًا في الفصل كحدّ أقصى"],
          ["learners in a class, at most", "متعلّمًا في الفصل كحدّ أقصى"],
        ),
      ),
      caption: "",
    },
    {
      id: b.id(),
      value: "2",
      label: b.w(["languages, every day", "لغتان كل يوم"]),
      caption: "",
    },
    {
      id: b.id(),
      value: "12",
      label: b.w(["founding teachers", "معلّمًا مؤسِّسًا"]),
      caption: "",
    },
    {
      id: b.id(),
      value: "1:10",
      label: b.w(
        naming(
          ["families"],
          [
            "adults to children in the early years",
            "نسبة الكبار إلى الأطفال في السنوات الأولى",
          ],
          [
            "adults to learners in the early years",
            "نسبة الكبار إلى المتعلّمين في السنوات الأولى",
          ],
        ),
      ),
      caption: "",
    },
  ],
  source: "",
}));

const LAUNCH_QUOTE = section(
  "quote",
  "large",
  (b) => ({
    quote: b.w([
      "We are building the school we always wanted to teach in: small enough to know every child, ambitious enough to stretch each one.",
      "نبني المدرسة التي طالما تمنّينا أن نعلّم فيها: صغيرة بما يكفي لنعرف كل طفل، وطموحة بما يكفي لنتحدّى كلًّا منهم.",
    ]),
    name: b.w(["Dr Amal Nasser", "د. أمل ناصر"]),
    role: b.w(["Founding principal", "المديرة المؤسِّسة"]),
    portrait: noImage,
    badge: "none" as const,
  }),
  { scheme: "ink" },
);

const LAUNCH_STEPS = section("steps", "horizontal", (b) => ({
  heading: b.w([
    "Four steps to a *founding* place",
    "أربع خطوات نحو *مقعد مؤسِّس*",
  ]),
  text: "",
  items: [
    {
      id: b.id(),
      title: b.w(["Register interest", "سجّلوا اهتمامكم"]),
      text: b.w(
        naming(
          ["families", "grade_levels"],
          [
            "Tell us about your child and the year they would join. We reply within two working days.",
            "أخبرونا عن طفلكم والصف الذي سيلتحق به، وسنرد خلال يومي عمل.",
          ],
          [
            "Tell us a little about yourself and when you would like to start. We reply within two working days.",
            "أخبرنا قليلًا عن نفسك ومتى تودّ أن تبدأ، وسنرد خلال يومي عمل.",
          ],
        ),
      ),
    },
    {
      id: b.id(),
      title: b.w(["Meet us", "قابلونا"]),
      text: b.w([
        "Come to an information morning at the new campus and meet the founding team.",
        "احضروا صباحًا تعريفيًا في الحرم الجديد وقابلوا الفريق المؤسِّس.",
      ]),
    },
    {
      id: b.id(),
      title: b.w(["Assessment", "التقييم"]),
      text: b.w(
        naming(
          ["families"],
          [
            "A relaxed morning with us, so we can understand how your child learns best.",
            "صباح هادئ معنا لنفهم كيف يتعلّم طفلكم على أفضل وجه.",
          ],
          [
            "A relaxed morning with us, so we can understand how you learn best.",
            "صباح هادئ معنا لنفهم كيف تتعلّم على أفضل وجه.",
          ],
        ),
      ),
    },
    {
      id: b.id(),
      title: b.w(["A founding place", "مقعد مؤسِّس"]),
      text: b.w(
        naming(
          ["families"],
          [
            "We confirm your child's place and help you prepare for the very first day.",
            "نؤكّد مقعد طفلكم ونساعدكم على الاستعداد لليوم الأول.",
          ],
          [
            "We confirm your place and help you prepare for the very first day.",
            "نؤكّد مقعدك ونساعدك على الاستعداد لليوم الأول.",
          ],
        ),
      ),
    },
  ],
}));

const LAUNCH_NEWS = section("news", "list", (b) => ({
  heading: b.w(["Notes from the *founding* year", "من يوميات *عام التأسيس*"]),
  count: 3,
  category: "",
}));

/** A sample of every section, for the builder to show and insert. */
const SAMPLES: Record<SectionType, (b: Builder) => PageSection> = {
  hero: HERO_HOME,
  slides: SLIDES,
  blocks: BLOCKS,
  pageHeader: PAGE_HEADER(
    ["Page title", "عنوان الصفحة"],
    ["A sentence about what this page offers.", "جملة عمّا تقدّمه هذه الصفحة."],
  ),
  announcement: ANNOUNCEMENT,
  welcome: WELCOME,
  text: TEXT(
    ["Our approach", "نهجنا"],
    [
      "Write a few paragraphs about what makes this part of your school distinctive.",
      "اكتب بضع فقرات عمّا يميّز هذا الجانب من مدرستك.",
    ],
  ),
  imageText: IMAGE_TEXT,
  cards: CARDS_PROGRAMMES,
  divisions: DIVISIONS,
  stats: STATS,
  pillars: PILLARS,
  quote: QUOTE,
  voices: VOICES,
  people: PEOPLE,
  video: VIDEO,
  gallery: GALLERY,
  timeline: TIMELINE,
  accordion: FAQ,
  logos: LOGOS,
  news: NEWS,
  events: EVENTS,
  courses: COURSES,
  admissions: ADMISSIONS_INTAKES,
  registerApply: REGISTER_APPLY,
  steps: STEPS,
  fees: FEES,
  contact: CONTACT,
  quickLinks: QUICK_LINKS,
  embed: EMBED,
  form: ENQUIRY_FORM,
};

/** Sample words for a layout whose items say something else than the section's others. */
const LAYOUT_SAMPLES: Partial<Record<SectionType, Record<string, Make>>> = {
  fees: { plans: PLANS },
};

/**
 * One section with sample words in both languages and the same ids, in the
 * layout asked for.
 */
export function buildSection<T extends SectionType>(
  type: T,
  variant: SectionOf<T>["variant"],
  primary: SiteLocale,
): { content: PageSection; translation: PageSection } {
  const ids = Array.from({ length: 60 }, () => crypto.randomUUID());
  const sample = LAYOUT_SAMPLES[type]?.[variant] ?? SAMPLES[type];
  const build = (locale: SiteLocale) =>
    ({
      ...sample(builder(ids, locale, () => true)),
      variant,
    }) as PageSection;
  return {
    content: build(primary),
    translation: build(primary === "ar" ? "en" : "ar"),
  };
}

// The international starter's own words: a school that backs its claims
// with figures, shows its four stages and lets families speak.
const INTL_HERO = section("hero", "collage", (b) => ({
  eyebrow: b.w([
    "International school, ages 3 to 18",
    "مدرسة دولية، من 3 إلى 18 سنة",
  ]),
  heading: b.w([
    "Curious minds, *global* futures",
    "عقول فضولية ومستقبل *عالمي*",
  ]),
  text: b.w([
    "Students from forty-five countries learn in English and Arabic, from their first morning in the early years to the university of their choice.",
    "يتعلّم طلاب من خمس وأربعين دولة بالعربية والإنجليزية، من صباحهم الأول في رياض الأطفال حتى الجامعة التي يختارونها.",
  ]),
  more: [
    { id: b.id(), image: noImage },
    { id: b.id(), image: noImage },
  ],
  actions: [
    link(b, ["Book a visit", "احجز زيارة"], `/pages/visit#${ANCHOR.visit}`),
    link(b, ["Explore academics", "اكتشف مناهجنا"], "/pages/academics"),
  ],
  height: "l" as const,
}));

const figure = (b: Builder, value: string, label: Said, caption: Said) => ({
  id: b.id(),
  value,
  label: b.w(label),
  caption: b.w(caption),
});

const INTL_FIGURES = section("stats", "captions", (b) => ({
  heading: b.w(["The school in *numbers*", "المدرسة *بالأرقام*"]),
  items: [
    figure(
      b,
      "1,200",
      ["students", "طالب وطالبة"],
      naming(
        ["grade_levels"],
        [
          "From the early years to Grade 12, on one campus.",
          "من رياض الأطفال حتى الصف الثاني عشر، في حرم واحد.",
        ],
        [
          "From the early years to graduation, on one campus.",
          "من رياض الأطفال حتى التخرّج، في حرم واحد.",
        ],
      ),
    ),
    figure(
      b,
      "45",
      ["nationalities", "جنسية"],
      naming(
        ["families"],
        [
          "Families from every continent, learning as one community.",
          "أسر من كل القارات تتعلّم مجتمعًا واحدًا.",
        ],
        [
          "Students from every continent, learning as one community.",
          "طلاب من كل القارات يتعلّمون مجتمعًا واحدًا.",
        ],
      ),
    ),
    figure(
      b,
      "12:1",
      ["students per teacher", "طالبًا لكل معلّم"],
      naming(
        ["families"],
        [
          "Small classes, so every child is known well.",
          "فصول صغيرة يُعرف فيها كل طفل معرفة جيدة.",
        ],
        [
          "Small classes, so every student is known well.",
          "فصول صغيرة يُعرف فيها كل طالب معرفة جيدة.",
        ],
      ),
    ),
    figure(
      b,
      "98%",
      ["university offers", "قبولًا جامعيًا"],
      [
        "Graduates holding an offer from their first-choice university.",
        "من الخريجين نالوا قبولًا من جامعتهم الأولى.",
      ],
    ),
  ],
  source: b.w([
    "Figures for the 2026 to 2027 school year.",
    "أرقام العام الدراسي 2026–2027.",
  ]),
}));

/** The four stages: on the home page the way into academics, on academics itself rows that lead nowhere else. */
const INTL_STAGES = (variant: "tall" | "rows", href: string) =>
  section("divisions", variant, (b) => ({
    heading: b.w(["Four stages, *one* school", "أربع مراحل في مدرسة *واحدة*"]),
    text: b.w(
      naming(
        ["families"],
        [
          "Each stage builds on the last, led by a head who knows every child in it.",
          "تبني كل مرحلة على ما قبلها، ويقودها رئيس يعرف كل طفل فيها.",
        ],
        [
          "Each stage builds on the last, led by a head who knows every student in it.",
          "تبني كل مرحلة على ما قبلها، ويقودها رئيس يعرف كل طالب فيها.",
        ],
      ),
    ),
    items: [
      {
        id: b.id(),
        title: b.w(["Early years", "رياض الأطفال"]),
        ages: b.w(["Ages 3 to 5", "من 3 إلى 5 سنوات"]),
        text: b.w([
          "Learning through play, stories and discovery, indoors and out.",
          "التعلّم باللعب والقصص والاكتشاف، داخل الفصل وخارجه.",
        ]),
        image: noImage,
        href,
      },
      {
        id: b.id(),
        title: b.w(["Primary", "الابتدائية"]),
        ages: b.w(["Ages 5 to 11", "من 5 إلى 11 سنة"]),
        text: b.w([
          "Strong foundations in reading, number and science, in two languages.",
          "أسس متينة في القراءة والحساب والعلوم، بلغتين.",
        ]),
        image: noImage,
        href,
      },
      {
        id: b.id(),
        title: b.w(["Middle school", "المتوسطة"]),
        ages: b.w(["Ages 11 to 14", "من 11 إلى 14 سنة"]),
        text: b.w([
          "Wider subjects, more choice and the habits of independent study.",
          "مواد أوسع وخيارات أكثر وعادات الدراسة المستقلة.",
        ]),
        image: noImage,
        href,
      },
      {
        id: b.id(),
        title: b.w(["High school", "الثانوية"]),
        ages: b.w(["Ages 14 to 18", "من 14 إلى 18 سنة"]),
        text: b.w([
          "Demanding courses and guidance towards the university of their choice.",
          "مقررات رصينة وإرشاد نحو الجامعة التي يختارونها.",
        ]),
        image: noImage,
        href,
      },
    ],
  }));

const INTL_WHY = section("cards", "icons", (b) => ({
  heading: b.w(
    naming(
      ["families"],
      ["Why families *choose* us", "لماذا *تختارنا* الأسر"],
      ["Why students *choose* us", "لماذا *يختارنا* الطلاب"],
    ),
  ),
  text: b.w(
    naming(
      ["families"],
      [
        "What parents tell us made the difference when they first visited.",
        "ما تقول الأسر إنه صنع الفرق في زيارتها الأولى.",
      ],
      [
        "What visitors tell us made the difference when they first came.",
        "ما يقول زوّارنا إنه صنع الفرق في زيارتهم الأولى.",
      ],
    ),
  ),
  columns: "3" as const,
  items: [
    card(
      b,
      ["Two languages, many cultures", "لغتان وثقافات كثيرة"],
      naming(
        ["families"],
        [
          "Every child becomes fluent in English and Arabic, alongside classmates from forty-five countries.",
          "يتقن كل طفل العربية والإنجليزية، مع زملاء من خمس وأربعين دولة.",
        ],
        [
          "Every student becomes fluent in English and Arabic, alongside classmates from forty-five countries.",
          "يتقن كل طالب العربية والإنجليزية، مع زملاء من خمس وأربعين دولة.",
        ],
      ),
      "globe",
    ),
    card(
      b,
      ["Guidance at every step", "إرشاد في كل خطوة"],
      [
        "An adviser follows each student from the first morning to university applications, with time set aside every week.",
        "يرافق مرشد كل طالب من صباحه الأول حتى التقديم للجامعات، بوقت مخصّص كل أسبوع.",
      ],
      "compass",
    ),
    card(
      b,
      ["Ready for university", "مستعدّون للجامعة"],
      [
        "Graduates go on to leading universities around the world, most with an offer from their first choice.",
        "يلتحق خريجونا بجامعات رائدة حول العالم، وينال أكثرهم القبول من خيارهم الأول.",
      ],
      "graduation",
    ),
  ],
}));

const voice = (
  b: Builder,
  quote: Said,
  name: Said,
  role: Said,
  audience: "student" | "parent" | "staff" | "alumni",
) => ({
  id: b.id(),
  quote: b.w(quote),
  name: b.w(name),
  role: b.w(role),
  audience,
  portrait: noImage,
});

const INTL_VOICES = section("voices", "carousel", (b) => ({
  heading: b.w(["In their *own* words", "*بكلماتهم* هم"]),
  items: [
    voice(
      b,
      [
        "My children run in every morning. The teachers know them well and tell us how they are doing before we have to ask.",
        "يدخل أطفالي المدرسة كل صباح وهم متحمّسون. المعلّمون يعرفونهم جيدًا ويخبروننا بأحوالهم قبل أن نسأل.",
      ],
      ["Layla Hassan", "ليلى حسن"],
      ["Parent of two", "أمّ لطفلين"],
      "parent",
    ),
    voice(
      b,
      [
        "Teachers here really listen. When I wanted to start a robotics club, they helped me find the room and the kit.",
        "المعلّمون هنا يستمعون حقًا. حين أردت تأسيس نادٍ للروبوتات ساعدوني في إيجاد القاعة والأدوات.",
      ],
      ["Omar Saleh", "عمر صالح"],
      naming(
        ["grade_levels"],
        ["Student, Grade 10", "طالب في الصف العاشر"],
        ["Student", "طالب"],
      ),
      "student",
    ),
    voice(
      b,
      [
        "We moved here in the middle of a school year. Within a week our daughter had friends, and the office had answered every question we had.",
        "انتقلنا إلى هنا في منتصف العام الدراسي، وخلال أسبوع كوّنت ابنتنا صداقات، وأجاب المكتب عن كل أسئلتنا.",
      ],
      ["Daniel Okafor", "دانيال أوكافور"],
      ["Parent, new to the city", "وليّ أمر، جديد في المدينة"],
      "parent",
    ),
    voice(
      b,
      [
        "It is a place where I keep growing as a teacher, with colleagues who share what works and time to plan together.",
        "مكان أواصل فيه النمو كمعلّمة، مع زملاء يتبادلون ما ينجح ووقت للتخطيط معًا.",
      ],
      ["Sara Mansour", "سارة منصور"],
      ["Head of science", "رئيسة قسم العلوم"],
      "staff",
    ),
    voice(
      b,
      [
        "I arrived at university knowing how to plan my own work and when to ask for help. I learned both here.",
        "وصلت إلى الجامعة وأنا أعرف كيف أنظّم عملي ومتى أطلب المساعدة، وقد تعلّمت الأمرين هنا.",
      ],
      ["Nour Adel", "نور عادل"],
      [
        "Class of 2024, now reading engineering",
        "خريجة دفعة 2024، تدرس الهندسة",
      ],
      "alumni",
    ),
  ],
}));

const INTL_SUBJECTS = section("cards", "icons", (b) => ({
  heading: b.w(["What students *learn*", "ماذا *يتعلّم* طلابنا"]),
  text: b.w(
    naming(
      ["families"],
      [
        "A broad curriculum in two languages, taught in small classes by teachers who know each child.",
        "منهج واسع بلغتين، في فصول صغيرة، مع معلّمين يعرفون كل طفل.",
      ],
      [
        "A broad curriculum in two languages, taught in small classes by teachers who know each student.",
        "منهج واسع بلغتين، في فصول صغيرة، مع معلّمين يعرفون كل طالب.",
      ],
    ),
  ),
  columns: "3" as const,
  items: [
    card(
      b,
      ["Languages", "اللغات"],
      [
        "Arabic and English every day from the early years, with French added in primary.",
        "العربية والإنجليزية يوميًا منذ السنوات الأولى، وتُضاف الفرنسية في المرحلة الابتدائية.",
      ],
      "globe",
    ),
    card(
      b,
      ["Mathematics", "الرياضيات"],
      [
        "From counting and pattern in the early years to calculus and statistics in the final years.",
        "من العدّ والأنماط في السنوات الأولى إلى التفاضل والإحصاء في السنوات الأخيرة.",
      ],
      "lightbulb",
    ),
    card(
      b,
      ["Sciences", "العلوم"],
      [
        "Biology, chemistry and physics in working laboratories, with a project of their own every term.",
        "الأحياء والكيمياء والفيزياء في مختبرات مجهّزة، مع مشروع خاص في كل فصل دراسي.",
      ],
      "flask",
    ),
    card(
      b,
      ["Humanities", "العلوم الإنسانية"],
      [
        "History, geography and global politics, read from more than one point of view.",
        "التاريخ والجغرافيا والسياسة العالمية، من أكثر من وجهة نظر.",
      ],
      "map",
    ),
    card(
      b,
      ["The arts", "الفنون"],
      [
        "Music, drama and visual art, with performances and exhibitions every term.",
        "الموسيقى والمسرح والفنون البصرية، مع عروض ومعارض في كل فصل.",
      ],
      "palette",
    ),
    card(
      b,
      ["Sport", "الرياضة"],
      [
        "Swimming, athletics and team sports, with fixtures against schools across the city.",
        "السباحة وألعاب القوى والرياضات الجماعية، مع مباريات أمام مدارس من أنحاء المدينة.",
      ],
      "trophy",
    ),
  ],
}));

const INTL_TEACHING = section("imageText", "mediaStart", (b) => ({
  eyebrow: b.w(["How we teach", "كيف نُعلّم"]),
  heading: b.w([
    "Lessons that ask students to *think*",
    "دروس تدعو الطلاب إلى *التفكير*",
  ]),
  body: plainContent(
    b.w(
      naming(
        ["families"],
        [
          "Teachers plan together across each stage, so what a child learns one year builds on the last. Lessons begin with a question, and students spend as long explaining their thinking as writing answers down.\nWe report to families three times a year, and you are welcome to sit in on a lesson when you visit.",
          "يخطّط المعلّمون معًا في كل مرحلة، فيبني ما يتعلّمه الطفل في عام على ما سبقه. تبدأ الدروس بسؤال، ويقضي الطلاب في شرح تفكيرهم وقتًا يعادل ما يقضونه في كتابة الإجابات.\nنرسل تقارير إلى الأسر ثلاث مرات في العام، ويسعدنا أن تحضروا درسًا في أثناء زيارتكم.",
        ],
        [
          "Teachers plan together across each stage, so what a student learns one year builds on the last. Lessons begin with a question, and students spend as long explaining their thinking as writing answers down.\nEvery student hears how they are doing three times a year, and you are welcome to sit in on a lesson when you visit.",
          "يخطّط المعلّمون معًا في كل مرحلة، فيبني ما يتعلّمه الطالب في عام على ما سبقه. تبدأ الدروس بسؤال، ويقضي الطلاب في شرح تفكيرهم وقتًا يعادل ما يقضونه في كتابة الإجابات.\nيعرف كل طالب مستوى تقدّمه ثلاث مرات في العام، ويسعدنا أن تحضروا درسًا في أثناء زيارتكم.",
        ],
      ),
    ),
  ),
  media: {
    kind: "image" as const,
    fileId: null,
    alt: "",
    posterFileId: null,
    captionsFileId: null,
  },
  actions: [
    link(b, ["See a lesson", "احضر درسًا"], `/pages/visit#${ANCHOR.visit}`),
  ],
}));

const INTL_RESULTS = section(
  "stats",
  "captions",
  (b) => ({
    heading: b.w(["Results that *open doors*", "نتائج *تفتح الأبواب*"]),
    items: [
      figure(
        b,
        "98%",
        ["university offers", "قبولًا جامعيًا"],
        [
          "Graduates holding an offer from their first-choice university.",
          "من الخريجين نالوا قبولًا من جامعتهم الأولى.",
        ],
      ),
      figure(
        b,
        "92%",
        ["top grades in English", "تقديرات عليا في الإنجليزية"],
        [
          "Students at the two highest grades in their final examinations.",
          "من الطلاب نالوا أعلى تقديرين في الامتحانات النهائية.",
        ],
      ),
      figure(
        b,
        "24",
        ["countries of study", "دولة للدراسة"],
        naming(
          ["grade_levels"],
          [
            "Where our last five year groups went on to university.",
            "التحق فيها خريجو آخر خمس دفعات بالجامعات.",
          ],
          [
            "Where our last five graduating classes went on to university.",
            "التحق فيها خريجو آخر خمس دفعات بالجامعات.",
          ],
        ),
      ),
    ],
    source: b.w([
      "School results, class of 2026.",
      "نتائج المدرسة، دفعة 2026.",
    ]),
  }),
  { align: "center" },
);

const INTL_HEADS = section("people", "grid", (b) => ({
  heading: b.w(["Heads of *stage*", "رؤساء *المراحل*"]),
  text: b.w(
    naming(
      ["families"],
      [
        "The people who know your child's stage best, and whom you will meet when you visit.",
        "هم الأقرب إلى مرحلة طفلكم، وستقابلونهم حين تزوروننا.",
      ],
      [
        "The people who know each stage best, and whom you will meet when you visit.",
        "هم الأقرب إلى كل مرحلة، وستقابلونهم حين تزوروننا.",
      ],
    ),
  ),
  items: [
    person(
      b,
      ["Mariam Fawzy", "مريم فوزي"],
      ["Head of early years", "رئيسة رياض الأطفال"],
    ),
    person(
      b,
      ["James Whitfield", "جيمس ويتفيلد"],
      ["Head of primary", "رئيس المرحلة الابتدائية"],
    ),
    person(
      b,
      ["Hana Youssef", "هناء يوسف"],
      ["Head of middle school", "رئيسة المرحلة المتوسطة"],
    ),
    person(
      b,
      ["Karim Adel", "كريم عادل"],
      ["Head of high school", "رئيس المرحلة الثانوية"],
    ),
  ],
}));

const HERITAGE_HERO = section("hero", "fullbleed", (b) => ({
  eyebrow: b.w(["Founded in 1921", "تأسست عام 1921"]),
  heading: b.w([
    "An education of the *mind* and of the *heart*",
    "تعليم ينمي *العقل* ويهذب *القلب*",
  ]),
  text: b.w([
    "An independent day school for girls and boys aged 3 to 18, where scholarship, service and friendship have gone hand in hand for more than a century.",
    "مدرسة مستقلة للبنات والبنين من سن الثالثة حتى الثامنة عشرة، يسير فيها العلم والخدمة والصداقة جنبًا إلى جنب منذ أكثر من قرن.",
  ]),
  actions: [
    link(b, ["Enquire", "استفسر"], `/pages/admissions#${ANCHOR.enquiry}`),
    link(b, ["Book a visit", "احجز زيارة"], `/pages/visit#${ANCHOR.visit}`),
  ],
  height: "l" as const,
}));

/** On the canvas rather than the brand, so it does not run on from the hero's dark picture. */
const HERITAGE_PURPOSE = section(
  "text",
  "statement",
  (b) => ({
    eyebrow: b.w(["Our purpose", "رسالتنا"]),
    heading: b.w(
      naming(
        ["families"],
        [
          "We teach children to *think for themselves*, to *care for others* and to go out into the world with a sense of purpose.",
          "نعلّم أبناءنا أن *يفكّروا بأنفسهم* وأن *يرعوا غيرهم*، وأن يخرجوا إلى العالم وفي نفوسهم غاية.",
        ],
        [
          "We teach our students to *think for themselves*, to *care for others* and to go out into the world with a sense of purpose.",
          "نعلّم طلابنا أن *يفكّروا بأنفسهم* وأن *يرعوا غيرهم*، وأن يخرجوا إلى العالم وفي نفوسهم غاية.",
        ],
      ),
    ),
    body: plainContent(
      b.w([
        "Small classes, a broad and demanding curriculum and a house system that gives every pupil a place to belong, from their first morning to their last examination.",
        "فصول صغيرة، ومنهج واسع ومتطلّب، ونظام بيوت يمنح كل طالب مكانًا ينتمي إليه، من صباحه الأول حتى امتحانه الأخير.",
      ]),
    ),
  }),
  { scheme: "canvas", align: "center" },
);

const HERITAGE_LETTER = section("welcome", "portraitStart", (b) => ({
  heading: b.w(["A letter from the *Principal*", "رسالة من *مديرة* المدرسة"]),
  body: plainContent(
    b.w(
      naming(
        ["families"],
        [
          "Dear families,\nThank you for thinking of us for your child. A school is best judged not by its buildings or its results, though we are proud of both, but by the way its pupils treat one another when nobody is watching.\nHere every child is known. Their teachers notice when they fall quiet, stretch them when they coast and celebrate when they surprise themselves. That has been our work since the day the school opened.\nI would be delighted to show you round. Come on an ordinary morning and see it for yourself.\nWith warm wishes,",
          "أعزّاءنا أولياء الأمور،\nشكرًا لأنكم فكّرتم فينا لأبنائكم. لا تُقاس المدرسة بمبانيها ولا بنتائجها، وإن كنّا نفخر بهما، بل بالطريقة التي يعامل بها طلابها بعضهم بعضًا حين لا يراهم أحد.\nهنا يُعرف كل طفل. يلاحظ معلّموه صمته، ويدفعونه إلى الأمام حين يتراخى، ويحتفون به حين يفاجئ نفسه. هذا عملنا منذ اليوم الأول لافتتاح المدرسة.\nيسعدني أن أرافقكم في جولة. تعالوا في صباح عادي وشاهدوا بأنفسكم.\nمع خالص التحيات،",
        ],
        [
          "Dear friends,\nThank you for thinking of us. A school is best judged not by its buildings or its results, though we are proud of both, but by the way its students treat one another when nobody is watching.\nHere every student is known. Their teachers notice when they fall quiet, stretch them when they coast and celebrate when they surprise themselves. That has been our work since the day the school opened.\nI would be delighted to show you round. Come on an ordinary morning and see it for yourself.\nWith warm wishes,",
          "أعزّاءنا،\nشكرًا لأنكم فكّرتم فينا. لا تُقاس المدرسة بمبانيها ولا بنتائجها، وإن كنّا نفخر بهما، بل بالطريقة التي يعامل بها طلابها بعضهم بعضًا حين لا يراهم أحد.\nهنا يُعرف كل طالب. يلاحظ معلّموه صمته، ويدفعونه إلى الأمام حين يتراخى، ويحتفون به حين يفاجئ نفسه. هذا عملنا منذ اليوم الأول لافتتاح المدرسة.\nيسعدني أن أرافقكم في جولة. تعالوا في صباح عادي وشاهدوا بأنفسكم.\nمع خالص التحيات،",
        ],
      ),
    ),
  ),
  portrait: noImage,
  name: b.w(["Dr Amal Nasser", "د. أمل ناصر"]),
  role: b.w(["Principal", "مديرة المدرسة"]),
}));

const HERITAGE_INSPECTION = section(
  "quote",
  "large",
  (b) => ({
    quote: b.w([
      "Pupils are articulate, confident and courteous. Their personal development is excellent, and they leave the school ready to take their place in the world.",
      "الطلاب فصحاء واثقون مهذّبون، ونموّهم الشخصي ممتاز، ويغادرون المدرسة مستعدّين لأخذ مكانهم في العالم.",
    ]),
    name: b.w(["Inspection report", "تقرير التفتيش"]),
    role: b.w([
      "Whole-school inspection, spring 2025",
      "التفتيش الشامل للمدرسة، ربيع 2025",
    ]),
    portrait: noImage,
    badge: "none" as const,
  }),
  { scheme: "brand", align: "center" },
);

const HERITAGE_ACCREDITATION = section(
  "logos",
  "row",
  (b) => ({
    heading: b.w(["Accredited by", "معتمدون من"]),
    items: (
      [
        ["Council of International Schools", "مجلس المدارس الدولية"],
        ["Cambridge International", "كامبريدج الدولية"],
        ["British Schools Overseas", "المدارس البريطانية في الخارج"],
      ] as const
    ).map((name) => ({
      id: b.id(),
      image: noImage,
      name: b.w(name),
      href: "",
    })),
  }),
  { scheme: "brand", align: "center" },
);

const HISTORY = section("timeline", "vertical", (b) => ({
  heading: b.w(["A *century* of learning", "مئة عام من *التعليم*"]),
  items: [
    milestone(
      b,
      "1921",
      ["Founded", "التأسيس"],
      naming(
        ["families"],
        [
          "The school opens in a family house by the river, with forty pupils, six teachers and a library of borrowed books.",
          "تفتح المدرسة أبوابها في بيت عائلي قرب النهر، بأربعين طالبًا وستة معلّمين ومكتبة من كتب مستعارة.",
        ],
        [
          "The school opens in an old house by the river, with forty students, six teachers and a library of borrowed books.",
          "تفتح المدرسة أبوابها في بيت قديم قرب النهر، بأربعين طالبًا وستة معلّمين ومكتبة من كتب مستعارة.",
        ],
      ),
    ),
    milestone(
      b,
      "1954",
      ["A school for every age", "مدرسة لكل الأعمار"],
      [
        "The senior school opens, and our first leavers go on to universities at home and abroad.",
        "تُفتتح المرحلة الثانوية، ويلتحق أوائل خرّيجينا بجامعات في الداخل والخارج.",
      ],
    ),
    milestone(
      b,
      "1978",
      ["Two languages, one school", "لغتان ومدرسة واحدة"],
      naming(
        ["grade_levels"],
        [
          "Arabic and English become equal languages of teaching, from the first year to the last.",
          "تصبح العربية والإنجليزية لغتين متكافئتين للتدريس، من الصف الأول حتى الأخير.",
        ],
        [
          "Arabic and English become equal languages of teaching, from the first year to the last.",
          "تصبح العربية والإنجليزية لغتين متكافئتين للتدريس، من أول عام دراسي حتى آخره.",
        ],
      ),
    ),
    milestone(
      b,
      "2001",
      ["Around the old courtyard", "حول الفناء القديم"],
      [
        "A new library, laboratories and a theatre open on three sides of the original courtyard.",
        "تُفتتح مكتبة جديدة ومختبرات ومسرح على ثلاثة جوانب من الفناء الأصلي.",
      ],
    ),
    milestone(
      b,
      "2021",
      ["A hundred years", "مئة عام"],
      [
        "We mark our centenary with a bursary fund that today helps one pupil in ten to study here.",
        "نحتفل بمئويتنا بصندوق للمنح الدراسية يساعد اليوم طالبًا من كل عشرة على الدراسة لدينا.",
      ],
    ),
  ],
}));

// About, for a school of any age or kind: why it exists, the principal's
// welcome, its values, figures and how it began, with no founding year a
// school would have to correct.
const ABOUT_PURPOSE = section(
  "text",
  "statement",
  (b) => ({
    eyebrow: b.w(["Our purpose", "رسالتنا"]),
    heading: b.w(
      naming(
        ["families"],
        [
          "We want every child to leave us *confident* in themselves, *generous* to others and ready to keep learning all their life.",
          "نريد لكل طفل أن يغادرنا *واثقًا* بنفسه، *كريمًا* مع غيره، مستعدًا لأن يواصل التعلّم طوال حياته.",
        ],
        [
          "We want every student to leave us *confident* in themselves, *generous* to others and ready to keep learning all their life.",
          "نريد لكل طالب أن يغادرنا *واثقًا* بنفسه، *كريمًا* مع غيره، مستعدًا لأن يواصل التعلّم طوال حياته.",
        ],
      ),
    ),
    body: plainContent(
      b.w(
        naming(
          ["families"],
          [
            "Everything else follows from that: small classes, teachers who know each child well, languages taught with real care, and a day with room for sport, the arts and friendship as well as study.",
            "ومن هذه الغاية ينبع كل ما عداها: فصول صغيرة، ومعلّمون يعرفون كل طفل جيدًا، ولغات تُدرَّس بعناية حقيقية، ويوم دراسي يتّسع للرياضة والفنون والصداقة إلى جانب الدراسة.",
          ],
          [
            "Everything else follows from that: small classes, teachers who know each student well, languages taught with real care, and a day with room for sport, the arts and friendship as well as study.",
            "ومن هذه الغاية ينبع كل ما عداها: فصول صغيرة، ومعلّمون يعرفون كل طالب جيدًا، ولغات تُدرَّس بعناية حقيقية، ويوم دراسي يتّسع للرياضة والفنون والصداقة إلى جانب الدراسة.",
          ],
        ),
      ),
    ),
  }),
  { align: "center" },
);

const ABOUT_WELCOME = section("welcome", "portraitEnd", (b) => ({
  heading: b.w(["A word from our *principal*", "كلمة *مديرة* المدرسة"]),
  body: plainContent(
    b.w(
      naming(
        ["families"],
        [
          "Thank you for taking the time to find out about us. Choosing a school is one of the biggest decisions a family makes, and we do not take your trust lightly.\nWhat I hope you notice when you visit is how well our teachers know the children in front of them: what each one finds easy, what they find hard and what will help them take the next step. That knowledge is the heart of the school.\nCome and see us on an ordinary morning. I would be glad to answer your questions myself.",
          "شكرًا لأنكم خصّصتم وقتًا للتعرّف إلينا. إن اختيار المدرسة من أهمّ القرارات التي تتخذها الأسرة، ونحن نقدّر الثقة التي تضعونها فينا.\nأرجو أن تلاحظوا حين تزوروننا مدى معرفة معلّمينا بالأطفال الذين بين أيديهم: ما يسهل على كل منهم وما يصعب عليه، وما يعينه على الخطوة التالية. هذه المعرفة هي قلب المدرسة.\nتعالوا وزورونا في صباح عادي، ويسعدني أن أجيب عن أسئلتكم بنفسي.",
        ],
        [
          "Thank you for taking the time to find out about us. Choosing where to learn is one of the biggest decisions anyone makes, and we do not take your trust lightly.\nWhat I hope you notice when you visit is how well our teachers know the students in front of them: what each one finds easy, what they find hard and what will help them take the next step. That knowledge is the heart of the school.\nCome and see us on an ordinary morning. I would be glad to answer your questions myself.",
          "شكرًا لأنكم خصّصتم وقتًا للتعرّف إلينا. إن اختيار المكان الذي تتعلّمون فيه من أهمّ القرارات، ونحن نقدّر الثقة التي تضعونها فينا.\nأرجو أن تلاحظوا حين تزوروننا مدى معرفة معلّمينا بالطلاب الذين بين أيديهم: ما يسهل على كل منهم وما يصعب عليه، وما يعينه على الخطوة التالية. هذه المعرفة هي قلب المدرسة.\nتعالوا وزورونا في صباح عادي، ويسعدني أن أجيب عن أسئلتكم بنفسي.",
        ],
      ),
    ),
  ),
  portrait: noImage,
  name: b.w(["Dr Amal Nasser", "د. أمل ناصر"]),
  role: b.w(["Principal", "مديرة المدرسة"]),
}));

const pillar = (b: Builder, title: Said, text: Said, icon: IconId) => ({
  id: b.id(),
  title: b.w(title),
  text: b.w(text),
  icon,
  image: noImage,
});

const ABOUT_VALUES = section("pillars", "icons", (b) => ({
  heading: b.w(["What we *value*", "ما *نؤمن* به"]),
  text: b.w([
    "Four commitments we hold ourselves to, in every classroom and every year.",
    "أربعة التزامات نأخذ بها أنفسنا، في كل فصل وفي كل عام.",
  ]),
  items: [
    pillar(
      b,
      ["Curiosity", "الفضول"],
      naming(
        ["families"],
        [
          "Lessons start with a question, and children learn to enjoy working the answer out for themselves.",
          "تبدأ الدروس بسؤال، ويتعلّم الأطفال متعة الوصول إلى الإجابة بأنفسهم.",
        ],
        [
          "Lessons start with a question, and students learn to enjoy working the answer out for themselves.",
          "تبدأ الدروس بسؤال، ويتعلّم الطلاب متعة الوصول إلى الإجابة بأنفسهم.",
        ],
      ),
      "lightbulb",
    ),
    pillar(
      b,
      ["Care", "الرعاية"],
      naming(
        ["families"],
        [
          "Every child is known by name and by need, and no one is left to struggle quietly.",
          "يُعرف كل طفل باسمه وبما يحتاج إليه، ولا يُترك أحد يعاني في صمت.",
        ],
        [
          "Every student is known by name and by need, and no one is left to struggle quietly.",
          "يُعرف كل طالب باسمه وبما يحتاج إليه، ولا يُترك أحد يعاني في صمت.",
        ],
      ),
      "heart",
    ),
    pillar(
      b,
      ["Ambition", "الطموح"],
      naming(
        ["families"],
        [
          "High expectations in every subject, with the support each child needs to reach them.",
          "توقّعات عالية في كل مادة، مع الدعم الذي يحتاجه كل طفل ليبلغها.",
        ],
        [
          "High expectations in every subject, with the support each student needs to reach them.",
          "توقّعات عالية في كل مادة، مع الدعم الذي يحتاجه كل طالب ليبلغها.",
        ],
      ),
      "star",
    ),
    pillar(
      b,
      ["Belonging", "الانتماء"],
      naming(
        ["families"],
        [
          "Families, students and staff work as one community, and every voice is heard.",
          "تعمل الأسر والطلاب والمعلّمون مجتمعًا واحدًا يُسمع فيه كل صوت.",
        ],
        [
          "Students and staff work as one community, and every voice is heard.",
          "يعمل الطلاب والمعلّمون مجتمعًا واحدًا يُسمع فيه كل صوت.",
        ],
      ),
      "users",
    ),
  ],
}));

const ABOUT_FIGURES = section(
  "stats",
  "captions",
  (b) => ({
    heading: b.w(["The school at a *glance*", "المدرسة في *لمحة*"]),
    items: [
      figure(
        b,
        "1,200",
        ["students", "طالب وطالبة"],
        [
          "From the early years to the final year of school.",
          "من رياض الأطفال حتى السنة الأخيرة في المدرسة.",
        ],
      ),
      figure(
        b,
        "12:1",
        ["students per teacher", "طالبًا لكل معلّم"],
        naming(
          ["families"],
          [
            "Small classes, so no child goes unnoticed.",
            "فصول صغيرة لا يغيب فيها طفل عن الأنظار.",
          ],
          [
            "Small classes, so no student goes unnoticed.",
            "فصول صغيرة لا يغيب فيها طالب عن الأنظار.",
          ],
        ),
      ),
      figure(
        b,
        "60",
        ["clubs and teams", "ناديًا وفريقًا"],
        [
          "Running every week, from robotics to choir.",
          "كل أسبوع، من الروبوتات إلى الكورال.",
        ],
      ),
      figure(
        b,
        "98%",
        ["university offers", "قبولًا جامعيًا"],
        [
          "Graduates holding an offer from their first-choice university.",
          "من الخريجين نالوا قبولًا من جامعتهم الأولى.",
        ],
      ),
    ],
    source: b.w([
      "Figures for the 2026 to 2027 school year.",
      "أرقام العام الدراسي 2026–2027.",
    ]),
  }),
  { align: "center" },
);

const ABOUT_STORY = section("imageText", "mediaStart", (b) => ({
  eyebrow: b.w(["Our story", "قصتنا"]),
  heading: b.w([
    "A small beginning, a *lasting* idea",
    "بداية صغيرة وفكرة *باقية*",
  ]),
  body: plainContent(
    b.w(
      naming(
        ["families"],
        [
          "We began with a handful of classes in a converted family house: a few dozen children, and teachers who believed a school could be both demanding and kind.\nThe house is still at the heart of the campus, joined now by laboratories, a library and playing fields, and the belief has not changed. Many of our teachers have been with us for more than a decade, and some of today's parents were once our students.",
          "بدأنا ببضعة فصول في بيت عائلي مُجدَّد: عشرات من الأطفال، ومعلّمون آمنوا بأن المدرسة يمكن أن تكون متطلّبة ورحيمة في آن واحد.\nلا يزال ذلك البيت في قلب الحرم، وقد أحاطت به اليوم مختبرات ومكتبة وملاعب، أما الإيمان فلم يتغيّر. كثير من معلّمينا معنا منذ أكثر من عشر سنوات، وبعض أولياء الأمور اليوم كانوا يومًا طلابًا لدينا.",
        ],
        [
          "We began with a handful of classes in a converted old house: a few dozen students, and teachers who believed a school could be both demanding and kind.\nThe house is still at the heart of the campus, joined now by laboratories, a library and playing fields, and the belief has not changed. Many of our teachers have been with us for more than a decade, and some of them were once our students.",
          "بدأنا ببضعة فصول في بيت قديم مُجدَّد: عشرات من الطلاب، ومعلّمون آمنوا بأن المدرسة يمكن أن تكون متطلّبة ورحيمة في آن واحد.\nلا يزال ذلك البيت في قلب الحرم، وقد أحاطت به اليوم مختبرات ومكتبة وملاعب، أما الإيمان فلم يتغيّر. كثير من معلّمينا معنا منذ أكثر من عشر سنوات، وبعضهم كانوا يومًا طلابًا لدينا.",
        ],
      ),
    ),
  ),
  media: {
    kind: "image" as const,
    fileId: null,
    alt: "",
    posterFileId: null,
    captionsFileId: null,
  },
  actions: [
    link(b, ["Book a visit", "احجزوا زيارة"], `/pages/visit#${ANCHOR.visit}`),
  ],
}));

// The nursery's own About, Admissions and Visit: rooms by age, the day,
// settling in and ratios, in the voice of a setting for children of 2 to 6.
const EY_ABOUT_WELCOME = section("welcome", "portraitStart", (b) => ({
  heading: b.w(["Welcome to our *nursery*", "أهلًا بكم في *روضتنا*"]),
  body: plainContent(
    b.w(
      naming(
        ["families"],
        [
          "Starting nursery is a big step, for children and for their parents. We have spent more than ten years learning how to make that step feel small: a key person who comes to know your child almost as well as you do, rooms that feel like home and a garden that is never more than a door away.\nWe would love you to see it for yourself. Come to a stay-and-play morning with your little one, and stay as long as you like.",
          "بدء الروضة خطوة كبيرة للأطفال ولأسرهم معًا. وقد أمضينا أكثر من عشر سنوات نتعلّم كيف نجعل هذه الخطوة تبدو صغيرة: مربية رئيسية تعرف طفلكم كما تعرفونه تقريبًا، وغرف تشبه البيت، وحديقة لا يفصلها عن الأطفال سوى باب.\nيسعدنا أن تروا ذلك بأنفسكم. تعالوا مع صغيركم إلى صباح لعب مفتوح، وابقوا ما شئتم.",
        ],
        [
          "Starting nursery is a big step. We have spent more than ten years learning how to make that step feel small: a key person who comes to know each learner well, rooms that feel like home and a garden that is never more than a door away.\nWe would love you to see it for yourself. Come to a stay-and-play morning, and stay as long as you like.",
          "بدء الروضة خطوة كبيرة. وقد أمضينا أكثر من عشر سنوات نتعلّم كيف نجعل هذه الخطوة تبدو صغيرة: مربية رئيسية تعرف كل متعلّم معرفة جيدة، وغرف تشبه البيت، وحديقة لا يفصلها عن الغرف سوى باب.\nيسعدنا أن تروا ذلك بأنفسكم. تعالوا إلى صباح لعب مفتوح، وابقوا ما شئتم.",
        ],
      ),
    ),
  ),
  portrait: noImage,
  name: b.w(["Rania Kamal", "رانيا كمال"]),
  role: b.w(["Head of nursery", "مديرة الروضة"]),
}));

const room = (b: Builder, title: Said, ages: Said, text: Said) => ({
  id: b.id(),
  title: b.w(title),
  ages: b.w(ages),
  text: b.w(text),
  image: noImage,
  href: "",
});

const EY_ROOMS = section("divisions", "tall", (b) => ({
  heading: b.w(
    naming(
      ["families"],
      ["Four rooms, one *family*", "أربع غرف وأسرة *واحدة*"],
      ["Four rooms, one *home*", "أربع غرف وبيت *واحد*"],
    ),
  ),
  text: b.w(
    naming(
      ["families"],
      [
        "Children move up a room each September, with their friends and familiar faces beside them.",
        "ينتقل الأطفال إلى الغرفة التالية كل سبتمبر، ومعهم أصدقاؤهم ووجوه يعرفونها.",
      ],
      [
        "Each September everyone moves up a room, with their friends and familiar faces beside them.",
        "ينتقل المتعلّمون إلى الغرفة التالية كل سبتمبر، ومعهم أصدقاؤهم ووجوه يعرفونها.",
      ],
    ),
  ),
  items: [
    room(
      b,
      ["Toddlers", "البراعم"],
      ["Ages 2 to 3", "من 2 إلى 3 سنوات"],
      [
        "Small groups, plenty of cuddles and a gentle rhythm of play, food, sleep and fresh air.",
        "مجموعات صغيرة وحنان وافر، وإيقاع هادئ من اللعب والطعام والنوم والهواء الطلق.",
      ],
    ),
    room(
      b,
      ["Nursery", "الحضانة"],
      ["Ages 3 to 4", "من 3 إلى 4 سنوات"],
      [
        "First friendships, first songs in two languages and plenty of time to explore.",
        "صداقات أولى وأغانٍ أولى بلغتين، ووقت وافر للاستكشاف.",
      ],
    ),
    room(
      b,
      ["Kindergarten 1", "الروضة الأولى"],
      ["Ages 4 to 5", "من 4 إلى 5 سنوات"],
      [
        "Stories, early mark-making and counting woven into play, indoors and out.",
        "قصص وخربشات أولى وعدّ يتخلّل اللعب، داخل الغرفة وخارجها.",
      ],
    ),
    room(
      b,
      ["Kindergarten 2", "الروضة الثانية"],
      ["Ages 5 to 6", "من 5 إلى 6 سنوات"],
      naming(
        ["grade_levels"],
        [
          "Letters, numbers and the confidence to start big school, ready for Grade 1.",
          "الحروف والأعداد والثقة اللازمة لبدء المدرسة، استعدادًا للصف الأول.",
        ],
        [
          "Letters, numbers and the confidence to start big school.",
          "الحروف والأعداد والثقة اللازمة لبدء المدرسة.",
        ],
      ),
    ),
  ],
}));

const EY_DAY = section("timeline", "vertical", (b) => ({
  heading: b.w(["A day at *nursery*", "يوم في *الروضة*"]),
  items: [
    moment(
      b,
      "7:30",
      ["Hello and breakfast", "الاستقبال والإفطار"],
      naming(
        ["families"],
        [
          "A warm welcome from your child's key person, and breakfast together for early arrivals.",
          "تستقبل المربية الرئيسية طفلكم بابتسامة، ويتناول القادمون مبكرًا الإفطار معًا.",
        ],
        [
          "A warm welcome from each learner's key person, and breakfast together for early arrivals.",
          "تستقبل المربية الرئيسية كل متعلّم بابتسامة، ويتناول القادمون مبكرًا الإفطار معًا.",
        ],
      ),
    ),
    moment(
      b,
      "8:30",
      ["Circle time", "حلقة الصباح"],
      [
        "Songs, the weather and the plan for the day, in Arabic and English.",
        "أغانٍ وحديث عن الطقس وخطة اليوم، بالعربية والإنجليزية.",
      ],
    ),
    moment(
      b,
      "9:00",
      ["Play and explore", "اللعب والاستكشاف"],
      [
        "Free choice across the room and the garden, with small-group activities along the way.",
        "يختار الأطفال ما يلعبون به في الغرفة والحديقة، مع أنشطة في مجموعات صغيرة.",
      ],
    ),
    moment(
      b,
      "11:30",
      ["Lunch", "الغداء"],
      [
        "A hot meal cooked in our kitchen, eaten together at small tables.",
        "وجبة ساخنة تُطهى في مطبخنا، يتناولها الأطفال معًا حول طاولات صغيرة.",
      ],
    ),
    moment(
      b,
      "12:15",
      ["Rest", "وقت الراحة"],
      [
        "A nap for the youngest, and quiet stories for everyone else.",
        "قيلولة للأصغر سنًا، وقصص هادئة لغيرهم.",
      ],
    ),
    moment(
      b,
      "14:00",
      ["Home time", "وقت العودة"],
      naming(
        ["families"],
        [
          "Collection with a note and a photo from the day. The extended day runs until 17:00.",
          "الاستلام مع ملاحظة وصورة من يوم طفلكم، ويستمر اليوم الممتد حتى الساعة 17:00.",
        ],
        [
          "Collection with a note and a photo from the day. The extended day runs until 17:00.",
          "الاستلام مع ملاحظة وصورة من اليوم، ويستمر اليوم الممتد حتى الساعة 17:00.",
        ],
      ),
    ),
  ],
}));

const EY_PLAY = section("pillars", "icons", (b) => ({
  heading: b.w(["Learning through *play*", "التعلّم *باللعب*"]),
  text: b.w(
    naming(
      ["families"],
      [
        "Young children learn best by doing, so our days are built around what they choose to do.",
        "يتعلّم الصغار على أفضل وجه حين يفعلون بأنفسهم، لذا نبني أيامنا حول ما يختارون فعله.",
      ],
      [
        "Young learners learn best by doing, so our days are built around what they choose to do.",
        "يتعلّم الصغار على أفضل وجه حين يفعلون بأنفسهم، لذا نبني أيامنا حول ما يختارون فعله.",
      ],
    ),
  ),
  items: [
    pillar(
      b,
      ["Following their interests", "نتبع اهتماماتهم"],
      naming(
        ["families"],
        [
          "If a child is fascinated by snails, the week fills with snails: counting them, drawing them, reading about them and building them a home.",
          "إذا شُغف طفل بالحلزونات امتلأ الأسبوع بها: يعدّها ويرسمها ويقرأ عنها ويبني لها بيتًا.",
        ],
        [
          "If someone is fascinated by snails, the week fills with snails: counting them, drawing them, reading about them and building them a home.",
          "إذا شُغف أحدهم بالحلزونات امتلأ الأسبوع بها: يعدّها ويرسمها ويقرأ عنها ويبني لها بيتًا.",
        ],
      ),
      "leaf",
    ),
    pillar(
      b,
      ["Two languages, naturally", "لغتان بطريقة طبيعية"],
      naming(
        ["families"],
        [
          "Every room has an Arabic-speaking and an English-speaking adult, so children hear both all day and answer in whichever comes first.",
          "في كل غرفة مربية تتحدث العربية وأخرى تتحدث الإنجليزية، فيسمع الأطفال اللغتين طوال اليوم ويجيبون بأيّهما سبقت إلى ألسنتهم.",
        ],
        [
          "Every room has an Arabic-speaking and an English-speaking adult, so learners hear both all day and answer in whichever comes first.",
          "في كل غرفة مربية تتحدث العربية وأخرى تتحدث الإنجليزية، فيسمع المتعلّمون اللغتين طوال اليوم ويجيبون بأيّهما سبقت إلى ألسنتهم.",
        ],
      ),
      "book",
    ),
    pillar(
      b,
      ["Noticing every step", "نلاحظ كل خطوة"],
      naming(
        ["families"],
        [
          "Key persons watch, listen and note what each child can do, and share it with you in a photo and a short note every day.",
          "تراقب المربيات وتصغي وتدوّن ما يستطيع كل طفل فعله، وتشاركنه معكم بصورة وملاحظة قصيرة كل يوم.",
        ],
        [
          "Key persons watch, listen and note what each learner can do, and share it in a photo and a short note every day.",
          "تراقب المربيات وتصغي وتدوّن ما يستطيع كل متعلّم فعله، وتشاركنه بصورة وملاحظة قصيرة كل يوم.",
        ],
      ),
      "heart",
    ),
  ],
}));

const EY_RATIOS = section(
  "stats",
  "captions",
  (b) => ({
    heading: b.w(["More adults, more *attention*", "كبار أكثر واهتمام *أوفر*"]),
    items: [
      figure(
        b,
        "1:4",
        naming(
          ["families"],
          [
            "adults to children aged 2 to 3",
            "نسبة الكبار إلى الأطفال من سنتين إلى ثلاث",
          ],
          [
            "adults to learners aged 2 to 3",
            "نسبة الكبار إلى المتعلّمين من سنتين إلى ثلاث",
          ],
        ),
        [
          "Two adults with every group of eight toddlers.",
          "اثنان من الكبار مع كل ثمانية أطفال من البراعم.",
        ],
      ),
      figure(
        b,
        "1:8",
        naming(
          ["families"],
          [
            "adults to children aged 3 to 6",
            "نسبة الكبار إلى الأطفال من ثلاث إلى ست",
          ],
          [
            "adults to learners aged 3 to 6",
            "نسبة الكبار إلى المتعلّمين من ثلاث إلى ست",
          ],
        ),
        naming(
          ["families"],
          [
            "A teacher and an assistant in every room of sixteen.",
            "معلّمة ومساعدة في كل غرفة من ستة عشر طفلًا.",
          ],
          [
            "A teacher and an assistant in every room of sixteen.",
            "معلّمة ومساعدة في كل غرفة من ستة عشر متعلّمًا.",
          ],
        ),
      ),
      figure(
        b,
        "16",
        naming(
          ["families"],
          ["children in a room, at most", "طفلًا في الغرفة كحدّ أقصى"],
          ["learners in a room, at most", "متعلّمًا في الغرفة كحدّ أقصى"],
        ),
        naming(
          ["families"],
          [
            "Small enough to feel like a family.",
            "عدد صغير يجعل الغرفة أشبه بأسرة.",
          ],
          [
            "Small enough to feel like home.",
            "عدد صغير يجعل الغرفة أشبه بالبيت.",
          ],
        ),
      ),
      figure(
        b,
        "100%",
        [
          "of staff trained in first aid",
          "من الفريق مدرَّبون على الإسعافات الأولية",
        ],
        [
          "Paediatric first aid, refreshed every year.",
          "إسعافات أولية للأطفال، يُجدَّد التدريب عليها كل عام.",
        ],
      ),
    ],
    source: "",
  }),
  { align: "center" },
);

const EY_CARE = section("cards", "icons", (b) => ({
  heading: b.w(["Safe, well and *cared* for", "في *أمان* ورعاية"]),
  text: b.w(
    naming(
      ["families"],
      [
        "The care behind every happy day, written down in our policies and shared with every family.",
        "الرعاية التي تقف وراء كل يوم سعيد، مكتوبة في سياساتنا ومتاحة لكل أسرة.",
      ],
      [
        "The care behind every happy day, written down in our policies and open to anyone who asks.",
        "الرعاية التي تقف وراء كل يوم سعيد، مكتوبة في سياساتنا ومتاحة لكل من يطلبها.",
      ],
    ),
  ),
  columns: "3" as const,
  items: [
    card(
      b,
      ["Safer recruitment", "تعيين آمن"],
      naming(
        ["families"],
        [
          "Every adult is checked and referenced before they join us, and trained in safeguarding every year.",
          "يخضع كل من يعمل معنا للتحقق والتزكية قبل انضمامه، ويتدرّب على حماية الطفل كل عام.",
        ],
        [
          "Every adult is checked and referenced before they join us, and trained in safeguarding every year.",
          "يخضع كل من يعمل معنا للتحقق والتزكية قبل انضمامه، ويتدرّب على الحماية والسلامة كل عام.",
        ],
      ),
      "award",
    ),
    card(
      b,
      ["Safe collection", "استلام آمن"],
      naming(
        ["families"],
        [
          "Children go home only with the adults you name, and a password covers any change on the day.",
          "لا يغادر الطفل إلا مع من تسمّونهم من الكبار، وتُستخدم كلمة سر لأي تغيير طارئ.",
        ],
        [
          "No one leaves except with an adult named in advance, and a password covers any change on the day.",
          "لا يغادر أحد إلا مع من سُمّي مسبقًا من الكبار، وتُستخدم كلمة سر لأي تغيير طارئ.",
        ],
      ),
      "users",
    ),
    card(
      b,
      ["Meals and allergies", "الوجبات والحساسية"],
      [
        "Fresh meals cooked on site, with every allergy and diet recorded and checked at each table.",
        "وجبات طازجة تُطهى في الروضة، مع تسجيل كل حساسية ونظام غذائي ومراجعتها عند كل طاولة.",
      ],
      "utensils",
    ),
    card(
      b,
      ["Sleep and rest", "النوم والراحة"],
      naming(
        ["families"],
        [
          "A quiet room with a cot for every child who naps, and an adult checking on them throughout.",
          "غرفة هادئة فيها سرير لكل طفل يأخذ قيلولة، وأحد الكبار يتفقّدهم طوال الوقت.",
        ],
        [
          "A quiet room with a cot for everyone who naps, and an adult checking on them throughout.",
          "غرفة هادئة فيها سرير لكل من يأخذ قيلولة، وأحد الكبار يتفقّدهم طوال الوقت.",
        ],
      ),
      "clock",
    ),
    card(
      b,
      ["Health and medicines", "الصحة والأدوية"],
      [
        "A nurse on site every morning, and medicines given only with your written consent.",
        "ممرضة في الروضة كل صباح، ولا يُعطى أي دواء إلا بموافقتكم الكتابية.",
      ],
      "heart",
    ),
    card(
      b,
      ["A secure site", "مبنى آمن"],
      [
        "One staffed entrance, a fenced garden and every visitor signed in at the door.",
        "مدخل واحد يقف عنده فريقنا، وحديقة مسوّرة، وكل زائر يسجّل دخوله عند الباب.",
      ],
      "shield",
    ),
  ],
}));

const EY_TEAM = section("people", "grid", (b) => ({
  heading: b.w(
    naming(
      ["families"],
      ["The people your child will *know*", "من سيعرفهم *طفلكم*"],
      ["The people you will *know*", "من *ستعرفونهم* هنا"],
    ),
  ),
  text: b.w(
    naming(
      ["families"],
      [
        "Every child has a key person: the adult who settles them in, knows their routines and is your first point of contact.",
        "لكل طفل مربية رئيسية تتولّى تهيئته وتعرف روتينه، وهي أول من تتواصلون معه.",
      ],
      [
        "Every learner has a key person: the adult who settles them in, knows their routines and is the first point of contact.",
        "لكل متعلّم مربية رئيسية تتولّى تهيئته وتعرف روتينه، وهي أول من يُتواصل معه.",
      ],
    ),
  ),
  items: [
    person(
      b,
      ["Rania Kamal", "رانيا كمال"],
      ["Head of nursery", "مديرة الروضة"],
    ),
    person(
      b,
      ["Youssef Sami", "يوسف سامي"],
      ["Deputy head and inclusion lead", "نائب المديرة ومسؤول الدمج"],
    ),
    person(
      b,
      ["Laila Mourad", "ليلى مراد"],
      ["Toddler room leader", "مشرفة غرفة البراعم"],
    ),
    person(
      b,
      ["Emma Clarke", "إيما كلارك"],
      ["Kindergarten teacher", "معلّمة الروضة"],
    ),
  ],
}));

const session = (b: Builder, label: Said, value: Said, note: Said) => ({
  id: b.id(),
  label: b.w(label),
  value: b.w(value),
  note: b.w(note),
});

const EY_SESSIONS = section("fees", "table", (b) => ({
  heading: b.w(["Sessions and *hours*", "الفترات *والمواعيد*"]),
  text: b.w([
    "Choose the pattern that suits your family, from Sunday to Thursday. Meals, snacks and nappies are included.",
    "اختاروا ما يناسب أسرتكم، من الأحد إلى الخميس. الوجبات والوجبات الخفيفة والحفاضات مشمولة.",
  ]),
  items: [
    session(
      b,
      ["Mornings", "الفترة الصباحية"],
      ["7:30 to 12:30", "من 7:30 إلى 12:30"],
      ["Lunch included", "تشمل الغداء"],
    ),
    session(
      b,
      ["Nursery day", "اليوم الكامل"],
      ["7:30 to 14:00", "من 7:30 إلى 14:00"],
      ["Our most popular session", "الفترة الأكثر طلبًا"],
    ),
    session(
      b,
      ["Extended day", "اليوم الممتد"],
      ["7:30 to 17:00", "من 7:30 إلى 17:00"],
      [
        "With an afternoon snack and quiet play",
        "مع وجبة خفيفة بعد الظهر ولعب هادئ",
      ],
    ),
    session(
      b,
      ["Three mornings a week", "ثلاثة صباحات في الأسبوع"],
      ["7:30 to 12:30", "من 7:30 إلى 12:30"],
      ["For toddlers only", "للبراعم فقط"],
    ),
  ],
}));

const EY_SETTLING = section("imageText", "mediaStart", (b) => ({
  eyebrow: b.w(["Settling in", "التأقلم"]),
  heading: b.w(["At your child's *pace*", "على *إيقاع* طفلكم"]),
  body: plainContent(
    b.w([
      "Most children settle within two weeks. On the first days you stay with your child in the room; then you leave for a short while, a little longer each day, until a wave at the door is enough.\nYour child's key person plans it with you, and we call you if they need you. We will never ask you to leave a child who is not ready.",
      "يتأقلم معظم الأطفال خلال أسبوعين. في الأيام الأولى تبقون مع طفلكم في الغرفة، ثم تغادرون لوقت قصير يطول قليلًا كل يوم، حتى تكفي تلويحة عند الباب.\nتخطّط المربية الرئيسية لذلك معكم، ونتصل بكم إن احتاجكم طفلكم. لن نطلب منكم أبدًا أن تتركوا طفلًا ليس مستعدًا بعد.",
    ]),
  ),
  media: {
    kind: "image" as const,
    fileId: null,
    alt: "",
    posterFileId: null,
    captionsFileId: null,
  },
  actions: [
    link(
      b,
      ["Book a stay-and-play", "احجزوا صباح لعب"],
      `/pages/visit#${ANCHOR.visit}`,
    ),
  ],
}));

const EY_BRING = section("pillars", "numbered", (b) => ({
  heading: b.w(["What to *bring*", "ماذا *تحضرون* معكم"]),
  text: b.w([
    "Label everything with your child's name, and we provide the rest.",
    "اكتبوا اسم طفلكم على كل شيء، ونحن نوفّر الباقي.",
  ]),
  items: [
    pillar(
      b,
      ["A change of clothes", "ملابس احتياطية"],
      [
        "Two full sets in a named bag, for messy play and little accidents.",
        "طقمان كاملان في حقيبة باسم الطفل، للعب الفوضوي والحوادث الصغيرة.",
      ],
      "none",
    ),
    pillar(
      b,
      ["A water bottle", "زجاجة ماء"],
      [
        "One your child can open alone. We refill it through the day.",
        "زجاجة يستطيع طفلكم فتحها وحده، ونعيد ملأها طوال اليوم.",
      ],
      "none",
    ),
    pillar(
      b,
      ["A sun hat", "قبعة للشمس"],
      [
        "We play outside every day, so a hat, with sun cream put on at home.",
        "نلعب في الخارج كل يوم، فلا تنسوا القبعة وواقي الشمس قبل الخروج من البيت.",
      ],
      "none",
    ),
    pillar(
      b,
      ["Something from home", "شيء من البيت"],
      [
        "A favourite toy or blanket helps in the first weeks and at nap time.",
        "لعبة أو بطانية مفضّلة تساعد في الأسابيع الأولى وفي وقت القيلولة.",
      ],
      "none",
    ),
    pillar(
      b,
      ["Indoor shoes", "حذاء للداخل"],
      [
        "Soft shoes with a strap your child can fasten alone.",
        "حذاء ليّن بلاصق يستطيع طفلكم إغلاقه وحده.",
      ],
      "none",
    ),
    pillar(
      b,
      ["A family photo", "صورة للأسرة"],
      [
        "For the family wall in the room, so home is never far away.",
        "لجدار الأسر في الغرفة، حتى يبقى البيت قريبًا دائمًا.",
      ],
      "none",
    ),
  ],
}));

const EY_PLACES = section("admissions", "triad", (b) => ({
  source: "intakes" as const,
  heading: b.w(["Places for *next* year", "المقاعد المتاحة للعام *القادم*"]),
  text: b.w([
    "Each room's dates and fees, as the nursery office has set them.",
    "مواعيد كل غرفة ورسومها كما حدّدها مكتب الروضة.",
  ]),
}));

const question = (b: Builder, title: Said, text: Said) => ({
  id: b.id(),
  title: b.w(title),
  text: b.w(text),
});

const EY_FAQ = section("accordion", "columns", (b) => ({
  heading: b.w(["Questions parents *ask*", "أسئلة *يطرحها* الأهل"]),
  text: "",
  items: [
    question(
      b,
      ["What age can my child start?", "في أي سن يمكن أن يبدأ طفلي؟"],
      [
        "From two. Children join the room for their age in September, and can start during the year whenever a place is free.",
        "من سن الثانية. ينضم الأطفال إلى غرفة عمرهم في سبتمبر، ويمكنهم البدء خلال العام متى توفّر مقعد.",
      ],
    ),
    question(
      b,
      [
        "Does my child need to be toilet trained?",
        "هل يجب أن يكون طفلي قد تعلّم استخدام الحمّام؟",
      ],
      [
        "No. We change nappies and help with toilet training when your child is ready, working with you at home.",
        "لا. نغيّر الحفاضات ونساعد على تعلّم استخدام الحمّام حين يصبح طفلكم مستعدًا، بالتنسيق معكم في البيت.",
      ],
    ),
    question(
      b,
      ["What if my child is unwell?", "ماذا لو مرض طفلي؟"],
      [
        "Please keep them at home until they are well, and for 48 hours after any sickness or diarrhoea. If they fall ill with us, we call you straight away.",
        "أبقوه في البيت حتى يتعافى، ولمدة 48 ساعة بعد أي قيء أو إسهال. وإذا مرض عندنا نتصل بكم فورًا.",
      ],
    ),
    question(
      b,
      [
        "Can you cater for allergies and special diets?",
        "هل تراعون الحساسية والأنظمة الغذائية الخاصة؟",
      ],
      [
        "Yes. Tell us when you register, and our cook plans your child's meals with you.",
        "نعم. أخبرونا عند التسجيل، ويخطّط طاهينا وجبات طفلكم معكم.",
      ],
    ),
    question(
      b,
      ["Do brothers and sisters get priority?", "هل للإخوة أولوية؟"],
      [
        "Yes. Places are offered first to the brothers and sisters of children already with us.",
        "نعم. تُعرض المقاعد أولًا على إخوة الأطفال الملتحقين بنا.",
      ],
    ),
  ],
}));

const EY_STAY_AND_PLAY = section("imageText", "mediaEnd", (b) => ({
  eyebrow: b.w(["Stay-and-play mornings", "صباحات اللعب المفتوحة"]),
  heading: b.w(["Play first, *questions* after", "اللعب أولًا ثم *الأسئلة*"]),
  body: plainContent(
    b.w(
      naming(
        ["families"],
        [
          "Stay-and-play mornings run every Saturday from 9:30 to 11:00. Your child plays in the rooms and the garden alongside ours, while you see how a nursery day really works.\nWe finish with songs at circle time, then coffee with the head of nursery and time for your questions. Brothers and sisters are welcome, and buggies fit through every door.",
          "تُقام صباحات اللعب المفتوحة كل سبت من الساعة 9:30 حتى 11:00. يلعب طفلكم في الغرف والحديقة مع أطفالنا، بينما ترون كيف يمضي يوم الروضة فعلًا.\nنختم بالأغاني في حلقة الصباح، ثم قهوة مع مديرة الروضة ووقت لأسئلتكم. الإخوة مرحَّب بهم، وعربات الأطفال تمرّ من كل باب.",
        ],
        [
          "Stay-and-play mornings run every Saturday from 9:30 to 11:00. Play in the rooms and the garden alongside our learners, and see how a nursery day really works.\nWe finish with songs at circle time, then coffee with the head of nursery and time for your questions. Everyone is welcome, and buggies fit through every door.",
          "تُقام صباحات اللعب المفتوحة كل سبت من الساعة 9:30 حتى 11:00. العبوا في الغرف والحديقة مع متعلّمينا، وشاهدوا كيف يمضي يوم الروضة فعلًا.\nنختم بالأغاني في حلقة الصباح، ثم قهوة مع مديرة الروضة ووقت لأسئلتكم. الجميع مرحَّب بهم، والعربات تمرّ من كل باب.",
        ],
      ),
    ),
  ),
  media: {
    kind: "image" as const,
    fileId: null,
    alt: "",
    posterFileId: null,
    captionsFileId: null,
  },
  actions: [
    link(b, ["Book a morning", "احجزوا صباحًا"], `/pages/visit#${ANCHOR.visit}`),
  ],
}));

const step = (b: Builder, title: Said, text: Said) => ({
  id: b.id(),
  title: b.w(title),
  text: b.w(text),
});

const EY_VISIT_STEPS = section("steps", "horizontal", (b) => ({
  heading: b.w(["What to *expect*", "ماذا *تتوقّعون*"]),
  text: "",
  items: [
    step(
      b,
      ["Arrive and say hello", "الوصول والتعارف"],
      naming(
        ["families"],
        [
          "We meet you at the garden gate, show you where to leave the buggy and introduce the room leaders.",
          "نستقبلكم عند بوابة الحديقة، ونريكم مكان عربة الطفل، ونعرّفكم إلى مشرفات الغرف.",
        ],
        [
          "We meet you at the garden gate, show you where to leave the buggy and introduce the room leaders.",
          "نستقبلكم عند بوابة الحديقة، ونريكم مكان ترك العربة، ونعرّفكم إلى مشرفات الغرف.",
        ],
      ),
    ),
    step(
      b,
      ["Play together", "نلعب معًا"],
      naming(
        ["families"],
        [
          "Explore the rooms and the garden at your child's pace. Join in, or sit back and watch.",
          "استكشفوا الغرف والحديقة على إيقاع طفلكم. شاركوه اللعب أو اجلسوا وتابعوا.",
        ],
        [
          "Explore the rooms and the garden at your own pace. Join in, or sit back and watch.",
          "استكشفوا الغرف والحديقة على إيقاعكم. شاركوا في اللعب أو اجلسوا وتابعوا.",
        ],
      ),
    ),
    step(
      b,
      ["Circle time", "حلقة الصباح"],
      naming(
        ["families"],
        [
          "Songs and a story in Arabic and English, so your child hears both.",
          "أغانٍ وقصة بالعربية والإنجليزية، ليسمع طفلكم اللغتين.",
        ],
        [
          "Songs and a story in Arabic and English, so everyone hears both.",
          "أغانٍ وقصة بالعربية والإنجليزية، ليسمع الجميع اللغتين.",
        ],
      ),
    ),
    step(
      b,
      ["Questions over coffee", "أسئلة مع القهوة"],
      [
        "Sit down with the head of nursery to talk about sessions, settling in and places.",
        "اجلسوا مع مديرة الروضة للحديث عن الفترات والتأقلم والمقاعد.",
      ],
    ),
  ],
}));

const EY_FIND_US = section("contact", "map", (b) => ({
  heading: b.w(["How to *find* us", "كيف *تصلون* إلينا"]),
  text: b.w([
    "Come in through the garden gate on the side street, where there is room for buggies and short-stay parking. The office is open Sunday to Thursday, 7:30 to 17:00.",
    "ادخلوا من بوابة الحديقة في الشارع الجانبي، حيث مكان لعربات الأطفال ومواقف للتوقف القصير. المكتب مفتوح من الأحد إلى الخميس، من 7:30 إلى 17:00.",
  ]),
  mapHref: "",
}));

/** Where the nursery parents page's own quick links lead. */
const EY_PARENTS_ANCHOR = {
  pack: "what-to-pack",
  routines: "meals-and-naps",
  unwell: "sickness-and-absence",
} as const;

const EY_PARENTS_NOTICE = section(
  "announcement",
  "strip",
  (b) => ({
    text: b.w([
      "Parents' mornings are next week: fifteen minutes with your child's key person to look through their learning journal together.",
      "لقاءات الأهل في الأسبوع القادم: ربع ساعة مع المربية الرئيسية لطفلكم لتتصفّحوا معًا سجلّ تعلّمه.",
    ]),
    date: "",
    actions: [
      link(
        b,
        ["Choose a time", "اختاروا موعدًا"],
        `/pages/parents#${ANCHOR.general}`,
      ),
    ],
  }),
  { scheme: "accent", spacing: "s" },
);

const EY_PARENTS_LINKS = section("quickLinks", "tiles", (b) => ({
  heading: b.w(["Little things that *matter*", "تفاصيل صغيرة لها *أهميتها*"]),
  items: [
    quickLink(
      b,
      ["Drop-off and pick-up", "الوصول والاستلام"],
      ["Times, and who may collect", "المواعيد ومن يحقّ له الاستلام"],
      "clock",
      `/pages/parents#${PARENTS_ANCHOR.day}`,
    ),
    quickLink(
      b,
      ["What to pack", "تجهيز الحقيبة"],
      ["Everything in a named bag", "كل شيء في حقيبة باسم طفلكم"],
      "star",
      `/pages/parents#${EY_PARENTS_ANCHOR.pack}`,
    ),
    quickLink(
      b,
      ["Meals and naps", "الوجبات والقيلولة"],
      ["Menus, allergies and rest", "قوائم الطعام والحساسية والراحة"],
      "utensils",
      `/pages/parents#${EY_PARENTS_ANCHOR.routines}`,
    ),
    quickLink(
      b,
      ["If your child is unwell", "إذا مرض طفلكم"],
      ["When to keep them at home", "متى يبقى في البيت"],
      "heart",
      `/pages/parents#${EY_PARENTS_ANCHOR.unwell}`,
    ),
    quickLink(
      b,
      ["Report an absence", "الإبلاغ عن غياب"],
      ["Let us know before 8:30", "أخبرونا قبل الساعة 8:30"],
      "mail",
      `/pages/parents#${ANCHOR.general}`,
    ),
    quickLink(
      b,
      ["News and term dates", "الأخبار ومواعيد الفصول"],
      [
        "Holidays, events and letters home",
        "العطل والفعاليات والرسائل إلى الأسر",
      ],
      "calendar",
      "/news",
    ),
  ],
}));

const EY_PARENTS_DAY = section(
  "timeline",
  "vertical",
  (b) => ({
    heading: b.w(["The rhythm of the *day*", "*إيقاع* اليوم"]),
    items: [
      moment(
        b,
        "7:30",
        ["Drop-off opens", "بدء الاستقبال"],
        [
          "Come into your child's room and hand over to their key person, with a word about the night and the morning so far.",
          "ادخلوا مع طفلكم إلى غرفته وسلّموه إلى مربيته الرئيسية، مع كلمة عن ليلته وصباحه.",
        ],
      ),
      moment(
        b,
        "8:30",
        ["Drop-off closes", "انتهاء الاستقبال"],
        [
          "Arriving by now lets your child join circle time and start the day with friends. Running late? Send us a message and we will look out for you.",
          "الوصول قبل هذا الموعد يتيح لطفلكم أن يشارك في حلقة الصباح ويبدأ يومه مع أصدقائه. وإن تأخّرتم فراسلونا وسنكون في انتظاركم.",
        ],
      ),
      moment(
        b,
        "11:30",
        ["Lunch, then rest", "الغداء ثم الراحة"],
        [
          "A hot lunch together, then a nap or quiet stories, following the routine you know works at home.",
          "غداء ساخن معًا، ثم قيلولة أو قصص هادئة، وفق الروتين الذي تعرفون أنه يناسب طفلكم في البيت.",
        ],
      ),
      moment(
        b,
        "12:30",
        ["Morning pick-up", "استلام الفترة الصباحية"],
        [
          "Children in the morning session go home after lunch, collected from their room.",
          "يعود أطفال الفترة الصباحية إلى البيت بعد الغداء، ويُستلمون من غرفهم.",
        ],
      ),
      moment(
        b,
        "14:00",
        ["Home time", "وقت العودة"],
        [
          "Collection from the garden gate, only by the adults you have named, with a quick word about the day.",
          "الاستلام من بوابة الحديقة، ولا يُسلَّم الطفل إلا لمن سمّيتموهم من الكبار، مع كلمة سريعة عن يومه.",
        ],
      ),
      moment(
        b,
        "17:00",
        ["Extended day ends", "انتهاء اليوم الممتد"],
        [
          "After an afternoon snack and quiet play, the last children go home and the nursery closes.",
          "بعد وجبة خفيفة ولعب هادئ يعود آخر الأطفال إلى بيوتهم وتُغلق الروضة.",
        ],
      ),
    ],
  }),
  { anchor: PARENTS_ANCHOR.day },
);

const EY_KEY_PERSON = section("imageText", "mediaStart", (b) => ({
  eyebrow: b.w(["Your key person", "المربية الرئيسية"]),
  heading: b.w(["A familiar *face*, every day", "*وجه* مألوف كل يوم"]),
  body: plainContent(
    b.w([
      "Your child's key person settles them in, knows their routines and is the first person to talk to: at the door each morning, at pick-up, or through the parent portal at any time.\nEach afternoon they add a photo and a short note to the portal, with what your child ate and how long they slept. Every half term their learning journal joins it, and we sit down together to talk it through.",
      "تتولّى المربية الرئيسية تهيئة طفلكم، وتعرف روتينه، وهي أول من تتحدّثون إليه: عند الباب كل صباح، أو عند الاستلام، أو عبر بوابة أولياء الأمور في أي وقت.\nوفي كل عصر تضيف إلى البوابة صورة وملاحظة قصيرة، فيها ما أكله طفلكم وكم من الوقت نام. ومع كل نصف فصل يُضاف سجلّ تعلّمه، فنجلس معًا لنتحدّث عنه.",
    ]),
  ),
  media: {
    kind: "image" as const,
    fileId: null,
    alt: "",
    posterFileId: null,
    captionsFileId: null,
  },
  actions: [
    link(
      b,
      ["Message the nursery", "راسلوا الروضة"],
      `/pages/parents#${ANCHOR.general}`,
    ),
  ],
}));

const EY_PACK = section(
  "cards",
  "icons",
  (b) => ({
    heading: b.w(["Packing the *bag*", "تجهيز *الحقيبة*"]),
    text: b.w([
      "Please label everything with your child's name. Nappies, wipes and meals come from us.",
      "اكتبوا اسم طفلكم على كل شيء، أما الحفاضات والمناديل المبلّلة والوجبات فنوفّرها نحن.",
    ]),
    columns: "3" as const,
    items: [
      card(
        b,
        ["Every day", "كل يوم"],
        [
          "A water bottle your child can open alone and a sun hat, with sun cream put on at home. A comforter, if they nap with one.",
          "زجاجة ماء يستطيع طفلكم فتحها وحده، وقبعة للشمس مع واقٍ شمسي تضعونه في البيت، ودمية النوم إن كان ينام معها.",
        ],
        "sparkles",
      ),
      card(
        b,
        ["Kept on their peg", "على علّاقته في الغرفة"],
        [
          "Two full changes of clothes and soft indoor shoes in a named bag. Wet or muddy things come home, and a fresh set comes back.",
          "طقمان كاملان من الملابس وحذاء ليّن للداخل في حقيبة باسمه. تعود الملابس المبلّلة أو المتّسخة إلى البيت، ويحلّ مكانها طقم نظيف.",
        ],
        "star",
      ),
      card(
        b,
        ["Best left at home", "ما يبقى في البيت"],
        [
          "Toys with small parts, jewellery, sweets and anything precious. Comforters are always welcome.",
          "الألعاب ذات القطع الصغيرة والحُليّ والحلوى وكل ما هو ثمين. أما دمى النوم فمرحَّب بها دائمًا.",
        ],
        "lightbulb",
      ),
    ],
  }),
  { anchor: EY_PARENTS_ANCHOR.pack },
);

const EY_ROUTINES = section(
  "cards",
  "icons",
  (b) => ({
    heading: b.w([
      "Meals, naps and *routines*",
      "الوجبات والقيلولة *والروتين*",
    ]),
    text: b.w([
      "We follow your child's routines from home, and note what they eat and how they sleep every day.",
      "نتبع الروتين الذي اعتاده طفلكم في البيت، وندوّن كل يوم ما يأكله وكيف ينام.",
    ]),
    columns: "2" as const,
    items: [
      card(
        b,
        ["Freshly cooked meals", "وجبات تُطهى طازجة"],
        [
          "Breakfast for early arrivals, a mid-morning snack and a hot lunch from our kitchen, with an afternoon snack on the extended day. The week's menu is in the parent portal every Thursday.",
          "إفطار للقادمين مبكرًا، ووجبة خفيفة في منتصف الصباح، وغداء ساخن من مطبخنا، ووجبة خفيفة بعد الظهر في اليوم الممتد. وتجدون قائمة الأسبوع في بوابة أولياء الأمور كل خميس.",
        ],
        "utensils",
      ),
      card(
        b,
        ["Allergies and diets", "الحساسية والأنظمة الغذائية"],
        [
          "Every allergy and diet is recorded, with your child's photo at the serving table, and our cook plans any swaps with you.",
          "تُسجَّل كل حساسية وكل نظام غذائي مع صورة طفلكم عند طاولة التقديم، ويتّفق طاهينا معكم على أي بدائل.",
        ],
        "shield",
      ),
      card(
        b,
        ["Naps and rest", "القيلولة والراحة"],
        [
          "After lunch, children who nap sleep on their own cot in a quiet room, with an adult close by. We keep to the times that suit your child.",
          "بعد الغداء ينام من يحتاج إلى قيلولة على سريره الخاص في غرفة هادئة، وأحد الكبار قريب منه. ونلتزم بالمواعيد التي تناسب طفلكم.",
        ],
        "clock",
      ),
      card(
        b,
        ["Nappies and the toilet", "الحفاضات واستخدام الحمّام"],
        [
          "We change nappies through the day and note each one. When you start toilet training at home, we use the same words and routine here.",
          "نغيّر الحفاضات على مدار اليوم ونسجّل كل تغيير. وحين تبدؤون تدريب طفلكم على استخدام الحمّام في البيت، نستخدم هنا الكلمات والروتين نفسه.",
        ],
        "heart",
      ),
    ],
  }),
  { anchor: EY_PARENTS_ANCHOR.routines },
);

const EY_UNWELL = section(
  "accordion",
  "columns",
  (b) => ({
    heading: b.w(["When plans *change*", "حين *تتغيّر* الخطط"]),
    text: b.w([
      "Sickness, absence and late pick-ups, and what to do about each.",
      "المرض والغياب والتأخّر في الاستلام، وما تفعلونه في كل حالة.",
    ]),
    items: [
      question(
        b,
        ["When should my child stay at home?", "متى يبقى طفلي في البيت؟"],
        [
          "With a temperature or an infectious illness, and for 48 hours after any sickness or diarrhoea. If you are not sure, send us a message and our nurse will advise.",
          "إذا كانت لديه حرارة أو مرض معدٍ، ولمدة 48 ساعة بعد أي قيء أو إسهال. وإن لم تكونوا متأكّدين فراسلونا وستنصحكم ممرضتنا.",
        ],
      ),
      question(
        b,
        ["How do I report an absence?", "كيف أبلغ عن غياب طفلي؟"],
        [
          "Send a message through the form below or the parent portal before 8:30, and tell us why. Your child's key person will check in with you when they are back.",
          "أرسلوا رسالة عبر النموذج أدناه أو عبر بوابة أولياء الأمور قبل الساعة 8:30، وأخبرونا بالسبب. وستطمئنّ المربية الرئيسية على طفلكم حين يعود.",
        ],
      ),
      question(
        b,
        [
          "What if my child falls ill at nursery?",
          "ماذا لو مرض طفلي في الروضة؟",
        ],
        [
          "We call you straight away and ask you to collect them within the hour. Until then your child rests somewhere quiet with their key person.",
          "نتصل بكم فورًا ونطلب منكم الحضور لاستلامه خلال ساعة، وحتى ذلك الحين يرتاح طفلكم في مكان هادئ مع مربيته الرئيسية.",
        ],
      ),
      question(
        b,
        ["Can you give my child medicine?", "هل تعطون طفلي الدواء؟"],
        [
          "Yes, when a doctor has prescribed it. Bring it in its original box and sign the consent form, and we note every dose in the portal.",
          "نعم، إذا وصفه الطبيب. أحضروه في علبته الأصلية ووقّعوا نموذج الموافقة، ونسجّل كل جرعة في البوابة.",
        ],
      ),
      question(
        b,
        [
          "Someone else is collecting today. What do I do?",
          "سيستلم طفلي اليوم شخص آخر، فماذا أفعل؟",
        ],
        [
          "Tell us their name in the portal or by phone, and give them your family password. We will not hand your child to anyone without it.",
          "أخبرونا باسمه عبر البوابة أو بالهاتف، وأعطوه كلمة السر الخاصة بأسرتكم، فلن نسلّم طفلكم لأحد من دونها.",
        ],
      ),
      question(
        b,
        ["What if we are late for pick-up?", "ماذا لو تأخّرنا عن موعد الاستلام؟"],
        [
          "Call the office as soon as you know. Your child stays with an adult they know, playing calmly, until you arrive.",
          "اتصلوا بالمكتب حالما تعرفون. سيبقى طفلكم مع أحد الكبار ممن يعرفهم، يلعب بهدوء حتى تصلوا.",
        ],
      ),
    ],
  }),
  { anchor: EY_PARENTS_ANCHOR.unwell },
);

const EY_PARENTS_MESSAGE = FORM(
  "general",
  ["Message the *nursery*", "راسلوا *الروضة*"],
  [
    "Report an absence, ask for a word with your child's key person or send any question. The office reads every message the same day.",
    "أبلغونا عن غياب، أو اطلبوا حديثًا مع المربية الرئيسية لطفلكم، أو أرسلوا أي سؤال. يقرأ المكتب كل رسالة في اليوم نفسه.",
  ],
);

// A school still to open: no tours of classes yet, but mornings with the
// founders, the plans and the people who will teach.
const LAUNCH_MORNINGS = section("imageText", "mediaEnd", (b) => ({
  eyebrow: b.w(["Founders' mornings", "صباحات المؤسِّسين"]),
  heading: b.w(["A school you can help *shape*", "مدرسة تشاركون في *صنعها*"]),
  body: plainContent(
    b.w(
      naming(
        ["families"],
        [
          "Founders' mornings run every Saturday at 10:00 and last about an hour and a half. We start with coffee and the plans on the table, then walk the site in hard hats: the classrooms, the library and the playground as they take shape.\nFounding families have a say most families never get: the clubs we start with, the uniform, even the names of the houses. Bring your questions, and your ideas.",
          "تُقام صباحات المؤسِّسين كل سبت الساعة 10:00 وتستغرق نحو ساعة ونصف. نبدأ بالقهوة والمخطّطات على الطاولة، ثم نتجوّل في الموقع بخوذ السلامة بين الفصول والمكتبة والملعب وهي تكتمل أمام أعينكم.\nللأسر المؤسِّسة رأي لا يُتاح لغيرها: في الأندية التي نبدأ بها، وفي الزيّ المدرسي، بل وفي أسماء البيوت المدرسية. أحضروا أسئلتكم وأفكاركم.",
        ],
        [
          "Founders' mornings run every Saturday at 10:00 and last about an hour and a half. We start with coffee and the plans on the table, then walk the site in hard hats: the classrooms, the library and the playground as they take shape.\nOur founding students have a say few ever get: the clubs we start with, the uniform, even the names of the houses. Bring your questions, and your ideas.",
          "تُقام صباحات المؤسِّسين كل سبت الساعة 10:00 وتستغرق نحو ساعة ونصف. نبدأ بالقهوة والمخطّطات على الطاولة، ثم نتجوّل في الموقع بخوذ السلامة بين الفصول والمكتبة والملعب وهي تكتمل أمام أعينكم.\nلطلابنا المؤسِّسين رأي لا يُتاح لغيرهم: في الأندية التي نبدأ بها، وفي الزيّ المدرسي، بل وفي أسماء البيوت المدرسية. أحضروا أسئلتكم وأفكاركم.",
        ],
      ),
    ),
  ),
  media: {
    kind: "image" as const,
    fileId: null,
    alt: "",
    posterFileId: null,
    captionsFileId: null,
  },
  actions: [
    link(b, ["Book a morning", "احجزوا موعدًا"], `/pages/visit#${ANCHOR.visit}`),
  ],
}));

const season = (b: Builder, when: Said, title: Said, text: Said) => ({
  id: b.id(),
  year: b.w(when),
  title: b.w(title),
  text: b.w(text),
});

const LAUNCH_PLANS = section("timeline", "horizontal", (b) => ({
  heading: b.w(["From building site to *school*", "من موقع بناء إلى *مدرسة*"]),
  items: [
    season(
      b,
      ["Now", "الآن"],
      ["Building under way", "البناء جارٍ"],
      [
        "Work is well under way on the new campus, designed around a shaded central courtyard.",
        "يتواصل العمل في الحرم الجديد، المصمَّم حول فناء مركزي مظلَّل.",
      ],
    ),
    season(
      b,
      ["Spring", "الربيع"],
      ["The founding teachers", "المعلّمون المؤسِّسون"],
      [
        "Twelve teachers join the principal and plan the first year together.",
        "ينضم اثنا عشر معلّمًا إلى المديرة ويخطّطون معًا للعام الأول.",
      ],
    ),
    season(
      b,
      ["Summer", "الصيف"],
      ["A first look inside", "نظرة أولى من الداخل"],
      naming(
        ["families"],
        [
          "Furniture and books arrive, and founding families see the finished rooms.",
          "يصل الأثاث والكتب، وتشاهد الأسر المؤسِّسة الغرف مكتملة.",
        ],
        [
          "Furniture and books arrive, and our founding students see the finished rooms.",
          "يصل الأثاث والكتب، ويشاهد طلابنا المؤسِّسون الغرف مكتملة.",
        ],
      ),
    ),
    season(
      b,
      ["September", "سبتمبر"],
      ["Doors open", "افتتاح الأبواب"],
      naming(
        ["families"],
        [
          "Our first children walk in, and the founding year begins.",
          "يدخل أطفالنا الأوائل، ويبدأ عام التأسيس.",
        ],
        [
          "Our first students walk in, and the founding year begins.",
          "يدخل طلابنا الأوائل، ويبدأ عام التأسيس.",
        ],
      ),
    ),
  ],
}));

const LAUNCH_LETTER = section("welcome", "portraitStart", (b) => ({
  heading: b.w([
    "A letter from the founding *principal*",
    "رسالة من *المديرة* المؤسِّسة",
  ]),
  body: plainContent(
    b.w(
      naming(
        ["families"],
        [
          "Dear families,\nEvery school begins with a few families willing to trust an idea before there is a building to show them. If you are reading this, you may be one of them, and I would very much like to meet you.\nI have taught and led schools for twenty years, and this is the one I have always wanted to build: small enough for every child to be known, ambitious enough for every child to be stretched, and open to the families who make it.\nCome to a founders' morning and tell me what you hope for your child. Those conversations are shaping the school.\nWith warm wishes,",
          "أعزّاءنا أولياء الأمور،\nتبدأ كل مدرسة بأسر قليلة تثق بفكرة قبل أن يكون هناك مبنى تراه. إن كنتم تقرؤون هذه الكلمات فقد تكونون منهم، ويسعدني كثيرًا أن ألقاكم.\nعملتُ في التعليم وقيادة المدارس عشرين عامًا، وهذه هي المدرسة التي طالما تمنّيت أن أبنيها: صغيرة بما يكفي ليُعرف فيها كل طفل، وطموحة بما يكفي ليُتحدّى فيها كل طفل، ومفتوحة للأسر التي تصنعها.\nاحضروا صباح المؤسِّسين وحدّثوني عمّا تتمنّونه لطفلكم، فهذه الأحاديث هي التي تصنع المدرسة.\nمع خالص التحيات،",
        ],
        [
          "Dear friends,\nEvery school begins with a few people willing to trust an idea before there is a building to show them. If you are reading this, you may be one of them, and I would very much like to meet you.\nI have taught and led schools for twenty years, and this is the one I have always wanted to build: small enough for every student to be known, ambitious enough for every student to be stretched, and open to the people who make it.\nCome to a founders' morning and tell me what you hope to learn here. Those conversations are shaping the school.\nWith warm wishes,",
          "أعزّاءنا،\nتبدأ كل مدرسة بقلّة يثقون بفكرة قبل أن يكون هناك مبنى يرونه. إن كنتم تقرؤون هذه الكلمات فقد تكونون منهم، ويسعدني كثيرًا أن ألقاكم.\nعملتُ في التعليم وقيادة المدارس عشرين عامًا، وهذه هي المدرسة التي طالما تمنّيت أن أبنيها: صغيرة بما يكفي ليُعرف فيها كل طالب، وطموحة بما يكفي ليُتحدّى فيها كل طالب، ومفتوحة لمن يصنعونها.\nاحضروا صباح المؤسِّسين وحدّثوني عمّا تأملون أن تتعلّموه هنا، فهذه الأحاديث هي التي تصنع المدرسة.\nمع خالص التحيات،",
        ],
      ),
    ),
  ),
  portrait: noImage,
  name: b.w(["Dr Amal Nasser", "د. أمل ناصر"]),
  role: b.w(["Founding principal", "المديرة المؤسِّسة"]),
}));

const LAUNCH_FIND_US = section("contact", "map", (b) => ({
  heading: b.w(["Finding the *site*", "الوصول إلى *الموقع*"]),
  text: b.w([
    "The campus is still being built, so please come to the site office at the north gate, where there is parking. The office is open Sunday to Thursday, 9:00 to 16:00, and on Saturday mornings for visits.",
    "لا يزال الحرم قيد البناء، لذا نرجو التوجّه إلى مكتب الموقع عند البوابة الشمالية حيث تتوفّر المواقف. المكتب مفتوح من الأحد إلى الخميس من 9:00 إلى 16:00، وصباح السبت للزيارات.",
  ]),
  mapHref: "",
}));

const INK = { scheme: "ink" } as const;
const ACCENT = { scheme: "accent" } as const;

const courseVoice = (
  b: Builder,
  quote: Said,
  name: Said,
  role: Said,
  audience: "student" | "alumni",
) => ({
  id: b.id(),
  quote: b.w(quote),
  name: b.w(name),
  role: b.w(role),
  audience,
  portrait: noImage,
});

const courseQuestion = (b: Builder, title: Said, text: Said) => ({
  id: b.id(),
  title: b.w(title),
  text: b.w(text),
});

const coursePrice = (b: Builder, label: Said, value: Said, note: Said) => ({
  id: b.id(),
  label: b.w(label),
  value: b.w(value),
  note: b.w(note),
});

const courseStep = (b: Builder, title: Said, text: Said) => ({
  id: b.id(),
  title: b.w(title),
  text: b.w(text),
});

const courseFigure = (b: Builder, value: string, label: Said) => ({
  id: b.id(),
  value,
  label: b.w(label),
  caption: "",
});

const COURSES_CONTACT = [
  PAGE_HEADER(
    ["Get in *touch*", "*تواصل* معنا"],
    [
      "Ask about a course, a start date or a place. We reply within two working days.",
      "اسأل عن دورة أو موعد بدء أو مقعد. نرد خلال يومي عمل.",
    ],
  ),
  on(CONTACT_MAP, { scheme: "canvas" }),
  FORM(
    "general",
    ["Send us a message", "أرسل لنا رسالة"],
    [
      "Tell us what you would like to learn and when you are free. We read every message.",
      "أخبرنا ماذا تريد أن تتعلّم ومتى يناسبك. نقرأ كل رسالة.",
    ],
  ),
];

// Workshop: a school that teaches code. Dark bands, one loud accent, and
// pages named for what a learner looks for: tracks and cohorts.

const WORKSHOP_HERO = section("hero", "type", (b) => ({
  eyebrow: b.w(["Evening and weekend cohorts", "دفعات مسائية وفي عطلة الأسبوع"]),
  heading: b.w([
    "Learn to code by *shipping* something every week",
    "تعلّم البرمجة بأن *تنجز* شيئًا كل أسبوع",
  ]),
  text: b.w([
    "Small cohorts in Python, web and data. You write real code from the first session, and you leave with projects people can open.",
    "دفعات صغيرة في بايثون والويب والبيانات. تكتب شيفرة حقيقية من الجلسة الأولى، وتخرج بمشاريع يستطيع الناس فتحها.",
  ]),
  actions: [
    link(b, ["Join a cohort", "انضم إلى دفعة"], "/pages/cohorts"),
    link(b, ["See the tracks", "تعرّف على المسارات"], "/pages/tracks"),
  ],
  height: "l" as const,
}));

const WORKSHOP_TRACKS = section("cards", "icons", (b) => ({
  heading: b.w(["Pick where you *start*", "اختر من أين *تبدأ*"]),
  text: b.w([
    "Four tracks, each a set of weeks with a project at the end. Move up when you are ready.",
    "أربعة مسارات، كلٌّ منها أسابيع معدودة تنتهي بمشروع. انتقل إلى التالي حين تكون مستعدًا.",
  ]),
  columns: "2" as const,
  items: [
    card(
      b,
      ["Python foundations", "أساسيات بايثون"],
      [
        "Ten weeks from your first line to a working program. No experience needed.",
        "عشرة أسابيع من أول سطر إلى برنامج يعمل. لا تحتاج إلى خبرة سابقة.",
      ],
      "lightbulb",
      "/pages/tracks",
    ),
    card(
      b,
      ["Web development", "تطوير الويب"],
      [
        "Twelve weeks from HTML to an app that is live on the internet.",
        "اثنا عشر أسبوعًا من HTML إلى تطبيق منشور على الإنترنت.",
      ],
      "globe",
      "/pages/tracks",
    ),
    card(
      b,
      ["Data analysis", "تحليل البيانات"],
      [
        "Eight weeks of real data: cleaning it, charting it and saying what it shows.",
        "ثمانية أسابيع مع بيانات حقيقية: تنظيفها ورسمها وشرح ما تقوله.",
      ],
      "flask",
      "/pages/tracks",
    ),
    card(
      b,
      ["Scratch and micro:bit", "سكراتش والمايكروبت"],
      [
        "For ages 8 to 12: eight Saturday mornings of games, lights and sensors.",
        "للأعمار من 8 إلى 12: ثمانية صباحات سبت مع الألعاب والأضواء والحسّاسات.",
      ],
      "sparkles",
      "/pages/tracks",
    ),
  ],
}));

const WORKSHOP_HOW = section("pillars", "numbered", (b) => ({
  heading: b.w(["How a week *works*", "كيف يسير *الأسبوع*"]),
  text: "",
  items: [
    pillar(
      b,
      ["Two sessions, hands on keys", "جلستان، ويداك على لوحة المفاتيح"],
      [
        "A short idea, then you build. The teacher is beside you, not in front of a slide.",
        "فكرة قصيرة ثم تبني بنفسك. المعلّم بجانبك، لا أمام شريحة عرض.",
      ],
      "clock",
    ),
    pillar(
      b,
      ["Something shipped by Friday", "شيء منجز قبل نهاية الأسبوع"],
      [
        "Every week ends with code that runs: small at first, then yours.",
        "ينتهي كل أسبوع بشيفرة تعمل: صغيرة في البداية، ثم من صنعك أنت.",
      ],
      "award",
    ),
    pillar(
      b,
      ["Feedback on your own code", "ملاحظات على شيفرتك أنت"],
      [
        "Your work is read line by line and returned with comments you can act on.",
        "يُقرأ عملك سطرًا سطرًا ويعود إليك بملاحظات تستطيع العمل بها.",
      ],
      "lightbulb",
    ),
  ],
}));

const WORKSHOP_COHORTS = section("courses", "table", (b) => ({
  heading: b.w(["Upcoming *cohorts*", "الدفعات *القادمة*"]),
  text: b.w([
    "Twelve learners to a cohort. A place is yours once you have spoken to us.",
    "اثنا عشر متعلّمًا في الدفعة. المقعد لك بعد أن تتحدّث إلينا.",
  ]),
  action: [
    link(
      b,
      ["Ask about a place", "اسأل عن مقعد"],
      `/pages/contact#${ANCHOR.general}`,
    ),
  ],
  items: [
    sampleClass(
      b,
      ["Python foundations", "أساسيات بايثون"],
      [
        "Sunday and Tuesday, 19:00 · 10 weeks",
        "الأحد والثلاثاء، 19:00 · 10 أسابيع",
      ],
      ["Starts next month", "تبدأ الشهر القادم"],
    ),
    sampleClass(
      b,
      ["Web development", "تطوير الويب"],
      ["Saturdays, 10:00 · 12 weeks", "السبت، 10:00 · 12 أسبوعًا"],
      ["Starts in two months", "تبدأ بعد شهرين"],
    ),
    sampleClass(
      b,
      ["Scratch and micro:bit", "سكراتش والمايكروبت"],
      ["Saturdays, 10:00 · ages 8 to 12", "السبت، 10:00 · الأعمار من 8 إلى 12"],
      ["Every term", "كل فصل"],
    ),
  ],
}));

const WORKSHOP_PROJECTS = section("gallery", "grid", (b) => ({
  heading: b.w(["Built by our *learners*", "من صنع *متعلّمينا*"]),
  items: Array.from({ length: 6 }, () => ({ id: b.id(), image: noImage })),
}));

const WORKSHOP_VOICES = section("voices", "grid", (b) => ({
  heading: b.w(["What learners *say*", "ماذا يقول *المتعلّمون*"]),
  items: [
    courseVoice(
      b,
      [
        "I had watched tutorials for a year. Here I wrote more code in two weeks than in all of it.",
        "شاهدت الدروس المصوّرة عامًا كاملًا. وهنا كتبت في أسبوعين شيفرة أكثر مما كتبت في ذلك العام كله.",
      ],
      ["Omar", "عمر"],
      ["Python foundations", "أساسيات بايثون"],
      "student",
    ),
    courseVoice(
      b,
      [
        "The project at the end is what got me my first interview.",
        "مشروع نهاية المسار هو ما أوصلني إلى أول مقابلة عمل.",
      ],
      ["Salma", "سلمى"],
      ["Web development, last year", "تطوير الويب، العام الماضي"],
      "alumni",
    ),
    courseVoice(
      b,
      [
        "My daughter now explains to me how the game she made works.",
        "ابنتي تشرح لي الآن كيف تعمل اللعبة التي صنعتها.",
      ],
      ["Hany", "هاني"],
      ["Scratch, Saturdays", "سكراتش، أيام السبت"],
      "student",
    ),
  ],
}));

const WORKSHOP_FAQ = section("accordion", "columns", (b) => ({
  heading: b.w(["Before you *ask*", "قبل أن *تسأل*"]),
  text: "",
  items: [
    courseQuestion(
      b,
      ["Do I need my own laptop?", "هل أحتاج إلى حاسوب محمول؟"],
      [
        "Yes, any laptop from the last eight years will do. Everything runs in the browser, so there is nothing to install.",
        "نعم، وأي حاسوب محمول من آخر ثماني سنوات يكفي. كل شيء يعمل في المتصفح، فلا تحتاج إلى تثبيت أي شيء.",
      ],
    ),
    courseQuestion(
      b,
      ["What if I miss a session?", "ماذا لو فاتتني جلسة؟"],
      [
        "Each session's lesson and exercise stay online, and the teacher answers questions between sessions.",
        "يبقى درس كل جلسة وتمرينها على الإنترنت، ويجيب المعلّم عن الأسئلة بين الجلسات.",
      ],
    ),
    courseQuestion(
      b,
      [
        "Is it taught in Arabic or English?",
        "هل التدريس بالعربية أم الإنجليزية؟",
      ],
      [
        "Lessons are explained in Arabic; the code and its terms are in English, as they are at work.",
        "تُشرح الدروس بالعربية، أما الشيفرة ومصطلحاتها فبالإنجليزية، كما هي في سوق العمل.",
      ],
    ),
    courseQuestion(
      b,
      ["Do I get a certificate?", "هل أحصل على شهادة؟"],
      [
        "You get a certificate when your final project is accepted, and the project itself, which matters more.",
        "تحصل على شهادة عند قبول مشروعك النهائي، وتحصل على المشروع نفسه، وهو الأهم.",
      ],
    ),
  ],
}));

const WORKSHOP_JOIN = section("steps", "horizontal", (b) => ({
  heading: b.w(["Joining is *three* steps", "الانضمام *ثلاث* خطوات"]),
  text: "",
  items: [
    courseStep(
      b,
      ["Write to us", "راسلنا"],
      [
        "Say which track and which days suit you. We reply within two working days.",
        "اذكر المسار والأيام التي تناسبك. نرد خلال يومي عمل.",
      ],
    ),
    courseStep(
      b,
      ["A short call", "مكالمة قصيرة"],
      [
        "Ten minutes to check the track fits where you are starting from.",
        "عشر دقائق لنتأكد أن المسار يناسب نقطة بدايتك.",
      ],
    ),
    courseStep(
      b,
      ["Your place", "مقعدك"],
      [
        "You get your sign-in, the first lesson and the date of session one.",
        "تحصل على حساب الدخول والدرس الأول وموعد الجلسة الأولى.",
      ],
    ),
  ],
}));

const WORKSHOP_ABOUT = section(
  "text",
  "statement",
  (b) => ({
    eyebrow: b.w(["Why we teach this way", "لماذا ندرّس هكذا"]),
    heading: b.w([
      "Nobody learns to code by watching. You learn by *building*, getting stuck and being helped out.",
      "لا أحد يتعلّم البرمجة بالمشاهدة. تتعلّم بأن *تبني*، وتتعثّر، وتجد من يساعدك.",
    ]),
    body: plainContent(
      b.w([
        "So our cohorts are small, our teachers work as developers, and every week ends with something that runs.",
        "لذلك دفعاتنا صغيرة، ومعلّمونا يعملون مطوّرين، وكل أسبوع ينتهي بشيء يعمل.",
      ]),
    ),
  }),
  { scheme: "ink", align: "center" },
);

const WORKSHOP_TEAM = section("people", "grid", (b) => ({
  heading: b.w(["Who *teaches* you", "من *يعلّمك*"]),
  text: b.w([
    "Developers who still ship code for a living.",
    "مطوّرون ما زالوا يكتبون الشيفرة في عملهم اليومي.",
  ]),
  items: [
    person(
      b,
      ["Lead teacher", "المعلّم الرئيسي"],
      ["Python and data", "بايثون والبيانات"],
    ),
    person(b, ["Teacher", "معلّمة"], ["Web development", "تطوير الويب"]),
    person(
      b,
      ["Teacher", "معلّم"],
      ["Scratch and micro:bit", "سكراتش والمايكروبت"],
    ),
  ],
}));

// Atelier: an academy of courses for adults. Warm paper, a book serif, and
// the season's courses as the first thing after the welcome.

const ATELIER_HERO = section("hero", "split", (b) => ({
  eyebrow: b.w(["Evening and weekend courses", "دورات مسائية وفي عطلة الأسبوع"]),
  heading: b.w([
    "Learn a craft *properly*, with people who practise it",
    "تعلّم الصنعة *كما ينبغي*، مع من يمارسونها",
  ]),
  text: b.w([
    "Twelve learners to a room, taught by working professionals, in terms of eight to twelve weeks.",
    "اثنا عشر متعلّمًا في القاعة، يعلّمهم محترفون يعملون في مجالهم، في فصول من ثمانية إلى اثني عشر أسبوعًا.",
  ]),
  actions: [
    link(b, ["See the courses", "تصفّح الدورات"], "/pages/courses"),
    link(
      b,
      ["Ask about a place", "اسأل عن مقعد"],
      `/pages/contact#${ANCHOR.general}`,
    ),
  ],
  height: "m" as const,
}));

const ATELIER_COURSES = section("courses", "list", (b) => ({
  heading: b.w(["This season's *courses*", "دورات هذا *الموسم*"]),
  text: "",
  action: [
    link(
      b,
      ["Ask about a place", "اسأل عن مقعد"],
      `/pages/contact#${ANCHOR.general}`,
    ),
  ],
  items: [
    sampleClass(
      b,
      ["Arabic calligraphy: Naskh", "الخط العربي: النسخ"],
      [
        "Ten Sunday evenings for beginners. The pen, the proportions and a finished page of your own.",
        "عشر أمسيات أحد للمبتدئين. القلم والنِّسَب وصفحة مكتملة بخط يدك.",
      ],
      ["10 weeks", "10 أسابيع"],
    ),
    sampleClass(
      b,
      ["Bookkeeping for small business", "مسك الدفاتر للمشروعات الصغيرة"],
      [
        "Eight Tuesdays. No experience needed: leave able to keep your own books.",
        "ثمانية أيام ثلاثاء. بلا خبرة سابقة: تخرج قادرًا على مسك دفاترك بنفسك.",
      ],
      ["8 weeks", "8 أسابيع"],
    ),
    sampleClass(
      b,
      ["English for the workplace", "الإنجليزية لبيئة العمل"],
      [
        "Twelve weeks, Monday and Wednesday, for people who read English and want to speak it at work.",
        "اثنا عشر أسبوعًا، الاثنين والأربعاء، لمن يقرأ الإنجليزية ويريد أن يتحدّثها في عمله.",
      ],
      ["12 weeks", "12 أسبوعًا"],
    ),
    sampleClass(
      b,
      ["Photography: light and portrait", "التصوير: الضوء والبورتريه"],
      [
        "Eight Saturday mornings with any camera, a phone included.",
        "ثمانية صباحات سبت بأي كاميرا، ولو كانت كاميرا الهاتف.",
      ],
      ["8 weeks", "8 أسابيع"],
    ),
  ],
}));

const ATELIER_FIGURES = section("stats", "row", (b) => ({
  heading: "",
  items: [
    courseFigure(b, "12", [
      "learners to a class, at most",
      "متعلّمًا في الفصل، على الأكثر",
    ]),
    courseFigure(b, "94%", [
      "finish the course they start",
      "يكملون الدورة التي بدؤوها",
    ]),
    courseFigure(b, "9", [
      "years teaching in this city",
      "سنوات من التدريس في هذه المدينة",
    ]),
  ],
  source: "",
}));

const ATELIER_QUOTE = section(
  "quote",
  "large",
  (b) => ({
    quote: b.w([
      "I had tried to learn from videos for two years. Ten Sundays in that room did what they could not.",
      "حاولت أن أتعلّم من الفيديوهات عامين. وعشرة أيام أحد في تلك القاعة فعلت ما لم تفعله.",
    ]),
    name: b.w(["Dina", "دينا"]),
    role: b.w(["Naskh, spring term", "النسخ، فصل الربيع"]),
    portrait: noImage,
    badge: "none" as const,
  }),
  { align: "center" },
);

const ATELIER_TUTORS = section("people", "grid", (b) => ({
  heading: b.w(["Your *tutors*", "*معلّموك*"]),
  text: b.w([
    "Each teaches what they do for a living.",
    "كلٌّ منهم يعلّم ما يعمل به.",
  ]),
  items: [
    person(b, ["Tutor", "معلّمة"], ["Calligraphy", "الخط العربي"]),
    person(b, ["Tutor", "معلّم"], ["Accounting", "المحاسبة"]),
    person(b, ["Tutor", "معلّمة"], ["Photography", "التصوير"]),
  ],
}));

const ATELIER_JOIN = section("steps", "horizontal", (b) => ({
  heading: b.w(["How to *join*", "كيف *تلتحق*"]),
  text: "",
  items: [
    courseStep(
      b,
      ["Choose a course", "اختر دورة"],
      [
        "Read what each covers and who it is for. Ask us if you are unsure of the level.",
        "اقرأ ما تغطيه كل دورة ولمن هي. واسألنا إن لم تكن متأكدًا من المستوى.",
      ],
    ),
    courseStep(
      b,
      ["Reserve your place", "احجز مقعدك"],
      [
        "Write to us with the course and your phone number. Places are kept in the order we hear from you.",
        "راسلنا باسم الدورة ورقم هاتفك. تُحجز المقاعد بترتيب وصول الرسائل.",
      ],
    ),
    courseStep(
      b,
      ["Come to the first evening", "احضر الأمسية الأولى"],
      [
        "Materials are on the table. If the course is not for you, the first evening is free.",
        "الأدوات على الطاولة. وإن لم تناسبك الدورة فالأمسية الأولى بلا مقابل.",
      ],
    ),
  ],
}));

const ATELIER_FEES = section("fees", "table", (b) => ({
  heading: b.w(["Fees", "الرسوم"]),
  text: b.w([
    "One fee for the whole course, materials included.",
    "رسم واحد للدورة كلها، شاملًا الأدوات.",
  ]),
  items: [
    coursePrice(
      b,
      ["Eight-week course", "دورة من ثمانية أسابيع"],
      ["—", "—"],
      ["", ""],
    ),
    coursePrice(
      b,
      ["Ten-week course", "دورة من عشرة أسابيع"],
      ["—", "—"],
      ["", ""],
    ),
    coursePrice(
      b,
      ["Twelve-week course", "دورة من اثني عشر أسبوعًا"],
      ["—", "—"],
      ["", ""],
    ),
  ],
}));

const ATELIER_FAQ = section("accordion", "accordion", (b) => ({
  heading: b.w(["Questions people *ask*", "أسئلة *يطرحها* الناس"]),
  text: "",
  items: [
    courseQuestion(
      b,
      ["Is this for beginners?", "هل هذه الدورات للمبتدئين؟"],
      [
        "Most courses are. Where a course expects you to know something already, its description says so.",
        "أغلبها كذلك. وحيث تفترض الدورة معرفة سابقة، يذكر وصفها ذلك.",
      ],
    ),
    courseQuestion(
      b,
      ["What if I miss an evening?", "ماذا لو فاتتني أمسية؟"],
      [
        "The notes and the exercise for each evening are kept online, and your tutor stays ten minutes after the next one.",
        "تُحفظ ملاحظات كل أمسية وتمرينها على الإنترنت، ويبقى معلّمك عشر دقائق بعد الأمسية التالية.",
      ],
    ),
    courseQuestion(
      b,
      ["Can I pay in parts?", "هل أستطيع الدفع على أقساط؟"],
      [
        "Yes: half before the first evening and half at the midpoint.",
        "نعم: النصف قبل الأمسية الأولى والنصف عند منتصف الدورة.",
      ],
    ),
  ],
}));

const ATELIER_ABOUT = section(
  "text",
  "statement",
  (b) => ({
    eyebrow: b.w(["Who we are", "من نحن"]),
    heading: b.w([
      "A small academy that believes a skill is learned in a *room*, from someone who has it.",
      "أكاديمية صغيرة تؤمن بأن المهارة تُتعلَّم في *قاعة*، ممن يملكها.",
    ]),
    body: plainContent(
      b.w([
        "We keep classes small, hire tutors who practise what they teach, and judge ourselves by how many learners finish.",
        "نبقي الفصول صغيرة، ونختار معلّمين يمارسون ما يعلّمونه، ونحكم على أنفسنا بعدد من يكملون.",
      ]),
    ),
  }),
  { scheme: "brand", align: "center" },
);

// Reel: a school of video courses. One picture fills the first screen, the
// library comes next, and a free lesson is offered before any price.

const REEL_ANCHOR = { free: "free-lesson" } as const;

const REEL_HERO = section("hero", "fullbleed", (b) => ({
  eyebrow: b.w(["Film school, in your own time", "مدرسة أفلام، في وقتك أنت"]),
  heading: b.w([
    "Make films people *finish* watching",
    "اصنع أفلامًا *يكملها* الناس حتى النهاية",
  ]),
  text: b.w([
    "Short lessons you can act on the same evening, taught by working directors and editors. In Arabic and English.",
    "دروس قصيرة تطبّقها في المساء نفسه، يقدّمها مخرجون ومونتيرون يعملون في المجال. بالعربية والإنجليزية.",
  ]),
  actions: [
    link(b, ["Browse the courses", "تصفّح الدورات"], "/pages/courses"),
    link(
      b,
      ["Watch a free lesson", "شاهد درسًا مجانيًا"],
      `/pages/courses#${REEL_ANCHOR.free}`,
    ),
  ],
  height: "screen" as const,
}));

const REEL_LIBRARY = section("courses", "grid", (b) => ({
  heading: b.w(["The *courses*", "*الدورات*"]),
  text: b.w([
    "Each is a set of short lessons with questions inside the video and an exercise at the end.",
    "كل دورة مجموعة دروس قصيرة، بأسئلة داخل الفيديو وتمرين في نهايتها.",
  ]),
  action: [
    link(
      b,
      ["Watch a free lesson", "شاهد درسًا مجانيًا"],
      `/pages/courses#${REEL_ANCHOR.free}`,
    ),
  ],
  items: [
    sampleClass(
      b,
      ["Directing the short film", "إخراج الفيلم القصير"],
      ["24 lessons · 6 hours", "24 درسًا · 6 ساعات"],
      ["", ""],
      ["Beginner", "للمبتدئين"],
    ),
    sampleClass(
      b,
      ["Editing on movement", "المونتاج على الحركة"],
      ["18 lessons · 4 hours", "18 درسًا · 4 ساعات"],
      ["", ""],
      ["Intermediate", "المستوى المتوسط"],
    ),
    sampleClass(
      b,
      ["Light you already have", "الضوء المتاح لديك"],
      ["12 lessons · 3 hours", "12 درسًا · 3 ساعات"],
      ["", ""],
      ["Beginner", "للمبتدئين"],
    ),
  ],
}));

const REEL_FREE = section(
  "video",
  "beside",
  (b) => ({
    heading: b.w(["Try a lesson *first*", "جرّب درسًا *أولًا*"]),
    text: b.w([
      '"Cutting on movement", eleven minutes, with the questions and the exercise that come with it.',
      "«القطع على الحركة»، إحدى عشرة دقيقة، مع أسئلته وتمرينه.",
    ]),
    actions: [link(b, ["See every course", "كل الدورات"], "/pages/courses")],
  }),
  { scheme: "soft", anchor: REEL_ANCHOR.free },
);

const REEL_HOW = section("pillars", "icons", (b) => ({
  heading: b.w(["How you *learn* here", "كيف *تتعلّم* هنا"]),
  text: "",
  items: [
    pillar(
      b,
      ["Short on purpose", "قصيرة عن قصد"],
      [
        "Lessons run ten to fifteen minutes: one idea, shown, then yours to try.",
        "مدة الدرس من عشر إلى خمس عشرة دقيقة: فكرة واحدة تُعرض، ثم تجرّبها أنت.",
      ],
      "clock",
    ),
    pillar(
      b,
      ["Questions inside the video", "أسئلة داخل الفيديو"],
      [
        "The lesson stops and asks, so you notice what you missed before moving on.",
        "يتوقف الدرس ويسألك، فتنتبه لما فاتك قبل أن تكمل.",
      ],
      "lightbulb",
    ),
    pillar(
      b,
      ["Your work, looked at", "عملك يُشاهَد"],
      [
        "Send the exercise in and a teacher answers with notes on your own footage.",
        "أرسل التمرين فيردّ عليك معلّم بملاحظات على لقطاتك أنت.",
      ],
      "award",
    ),
    pillar(
      b,
      ["Two languages", "لغتان"],
      [
        "Every lesson has captions in Arabic and English.",
        "لكل درس ترجمة مكتوبة بالعربية والإنجليزية.",
      ],
      "globe",
    ),
  ],
}));

const REEL_PRICING = section("fees", "plans", (b) => ({
  heading: b.w(["Pricing", "الأسعار"]),
  text: b.w([
    "Buy one course and keep it, or take everything by the month.",
    "اشترِ دورة واحدة واحتفظ بها، أو اشترك في كل شيء شهريًا.",
  ]),
  items: [
    planCard(b, {
      label: ["One course", "دورة واحدة"],
      value: ["—", "—"],
      note: ["Yours to keep, with its updates.", "تبقى لك، مع تحديثاتها."],
      includes: [
        "Every lesson of the course\nCaptions in Arabic and English\nWatch on a phone, tablet or computer",
        "كل دروس الدورة\nترجمة مكتوبة بالعربية والإنجليزية\nشاهد على الهاتف أو الجهاز اللوحي أو الحاسوب",
      ],
      link: ["Choose a course", "اختر دورة"],
      href: "/pages/courses",
    }),
    planCard(b, {
      label: ["Everything, by the month", "كل الدورات، شهريًا"],
      value: ["—", "—"],
      note: [
        "Every course while you subscribe. Stop whenever you like.",
        "كل الدورات ما دمت مشتركًا. وتوقف متى شئت.",
      ],
      includes: [
        "Every course in the library\nNew courses as they come out\nCaptions in Arabic and English\nStop whenever you like",
        "كل دورات المكتبة\nالدورات الجديدة فور صدورها\nترجمة مكتوبة بالعربية والإنجليزية\nتوقف متى شئت",
      ],
      chosen: true,
      link: ["Start watching", "ابدأ المشاهدة"],
      href: "/pages/courses",
    }),
  ],
}));

const REEL_VOICES = section("voices", "carousel", (b) => ({
  heading: b.w(["From people who *finished*", "ممن *أكملوا*"]),
  items: [
    courseVoice(
      b,
      [
        "The first course I have ever finished online. The lessons are short enough that I had no excuse.",
        "أول دورة أكملها على الإنترنت. الدروس قصيرة إلى حد لم يترك لي عذرًا.",
      ],
      ["Karim", "كريم"],
      ["Directing the short film", "إخراج الفيلم القصير"],
      "student",
    ),
    courseVoice(
      b,
      [
        "The notes on my own edit taught me more than the lessons did.",
        "الملاحظات على مونتاجي أنا علّمتني أكثر من الدروس نفسها.",
      ],
      ["Nour", "نور"],
      ["Editing on movement", "المونتاج على الحركة"],
      "alumni",
    ),
  ],
}));

const REEL_FAQ = section("accordion", "accordion", (b) => ({
  heading: b.w(["Before you *start*", "قبل أن *تبدأ*"]),
  text: "",
  items: [
    courseQuestion(
      b,
      ["What do I need?", "ماذا أحتاج؟"],
      [
        "A phone that films and any free editing app. Each course says if it needs more.",
        "هاتف يصوّر وأي تطبيق مونتاج مجاني. وتذكر كل دورة إن كانت تحتاج إلى أكثر من ذلك.",
      ],
    ),
    courseQuestion(
      b,
      ["How long do I have?", "كم من الوقت لديّ؟"],
      [
        "As long as you like. Your place in every lesson is kept.",
        "ما شئت من الوقت. ومكانك في كل درس محفوظ.",
      ],
    ),
    courseQuestion(
      b,
      ["Can I watch on my phone?", "هل أستطيع المشاهدة على الهاتف؟"],
      [
        "Yes. The video adjusts to your connection, and captions work everywhere.",
        "نعم. يتكيّف الفيديو مع سرعة اتصالك، والترجمة المكتوبة تعمل في كل مكان.",
      ],
    ),
  ],
}));

const REEL_ABOUT = section(
  "text",
  "statement",
  (b) => ({
    eyebrow: b.w(["Why we made this", "لماذا صنعنا هذا"]),
    heading: b.w([
      "Most online courses are started and never *finished*. We built ours to be finished.",
      "أغلب الدورات على الإنترنت تُبدأ ولا *تُكمَل*. صنعنا دوراتنا لتُكمَل.",
    ]),
    body: plainContent(
      b.w([
        "Short lessons, a question before you drift, and a person who looks at what you made.",
        "دروس قصيرة، وسؤال قبل أن يشرد ذهنك، وإنسان يشاهد ما صنعت.",
      ]),
    ),
  }),
  { scheme: "ink", align: "center" },
);

const REEL_TEACHERS = section("people", "grid", (b) => ({
  heading: b.w(["Who *teaches*", "من *يعلّم*"]),
  text: "",
  items: [
    person(b, ["Director", "مخرجة"], ["Directing", "الإخراج"]),
    person(b, ["Editor", "مونتير"], ["Editing", "المونتاج"]),
    person(
      b,
      ["Cinematographer", "مدير تصوير"],
      ["Light and camera", "الضوء والكاميرا"],
    ),
  ],
}));

const CANVAS = { scheme: "canvas" } as const;
const SOFT = { scheme: "soft" } as const;
const BRAND = { scheme: "brand" } as const;

export const PAGE_TEMPLATES = {
  blank: [],
  // Established: a full picture, the school's purpose in a sentence, the
  // stages joined in the theme's shape, the head's letter, the inspectors'
  // words with the school's accreditations beneath them.
  homeClassic: [
    HERITAGE_HERO,
    HERITAGE_PURPOSE,
    on(DIVISIONS, SOFT, "rail"),
    on(HERITAGE_LETTER, CANVAS),
    HERITAGE_INSPECTION,
    HERITAGE_ACCREDITATION,
    on(NEWS, SOFT, "list"),
    on(ADMISSIONS_TRIAD, BRAND),
  ],
  // International: a collage opening, figures that back its claims, the
  // four stages, why families choose the school and their voices to scroll
  // through. Card sections sit on the soft surface, where cards read crisp.
  homeStory: [
    on(INTL_HERO, CANVAS),
    on(INTL_FIGURES, SOFT),
    on(INTL_STAGES("tall", "/pages/academics"), CANVAS),
    on(INTL_WHY, SOFT),
    only(["families"], on(INTL_VOICES, CANVAS)),
    on(NEWS, SOFT),
    REGISTER_APPLY,
  ],
  homeAdmissions: [
    HERO_HOME,
    on(ADMISSIONS_TRIAD, BRAND),
    on(STEPS, CANVAS),
    on(STATS, SOFT),
    only(["families"], on(VOICES, CANVAS)),
  ],
  // Young families: a warm split opening, this term's invitation, the
  // everyday links, how children learn, everyday moments, parents' words
  // and joining in clear steps; the footer's call to visit closes it.
  homeCommunity: [
    on(EY_HERO, SOFT),
    EY_NOTICE,
    only(["families"], on(EY_QUICK_LINKS, CANVAS)),
    on(EY_LEARNING, { scheme: "soft", dividerTop: "wave" }),
    on(EY_STATS, { dividerTop: "wave" }),
    on(EY_GALLERY, CANVAS),
    only(["families"], on(EY_VOICES, { dividerTop: "wave" })),
    on(EY_STEPS, CANVAS),
  ],
  // Bold and new: words before pictures, values in motion, the proof, then
  // the way in, closing on the same colour the values opened on.
  homeStatement: [
    on(LAUNCH_HERO, CANVAS),
    on(PILLARS, { scheme: "accent", spacing: "s" }, "ticker"),
    on(LAUNCH_STORY, CANVAS),
    on(LAUNCH_STATS, SOFT),
    on(LAUNCH_QUOTE, { align: "center" }),
    on(LAUNCH_NEWS, SOFT),
    on(LAUNCH_STEPS, CANVAS),
    on(REGISTER_APPLY, { scheme: "accent" }),
  ],
  // A welcome: the whole screen first, a sentence that sums the school up,
  // values beside pictures, the numbers, the way in, and families' voices.
  // The news closes on the canvas so the footer's own colour does not run
  // straight on from a band of the same colour.
  homeWelcome: [
    on(WELCOME_HERO, CANVAS),
    on(STATEMENT, CANVAS),
    on(PILLARS, SOFT, "alternating"),
    on(STATS, CANVAS, "overImage"),
    on(ADMISSIONS_TRIAD, BRAND),
    only(["families"], on(VOICES, SOFT, "tabs")),
    on(NEWS, CANVAS, "featured"),
  ],
  // Any school: its purpose in a sentence, the principal's word, values,
  // figures and how it began, closing on the way to a visit.
  about: [
    PAGE_HEADER(
      ["Get to know our *school*", "تعرّفوا على *مدرستنا*"],
      [
        "What we believe, how we teach and where we began.",
        "ما نؤمن به، وكيف نعلّم، ومن أين بدأنا.",
      ],
    ),
    on(ABOUT_PURPOSE, CANVAS),
    on(ABOUT_WELCOME, SOFT),
    on(ABOUT_VALUES, CANVAS),
    on(ABOUT_FIGURES, BRAND),
    on(ABOUT_STORY, CANVAS),
  ],
  aboutHeritage: [
    PAGE_HEADER(
      ["About the *school*", "عن *المدرسة*"],
      [
        "Our story, the values we teach by and the people who make the school what it is.",
        "قصتنا والقيم التي نعلّم بها والأشخاص الذين يصنعون مدرستنا.",
      ],
    ),
    on(WELCOME, CANVAS),
    on(PILLARS, SOFT),
    on(STATS, BRAND),
    on(HISTORY, CANVAS),
  ],
  // A nursery: who looks after the children, the rooms by age, the day,
  // how they learn, the ratios, how they are kept safe and the team.
  aboutEarlyYears: [
    PAGE_HEADER(
      ["A nursery built around *play*", "روضة قوامها *اللعب*"],
      naming(
        ["families"],
        [
          "Who we are, how a day unfolds and how we keep every child safe, happy and learning.",
          "من نحن، وكيف يمضي اليوم، وكيف نحرص على أن يكون كل طفل آمنًا سعيدًا يتعلّم.",
        ],
        [
          "Who we are, how a day unfolds and how we keep everyone safe, happy and learning.",
          "من نحن، وكيف يمضي اليوم، وكيف نحرص على أن يكون الجميع آمنين سعداء يتعلّمون.",
        ],
      ),
    ),
    on(EY_ABOUT_WELCOME, CANVAS),
    on(EY_ROOMS, SOFT),
    on(EY_DAY, CANVAS),
    on(EY_PLAY, SOFT),
    on(EY_RATIOS, { scheme: "brand", dividerTop: "wave" }),
    on(EY_CARE, CANVAS),
    on(EY_TEAM, SOFT),
  ],
  admissions: [
    PAGE_HEADER(
      ["Admissions", "القبول"],
      [
        "Joining us is simple. Here is how it works, what it costs and who to ask.",
        "الالتحاق بنا سهل. إليكم كيف يتم، وما تكلفته، ومن تسألون.",
      ],
    ),
    on(STEPS, CANVAS),
    on(ADMISSIONS_INTAKES, SOFT),
    on(FAQ, CANVAS, "columns"),
    // The way in last, right above the form a family is sent to while
    // nothing is open.
    REGISTER_APPLY,
    on(ENQUIRY_FORM, SOFT),
  ],
  visit: [
    PAGE_HEADER(
      ["Come and *visit*", "تفضّلوا *بزيارتنا*"],
      [
        "The best way to know a school is to see it on an ordinary day.",
        "أفضل طريقة لمعرفة أي مدرسة أن تراها في يوم عادي.",
      ],
    ),
    on(VISIT_STORY, CANVAS),
    FORM(
      "visit",
      ["Book a visit", "احجز زيارة"],
      naming(
        ["families", "grade_levels"],
        [
          "Tell us which mornings suit you and the year your child would join. We will confirm by email.",
          "أخبرنا بالأيام التي تناسبك والصف الذي سيلتحق به طفلك، وسنؤكد لك بالبريد الإلكتروني.",
        ],
        [
          "Tell us which mornings suit you and what you would like to see. We will confirm by email.",
          "أخبرنا بالأيام التي تناسبك وما تودّ أن تراه، وسنؤكد لك بالبريد الإلكتروني.",
        ],
      ),
    ),
    on(CONTACT_MAP, CANVAS),
  ],
  admissionsEarlyYears: [
    PAGE_HEADER(
      ["Joining our *nursery*", "الانضمام إلى *روضتنا*"],
      [
        "Places for children aged 2 to 6, and a settling-in that goes at your child's pace.",
        "مقاعد للأطفال من سنتين إلى ست سنوات، وتأقلم يسير على إيقاع طفلكم.",
      ],
    ),
    on(EY_SESSIONS, CANVAS),
    on(EY_SETTLING, SOFT),
    on(EY_BRING, CANVAS),
    on(EY_PLACES, SOFT),
    on(EY_FAQ, CANVAS),
    REGISTER_APPLY,
    on(ENQUIRY_FORM, SOFT),
  ],
  visitEarlyYears: [
    PAGE_HEADER(
      ["Come and *play*", "تعالوا *والعبوا* معنا"],
      naming(
        ["families"],
        [
          "Bring your child to a stay-and-play morning. It is the easiest way for you both to get to know us.",
          "أحضروا طفلكم إلى صباح لعب مفتوح، فهو أسهل طريقة لتتعرّفوا إلينا معًا.",
        ],
        [
          "Come to a stay-and-play morning. It is the easiest way to get to know us.",
          "تعالوا إلى صباح لعب مفتوح، فهو أسهل طريقة لتتعرّفوا إلينا.",
        ],
      ),
    ),
    on(EY_STAY_AND_PLAY, CANVAS),
    on(EY_VISIT_STEPS, SOFT),
    on(
      FORM(
        "visit",
        ["Book your *morning*", "احجزوا *صباحكم*"],
        naming(
          ["families"],
          [
            "Tell us your child's age and which Saturday suits you. We will confirm by email, with directions.",
            "أخبرونا بعمر طفلكم والسبت الذي يناسبكم، وسنؤكّد لكم بالبريد الإلكتروني مع إرشادات الوصول.",
          ],
          [
            "Tell us which Saturday suits you. We will confirm by email, with directions.",
            "أخبرونا بالسبت الذي يناسبكم، وسنؤكّد لكم بالبريد الإلكتروني مع إرشادات الوصول.",
          ],
        ),
      ),
      CANVAS,
    ),
    on(EY_FIND_US, SOFT),
  ],
  // A school still to open: the founders' mornings, the plans to opening day
  // and the founding principal's letter. It closes on the canvas because the
  // compact footer is soft.
  visitLaunch: [
    PAGE_HEADER(
      ["Meet us before we *open*", "قابلونا قبل *الافتتاح*"],
      naming(
        ["families"],
        [
          "Our doors open in September 2027. Until then, come to a founders' morning, see the plans and meet the people who will teach your child.",
          "تُفتح أبوابنا في سبتمبر 2027. وحتى ذلك الحين، احضروا أحد صباحات المؤسِّسين، واطّلعوا على المخطّطات، وقابلوا من سيعلّمون أطفالكم.",
        ],
        [
          "Our doors open in September 2027. Until then, come to a founders' morning, see the plans and meet the people who will teach here.",
          "تُفتح أبوابنا في سبتمبر 2027. وحتى ذلك الحين، احضروا أحد صباحات المؤسِّسين، واطّلعوا على المخطّطات، وقابلوا من سيعلّمون فيها.",
        ],
      ),
    ),
    on(LAUNCH_MORNINGS, CANVAS),
    on(LAUNCH_PLANS, SOFT),
    on(LAUNCH_LETTER, CANVAS),
    FORM(
      "visit",
      ["Book a founders' *morning*", "احجزوا *صباح* المؤسِّسين"],
      naming(
        ["families", "grade_levels"],
        [
          "Choose a Saturday and tell us the year your child would join. We will confirm by email, with directions to the site office.",
          "اختاروا يوم سبت وأخبرونا بالصف الذي سيلتحق به طفلكم، وسنؤكّد لكم بالبريد الإلكتروني مع إرشادات الوصول إلى مكتب الموقع.",
        ],
        [
          "Choose a Saturday and tell us what you hope to learn. We will confirm by email, with directions to the site office.",
          "اختاروا يوم سبت وأخبرونا بما تأملون أن تتعلّموه، وسنؤكّد لكم بالبريد الإلكتروني مع إرشادات الوصول إلى مكتب الموقع.",
        ],
      ),
    ),
    on(LAUNCH_FIND_US, CANVAS),
  ],
  academics: [
    PAGE_HEADER(
      ["Academics", "المسار الأكاديمي"],
      [
        "A curriculum that stretches every learner, from first words to final exams.",
        "منهج يتحدّى كل متعلّم، من الكلمات الأولى حتى الامتحانات النهائية.",
      ],
    ),
    on(INTL_STAGES("rows", ""), CANVAS),
    on(INTL_SUBJECTS, SOFT),
    on(INTL_TEACHING, CANVAS),
    on(INTL_RESULTS, BRAND),
    on(INTL_HEADS, CANVAS),
    REGISTER_APPLY,
  ],
  parents: [
    PAGE_HEADER(
      ["Parents", "أولياء الأمور"],
      [
        "Everything families need through the year, in one place.",
        "كل ما تحتاجه الأسر طوال العام، في مكان واحد.",
      ],
    ),
    PARENTS_NOTICE,
    on(PARENTS_LINKS, CANVAS),
    PARENTS_DAY,
    on(NEWS, CANVAS),
    on(FAQ, { scheme: "soft", anchor: PARENTS_ANCHOR.questions }),
    on(PARENTS_MESSAGE, CANVAS),
  ],
  // A nursery's families: the handovers at either end of the day, what to
  // pack, meals and naps, what to do when plans change, and a message form.
  parentsEarlyYears: [
    PAGE_HEADER(
      ["Partners in *care*", "شركاء في *الرعاية*"],
      [
        "Drop-off and pick-up, the shape of the day, what to pack and how to reach your child's key person, all in one place.",
        "مواعيد الوصول والاستلام، وإيقاع اليوم، وما تحزمونه لطفلكم، وطرق التواصل مع مربيته الرئيسية، كلها في مكان واحد.",
      ],
    ),
    EY_PARENTS_NOTICE,
    on(EY_PARENTS_LINKS, CANVAS),
    on(EY_PARENTS_DAY, SOFT),
    on(EY_KEY_PERSON, CANVAS),
    on(EY_PACK, SOFT),
    on(EY_ROUTINES, CANVAS),
    on(EY_UNWELL, SOFT),
    on(EY_PARENTS_MESSAGE, CANVAS),
  ],
  contact: [
    PAGE_HEADER(
      ["Get in *touch*", "*تواصلوا* معنا"],
      naming(
        ["families"],
        [
          "We would love to hear from you, whether you are a family, a neighbour or a future colleague.",
          "يسعدنا أن نسمع منكم، أسرةً كنتم أو جيرانًا أو زملاء في المستقبل.",
        ],
        [
          "We would love to hear from you, whether you are a future student, a neighbour or a future colleague.",
          "يسعدنا أن نسمع منكم، طلابًا في المستقبل كنتم أو جيرانًا أو زملاء في المستقبل.",
        ],
      ),
    ),
    on(CONTACT_MAP, CANVAS),
    FORM(
      "general",
      ["Send us a message", "أرسل لنا رسالة"],
      [
        "We read every message and reply within two working days.",
        "نقرأ كل رسالة ونرد خلال يومي عمل.",
      ],
    ),
    on(FAQ, CANVAS, "columns"),
  ],
  // Workshop: the promise in type on a dark band, the tracks, how a week
  // goes, the cohorts with their days, learners' projects and words.
  homeWorkshop: [
    on(WORKSHOP_HERO, INK),
    on(WORKSHOP_TRACKS, CANVAS),
    on(WORKSHOP_HOW, SOFT),
    on(WORKSHOP_COHORTS, CANVAS),
    on(WORKSHOP_PROJECTS, INK),
    on(WORKSHOP_VOICES, CANVAS),
    on(WORKSHOP_JOIN, ACCENT),
  ],
  tracks: [
    PAGE_HEADER(
      ["The *tracks*", "*المسارات*"],
      [
        "What each track covers, who it is for and what you leave with.",
        "ما يغطيه كل مسار، ولمن هو، وبماذا تخرج منه.",
      ],
    ),
    on(WORKSHOP_TRACKS, CANVAS, "grid"),
    on(WORKSHOP_HOW, SOFT),
    on(WORKSHOP_FAQ, CANVAS),
  ],
  cohorts: [
    PAGE_HEADER(
      ["Upcoming *cohorts*", "الدفعات *القادمة*"],
      [
        "Days, times and how to take a place.",
        "الأيام والمواعيد وكيف تحجز مقعدًا.",
      ],
    ),
    on(WORKSHOP_COHORTS, CANVAS),
    on(WORKSHOP_JOIN, SOFT),
    on(WORKSHOP_FAQ, CANVAS),
  ],
  aboutWorkshop: [
    PAGE_HEADER(
      ["About *us*", "*من نحن*"],
      [
        "Who teaches here, and why we teach the way we do.",
        "من يعلّم هنا، ولماذا ندرّس بهذه الطريقة.",
      ],
    ),
    WORKSHOP_ABOUT,
    on(WORKSHOP_TEAM, CANVAS),
    on(WORKSHOP_PROJECTS, SOFT, "masonry"),
  ],
  // Atelier: the welcome beside a picture, the season's courses as a ruled
  // list, three figures, one learner's sentence, the tutors and the way in.
  homeAtelier: [
    on(ATELIER_HERO, CANVAS),
    on(ATELIER_COURSES, SOFT),
    on(ATELIER_FIGURES, CANVAS),
    on(ATELIER_QUOTE, BRAND),
    on(ATELIER_TUTORS, CANVAS),
    on(ATELIER_JOIN, SOFT),
  ],
  courses: [
    PAGE_HEADER(
      ["This season's *courses*", "دورات هذا *الموسم*"],
      [
        "What each course covers, when it meets and how long it runs.",
        "ما تغطيه كل دورة، ومتى تنعقد، وكم تستمر.",
      ],
    ),
    on(ATELIER_COURSES, CANVAS),
    on(ATELIER_JOIN, SOFT),
    on(ATELIER_FAQ, CANVAS),
  ],
  tutors: [
    PAGE_HEADER(
      ["Your *tutors*", "*معلّموك*"],
      ["People who do the work they teach.", "أناس يعملون بما يعلّمونه."],
    ),
    ATELIER_ABOUT,
    on(ATELIER_TUTORS, CANVAS),
    on(ATELIER_QUOTE, { scheme: "soft", align: "center" }),
  ],
  feesCourses: [
    PAGE_HEADER(
      ["Fees", "الرسوم"],
      [
        "What a course costs and how to pay for it.",
        "كم تكلّف الدورة وكيف تدفع رسومها.",
      ],
    ),
    on(ATELIER_FEES, CANVAS),
    on(ATELIER_FAQ, SOFT),
  ],
  // Reel: one picture and one sentence fill the screen, then the library,
  // a lesson to try, how learning works here, and the price last.
  homeReel: [
    on(REEL_HERO, INK),
    on(REEL_LIBRARY, CANVAS),
    REEL_FREE,
    on(REEL_HOW, CANVAS),
    on(REEL_VOICES, INK),
    on(REEL_PRICING, CANVAS),
  ],
  library: [
    PAGE_HEADER(
      ["The *courses*", "*الدورات*"],
      [
        "Every course, how long it is and who it is for.",
        "كل الدورات، ومدة كلٍّ منها، ولمن هي.",
      ],
    ),
    on(REEL_LIBRARY, CANVAS),
    REEL_FREE,
    on(REEL_FAQ, CANVAS),
  ],
  pricing: [
    PAGE_HEADER(
      ["Pricing", "الأسعار"],
      [
        "Two ways to pay, and what each gives you.",
        "طريقتان للدفع، وما تحصل عليه في كلٍّ منهما.",
      ],
    ),
    on(REEL_PRICING, CANVAS),
    on(REEL_FAQ, SOFT),
  ],
  aboutReel: [
    PAGE_HEADER(
      ["About *us*", "*من نحن*"],
      [
        "Who makes these courses, and what we are trying to fix.",
        "من يصنع هذه الدورات، وما الذي نحاول إصلاحه.",
      ],
    ),
    REEL_ABOUT,
    on(REEL_TEACHERS, CANVAS),
    on(REEL_HOW, SOFT),
  ],
  contactCourses: COURSES_CONTACT,
} satisfies Record<string, Part[]>;
export type PageTemplate = keyof typeof PAGE_TEMPLATES;
export type SiteTemplate = PageTemplate;
export const PAGE_TEMPLATE_IDS = Object.keys(PAGE_TEMPLATES) as PageTemplate[];

/** A template's sections in the site's first language and as their translation. */
export interface BuiltTemplate {
  content: PageSection[];
  translation: PageSection[];
}

/**
 * Builds a template in both languages with the same section and item ids,
 * so the second language lines up as a translation of the first. A section
 * whose module, or whose words' modules, the school does not have is left
 * out, a sentence naming one it does not have is read in its neutral form,
 * and a form asks only what the school's modules let it ask.
 */
export function buildTemplate(
  template: PageTemplate,
  primary: SiteLocale,
  modules: SiteModules,
): BuiltTemplate {
  const ids = Array.from({ length: 400 }, () => crypto.randomUUID());
  const has = (needs: readonly ModuleId[]) =>
    needs.every((module) => modules[module]);
  const present = MODULE_IDS.filter((module) => modules[module]);
  const parts: readonly Part[] = PAGE_TEMPLATES[template];
  const build = (locale: SiteLocale) => {
    const b = builder(ids, locale, has);
    return parts.flatMap((part) => {
      if (typeof part !== "function" && !has(part.needs)) return [];
      const made = (typeof part === "function" ? part : part.make)(b);
      const owner = sectionModule(made.type);
      return owner && !modules[owner] ? [] : [askedBy(made, present)];
    });
  };
  return {
    content: build(primary),
    translation: build(primary === "ar" ? "en" : "ar"),
  };
}

export interface StarterPage {
  slug: string;
  title: Words;
  template: PageTemplate;
  home?: boolean;
  /** The modules the page is about; a school without one is built without the page. */
  needs?: readonly ModuleId[];
}

/** A button a starter puts in the site's header. */
export interface StarterAction {
  label: Words;
  href: string;
  style: "primary" | "secondary";
}

export interface Starter {
  theme: ThemeId;
  pages: StarterPage[];
  /** Its own header buttons, where a school's enquiry, visit and apply do not fit. */
  actions?: StarterAction[];
}

const HOME: StarterPage = {
  slug: "home",
  title: ["Home", "الرئيسية"],
  template: "homeClassic",
  home: true,
};
const ABOUT: StarterPage = {
  slug: "about",
  title: ["About", "من نحن"],
  template: "about",
};
const ADMISSIONS: StarterPage = {
  slug: "admissions",
  title: ["Admissions", "القبول"],
  template: "admissions",
  needs: ["admissions"],
};
const VISIT: StarterPage = {
  slug: "visit",
  title: ["Visit", "زُرنا"],
  template: "visit",
};
const ACADEMICS: StarterPage = {
  slug: "academics",
  title: ["Academics", "الأكاديمي"],
  template: "academics",
};
const PARENTS: StarterPage = {
  slug: "parents",
  title: ["Parents", "أولياء الأمور"],
  template: "parents",
  needs: ["families"],
};
const CONTACT_PAGE: StarterPage = {
  slug: "contact",
  title: ["Contact", "تواصل معنا"],
  template: "contact",
};
const starterPage = (
  slug: string,
  title: Words,
  template: PageTemplate,
): StarterPage => ({ slug, title, template });

/** Whole sites a school can start from: a theme and a set of pages. */
export const STARTERS = {
  heritage: {
    theme: "heritage",
    pages: [
      HOME,
      { ...ABOUT, template: "aboutHeritage" },
      ACADEMICS,
      ADMISSIONS,
      VISIT,
      CONTACT_PAGE,
    ],
  },
  international: {
    theme: "meridian",
    pages: [
      { ...HOME, template: "homeStory" },
      ABOUT,
      ACADEMICS,
      ADMISSIONS,
      VISIT,
      PARENTS,
      CONTACT_PAGE,
    ],
  },
  earlyYears: {
    theme: "brightStart",
    pages: [
      { ...HOME, template: "homeCommunity" },
      { ...ABOUT, template: "aboutEarlyYears" },
      { ...ADMISSIONS, template: "admissionsEarlyYears" },
      { ...VISIT, template: "visitEarlyYears" },
      { ...PARENTS, template: "parentsEarlyYears" },
      CONTACT_PAGE,
    ],
  },
  arabicFirst: {
    theme: "oasis",
    pages: [
      { ...HOME, template: "homeWelcome" },
      ABOUT,
      ACADEMICS,
      ADMISSIONS,
      VISIT,
      PARENTS,
      CONTACT_PAGE,
    ],
  },
  launch: {
    theme: "editorial",
    pages: [
      { ...HOME, template: "homeStatement" },
      ADMISSIONS,
      { ...VISIT, template: "visitLaunch" },
      CONTACT_PAGE,
    ],
  },
  workshop: {
    theme: "workshop",
    pages: [
      { ...HOME, template: "homeWorkshop" },
      starterPage("tracks", ["Tracks", "المسارات"], "tracks"),
      starterPage("cohorts", ["Cohorts", "الدفعات"], "cohorts"),
      { ...ABOUT, template: "aboutWorkshop" },
      { ...CONTACT_PAGE, template: "contactCourses" },
    ],
    actions: [
      {
        label: ["Join a cohort", "انضم إلى دفعة"],
        href: "/pages/cohorts",
        style: "primary",
      },
    ],
  },
  atelier: {
    theme: "atelier",
    pages: [
      { ...HOME, template: "homeAtelier" },
      starterPage("courses", ["Courses", "الدورات"], "courses"),
      starterPage("tutors", ["Tutors", "المعلّمون"], "tutors"),
      starterPage("fees", ["Fees", "الرسوم"], "feesCourses"),
      { ...CONTACT_PAGE, template: "contactCourses" },
    ],
    actions: [
      {
        label: ["Ask about a place", "اسأل عن مقعد"],
        href: `/pages/contact#${ANCHOR.general}`,
        style: "primary",
      },
    ],
  },
  reel: {
    theme: "reel",
    pages: [
      { ...HOME, template: "homeReel" },
      starterPage("courses", ["Courses", "الدورات"], "library"),
      starterPage("pricing", ["Pricing", "الأسعار"], "pricing"),
      { ...ABOUT, template: "aboutReel" },
      { ...CONTACT_PAGE, template: "contactCourses" },
    ],
    actions: [
      {
        label: ["Start watching", "ابدأ المشاهدة"],
        href: "/pages/courses",
        style: "primary",
      },
    ],
  },
} satisfies Record<string, Starter>;
export type StarterId = keyof typeof STARTERS;
export const STARTER_IDS = Object.keys(STARTERS) as StarterId[];

const freshId = () => crypto.randomUUID();

/** The pages a family weighing the school looks for, which the footer gathers under "Join us". */
const JOINING = new Set(["admissions", "visit", "contact"]);

const action = (
  label: Words,
  href: string,
  style: StarterAction["style"],
): SiteChrome["actions"][number] => ({
  id: freshId(),
  label: { en: label[0], ar: label[1] },
  href,
  style,
});

/**
 * The frame a starter site comes with: header buttons and a sitemap footer.
 * A school taking applications is offered its enquiry, visit and apply; any
 * other is offered one way to write to it.
 */
export function starterChrome(
  pages: StarterPage[],
  modules: SiteModules,
  actions?: StarterAction[],
): SiteChrome {
  const has = (slug: string) => pages.some((page) => page.slug === slug);
  const target = (slug: string, anchor: string) =>
    has(slug) ? `/pages/${slug}#${anchor}` : `/pages/contact#${ANCHOR.general}`;
  const column = (title: Words, chosen: StarterPage[]) => ({
    id: freshId(),
    title: { en: title[0], ar: title[1] },
    links: chosen.map((page) => ({
      id: freshId(),
      label: { en: page.title[0], ar: page.title[1] },
      href: `/pages/${page.slug}`,
    })),
  });
  const inner = pages.filter((page) => !page.home);
  return {
    // News joins the menu by itself, so a new site's header is one row.
    utility: [],
    actions: actions
      ? actions.map((entry) => action(entry.label, entry.href, entry.style))
      : modules.admissions
        ? [
            action(
              ["Enquire", "استفسر"],
              target("admissions", ANCHOR.enquiry),
              "secondary",
            ),
            action(
              ["Book a visit", "احجز زيارة"],
              target("visit", ANCHOR.visit),
              "secondary",
            ),
            action(
              ["Apply", "قدّم الآن"],
              target("admissions", ANCHOR.apply),
              "primary",
            ),
          ]
        : [
            action(
              ["Get in touch", "تواصل معنا"],
              target("contact", ANCHOR.general),
              "primary",
            ),
          ],
    footerColumns: [
      column(
        ["Explore", "تعرّف علينا"],
        inner.filter((page) => !JOINING.has(page.slug)),
      ),
      column(
        ["Join us", "انضم إلينا"],
        inner.filter((page) => JOINING.has(page.slug)),
      ),
    ].filter((entry) => entry.links.length > 0),
    footerNote: { en: "", ar: "" },
    dock: true,
  };
}

/** Whether a school with these modules gets the page. */
export const pageFits = (page: StarterPage, modules: SiteModules) =>
  (page.needs ?? []).every((module) => modules[module]);

/**
 * Points every link at something the built site has: one to an anchor no
 * section of its page carries leads to the page, or goes where it already
 * is, one to a page the school was built without leads to the contact page.
 */
function settledLinks(
  anchors: ReadonlyMap<string, ReadonlySet<string>>,
  here: string,
) {
  const fallback = anchors.has("/pages/contact") ? "/pages/contact" : "/";
  const settle = (href: string) => {
    if (!href.startsWith("/pages/")) return href;
    const [path = "", anchor] = href.split("#");
    const found = anchors.get(path);
    if (!found) return fallback;
    if (anchor === undefined || found.has(anchor)) return href;
    return path === here ? null : path;
  };
  const gone = (value: unknown) =>
    !!value &&
    typeof value === "object" &&
    "label" in value &&
    "href" in value &&
    typeof value.href === "string" &&
    settle(value.href) === null;
  const walk = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.filter((item) => !gone(item)).map(walk)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).map(([key, inner]) => [
              key,
              key === "href" && typeof inner === "string"
                ? (settle(inner) ?? "")
                : walk(inner),
            ]),
          )
        : value;
  return <T>(value: T) => walk(value) as T;
}

export interface BuiltStarter {
  pages: { plan: StarterPage; built: BuiltTemplate }[];
  chrome: SiteChrome;
}

/** A starter's pages and frame as a school with these modules gets them. */
export function buildStarter(
  starter: Starter,
  primary: SiteLocale,
  modules: SiteModules,
): BuiltStarter {
  const plans = starter.pages.filter((page) => pageFits(page, modules));
  const pages = plans.map((plan) => ({
    plan,
    built: buildTemplate(plan.template, primary, modules),
  }));
  const anchors = new Map(
    pages.map(({ plan, built }) => [
      `/pages/${plan.slug}`,
      new Set(built.content.flatMap((row) => row.style.anchor || [])),
    ]),
  );
  return {
    pages: pages.map(({ plan, built }) => {
      const settle = settledLinks(anchors, `/pages/${plan.slug}`);
      return {
        plan,
        built: {
          content: built.content.map(settle),
          translation: built.translation.map(settle),
        },
      };
    }),
    chrome: settledLinks(
      anchors,
      "",
    )(starterChrome(plans, modules, starter.actions)),
  };
}
