import type { Database } from "@faridalms/database";
import type { PageDocument, SiteLocale } from "@faridalms/domain/site";

import { schema } from "@faridalms/database";
import { plainContent } from "@faridalms/domain/content-conversion";

const DAY = 24 * 60 * 60 * 1000;

function document(locale: SiteLocale, paragraphs: string[]): PageDocument {
  return {
    version: 1,
    locale,
    sections: [
      {
        id: crypto.randomUUID(),
        tone: "plain",
        columns: [
          {
            id: crypto.randomUUID(),
            blocks: paragraphs.map((text) => ({
              id: crypto.randomUUID(),
              type: "content" as const,
              content: plainContent(text),
            })),
          },
        ],
      },
    ],
  };
}

interface PageSeed {
  slug: string;
  locale: SiteLocale;
  title: string;
  summary: string;
  navGroup: string;
  navOrder: number;
  paragraphs: string[];
}

const PAGES: PageSeed[] = [
  {
    slug: "home",
    locale: "en",
    title: "Welcome to Northwind School",
    summary:
      "For the wellbeing of our students, their families and our community.",
    navGroup: "",
    navOrder: 0,
    paragraphs: [
      "Northwind School is a bilingual school in Cairo for children from pre-kindergarten to middle school.",
      "Admission is open for 2026/2027. Visit the admission pages to learn how to apply.",
    ],
  },
  {
    slug: "welcome-letter",
    locale: "en",
    title: "Welcome letter",
    summary: "A word from the head of school.",
    navGroup: "About us",
    navOrder: 1,
    paragraphs: [
      "Dear families, thank you for considering our school for your child.",
    ],
  },
  {
    slug: "vision-and-mission",
    locale: "en",
    title: "Vision and mission",
    summary: "What we believe and what we work towards.",
    navGroup: "About us",
    navOrder: 2,
    paragraphs: [
      "We believe every child deserves a joyful, rigorous education.",
    ],
  },
  {
    slug: "application-process",
    locale: "en",
    title: "Application process",
    summary: "How to apply, step by step.",
    navGroup: "Admission",
    navOrder: 1,
    paragraphs: [
      "Submit the online application, visit the campus, then meet the admission team.",
    ],
  },
  {
    slug: "faq",
    locale: "en",
    title: "Frequently asked questions",
    summary: "Answers to the questions families ask most.",
    navGroup: "Admission",
    navOrder: 2,
    paragraphs: ["School hours are 8:00 to 14:30, Sunday to Thursday."],
  },
  {
    slug: "home",
    locale: "ar",
    title: "مرحباً بكم في كلية غاما الدولية",
    summary: "من أجل رفاهية طلابنا وأسرهم ومجتمعنا.",
    navGroup: "",
    navOrder: 0,
    paragraphs: [
      "كلية غاما الدولية مدرسة ثنائية اللغة في القاهرة للأطفال من مرحلة ما قبل الروضة حتى المرحلة الإعدادية.",
    ],
  },
  {
    slug: "welcome-letter",
    locale: "ar",
    title: "رسالة ترحيب",
    summary: "كلمة من مدير المدرسة.",
    navGroup: "من نحن",
    navOrder: 1,
    paragraphs: ["أعزاءنا أولياء الأمور، شكراً لاختياركم مدرستنا لأبنائكم."],
  },
];

/** Public site content for a freshly seeded school. Safe to run once per database. */
export async function seedSite(db: Database, adminId: string) {
  const now = new Date();
  await db.insert(schema.siteSettings).values({
    slot: 1,
    tagline: "Learning for the wellbeing of every child",
    taglineAr: "التعلّم من أجل رفاهية كل طفل",
    primaryColor: "#0f766e",
    contactEmail: "admissions@example.com",
    contactPhone: "+20 100 000 0100",
    address: "12 Nile View, Maadi, Cairo",
    mapUrl: "https://maps.example.com/northwind",
    socialLinks: [
      { label: "Facebook", url: "https://facebook.com/example" },
      { label: "Instagram", url: "https://instagram.com/example" },
    ],
    defaultLocale: "en",
    isPublished: true,
    updatedById: adminId,
  });
  await db.insert(schema.sitePages).values(
    PAGES.map((page) => {
      const content = document(page.locale, page.paragraphs);
      return {
        id: crypto.randomUUID(),
        slug: page.slug,
        locale: page.locale,
        title: page.title,
        summary: page.summary,
        navGroup: page.navGroup,
        navOrder: page.navOrder,
        showInNav: true,
        document: content,
        published: {
          title: page.title,
          summary: page.summary,
          document: content,
        },
        status: "published" as const,
        revision: 2,
        publishedAt: now,
        authorId: adminId,
        updatedById: adminId,
      };
    }),
  );
  const [news, events] = await db
    .insert(schema.sitePostCategories)
    .values([
      {
        id: crypto.randomUUID(),
        slug: "news",
        name: "News",
        nameAr: "الأخبار",
        sortOrder: 1,
      },
      {
        id: crypto.randomUUID(),
        slug: "events",
        name: "Events",
        nameAr: "الفعاليات",
        sortOrder: 2,
      },
    ])
    .returning({ id: schema.sitePostCategories.id });
  if (!news || !events) throw new Error("site categories not seeded");
  const posts = [
    {
      slug: "admission-open-2026-2027",
      locale: "en" as const,
      title: "Admission open for 2026/2027",
      summary: "Applications for next year are now open.",
      categoryId: news.id,
      text: "We are accepting applications for all grades. Start with the online application and our admission team will be in touch.",
      publishAt: new Date(now.getTime() - 5 * DAY),
    },
    {
      slug: "family-day",
      locale: "en" as const,
      title: "Family day this Thursday",
      summary: "Games, food and music on the school field.",
      categoryId: events.id,
      text: "Bring the whole family. Gates open at 15:00 and the day ends at sunset.",
      publishAt: new Date(now.getTime() - 2 * DAY),
    },
    {
      slug: "reading-week-highlights",
      locale: "en" as const,
      title: "Reading week highlights",
      summary: "A look back at a week of stories.",
      categoryId: news.id,
      text: "Every class shared a favourite book. Photos to follow.",
      publishAt: null,
    },
    {
      slug: "admission-open-2026-2027",
      locale: "ar" as const,
      title: "فتح باب القبول لعام 2026/2027",
      summary: "التقديم للعام القادم متاح الآن.",
      categoryId: news.id,
      text: "نستقبل طلبات الالتحاق لجميع الصفوف. ابدأ بالطلب الإلكتروني وسيتواصل معك فريق القبول.",
      publishAt: new Date(now.getTime() - 5 * DAY),
    },
  ];
  for (const post of posts) {
    const id = crypto.randomUUID();
    const content = plainContent(post.text);
    const published = post.publishAt !== null;
    await db.insert(schema.sitePosts).values({
      id,
      slug: post.slug,
      locale: post.locale,
      title: post.title,
      summary: post.summary,
      document: content,
      categoryId: post.categoryId,
      coverFileId: null,
      authorId: adminId,
      updatedById: adminId,
      status: published ? "published" : "draft",
      revision: published ? 2 : 1,
      publishAt: post.publishAt,
      published: published
        ? {
            title: post.title,
            summary: post.summary,
            document: content,
            coverFileId: null,
          }
        : null,
    });
    await db.insert(schema.sitePostRevisions).values({
      postId: id,
      revision: 1,
      title: post.title,
      summary: post.summary,
      document: content,
      savedById: adminId,
    });
  }
}
