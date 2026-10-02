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
  hint,
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
        hint: "",
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
          hint: "",
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
          hint: "",
          explanation: "",
          tries: null,
          wordLimit: null,
        },
      ];
    },
  },
];
