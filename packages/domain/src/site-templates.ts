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
      ages: b.w(["Ages 3 to 5", "من ٣ إلى ٥ سنوات"]),
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
      ages: b.w(["Ages 5 to 11", "من ٥ إلى ١١ سنة"]),
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
      ages: b.w(["Ages 11 to 18", "من ١١ إلى ١٨ سنة"]),
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
        "تُفتح الأبواب الساعة ٧:٣٠ وتبدأ الحصص الساعة ٨:٠٠. ينتهي اليوم الدراسي الساعة ١٤:٣٠، وتستمر الأندية حتى الساعة ١٦:٠٠.",
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
    "مكتبنا مفتوح من الأحد إلى الخميس، من ٧:٣٠ إلى ١٥:٣٠.",
  ]),
  mapHref: "",
}));

const CONTACT_MAP = section("contact", "map", (b) => ({
  heading: b.w(["Find *us*", "*موقعنا*"]),
  text: b.w([
    "Our office is open Sunday to Thursday, 7:30 to 15:30. Visitors sign in at the main gate.",
    "مكتبنا مفتوح من الأحد إلى الخميس، من ٧:٣٠ إلى ١٥:٣٠. يسجّل الزوّار دخولهم عند البوابة الرئيسية.",
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
      eyebrow: b.w(["Get in touch", "تواصل معنا"]),
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
  heading: b.w(["For our *families*", "*لأسرنا*"]),
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
    heading: b.w(["A day with *us*", "يوم *معنا*"]),
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
    "مدرسة دولية، من ٣ إلى ١٨ سنة",
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
    "أرقام العام الدراسي ٢٠٢٦–٢٠٢٧.",
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
        ages: b.w(["Ages 3 to 5", "من ٣ إلى ٥ سنوات"]),
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
        ages: b.w(["Ages 5 to 11", "من ٥ إلى ١١ سنة"]),
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
        ages: b.w(["Ages 11 to 14", "من ١١ إلى ١٤ سنة"]),
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
        ages: b.w(["Ages 14 to 18", "من ١٤ إلى ١٨ سنة"]),
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
        "خريجة دفعة ٢٠٢٤، تدرس الهندسة",
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
      "نتائج المدرسة، دفعة ٢٠٢٦.",
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
  // Bold and new: words before pictures, values in motion, then the proof.
  homeStatement: [
    on(HERO_HOME, CANVAS, "type"),
    on(PILLARS, { scheme: "accent", spacing: "s" }, "ticker"),
    on(VISIT_STORY, CANVAS, "overlap"),
    on(STATS, SOFT),
    on(QUOTE, { scheme: "ink", align: "start" }),
    on(NEWS, CANVAS, "list"),
    REGISTER_APPLY,
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
  about: [
    PAGE_HEADER(
      ["About *us*", "من *نحن*"],
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
    REGISTER_APPLY,
    on(FAQ, CANVAS),
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
  contact: [
    PAGE_HEADER(
      ["Contact *us*", "*تواصل* معنا"],
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
    on(FAQ, CANVAS),
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
    pages: [HOME, ABOUT, ACADEMICS, ADMISSIONS, VISIT, CONTACT_PAGE],
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
      ABOUT,
      ADMISSIONS,
      VISIT,
      PARENTS,
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
      VISIT,
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
