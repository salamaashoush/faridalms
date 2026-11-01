import type {
  IconId,
  PageSection,
  PortalDoor,
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

const REGISTER_APPLY = section("registerApply", "banner", (b) => ({
  eyebrow: b.w(["Admissions", "القبول"]),
  heading: b.w(["Ready to apply?", "هل أنتم مستعدون للتقديم؟"]),
  text: b.w([
    "Register as a family once, then apply for each child and come back to the application whenever you like.",
    "سجّلوا أسرتكم مرة واحدة، ثم قدّموا لكل طفل وعودوا إلى الطلب متى شئتم.",
  ]),
  intake: "",
  button: b.w(["Register and apply", "سجّل وقدّم"]),
}));

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
        "Learning through play and discovery.",
        "التعلّم باللعب والاكتشاف.",
      ]),
      image: noImage,
      href: "/pages/academics",
    },
    {
      id: b.id(),
      title: b.w(["Primary", "الابتدائية"]),
      ages: b.w(["Ages 5 to 11", "من ٥ إلى ١١ سنة"]),
      text: b.w([
        "Strong foundations in every subject.",
        "أسس متينة في كل مادة.",
      ]),
      image: noImage,
      href: "/pages/academics",
    },
    {
      id: b.id(),
      title: b.w(["Secondary", "الثانوية"]),
      ages: b.w(["Ages 11 to 18", "من ١١ إلى ١٨ سنة"]),
      text: b.w([
        "Ambitious study towards university.",
        "دراسة طموحة نحو الجامعة.",
      ]),
      image: noImage,
      href: "/pages/academics",
    },
  ],
}));

const WELCOME = section("welcome", "portraitStart", (b) => ({
  heading: b.w(["A welcome from our principal", "كلمة المدير"]),
  body: plainContent(
    b.w([
      "Thank you for your interest in our school. We are a community where curiosity is encouraged and kindness is expected.\nWe look forward to welcoming your family.",
      "شكرًا لاهتمامكم بمدرستنا. نحن مجتمع يشجّع الفضول ويتوقّع اللطف من الجميع.\nنتطلّع إلى الترحيب بأسرتكم.",
    ]),
  ),
  portrait: noImage,
  name: b.w(["The Principal", "مدير المدرسة"]),
  role: b.w(["Principal", "المدير"]),
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
          "My children run in every morning.",
          "يدخل أطفالي المدرسة كل صباح وهم متحمّسون.",
        ]),
        name: b.w(["A parent", "وليّ أمر"]),
        role: b.w(["Parent of two", "أب لطفلين"]),
        audience: "parent" as const,
        portrait: noImage,
      },
      {
        id: b.id(),
        quote: b.w([
          "Teachers here really listen.",
          "المعلّمون هنا يستمعون حقًا.",
        ]),
        name: b.w(["A student", "طالبة"]),
        role: b.w(["Grade 10", "الصف العاشر"]),
        audience: "student" as const,
        portrait: noImage,
      },
      {
        id: b.id(),
        quote: b.w([
          "A place where I grow as a teacher.",
          "مكان أنمو فيه كمعلّم.",
        ]),
        name: b.w(["A teacher", "معلّم"]),
        role: b.w(["Science department", "قسم العلوم"]),
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
      text: b.w(["We ask good questions.", "نطرح الأسئلة الجيدة."]),
      icon: "lightbulb" as const,
      image: noImage,
    },
    {
      id: b.id(),
      title: b.w(["Kindness", "اللطف"]),
      text: b.w(["We look after each other.", "يهتمّ بعضنا ببعض."]),
      icon: "heart" as const,
      image: noImage,
    },
    {
      id: b.id(),
      title: b.w(["Excellence", "التميّز"]),
      text: b.w(["We aim high in all we do.", "نطمح عاليًا في كل ما نفعل."]),
      icon: "star" as const,
      image: noImage,
    },
    {
      id: b.id(),
      title: b.w(["Community", "المجتمع"]),
      text: b.w(["We learn together.", "نتعلّم معًا."]),
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
      text: b.w(["Tell us about your child.", "أخبرنا عن طفلك."]),
    },
    {
      id: b.id(),
      title: b.w(["Visit", "زُرنا"]),
      text: b.w(["Tour the school and meet us.", "تجوّل في المدرسة وقابلنا."]),
    },
    {
      id: b.id(),
      title: b.w(["Assessment", "التقييم"]),
      text: b.w(["A friendly meeting and assessment.", "لقاء وتقييم ودّيان."]),
    },
    {
      id: b.id(),
      title: b.w(["Offer", "القبول"]),
      text: b.w(["We confirm your child's place.", "نؤكّد مقعد طفلك."]),
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
        "Doors open at 7:30 and lessons begin at 8:00.",
        "تُفتح الأبواب الساعة ٧:٣٠ وتبدأ الحصص الساعة ٨:٠٠.",
      ]),
    },
    {
      id: b.id(),
      title: b.w(["Is there a bus service?", "هل توجد حافلات؟"]),
      text: b.w([
        "Yes, buses cover most of the city.",
        "نعم، تغطي الحافلات معظم أنحاء المدينة.",
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
      text: "",
      icon: "calendar" as const,
      href: "/news",
    },
    {
      id: b.id(),
      title: b.w(["Uniform", "الزيّ المدرسي"]),
      text: "",
      icon: "shield" as const,
      href: "",
    },
    {
      id: b.id(),
      title: b.w(["Transport", "المواصلات"]),
      text: "",
      icon: "bus" as const,
      href: "",
    },
    {
      id: b.id(),
      title: b.w(["Lunch menu", "قائمة الغداء"]),
      text: "",
      icon: "utensils" as const,
      href: "",
    },
  ],
}));

const CARDS_PROGRAMMES = section("cards", "icons", (b) => ({
  heading: b.w(["Learning here", "التعلّم هنا"]),
  text: "",
  columns: "3" as const,
  items: [
    card(
      b,
      ["Languages", "اللغات"],
      [
        "Arabic, English and French from the early years.",
        "العربية والإنجليزية والفرنسية منذ السنوات الأولى.",
      ],
      "globe",
    ),
    card(
      b,
      ["Science and technology", "العلوم والتقنية"],
      ["Laboratories, robotics and coding.", "مختبرات وروبوتات وبرمجة."],
      "flask",
    ),
    card(
      b,
      ["Arts and sport", "الفنون والرياضة"],
      [
        "Music, drama, art and a full sports programme.",
        "موسيقى ومسرح وفنون وبرنامج رياضي متكامل.",
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
      "More than sixty activities each week, from robotics to choir.",
      "أكثر من ستين نشاطًا كل أسبوع، من الروبوتات إلى الكورال.",
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
      ["Opened with forty pupils.", "افتُتحت بأربعين طالبًا."],
    ),
    milestone(
      b,
      "2010",
      ["Secondary opens", "افتتاح الثانوية"],
      ["Our first graduates.", "أول دفعة من الخريجين."],
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
      submit: b.w(["Send", "أرسل"]),
      thanks: b.w([
        "Thank you. We will reply within two working days.",
        "شكرًا لك. سنرد خلال يومي عمل.",
      ]),
    }),
    { scheme: "soft" },
  );

const ENQUIRY_FORM = FORM(
  "enquiry",
  ["Ask us anything", "اسألنا عن أي شيء"],
  [
    "Tell us a little about your child and we will be in touch.",
    "أخبرنا قليلًا عن طفلك وسنتواصل معك.",
  ],
);

const SIGN_IN = section(
  "signIn",
  "panel",
  (b) => ({
    eyebrow: b.w(["Families, students and staff", "الأسر والطلاب والموظفون"]),
    heading: b.w(["Sign in", "تسجيل الدخول"]),
    text: b.w([
      "Use the email or sign-in name you received from the school.",
      "استخدم البريد الإلكتروني أو اسم الدخول الذي حصلت عليه من المدرسة.",
    ]),
    points: [
      {
        id: b.id(),
        icon: "book" as const,
        title: b.w(["Learning", "التعلم"]),
        text: b.w([
          "Lessons, homework and feedback in one place.",
          "الدروس والواجبات والملاحظات في مكان واحد.",
        ]),
      },
      {
        id: b.id(),
        icon: "users" as const,
        title: b.w(["Families", "الأسر"]),
        text: b.w([
          "Messages, reports and news from the school.",
          "الرسائل والتقارير وأخبار المدرسة.",
        ]),
      },
      {
        id: b.id(),
        icon: "globe" as const,
        title: b.w(["English and Arabic", "العربية والإنجليزية"]),
        text: b.w([
          "Read everything in the language you choose.",
          "اقرأ كل شيء باللغة التي تختارها.",
        ]),
      },
    ],
  }),
  { scheme: "canvas" },
);

const REGISTER = section(
  "register",
  "panel",
  (b) => ({
    eyebrow: b.w(["Admissions", "القبول"]),
    heading: b.w(["Register to apply", "سجّل للتقديم"]),
    text: b.w([
      "Create your family's account once. You can then start an application, save it and come back to it.",
      "أنشئ حساب أسرتك مرة واحدة، ثم ابدأ طلب الالتحاق واحفظه وعد إليه متى شئت.",
    ]),
  }),
  { scheme: "canvas" },
);

const APPLY = section(
  "apply",
  "stacked",
  (b) => ({
    eyebrow: b.w(["Admissions", "القبول"]),
    heading: b.w(["Apply for a place", "التقديم لطلب مقعد"]),
    text: b.w([
      "Your application is saved as you go, so you can stop and finish it later.",
      "يُحفظ طلبك أولًا بأول، فيمكنك التوقف وإكماله لاحقًا.",
    ]),
  }),
  { scheme: "canvas" },
);

const SIGN_IN_HELP = section("contact", "details", (b) => ({
  heading: b.w(["Need help signing in?", "تحتاج إلى مساعدة في الدخول؟"]),
  text: b.w([
    "The school office can send you a new link or tell you your sign-in name.",
    "يمكن لمكتب المدرسة أن يرسل إليك رابطًا جديدًا أو أن يخبرك باسم الدخول.",
  ]),
  mapHref: "",
}));

const APPLY_HELP = section("contact", "details", (b) => ({
  heading: b.w(["Questions about applying?", "أسئلة عن التقديم؟"]),
  text: b.w([
    "The admissions office is happy to help with the form or the documents.",
    "يسعد مكتب القبول بالمساعدة في الاستمارة أو المستندات.",
  ]),
  mapHref: "",
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
  signIn: SIGN_IN,
  register: REGISTER,
  apply: APPLY,
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

export const PAGE_TEMPLATES = {
  blank: [],
  homeClassic: [HERO_HOME, STATS, DIVISIONS, WELCOME, ADMISSIONS_TRIAD, NEWS],
  homeStory: [HERO_HOME, PILLARS, VOICES, DIVISIONS, NEWS, ADMISSIONS_TRIAD],
  homeAdmissions: [HERO_HOME, ADMISSIONS_TRIAD, STEPS, STATS, VOICES],
  homeCommunity: [SLIDES, QUICK_LINKS, NEWS, VOICES, CONTACT],
  about: [
    PAGE_HEADER(
      ["About us", "من نحن"],
      ["Our story, our values and our people.", "قصتنا وقيمنا وأهلنا."],
    ),
    WELCOME,
    PILLARS,
    STATS,
  ],
  admissions: [
    PAGE_HEADER(
      ["Admissions", "القبول"],
      ["Joining us is simple.", "الالتحاق بنا سهل."],
    ),
    STEPS,
    ADMISSIONS_INTAKES,
    REGISTER_APPLY,
    FAQ,
    ENQUIRY_FORM,
  ],
  visit: [
    PAGE_HEADER(
      ["Visit us", "زُرنا"],
      ["Come and see a school day.", "تعال وشاهد يومًا دراسيًا."],
    ),
    TEXT(
      ["Open mornings", "أيام الأبواب المفتوحة"],
      ["Join a tour led by our students.", "انضم إلى جولة يقودها طلابنا."],
    ),
    FORM(
      "visit",
      ["Book a visit", "احجز زيارة"],
      [
        "Choose a morning that suits you and we will confirm by email.",
        "اختر صباحًا يناسبك وسنؤكد لك بالبريد الإلكتروني.",
      ],
    ),
    CONTACT,
  ],
  academics: [
    PAGE_HEADER(
      ["Academics", "المسار الأكاديمي"],
      ["A curriculum that stretches every learner.", "منهج يتحدّى كل متعلّم."],
    ),
    CARDS_PROGRAMMES,
    DIVISIONS,
  ],
  parents: [
    PAGE_HEADER(
      ["Parents", "أولياء الأمور"],
      [
        "Everything families need, in one place.",
        "كل ما تحتاجه الأسر في مكان واحد.",
      ],
    ),
    QUICK_LINKS,
    NEWS,
  ],
  contact: [
    PAGE_HEADER(
      ["Contact", "تواصل معنا"],
      ["We would love to hear from you.", "يسعدنا أن نسمع منكم."],
    ),
    CONTACT,
    FORM(
      "general",
      ["Send us a message", "أرسل لنا رسالة"],
      ["We read every message.", "نقرأ كل رسالة."],
    ),
    FAQ,
  ],
  portal: [SIGN_IN, SIGN_IN_HELP],
  portalRegister: [REGISTER, APPLY_HELP],
  portalApply: [APPLY, APPLY_HELP],
} satisfies Record<string, ((b: Builder) => PageSection)[]>;
export type PageTemplate = keyof typeof PAGE_TEMPLATES;
/** A template a website page starts from; the portal page has its own. */
const PORTAL_TEMPLATES = ["portal", "portalRegister", "portalApply"] as const;
export type SiteTemplate = Exclude<
  PageTemplate,
  (typeof PORTAL_TEMPLATES)[number]
>;
export const PAGE_TEMPLATE_IDS = (
  Object.keys(PAGE_TEMPLATES) as PageTemplate[]
).filter(
  (template): template is SiteTemplate =>
    !(PORTAL_TEMPLATES as readonly string[]).includes(template),
);

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

/**
 * The portal's sign-in page every school starts with: the form among a few
 * of the school's own words, which the portal shows until the school
 * publishes its own.
 */
export const PORTAL_PAGE: StarterPage = {
  slug: "sign-in",
  title: ["Sign in", "تسجيل الدخول"],
  template: "portal",
};

/** The starter page of each door of the portal, which strangers see until the school publishes its own. */
export const PORTAL_PAGES: Record<PortalDoor, StarterPage> = {
  "sign-in": PORTAL_PAGE,
  register: {
    slug: "register",
    title: ["Register", "التسجيل"],
    template: "portalRegister",
  },
  apply: {
    slug: "apply",
    title: ["Apply", "التقديم"],
    template: "portalApply",
  },
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
    pages: [HOME, ABOUT, ACADEMICS, ADMISSIONS, VISIT, PARENTS, CONTACT_PAGE],
  },
  launch: {
    theme: "editorial",
    pages: [
      { ...HOME, template: "homeAdmissions" },
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

export function starterChrome(pages: StarterPage[]): SiteChrome {
  const has = (slug: string) => pages.some((page) => page.slug === slug);
  const target = (slug: string) =>
    has(slug) ? `/pages/${slug}` : "/pages/contact";
  return {
    utility: [
      { id: freshId(), label: { en: "News", ar: "الأخبار" }, href: "/news" },
      {
        id: freshId(),
        label: { en: "Contact", ar: "تواصل معنا" },
        href: target("contact"),
      },
    ],
    actions: [
      {
        id: freshId(),
        label: { en: "Enquire", ar: "استفسر" },
        href: target("admissions"),
        style: "secondary",
      },
      {
        id: freshId(),
        label: { en: "Visit", ar: "زُرنا" },
        href: target("visit"),
        style: "secondary",
      },
      {
        id: freshId(),
        label: { en: "Apply", ar: "قدّم الآن" },
        href: target("admissions"),
        style: "primary",
      },
    ],
    footerColumns: [
      {
        id: freshId(),
        title: { en: "School", ar: "المدرسة" },
        links: pages
          .filter((page) => !page.home)
          .slice(0, 6)
          .map((page) => ({
            id: freshId(),
            label: { en: page.title[0], ar: page.title[1] },
            href: `/pages/${page.slug}`,
          })),
      },
    ],
    footerNote: { en: "", ar: "" },
    dock: true,
  };
}
