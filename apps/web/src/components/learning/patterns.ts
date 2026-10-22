import type { LessonBlock } from "@faridalms/domain/learning";

import {
  headedContent,
  plainContent,
} from "@faridalms/domain/content-conversion";

import * as m from "~/i18n/messages";

/**
 * Lessons laid out in a shape the research backs, filled with a worked
 * sample the teacher writes over: a worked example whose steps open one at
 * a time, then one step to finish and a problem alone (worked examples in
 * maths g = 0.48; the IES maths guide fades them), and a prediction asked
 * before the answer is shown (prequestions g = 0.66 on the idea asked).
 * Read, check, reflect asks about a passage straight after it is read and
 * ends with the student explaining it in their own words: practice testing,
 * which Dunlosky and colleagues (2013) rate highly useful, then
 * self-explanation, which they rate moderately so. Watch and answer breaks a video with questions where
 * they matter, which keeps minds on it (Szpunar and colleagues, 2013).
 * Listen, choose, record suits children who do not read yet: they hear the
 * teacher, answer by tapping, then answer aloud.
 * Arabic numbers sit between words rather than in equations, which a
 * right-to-left line would reverse.
 */

type Text = { en: string; ar: string };

export interface Pattern {
  key: string;
  title: () => string;
  hint: () => string;
  blocks: (say: (text: Text) => string) => LessonBlock[];
}

const id = () => crypto.randomUUID();

const part = (heading: string, ...lines: string[]): LessonBlock => {
  const body = plainContent(lines.join("\n"));
  return {
    id: id(),
    type: "content",
    content: headedContent([
      {
        heading,
        body: lines.length ? body : { root: { ...body.root, children: [] } },
      },
    ]),
  };
};

const gate = (): LessonBlock => ({ id: id(), type: "gate", requires: "above" });

const number = (
  prompt: string,
  value: number,
  hint: string,
  explanation: string,
): LessonBlock => ({
  id: id(),
  type: "number",
  prompt,
  points: 1,
  hints: [hint],
  explanation,
  tries: null,
  mode: "exact",
  value,
  tolerance: 0,
  percent: false,
  min: 0,
  max: 0,
});

export const PATTERNS: Pattern[] = [
  {
    key: "worked-example",
    title: m.patternWorked,
    hint: m.patternWorkedHint,
    blocks: (say) => [
      part(
        say({ en: "Watch it done", ar: "شاهد الحل" }),
        say({
          en: "A shirt costs 200 and has 25% off. How much do you pay?",
          ar: "ثمن قميص 200، وعليه خصم 25٪. كم تدفع؟",
        }),
        say({
          en: "Step 1. Find the discount. 25% is a quarter, and a quarter of 200 is 50.",
          ar: "الخطوة الأولى: احسب الخصم. 25٪ هي الربع، وربع 200 هو 50.",
        }),
      ),
      gate(),
      part(
        "",
        say({
          en: "Step 2. Take the discount off the price: 200 − 50 = 150. You pay 150.",
          ar: "الخطوة الثانية: اطرح الخصم من الثمن. يبقى 150 بعد طرح 50 من 200، فتدفع 150.",
        }),
        say({
          en: "Check: 150 is three quarters of 200, and 100% − 25% = 75%.",
          ar: "تحقّق: 150 هي ثلاثة أرباع 200، والباقي بعد خصم 25٪ هو 75٪.",
        }),
      ),
      gate(),
      part(
        say({ en: "Finish this one", ar: "أكمل هذا" }),
        say({
          en: "A bag costs 80 and has 10% off. Step 1 is done: 10% of 80 is 8.",
          ar: "ثمن حقيبة 80، وعليها خصم 10٪. الخطوة الأولى محلولة: 10٪ من 80 هي 8.",
        }),
      ),
      number(
        say({
          en: "Do step 2. How much do you pay for the bag?",
          ar: "نفّذ الخطوة الثانية. كم تدفع ثمن الحقيبة؟",
        }),
        72,
        say({
          en: "Take the discount off the price.",
          ar: "اطرح الخصم من الثمن.",
        }),
        say({
          en: "80 − 8 = 72, so you pay 72.",
          ar: "يبقى 72 بعد طرح 8 من 80، فتدفع 72.",
        }),
      ),
      part(say({ en: "Your turn", ar: "دورك" })),
      number(
        say({
          en: "A game costs 120 and has 25% off. How much do you pay?",
          ar: "ثمن لعبة 120، وعليها خصم 25٪. كم تدفع؟",
        }),
        90,
        say({
          en: "Start by finding a quarter of 120.",
          ar: "ابدأ بإيجاد ربع 120.",
        }),
        say({
          en: "A quarter of 120 is 30, and 120 − 30 = 90.",
          ar: "ربع 120 هو 30، ويبقى 90 بعد طرح 30 من 120.",
        }),
      ),
      {
        id: id(),
        type: "written",
        prompt: say({
          en: "If your answer were wrong, which step would you check first, and why?",
          ar: "لو كانت إجابتك خاطئة، فأيّ خطوة تراجع أولًا، ولماذا؟",
        }),
        points: 0,
        hints: [],
        explanation: "",
        tries: null,
        wordLimit: null,
      },
    ],
  },
  {
    key: "predict",
    title: m.patternPredict,
    hint: m.patternPredictHint,
    blocks: (say) => {
      const options = [
        say({ en: "The hammer", ar: "المطرقة" }),
        say({ en: "The feather", ar: "الريشة" }),
        say({ en: "They land together", ar: "تصلان معًا" }),
      ].map((text) => ({ id: id(), text, feedback: "" }));
      return [
        {
          id: id(),
          type: "choice",
          prompt: say({
            en: "On the Moon there is no air. An astronaut drops a hammer and a feather at the same moment. Which reaches the ground first? Guess before you find out.",
            ar: "لا هواء على سطح القمر. يُسقط رائد فضاء مطرقة وريشة في اللحظة نفسها. أيهما تصل إلى الأرض أولًا؟ خمّن قبل أن تعرف.",
          }),
          // A guess is not marked, and one try shows the answer.
          points: 0,
          hints: [],
          explanation: "",
          tries: 1,
          options,
          correctOptionIds: [options[2]?.id ?? ""],
          multiple: false,
          shuffle: false,
        },
        gate(),
        part(
          say({ en: "Find out", ar: "اكتشف" }),
          say({
            en: "In 1971 the astronaut David Scott tried this on the Moon, and the hammer and the feather landed together. Add the video of his drop here.",
            ar: "جرّب رائد الفضاء ديفيد سكوت ذلك على القمر عام 1971، فوصلت المطرقة والريشة معًا. أضف هنا فيديو التجربة.",
          }),
          say({
            en: "On Earth, air slows the feather. With no air, gravity pulls everything down at the same rate, whatever it weighs.",
            ar: "على الأرض يُبطئ الهواءُ الريشة. وحين لا يوجد هواء، تجذب الجاذبية كل شيء إلى الأسفل بالسرعة نفسها، مهما كان وزنه.",
          }),
        ),
        {
          id: id(),
          type: "written",
          prompt: say({
            en: "Was your guess right? Explain what happened in your own words.",
            ar: "هل كان تخمينك صحيحًا؟ اشرح ما حدث بكلماتك.",
          }),
          points: 0,
          hints: [],
          explanation: "",
          tries: null,
          wordLimit: null,
        },
      ];
    },
  },
  {
    key: "read-check-reflect",
    title: m.patternRead,
    hint: m.patternReadHint,
    blocks: (say) => {
      const options = [
        say({
          en: "Bees carry pollen from flower to flower",
          ar: "ينقل النحل حبوب اللقاح من زهرة إلى زهرة",
        }),
        say({ en: "Bees eat the flowers", ar: "يأكل النحل الأزهار" }),
        say({ en: "Bees keep flowers warm", ar: "يُدفئ النحل الأزهار" }),
      ].map((text) => ({ id: id(), text, feedback: "" }));
      return [
        part(
          say({ en: "Read", ar: "اقرأ" }),
          say({
            en: "Bees visit flowers to drink nectar. As they move, pollen sticks to their hairy bodies and rubs off on the next flower. That is how many plants make seeds. Replace this passage with your own.",
            ar: "يزور النحل الأزهار ليشرب الرحيق. وفي أثناء تنقّله تلتصق حبوب اللقاح بجسمه المغطّى بالشعر، ثم تسقط على الزهرة التالية. هكذا تصنع نباتات كثيرة بذورها. ضع نصّك مكان هذا النص.",
          }),
        ),
        {
          id: id(),
          type: "choice",
          prompt: say({
            en: "How do bees help plants make seeds?",
            ar: "كيف يساعد النحل النباتات على صنع البذور؟",
          }),
          points: 1,
          hints: [
            say({
              en: "Look at what sticks to a bee's body.",
              ar: "انظر إلى ما يلتصق بجسم النحلة.",
            }),
          ],
          explanation: say({
            en: "Pollen travels on the bee to the next flower.",
            ar: "تنتقل حبوب اللقاح على النحلة إلى الزهرة التالية.",
          }),
          tries: 2,
          options,
          correctOptionIds: [options[0]?.id ?? ""],
          multiple: false,
          shuffle: true,
        },
        gate(),
        part(say({ en: "Reflect", ar: "تأمّل" })),
        {
          id: id(),
          type: "written",
          prompt: say({
            en: "Explain in your own words why a garden with no bees might have fewer fruits.",
            ar: "اشرح بكلماتك لماذا قد تقلّ الثمار في حديقة لا نحل فيها.",
          }),
          points: 0,
          hints: [],
          explanation: "",
          tries: null,
          wordLimit: 100,
        },
      ];
    },
  },
  {
    key: "watch-answer",
    title: m.patternWatch,
    hint: m.patternWatchHint,
    blocks: (say) => {
      const options = [
        say({ en: "It melts", ar: "يذوب" }),
        say({ en: "It freezes", ar: "يتجمّد" }),
        say({ en: "It boils", ar: "يغلي" }),
      ].map((text) => ({ id: id(), text, feedback: "" }));
      return [
        part(
          say({ en: "Watch", ar: "شاهد" }),
          say({
            en: "Add your video here, from Insert. Then choose each question below and, from the video's bar, ask it at the moment it matters, so the video stops there.",
            ar: "أضف الفيديو هنا من «إدراج». ثم اختر كل سؤال أدناه، ومن شريط الفيديو اطرحه في اللحظة المناسبة، فيتوقف الفيديو عندها.",
          }),
        ),
        {
          id: id(),
          type: "choice",
          prompt: say({
            en: "What happens to ice when it warms above 0 °C?",
            ar: "ماذا يحدث للجليد حين ترتفع حرارته فوق الصفر المئوي؟",
          }),
          points: 1,
          hints: [],
          explanation: say({
            en: "Above its melting point, ice turns to water.",
            ar: "فوق درجة انصهاره يتحوّل الجليد إلى ماء.",
          }),
          tries: 2,
          options,
          correctOptionIds: [options[0]?.id ?? ""],
          multiple: false,
          shuffle: true,
        },
        {
          id: id(),
          type: "written",
          prompt: say({
            en: "What was the most surprising thing in the video? Say why.",
            ar: "ما أكثر ما فاجأك في الفيديو؟ قل لماذا.",
          }),
          points: 0,
          hints: [],
          explanation: "",
          tries: null,
          wordLimit: 80,
        },
      ];
    },
  },
  {
    key: "listen-choose-record",
    title: m.patternListen,
    hint: m.patternListenHint,
    blocks: (say) => {
      const options = [
        say({ en: "A cat", ar: "قطة" }),
        say({ en: "A dog", ar: "كلب" }),
        say({ en: "A bird", ar: "طائر" }),
      ].map((text) => ({ id: id(), text, feedback: "" }));
      return [
        part(
          say({ en: "Listen", ar: "استمع" }),
          say({
            en: "Mia has a pet. It says meow and sleeps in the sun. Record yourself reading this aloud, from the block's bar, so children can listen.",
            ar: "لدى ميا حيوان أليف. يقول مياو وينام في الشمس. سجّل صوتك وأنت تقرأ هذا بصوت عالٍ من شريط الكتلة، ليستمع إليه الأطفال.",
          }),
        ),
        {
          id: id(),
          type: "choice",
          prompt: say({ en: "What is Mia's pet?", ar: "ما حيوان ميا الأليف؟" }),
          points: 1,
          hints: [],
          explanation: "",
          tries: null,
          options,
          correctOptionIds: [options[0]?.id ?? ""],
          multiple: false,
          shuffle: true,
        },
        {
          id: id(),
          type: "written",
          prompt: say({
            en: "Tell us about a pet you know.",
            ar: "حدّثنا عن حيوان أليف تعرفه.",
          }),
          points: 0,
          hints: [],
          explanation: "",
          tries: null,
          wordLimit: null,
          recordSeconds: 45,
        },
      ];
    },
  },
];
