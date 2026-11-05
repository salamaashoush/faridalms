import type {
  IconId,
  PageSection,
  SectionOf,
  SectionType,
  SiteLocale,
} from "./site-sections";
import type { SiteChrome, ThemeId } from "./site-theme";

import { plainContent } from "./content-conversion";
import { defaultStyle, newSection } from "./site-sections";

/** Words in both languages; a template is written once and built in either. */
type Words = readonly [en: string, ar: string];

interface Builder {
  /** The same sequence of ids in every language, so the two stay aligned. */
  id: () => string;
  w: (words: Words) => string;
}

type Section = <T extends SectionType>(
  type: T,
  variant: SectionOf<T>["variant"],
  data: (b: Builder) => Partial<SectionOf<T>["data"]>,
  style?: Partial<PageSection["style"]>,
) => (b: Builder) => PageSection;

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

const link = (b: Builder, label: Words, href: string) => ({
  id: b.id(),
  label: b.w(label),
  href,
});
const noImage = { fileId: null, alt: "" };
const card = (
  b: Builder,
  title: Words,
  text: Words,
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

const HERO_HOME = section("hero", "fullbleed", (b) => ({
  eyebrow: b.w(["Welcome", "أهلًا بكم"]),
  heading: b.w([
    "Where every child is *known* and *challenged*",
    "مدرسة يُعرف فيها *كل طفل* ويُتحدّى",
  ]),
  text: b.w([
    "A caring community with high expectations, from the early years to graduation.",
    "مجتمع يرعى أبناءه ويتوقّع منهم الكثير، من السنوات الأولى حتى التخرّج.",
  ]),
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
    text: b.w([
      "Three steps to a place for your child.",
      "ثلاث خطوات نحو مقعد لطفلك.",
    ]),
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
    text: b.w([
      "Register as a family once, then apply for each child and come back to the application whenever you like.",
      "سجّلوا أسرتكم مرة واحدة، ثم قدّموا لكل طفل وعودوا إلى الطلب متى شئتم.",
    ]),
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
    b.w([
      "Thank you for your interest in our school. We are a community where curiosity is encouraged, kindness is expected and every child is known well by the adults who teach them.\nThe best way to understand a school is to see it on an ordinary day. Come and visit: our students will show you round, and we will answer every question you bring.",
      "شكرًا لاهتمامكم بمدرستنا. نحن مجتمع يشجّع الفضول ويتوقّع اللطف، ويعرف فيه المعلّمون كل طفل معرفة جيدة.\nأفضل طريقة لفهم أي مدرسة أن تروها في يوم عادي. زورونا وسيرافقكم طلابنا في جولة، وسنجيب عن كل أسئلتكم.",
    ]),
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
        role: b.w(["Student, Grade 10", "طالب في الصف العاشر"]),
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
      text: b.w([
        "Children learn to ask good questions and to enjoy finding the answers out for themselves.",
        "يتعلّم الأطفال طرح الأسئلة الجيدة ويستمتعون بالبحث عن إجاباتها بأنفسهم.",
      ]),
      icon: "lightbulb" as const,
      image: noImage,
    },
    {
      id: b.id(),
      title: b.w(["Kindness", "اللطف"]),
      text: b.w([
        "We look after one another, and every child is known by name by the adults around them.",
        "يرعى بعضنا بعضًا، ويعرف الكبار من حول كل طفل اسمه وما يحتاج إليه.",
      ]),
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
      text: b.w([
        "Families, students and staff work as one community, in two languages and many cultures.",
        "تعمل الأسر والطلاب والمعلّمون مجتمعًا واحدًا، بلغتين وثقافات كثيرة.",
      ]),
      icon: "users" as const,
      image: noImage,
    },
  ],
}));

const PAGE_HEADER = (title: Words, text: Words) =>
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
      text: b.w([
        "Tell us about your child and the year they would join. We reply within two working days.",
        "أخبرنا عن طفلك والصف الذي سيلتحق به، وسنرد خلال يومي عمل.",
      ]),
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
      text: b.w([
        "A relaxed morning with us, so we can understand how your child learns best.",
        "صباح هادئ معنا لنفهم كيف يتعلّم طفلك على أفضل وجه.",
      ]),
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

const FAQ = section("accordion", "accordion", (b) => ({
  heading: b.w(["Questions families ask", "أسئلة تطرحها الأسر"]),
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
      title: b.w([
        "Can my child join during the year?",
        "هل يمكن لطفلي الالتحاق خلال العام؟",
      ]),
      text: b.w([
        "Often, yes. Where a class has room we welcome new students at any point, after a visit and an assessment morning.",
        "نعم في الغالب. حين يتوفّر مقعد في الفصل نرحّب بالطلاب الجدد في أي وقت، بعد زيارة وصباح تقييم.",
      ]),
    },
    {
      id: b.id(),
      title: b.w([
        "How do you support children learning in a new language?",
        "كيف تدعمون الأطفال الذين يتعلّمون بلغة جديدة؟",
      ]),
      text: b.w([
        "Specialist teachers work with small groups each day until a child is confident in class.",
        "يعمل معلّمون متخصّصون مع مجموعات صغيرة كل يوم حتى يشعر الطفل بالثقة داخل الفصل.",
      ]),
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
    b.w([
      "Tours run every Tuesday and Thursday morning and take about an hour. Our students show you round, so you see classes, clubs and lunch as they really are.\nAfterwards you meet the head of the stage your child would join, and we answer every question you bring.",
      "تُقام الجولات صباح كل ثلاثاء وخميس وتستغرق نحو ساعة. يرافقكم طلابنا لتروا الفصول والأندية والغداء كما هي فعلًا.\nبعد الجولة تقابلون رئيس المرحلة التي سيلتحق بها طفلكم، ونجيب عن كل أسئلتكم.",
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
    link(b, ["Book a visit", "احجز زيارة"], `/pages/visit#${ANCHOR.visit}`),
  ],
}));

const STATEMENT = section(
  "text",
  "statement",
  (b) => ({
    eyebrow: b.w(["Who we are", "من نحن"]),
    heading: b.w([
      "A school where every child is *known well*, taught with *ambition* and sent out ready to shape the world.",
      "مدرسة يُعرف فيها كل طفل *معرفة حقيقية*، ويتعلّم *بطموح*، ويتخرّج مستعدًا ليصنع عالمه.",
    ]),
    body: plainContent(
      b.w([
        "From the first morning in the early years to the last examination, our teachers know each student, their strengths and what will stretch them next.",
        "من الصباح الأول في رياض الأطفال حتى آخر امتحان، يعرف معلّمونا كل طالب ونقاط قوّته وما يحتاج إليه ليتقدّم.",
      ]),
    ),
  }),
  { scheme: "brand", align: "center" },
);

const TEXT = (heading: Words, body: Words) =>
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

const person = (b: Builder, name: Words, role: Words) => ({
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

const milestone = (b: Builder, year: string, title: Words, text: Words) => ({
  id: b.id(),
  year,
  title: b.w(title),
  text: b.w(text),
});

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
  eyebrow: Words,
  heading: Words,
  text: Words,
  action: [Words, string],
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
  heading: Words,
  text: Words,
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
      questions:
        purpose === "enquiry"
          ? [
              {
                id: b.id(),
                label: b.w(["How did you hear about us?", "كيف عرفتم بنا؟"]),
                hint: "",
                answer: "choice" as const,
                required: "optional" as const,
                options: b.w([
                  "A friend or relative\nSocial media\nA search online\nAn event or open day\nSomewhere else",
                  "صديق أو قريب\nوسائل التواصل الاجتماعي\nالبحث على الإنترنت\nفعالية أو يوم مفتوح\nمصدر آخر",
                ]),
              },
            ]
          : [],
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
  text: b.w([
    "A warm, bilingual nursery where children play, wonder and grow in confidence, with a team who know every child well.",
    "روضة دافئة ثنائية اللغة، يلعب فيها الأطفال ويكتشفون وتنمو ثقتهم بأنفسهم، مع فريق يعرف كل طفل جيدًا.",
  ]),
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
    text: b.w([
      "Stay-and-play mornings every Saturday this term: come with your child and meet the team.",
      "صباحات لعب مفتوحة كل سبت في هذا الفصل: تعالوا مع طفلكم وتعرّفوا على الفريق.",
    ]),
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
  title: Words,
  text: Words,
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
  heading: b.w(["How children *learn* here", "كيف *يتعلّم* أطفالنا"]),
  text: b.w([
    "Days built around play, with gentle routines and plenty of time outdoors.",
    "أيام تقوم على اللعب، بروتين هادئ ووقت وافر في الهواء الطلق.",
  ]),
  columns: "4" as const,
  items: [
    card(
      b,
      ["Play with a purpose", "لعب له هدف"],
      [
        "Sand, water, blocks and role play, each set up so children explore, count and talk as they go.",
        "رمل وماء ومكعّبات ولعب أدوار، يُهيّأ كل منها ليستكشف الأطفال ويعدّوا ويتحدّثوا وهم يلعبون.",
      ],
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
      [
        "Singing, painting, clay and simple instruments, with something small to take home most weeks.",
        "غناء ورسم وصلصال وآلات بسيطة، ومعظم الأسابيع يعود الطفل إلى البيت بشيء صنعه بيديه.",
      ],
      "music",
    ),
  ],
}));

const EY_STATS = section(
  "stats",
  "row",
  (b) => ({
    heading: b.w([
      "Small enough to know *every* child",
      "صغيرة بما يكفي لنعرف *كل* طفل",
    ]),
    items: [
      {
        id: b.id(),
        value: "1:4",
        label: b.w([
          "adults to children under three",
          "بالغ لكل أربعة أطفال دون الثالثة",
        ]),
        caption: "",
      },
      {
        id: b.id(),
        value: "16",
        label: b.w(["children in a class, at most", "طفلًا في الفصل كحدّ أقصى"]),
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

const parentVoice = (b: Builder, quote: Words, name: Words, role: Words) => ({
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
  text: b.w([
    "Most children start in September, and we welcome new families all year whenever a place is free.",
    "يبدأ معظم الأطفال في سبتمبر، ونرحّب بأسر جديدة طوال العام كلما توفّر مقعد.",
  ]),
  items: [
    {
      id: b.id(),
      title: b.w(["Come and play", "تعالوا والعبوا معنا"]),
      text: b.w([
        "Visit with your child on a stay-and-play morning and see the rooms, the garden and the team.",
        "زوروا الروضة مع طفلكم في صباح لعب مفتوح، وتعرّفوا على الغرف والحديقة والفريق.",
      ]),
    },
    {
      id: b.id(),
      title: b.w(["Tell us about your child", "حدّثونا عن طفلكم"]),
      text: b.w([
        "Register online and tell us about routines, languages at home and what helps your child feel settled.",
        "سجّلوا عبر الإنترنت وأخبرونا عن روتين طفلكم واللغات في البيت وما يساعده على الاطمئنان.",
      ]),
    },
    {
      id: b.id(),
      title: b.w(["Settling in gently", "تأقلم بهدوء"]),
      text: b.w([
        "Short sessions with a parent close by, growing a little longer each day.",
        "جلسات قصيرة بقرب أحد الوالدين، تطول قليلًا كل يوم.",
      ]),
    },
    {
      id: b.id(),
      title: b.w(["A full, happy day", "يوم كامل وسعيد"]),
      text: b.w([
        "When your child is ready they stay the whole day, and you hear how it went at the end of each one.",
        "حين يصبح طفلكم مستعدًا يبقى اليوم كله، ونخبركم في نهاية كل يوم كيف مضى.",
      ]),
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
      ["Questions families ask", "أسئلة تطرحها الأسر"],
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

const moment = (b: Builder, time: string, title: Words, text: Words) => ({
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
      label: b.w(["children in a class, at most", "طفلًا في الفصل كحدّ أقصى"]),
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
      label: b.w([
        "adults to children in the early years",
        "نسبة الكبار إلى الأطفال في السنوات الأولى",
      ]),
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
      text: b.w([
        "Tell us about your child and the year they would join. We reply within two working days.",
        "أخبرونا عن طفلكم والصف الذي سيلتحق به، وسنرد خلال يومي عمل.",
      ]),
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
      text: b.w([
        "A relaxed morning with us, so we can understand how your child learns best.",
        "صباح هادئ معنا لنفهم كيف يتعلّم طفلكم على أفضل وجه.",
      ]),
    },
    {
      id: b.id(),
      title: b.w(["A founding place", "مقعد مؤسِّس"]),
      text: b.w([
        "We confirm your child's place and help you prepare for the very first day.",
        "نؤكّد مقعد طفلكم ونساعدكم على الاستعداد لليوم الأول.",
      ]),
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
  admissions: ADMISSIONS_INTAKES,
  registerApply: REGISTER_APPLY,
  steps: STEPS,
  fees: FEES,
  contact: CONTACT,
  quickLinks: QUICK_LINKS,
  embed: EMBED,
  form: ENQUIRY_FORM,
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
  const build = (locale: SiteLocale) => {
    let cursor = 0;
    const b: Builder = {
      id: () => ids[cursor++] ?? crypto.randomUUID(),
      w: (words) => (locale === "ar" ? words[1] : words[0]),
    };
    return { ...SAMPLES[type](b), variant } as PageSection;
  };
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

const figure = (b: Builder, value: string, label: Words, caption: Words) => ({
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
      [
        "From the early years to Grade 12, on one campus.",
        "من رياض الأطفال حتى الصف الثاني عشر، في حرم واحد.",
      ],
    ),
    figure(
      b,
      "45",
      ["nationalities", "جنسية"],
      [
        "Families from every continent, learning as one community.",
        "أسر من كل القارات تتعلّم مجتمعًا واحدًا.",
      ],
    ),
    figure(
      b,
      "12:1",
      ["students per teacher", "طالبًا لكل معلّم"],
      [
        "Small classes, so every child is known well.",
        "فصول صغيرة يُعرف فيها كل طفل معرفة جيدة.",
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
}));

/** The four stages: on the home page the way into academics, on academics itself rows that lead nowhere else. */
const INTL_STAGES = (variant: "tall" | "rows", href: string) =>
  section("divisions", variant, (b) => ({
    heading: b.w(["Four stages, *one* school", "أربع مراحل في مدرسة *واحدة*"]),
    text: b.w([
      "Each stage builds on the last, led by a head who knows every child in it.",
      "تبني كل مرحلة على ما قبلها، ويقودها رئيس يعرف كل طفل فيها.",
    ]),
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
  heading: b.w(["Why families *choose* us", "لماذا *تختارنا* الأسر"]),
  text: b.w([
    "What parents tell us made the difference when they first visited.",
    "ما تقول الأسر إنه صنع الفرق في زيارتها الأولى.",
  ]),
  columns: "3" as const,
  items: [
    card(
      b,
      ["Two languages, many cultures", "لغتان وثقافات كثيرة"],
      [
        "Every child becomes fluent in English and Arabic, alongside classmates from forty-five countries.",
        "يتقن كل طفل العربية والإنجليزية، مع زملاء من خمس وأربعين دولة.",
      ],
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
  quote: Words,
  name: Words,
  role: Words,
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
      ["Student, Grade 10", "طالب في الصف العاشر"],
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
  text: b.w([
    "A broad curriculum in two languages, taught in small classes by teachers who know each child.",
    "منهج واسع بلغتين، في فصول صغيرة، مع معلّمين يعرفون كل طفل.",
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
    b.w([
      "Teachers plan together across each stage, so what a child learns one year builds on the last. Lessons begin with a question, and students spend as long explaining their thinking as writing answers down.\nWe report to families three times a year, and you are welcome to sit in on a lesson when you visit.",
      "يخطّط المعلّمون معًا في كل مرحلة، فيبني ما يتعلّمه الطفل في عام على ما سبقه. تبدأ الدروس بسؤال، ويقضي الطلاب في شرح تفكيرهم وقتًا يعادل ما يقضونه في كتابة الإجابات.\nنرسل تقارير إلى الأسر ثلاث مرات في العام، ويسعدنا أن تحضروا درسًا في أثناء زيارتكم.",
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
        [
          "Where our last five year groups went on to university.",
          "التحق فيها خريجو آخر خمس دفعات بالجامعات.",
        ],
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
  text: b.w([
    "The people who know your child's stage best, and whom you will meet when you visit.",
    "هم الأقرب إلى مرحلة طفلكم، وستقابلونهم حين تزوروننا.",
  ]),
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
    heading: b.w([
      "We teach children to *think for themselves*, to *care for others* and to go out into the world with a sense of purpose.",
      "نعلّم أبناءنا أن *يفكّروا بأنفسهم* وأن *يرعوا غيرهم*، وأن يخرجوا إلى العالم وفي نفوسهم غاية.",
    ]),
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
    b.w([
      "Dear families,\nThank you for thinking of us for your child. A school is best judged not by its buildings or its results, though we are proud of both, but by the way its pupils treat one another when nobody is watching.\nHere every child is known. Their teachers notice when they fall quiet, stretch them when they coast and celebrate when they surprise themselves. That has been our work since the day the school opened.\nI would be delighted to show you round. Come on an ordinary morning and see it for yourself.\nWith warm wishes,",
      "أعزّاءنا أولياء الأمور،\nشكرًا لأنكم فكّرتم فينا لأبنائكم. لا تُقاس المدرسة بمبانيها ولا بنتائجها، وإن كنّا نفخر بهما، بل بالطريقة التي يعامل بها طلابها بعضهم بعضًا حين لا يراهم أحد.\nهنا يُعرف كل طفل. يلاحظ معلّموه صمته، ويدفعونه إلى الأمام حين يتراخى، ويحتفون به حين يفاجئ نفسه. هذا عملنا منذ اليوم الأول لافتتاح المدرسة.\nيسعدني أن أرافقكم في جولة. تعالوا في صباح عادي وشاهدوا بأنفسكم.\nمع خالص التحيات،",
    ]),
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
      [
        "The school opens in a family house by the river, with forty pupils, six teachers and a library of borrowed books.",
        "تفتح المدرسة أبوابها في بيت عائلي قرب النهر، بأربعين طالبًا وستة معلّمين ومكتبة من كتب مستعارة.",
      ],
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
      [
        "Arabic and English become equal languages of teaching, from the first year to the last.",
        "تصبح العربية والإنجليزية لغتين متكافئتين للتدريس، من الصف الأول حتى الأخير.",
      ],
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
    heading: b.w([
      "We want every child to leave us *confident* in themselves, *generous* to others and ready to keep learning all their life.",
      "نريد لكل طفل أن يغادرنا *واثقًا* بنفسه، *كريمًا* مع غيره، مستعدًا لأن يواصل التعلّم طوال حياته.",
    ]),
    body: plainContent(
      b.w([
        "Everything else follows from that: small classes, teachers who know each child well, languages taught with real care, and a day with room for sport, the arts and friendship as well as study.",
        "ومن هذه الغاية ينبع كل ما عداها: فصول صغيرة، ومعلّمون يعرفون كل طفل جيدًا، ولغات تُدرَّس بعناية حقيقية، ويوم دراسي يتّسع للرياضة والفنون والصداقة إلى جانب الدراسة.",
      ]),
    ),
  }),
  { align: "center" },
);

const ABOUT_WELCOME = section("welcome", "portraitEnd", (b) => ({
  heading: b.w(["A word from our *principal*", "كلمة *مديرة* المدرسة"]),
  body: plainContent(
    b.w([
      "Thank you for taking the time to find out about us. Choosing a school is one of the biggest decisions a family makes, and we do not take your trust lightly.\nWhat I hope you notice when you visit is how well our teachers know the children in front of them: what each one finds easy, what they find hard and what will help them take the next step. That knowledge is the heart of the school.\nCome and see us on an ordinary morning. I would be glad to answer your questions myself.",
      "شكرًا لأنكم خصّصتم وقتًا للتعرّف إلينا. إن اختيار المدرسة من أهمّ القرارات التي تتخذها الأسرة، ونحن نقدّر الثقة التي تضعونها فينا.\nأرجو أن تلاحظوا حين تزوروننا مدى معرفة معلّمينا بالأطفال الذين بين أيديهم: ما يسهل على كل منهم وما يصعب عليه، وما يعينه على الخطوة التالية. هذه المعرفة هي قلب المدرسة.\nتعالوا وزورونا في صباح عادي، ويسعدني أن أجيب عن أسئلتكم بنفسي.",
    ]),
  ),
  portrait: noImage,
  name: b.w(["Dr Amal Nasser", "د. أمل ناصر"]),
  role: b.w(["Principal", "مديرة المدرسة"]),
}));

const pillar = (b: Builder, title: Words, text: Words, icon: IconId) => ({
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
      [
        "Lessons start with a question, and children learn to enjoy working the answer out for themselves.",
        "تبدأ الدروس بسؤال، ويتعلّم الأطفال متعة الوصول إلى الإجابة بأنفسهم.",
      ],
      "lightbulb",
    ),
    pillar(
      b,
      ["Care", "الرعاية"],
      [
        "Every child is known by name and by need, and no one is left to struggle quietly.",
        "يُعرف كل طفل باسمه وبما يحتاج إليه، ولا يُترك أحد يعاني في صمت.",
      ],
      "heart",
    ),
    pillar(
      b,
      ["Ambition", "الطموح"],
      [
        "High expectations in every subject, with the support each child needs to reach them.",
        "توقّعات عالية في كل مادة، مع الدعم الذي يحتاجه كل طفل ليبلغها.",
      ],
      "star",
    ),
    pillar(
      b,
      ["Belonging", "الانتماء"],
      [
        "Families, students and staff work as one community, and every voice is heard.",
        "تعمل الأسر والطلاب والمعلّمون مجتمعًا واحدًا يُسمع فيه كل صوت.",
      ],
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
        [
          "Small classes, so no child goes unnoticed.",
          "فصول صغيرة لا يغيب فيها طفل عن الأنظار.",
        ],
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
    b.w([
      "We began with a handful of classes in a converted family house: a few dozen children, and teachers who believed a school could be both demanding and kind.\nThe house is still at the heart of the campus, joined now by laboratories, a library and playing fields, and the belief has not changed. Many of our teachers have been with us for more than a decade, and some of today's parents were once our students.",
      "بدأنا ببضعة فصول في بيت عائلي مُجدَّد: عشرات من الأطفال، ومعلّمون آمنوا بأن المدرسة يمكن أن تكون متطلّبة ورحيمة في آن واحد.\nلا يزال ذلك البيت في قلب الحرم، وقد أحاطت به اليوم مختبرات ومكتبة وملاعب، أما الإيمان فلم يتغيّر. كثير من معلّمينا معنا منذ أكثر من عشر سنوات، وبعض أولياء الأمور اليوم كانوا يومًا طلابًا لدينا.",
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
    link(b, ["Book a visit", "احجزوا زيارة"], `/pages/visit#${ANCHOR.visit}`),
  ],
}));

// The nursery's own About, Admissions and Visit: rooms by age, the day,
// settling in and ratios, in the voice of a setting for children of 2 to 6.
const EY_ABOUT_WELCOME = section("welcome", "portraitStart", (b) => ({
  heading: b.w(["Welcome to our *nursery*", "أهلًا بكم في *روضتنا*"]),
  body: plainContent(
    b.w([
      "Starting nursery is a big step, for children and for their parents. We have spent more than ten years learning how to make that step feel small: a key person who comes to know your child almost as well as you do, rooms that feel like home and a garden that is never more than a door away.\nWe would love you to see it for yourself. Come to a stay-and-play morning with your little one, and stay as long as you like.",
      "بدء الروضة خطوة كبيرة للأطفال ولأسرهم معًا. وقد أمضينا أكثر من عشر سنوات نتعلّم كيف نجعل هذه الخطوة تبدو صغيرة: مربية رئيسية تعرف طفلكم كما تعرفونه تقريبًا، وغرف تشبه البيت، وحديقة لا يفصلها عن الأطفال سوى باب.\nيسعدنا أن تروا ذلك بأنفسكم. تعالوا مع صغيركم إلى صباح لعب مفتوح، وابقوا ما شئتم.",
    ]),
  ),
  portrait: noImage,
  name: b.w(["Rania Kamal", "رانيا كمال"]),
  role: b.w(["Head of nursery", "مديرة الروضة"]),
}));

const room = (b: Builder, title: Words, ages: Words, text: Words) => ({
  id: b.id(),
  title: b.w(title),
  ages: b.w(ages),
  text: b.w(text),
  image: noImage,
  href: "",
});

const EY_ROOMS = section("divisions", "tall", (b) => ({
  heading: b.w(["Four rooms, one *family*", "أربع غرف وأسرة *واحدة*"]),
  text: b.w([
    "Children move up a room each September, with their friends and familiar faces beside them.",
    "ينتقل الأطفال إلى الغرفة التالية كل سبتمبر، ومعهم أصدقاؤهم ووجوه يعرفونها.",
  ]),
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
      [
        "Letters, numbers and the confidence to start big school, ready for Grade 1.",
        "الحروف والأعداد والثقة اللازمة لبدء المدرسة، استعدادًا للصف الأول.",
      ],
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
      [
        "A warm welcome from your child's key person, and breakfast together for early arrivals.",
        "تستقبل المربية الرئيسية طفلكم بابتسامة، ويتناول القادمون مبكرًا الإفطار معًا.",
      ],
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
      [
        "Collection with a note and a photo from the day. The extended day runs until 17:00.",
        "الاستلام مع ملاحظة وصورة من يوم طفلكم، ويستمر اليوم الممتد حتى الساعة 17:00.",
      ],
    ),
  ],
}));

const EY_PLAY = section("pillars", "icons", (b) => ({
  heading: b.w(["Learning through *play*", "التعلّم *باللعب*"]),
  text: b.w([
    "Young children learn best by doing, so our days are built around what they choose to do.",
    "يتعلّم الصغار على أفضل وجه حين يفعلون بأنفسهم، لذا نبني أيامنا حول ما يختارون فعله.",
  ]),
  items: [
    pillar(
      b,
      ["Following their interests", "نتبع اهتماماتهم"],
      [
        "If a child is fascinated by snails, the week fills with snails: counting them, drawing them, reading about them and building them a home.",
        "إذا شُغف طفل بالحلزونات امتلأ الأسبوع بها: يعدّها ويرسمها ويقرأ عنها ويبني لها بيتًا.",
      ],
      "leaf",
    ),
    pillar(
      b,
      ["Two languages, naturally", "لغتان بطريقة طبيعية"],
      [
        "Every room has an Arabic-speaking and an English-speaking adult, so children hear both all day and answer in whichever comes first.",
        "في كل غرفة مربية تتحدث العربية وأخرى تتحدث الإنجليزية، فيسمع الأطفال اللغتين طوال اليوم ويجيبون بأيّهما سبقت إلى ألسنتهم.",
      ],
      "book",
    ),
    pillar(
      b,
      ["Noticing every step", "نلاحظ كل خطوة"],
      [
        "Key persons watch, listen and note what each child can do, and share it with you in a photo and a short note every day.",
        "تراقب المربيات وتصغي وتدوّن ما يستطيع كل طفل فعله، وتشاركنه معكم بصورة وملاحظة قصيرة كل يوم.",
      ],
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
        [
          "adults to children aged 2 to 3",
          "نسبة الكبار إلى الأطفال من سنتين إلى ثلاث",
        ],
        [
          "Two adults with every group of eight toddlers.",
          "اثنان من الكبار مع كل ثمانية أطفال من البراعم.",
        ],
      ),
      figure(
        b,
        "1:8",
        [
          "adults to children aged 3 to 6",
          "نسبة الكبار إلى الأطفال من ثلاث إلى ست",
        ],
        [
          "A teacher and an assistant in every room of sixteen.",
          "معلّمة ومساعدة في كل غرفة من ستة عشر طفلًا.",
        ],
      ),
      figure(
        b,
        "16",
        ["children in a room, at most", "طفلًا في الغرفة كحدّ أقصى"],
        [
          "Small enough to feel like a family.",
          "عدد صغير يجعل الغرفة أشبه بأسرة.",
        ],
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
  text: b.w([
    "The care behind every happy day, written down in our policies and shared with every family.",
    "الرعاية التي تقف وراء كل يوم سعيد، مكتوبة في سياساتنا ومتاحة لكل أسرة.",
  ]),
  columns: "3" as const,
  items: [
    card(
      b,
      ["Safer recruitment", "تعيين آمن"],
      [
        "Every adult is checked and referenced before they join us, and trained in safeguarding every year.",
        "يخضع كل من يعمل معنا للتحقق والتزكية قبل انضمامه، ويتدرّب على حماية الطفل كل عام.",
      ],
      "award",
    ),
    card(
      b,
      ["Safe collection", "استلام آمن"],
      [
        "Children go home only with the adults you name, and a password covers any change on the day.",
        "لا يغادر الطفل إلا مع من تسمّونهم من الكبار، وتُستخدم كلمة سر لأي تغيير طارئ.",
      ],
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
      [
        "A quiet room with a cot for every child who naps, and an adult checking on them throughout.",
        "غرفة هادئة فيها سرير لكل طفل يأخذ قيلولة، وأحد الكبار يتفقّدهم طوال الوقت.",
      ],
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
  heading: b.w(["The people your child will *know*", "من سيعرفهم *طفلكم*"]),
  text: b.w([
    "Every child has a key person: the adult who settles them in, knows their routines and is your first point of contact.",
    "لكل طفل مربية رئيسية تتولّى تهيئته وتعرف روتينه، وهي أول من تتواصلون معه.",
  ]),
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

const session = (b: Builder, label: Words, value: Words, note: Words) => ({
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

const question = (b: Builder, title: Words, text: Words) => ({
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
    b.w([
      "Stay-and-play mornings run every Saturday from 9:30 to 11:00. Your child plays in the rooms and the garden alongside ours, while you see how a nursery day really works.\nWe finish with songs at circle time, then coffee with the head of nursery and time for your questions. Brothers and sisters are welcome, and buggies fit through every door.",
      "تُقام صباحات اللعب المفتوحة كل سبت من الساعة 9:30 حتى 11:00. يلعب طفلكم في الغرف والحديقة مع أطفالنا، بينما ترون كيف يمضي يوم الروضة فعلًا.\nنختم بالأغاني في حلقة الصباح، ثم قهوة مع مديرة الروضة ووقت لأسئلتكم. الإخوة مرحَّب بهم، وعربات الأطفال تمرّ من كل باب.",
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
    link(b, ["Book a morning", "احجزوا صباحًا"], `/pages/visit#${ANCHOR.visit}`),
  ],
}));

const step = (b: Builder, title: Words, text: Words) => ({
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
      [
        "We meet you at the garden gate, show you where to leave the buggy and introduce the room leaders.",
        "نستقبلكم عند بوابة الحديقة، ونريكم مكان عربة الطفل، ونعرّفكم إلى مشرفات الغرف.",
      ],
    ),
    step(
      b,
      ["Play together", "نلعب معًا"],
      [
        "Explore the rooms and the garden at your child's pace. Join in, or sit back and watch.",
        "استكشفوا الغرف والحديقة على إيقاع طفلكم. شاركوه اللعب أو اجلسوا وتابعوا.",
      ],
    ),
    step(
      b,
      ["Circle time", "حلقة الصباح"],
      [
        "Songs and a story in Arabic and English, so your child hears both.",
        "أغانٍ وقصة بالعربية والإنجليزية، ليسمع طفلكم اللغتين.",
      ],
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
    b.w([
      "Founders' mornings run every Saturday at 10:00 and last about an hour and a half. We start with coffee and the plans on the table, then walk the site in hard hats: the classrooms, the library and the playground as they take shape.\nFounding families have a say most families never get: the clubs we start with, the uniform, even the names of the houses. Bring your questions, and your ideas.",
      "تُقام صباحات المؤسِّسين كل سبت الساعة 10:00 وتستغرق نحو ساعة ونصف. نبدأ بالقهوة والمخطّطات على الطاولة، ثم نتجوّل في الموقع بخوذ السلامة بين الفصول والمكتبة والملعب وهي تكتمل أمام أعينكم.\nللأسر المؤسِّسة رأي لا يُتاح لغيرها: في الأندية التي نبدأ بها، وفي الزيّ المدرسي، بل وفي أسماء البيوت المدرسية. أحضروا أسئلتكم وأفكاركم.",
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

const season = (b: Builder, when: Words, title: Words, text: Words) => ({
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
      [
        "Furniture and books arrive, and founding families see the finished rooms.",
        "يصل الأثاث والكتب، وتشاهد الأسر المؤسِّسة الغرف مكتملة.",
      ],
    ),
    season(
      b,
      ["September", "سبتمبر"],
      ["Doors open", "افتتاح الأبواب"],
      [
        "Our first children walk in, and the founding year begins.",
        "يدخل أطفالنا الأوائل، ويبدأ عام التأسيس.",
      ],
    ),
  ],
}));

const LAUNCH_LETTER = section("welcome", "portraitStart", (b) => ({
  heading: b.w([
    "A letter from the founding *principal*",
    "رسالة من *المديرة* المؤسِّسة",
  ]),
  body: plainContent(
    b.w([
      "Dear families,\nEvery school begins with a few families willing to trust an idea before there is a building to show them. If you are reading this, you may be one of them, and I would very much like to meet you.\nI have taught and led schools for twenty years, and this is the one I have always wanted to build: small enough for every child to be known, ambitious enough for every child to be stretched, and open to the families who make it.\nCome to a founders' morning and tell me what you hope for your child. Those conversations are shaping the school.\nWith warm wishes,",
      "أعزّاءنا أولياء الأمور،\nتبدأ كل مدرسة بأسر قليلة تثق بفكرة قبل أن يكون هناك مبنى تراه. إن كنتم تقرؤون هذه الكلمات فقد تكونون منهم، ويسعدني كثيرًا أن ألقاكم.\nعملتُ في التعليم وقيادة المدارس عشرين عامًا، وهذه هي المدرسة التي طالما تمنّيت أن أبنيها: صغيرة بما يكفي ليُعرف فيها كل طفل، وطموحة بما يكفي ليُتحدّى فيها كل طفل، ومفتوحة للأسر التي تصنعها.\nاحضروا صباح المؤسِّسين وحدّثوني عمّا تتمنّونه لطفلكم، فهذه الأحاديث هي التي تصنع المدرسة.\nمع خالص التحيات،",
    ]),
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
    on(INTL_VOICES, CANVAS),
    on(NEWS, SOFT),
    REGISTER_APPLY,
  ],
  homeAdmissions: [
    HERO_HOME,
    on(ADMISSIONS_TRIAD, BRAND),
    on(STEPS, CANVAS),
    on(STATS, SOFT),
    on(VOICES, CANVAS),
  ],
  // Young families: a warm split opening, this term's invitation, the
  // everyday links, how children learn, everyday moments, parents' words
  // and joining in clear steps; the footer's call to visit closes it.
  homeCommunity: [
    on(EY_HERO, SOFT),
    EY_NOTICE,
    on(EY_QUICK_LINKS, CANVAS),
    on(EY_LEARNING, { scheme: "soft", dividerTop: "wave" }),
    on(EY_STATS, { dividerTop: "wave" }),
    on(EY_GALLERY, CANVAS),
    on(EY_VOICES, { dividerTop: "wave" }),
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
    on(VOICES, SOFT, "tabs"),
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
      [
        "Who we are, how a day unfolds and how we keep every child safe, happy and learning.",
        "من نحن، وكيف يمضي اليوم، وكيف نحرص على أن يكون كل طفل آمنًا سعيدًا يتعلّم.",
      ],
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
      [
        "Tell us which mornings suit you and the year your child would join. We will confirm by email.",
        "أخبرنا بالأيام التي تناسبك والصف الذي سيلتحق به طفلك، وسنؤكد لك بالبريد الإلكتروني.",
      ],
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
      [
        "Bring your child to a stay-and-play morning. It is the easiest way for you both to get to know us.",
        "أحضروا طفلكم إلى صباح لعب مفتوح، فهو أسهل طريقة لتتعرّفوا إلينا معًا.",
      ],
    ),
    on(EY_STAY_AND_PLAY, CANVAS),
    on(EY_VISIT_STEPS, SOFT),
    on(
      FORM(
        "visit",
        ["Book your *morning*", "احجزوا *صباحكم*"],
        [
          "Tell us your child's age and which Saturday suits you. We will confirm by email, with directions.",
          "أخبرونا بعمر طفلكم والسبت الذي يناسبكم، وسنؤكّد لكم بالبريد الإلكتروني مع إرشادات الوصول.",
        ],
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
      [
        "Our doors open in September 2027. Until then, come to a founders' morning, see the plans and meet the people who will teach your child.",
        "تُفتح أبوابنا في سبتمبر 2027. وحتى ذلك الحين، احضروا أحد صباحات المؤسِّسين، واطّلعوا على المخطّطات، وقابلوا من سيعلّمون أطفالكم.",
      ],
    ),
    on(LAUNCH_MORNINGS, CANVAS),
    on(LAUNCH_PLANS, SOFT),
    on(LAUNCH_LETTER, CANVAS),
    FORM(
      "visit",
      ["Book a founders' *morning*", "احجزوا *صباح* المؤسِّسين"],
      [
        "Choose a Saturday and tell us the year your child would join. We will confirm by email, with directions to the site office.",
        "اختاروا يوم سبت وأخبرونا بالصف الذي سيلتحق به طفلكم، وسنؤكّد لكم بالبريد الإلكتروني مع إرشادات الوصول إلى مكتب الموقع.",
      ],
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
      [
        "We would love to hear from you, whether you are a family, a neighbour or a future colleague.",
        "يسعدنا أن نسمع منكم، أسرةً كنتم أو جيرانًا أو زملاء في المستقبل.",
      ],
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
} satisfies Record<string, ((b: Builder) => PageSection)[]>;
export type PageTemplate = keyof typeof PAGE_TEMPLATES;
export type SiteTemplate = PageTemplate;
export const PAGE_TEMPLATE_IDS = Object.keys(PAGE_TEMPLATES) as PageTemplate[];

/**
 * Builds a template in both languages with the same section and item ids,
 * so the second language lines up as a translation of the first.
 */
export function buildTemplate(
  template: PageTemplate,
  primary: SiteLocale,
): { content: PageSection[]; translation: PageSection[] } {
  const ids = Array.from({ length: 400 }, () => crypto.randomUUID());
  const build = (locale: SiteLocale) => {
    let cursor = 0;
    const b: Builder = {
      id: () => ids[cursor++] ?? crypto.randomUUID(),
      w: (words) => (locale === "ar" ? words[1] : words[0]),
    };
    return PAGE_TEMPLATES[template].map((make) => make(b));
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
}

export interface Starter {
  theme: ThemeId;
  pages: StarterPage[];
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
};
const CONTACT_PAGE: StarterPage = {
  slug: "contact",
  title: ["Contact", "تواصل معنا"],
  template: "contact",
};
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
} satisfies Record<string, Starter>;
export type StarterId = keyof typeof STARTERS;
export const STARTER_IDS = Object.keys(STARTERS) as StarterId[];

/** The frame a starter site comes with: the admissions actions and a sitemap footer. */
const freshId = () => crypto.randomUUID();

/** The pages a family weighing the school looks for, which the footer gathers under "Join us". */
const JOINING = new Set(["admissions", "visit", "contact"]);

export function starterChrome(pages: StarterPage[]): SiteChrome {
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
    actions: [
      {
        id: freshId(),
        label: { en: "Enquire", ar: "استفسر" },
        href: target("admissions", ANCHOR.enquiry),
        style: "secondary",
      },
      {
        id: freshId(),
        label: { en: "Book a visit", ar: "احجز زيارة" },
        href: target("visit", ANCHOR.visit),
        style: "secondary",
      },
      {
        id: freshId(),
        label: { en: "Apply", ar: "قدّم الآن" },
        href: target("admissions", ANCHOR.apply),
        style: "primary",
      },
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
