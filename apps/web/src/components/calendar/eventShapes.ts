import type { Section } from "~/components/content/shapes";

import * as m from "~/i18n/messages";

export interface EventShape {
  key: string;
  place: number;
  title: () => string;
  hint: () => string;
  sections: Section[];
}

const QUESTIONS: Section = {
  heading: { en: "Questions", ar: "للاستفسار" },
  prompt: {
    en: "Who families can ask, and how to reach them.",
    ar: "من تتواصل معه الأسر، وكيف تصل إليه.",
  },
};

/**
 * The events a school's calendar holds most, each laid out with what its
 * families ask about: the day's times, what to bring, the cost and consent,
 * and whom to ask. When, where and who it is for sit beside the page.
 */
export const EVENT_SHAPES: EventShape[] = [
  {
    key: "trip",
    place: 10,
    title: m.eventShapeTrip,
    hint: m.eventShapeTripHint,
    sections: [
      {
        heading: { en: "Where we are going", ar: "وجهتنا" },
        prompt: {
          en: "Where the class is going, and what students will learn there.",
          ar: "إلى أين يذهب الفصل، وماذا سيتعلم الطلاب هناك.",
        },
      },
      {
        heading: { en: "The day", ar: "برنامج اليوم" },
        points: [
          {
            en: "Arrive at school by …",
            ar: "الحضور إلى المدرسة قبل الساعة …",
          },
          {
            en: "We leave at … and are back at about …",
            ar: "نغادر الساعة … ونعود نحو الساعة …",
          },
          {
            en: "Collect your child from … at …",
            ar: "استلام الطفل من … الساعة …",
          },
        ],
      },
      {
        heading: { en: "What to bring", ar: "ما يُحضِره الطالب" },
        points: [
          {
            en: "A packed lunch and a bottle of water",
            ar: "وجبة غداء وزجاجة ماء",
          },
          {
            en: "Comfortable shoes and clothes for the weather",
            ar: "حذاء مريح وملابس تناسب الطقس",
          },
          {
            en: "Any medicine your child may need, handed to the class teacher",
            ar: "أي دواء قد يحتاجه الطفل، يُسلَّم إلى معلم الفصل",
          },
        ],
      },
      {
        heading: { en: "Cost and consent", ar: "التكلفة والموافقة" },
        prompt: {
          en: "What the trip costs and how to pay, and the consent each family gives.",
          ar: "تكلفة الرحلة وطريقة الدفع، والموافقة المطلوبة من كل أسرة.",
        },
      },
      QUESTIONS,
    ],
  },
  {
    key: "sport",
    place: 30,
    title: m.eventShapeSport,
    hint: m.eventShapeSportHintCore,
    sections: [
      {
        heading: { en: "The day", ar: "برنامج اليوم" },
        prompt: {
          en: "The events in order, and when each year group takes part.",
          ar: "الفعاليات بالترتيب، وموعد مشاركة كل صف.",
        },
      },
      {
        heading: { en: "What to wear and bring", ar: "الزي وما يُحضِره الطالب" },
        points: [
          { en: "PE kit and trainers", ar: "الزي الرياضي وحذاء رياضي" },
          { en: "A hat and sun cream", ar: "قبعة وواقٍ من الشمس" },
          {
            en: "A water bottle with your child's name on it",
            ar: "زجاجة ماء عليها اسم الطالب",
          },
        ],
      },
      {
        heading: { en: "Families", ar: "حضور الأسر" },
        prompt: {
          en: "Whether families may watch, where to stand, and where to park.",
          ar: "هل يمكن للأسر الحضور، وأين تقف، وأين تركن سياراتها.",
        },
      },
      {
        heading: { en: "If the weather is bad", ar: "إذا ساء الطقس" },
        prompt: {
          en: "What happens instead, and how families will hear.",
          ar: "ما البديل، وكيف تُبلَّغ الأسر.",
        },
      },
    ],
  },
  {
    key: "performance",
    place: 40,
    title: m.eventShapePerformance,
    hint: m.eventShapePerformanceHint,
    sections: [
      {
        heading: { en: "About the performance", ar: "عن العرض" },
        prompt: {
          en: "What students will perform, and who is taking part.",
          ar: "ما سيقدمه الطلاب، ومن يشارك فيه.",
        },
      },
      {
        heading: { en: "For performers", ar: "للمشاركين" },
        points: [
          {
            en: "Arrive by … to get ready",
            ar: "الحضور قبل الساعة … للاستعداد",
          },
          { en: "What to wear: …", ar: "الملابس: …" },
          {
            en: "Collect your child after the show at …",
            ar: "استلام الطفل بعد العرض الساعة …",
          },
        ],
      },
      {
        heading: { en: "For the audience", ar: "للحضور" },
        prompt: {
          en: "Tickets or seats, when the doors open, and whether photographs may be taken.",
          ar: "التذاكر أو المقاعد، وموعد فتح الأبواب، وهل يُسمح بالتصوير.",
        },
      },
    ],
  },
  {
    key: "exam",
    place: 50,
    title: m.eventShapeExam,
    hint: m.eventShapeExamHint,
    sections: [
      {
        heading: { en: "Timetable", ar: "جدول الامتحانات" },
        prompt: {
          en: "Each paper, its day, start time and length, and the room.",
          ar: "كل ورقة امتحانية بيومها وموعد بدايتها ومدتها والقاعة.",
        },
      },
      {
        heading: { en: "What to bring", ar: "ما يُحضِره الطالب" },
        points: [
          {
            en: "Black pens, a pencil, a ruler and an eraser",
            ar: "أقلام سوداء وقلم رصاص ومسطرة وممحاة",
          },
          {
            en: "A calculator, where the paper allows one",
            ar: "آلة حاسبة، حيث تسمح بها الورقة",
          },
          {
            en: "Water in a clear bottle with no label",
            ar: "ماء في زجاجة شفافة بلا ملصق",
          },
        ],
      },
      {
        heading: { en: "In the exam room", ar: "في قاعة الامتحان" },
        points: [
          {
            en: "Arrive ten minutes before each paper",
            ar: "الحضور قبل كل ورقة بعشر دقائق",
          },
          {
            en: "Phones and smart watches are handed in before the exam",
            ar: "تُسلَّم الهواتف والساعات الذكية قبل الامتحان",
          },
        ],
      },
      {
        heading: { en: "If your child is unwell", ar: "إذا مرض الطالب" },
        prompt: {
          en: "Whom to tell, by when, and what the school needs to see.",
          ar: "من تُبلِغون، وفي أي موعد، وما الذي تحتاج المدرسة إلى الاطلاع عليه.",
        },
      },
      QUESTIONS,
    ],
  },
];
