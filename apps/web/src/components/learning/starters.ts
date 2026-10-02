import type { LessonBlock, Picture } from "@faridalms/domain/learning";
import type { PictureSource } from "@faridalms/domain/library";

import * as m from "~/i18n/messages";

/**
 * Ready-made activities for young children, one of each kind a lesson
 * offers, to start from rather than an empty page. Their words come in both
 * languages, Arabic with its vowel marks so a voice can read it; their
 * pictures come from the open library and are copied into the school when a
 * starter is used.
 */

type Text = { en: string; ar: string };
type Locale = "en" | "ar";

interface LibraryRef {
  source: PictureSource;
  id: string;
  alt: Text;
}

export interface Starter {
  key: string;
  title: () => string;
  pictures: LibraryRef[];
  blocks: (
    say: (text: Text) => string,
    picture: (index: number) => Picture,
  ) => LessonBlock[];
}

const ref = (id: string, en: string, ar: string): LibraryRef => ({
  source: "arasaac",
  id,
  alt: { en, ar },
});

const id = () => crypto.randomUUID();
const ask = {
  points: 0,
  hint: "",
  explanation: "",
  tries: null,
};

const APPLE = ref("2462", "apple", "تُفَّاحٌ");
const CAR = ref("2339", "car", "سَيَّارَةٌ");
const CHAIR = ref("3155", "chair", "كُرْسِيٌّ");
const DUCK = ref("2563", "duck", "بَطَّةٌ");
const COW = ref("2609", "cow", "بَقَرَةٌ");
const MILK = ref("2445", "milk", "حَلِيبٌ");
const BEE = ref("2239", "bee", "نَحْلَةٌ");
const HONEY = ref("2911", "honey", "عَسَلٌ");
const HEN = ref("2403", "hen", "دَجَاجَةٌ");
const EGG = ref("2427", "egg", "بَيْضٌ");
const BANANA = ref("2530", "banana", "مَوْزٌ");
const GRAPES = ref("3247", "grapes", "عِنَبٌ");
const CARROT = ref("2619", "carrot", "جَزَرٌ");
const POTATO = ref("2503", "potato", "بَطَاطِسُ");
const CUCUMBER = ref("2847", "cucumber", "خِيَارٌ");

export const STARTERS: Starter[] = [
  {
    key: "choice",
    title: m.starterChoice,
    pictures: [APPLE, CAR, CHAIR],
    blocks: (say, picture) => {
      const options = [APPLE, CAR, CHAIR].map((item, index) => ({
        id: id(),
        text: say(item.alt),
        picture: picture(index),
        feedback: "",
      }));
      return [
        {
          ...ask,
          id: id(),
          type: "choice",
          prompt: say({ en: "Which one is a fruit?", ar: "أَيُّهَا فَاكِهَةٌ؟" }),
          options,
          correctOptionIds: [options[0]?.id ?? ""],
          multiple: false,
          shuffle: true,
        },
      ];
    },
  },
  {
    key: "counting",
    title: m.starterCounting,
    pictures: [DUCK],
    blocks: (say, picture) => [
      {
        ...ask,
        id: id(),
        type: "counting",
        prompt: say({ en: "How many ducks?", ar: "كَمْ بَطَّةً؟" }),
        picture: picture(0),
        count: 3,
        mode: "count",
        layout: "scatter",
        flashSeconds: null,
      },
    ],
  },
  {
    key: "memory",
    title: m.starterMemory,
    pictures: [COW, MILK, BEE, HONEY, HEN, EGG],
    blocks: (say, picture) => [
      {
        ...ask,
        id: id(),
        type: "matching",
        memory: true,
        prompt: say({
          en: "Find what each animal gives us.",
          ar: "لِنَجِدْ مَا يُعْطِينَا كُلُّ حَيَوَانٍ.",
        }),
        pairs: [
          [COW, MILK],
          [BEE, HONEY],
          [HEN, EGG],
        ].map(([animal, food], index) => ({
          id: id(),
          prompt: say(animal?.alt ?? { en: "", ar: "" }),
          promptPicture: picture(index * 2),
          answer: say(food?.alt ?? { en: "", ar: "" }),
          answerPicture: picture(index * 2 + 1),
        })),
        distractors: [],
      },
    ],
  },
  {
    key: "sorting",
    title: m.starterSorting,
    pictures: [APPLE, BANANA, GRAPES, CARROT, POTATO, CUCUMBER],
    blocks: (say, picture) => {
      const fruit = { id: id(), name: say({ en: "Fruit", ar: "فَاكِهَةٌ" }) };
      const vegetables = {
        id: id(),
        name: say({ en: "Vegetables", ar: "خُضَارٌ" }),
      };
      return [
        {
          ...ask,
          id: id(),
          type: "sorting",
          prompt: say({
            en: "Put each one in its group.",
            ar: "لِنَضَعْ كُلَّ وَاحِدٍ فِي مَجْمُوعَتِهِ.",
          }),
          groups: [fruit, vegetables],
          items: [APPLE, BANANA, GRAPES, CARROT, POTATO, CUCUMBER].map(
            (item, index) => ({
              id: id(),
              text: say(item.alt),
              picture: picture(index),
              groupId: index < 3 ? fruit.id : vegetables.id,
            }),
          ),
        },
      ];
    },
  },
  {
    key: "tracing",
    title: m.starterTracing,
    pictures: [],
    blocks: (say) => [
      {
        ...ask,
        id: id(),
        type: "tracing",
        prompt: say({ en: "Write the number 1.", ar: "لِنَكْتُبِ الرَّقْمَ ١." }),
        // One straight stroke from the top down, as both 1 and ١ are written.
        strokes: [
          Array.from({ length: 8 }, (_, index) => [
            0.5,
            0.15 + index * 0.1,
          ]).flat(),
        ],
      },
    ],
  },
  {
    key: "spelling",
    title: m.starterSpelling,
    pictures: [DUCK],
    blocks: (say, picture) => [
      {
        ...ask,
        id: id(),
        type: "spelling",
        prompt: say({
          en: "Build the word duck.",
          ar: "لِنَبْنِ كَلِمَةَ بَطَّةٍ.",
        }),
        picture: picture(0),
        tiles: say({ en: "d u ck", ar: "بَ طَّ ةٌ" }).split(" "),
        extras: say({ en: "b o", ar: "تَ سَ" }).split(" "),
      },
    ],
  },
  {
    key: "drawing",
    title: m.starterDrawing,
    pictures: [],
    blocks: (say) => [
      {
        ...ask,
        id: id(),
        type: "written",
        prompt: say({ en: "Draw your family.", ar: "لِنَرْسُمْ عَائِلَتَنَا." }),
        wordLimit: null,
        answerWith: "drawing",
      },
    ],
  },
];

/** The words of a starter in the teacher's language. */
export const sayIn = (locale: Locale) => (text: Text) =>
  locale === "ar" ? text.ar : text.en;

export const altIn = (locale: Locale, picture: LibraryRef) =>
  sayIn(locale)(picture.alt);
