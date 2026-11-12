import type { EventShape } from "~/components/calendar/eventShapes";

import * as m from "~/i18n/messages";

/** The evening a school meets its families, laid out with what they ask about. */
export const PARENTS_EVENING: EventShape = {
  key: "meeting",
  place: 20,
  title: m.eventShapeMeeting,
  hint: m.eventShapeMeetingHint,
  sections: [
    {
      heading: { en: "What it is for", ar: "الهدف من اللقاء" },
      prompt: {
        en: "What teachers will share, and what families can ask about.",
        ar: "ما سيعرضه المعلمون، وما يمكن للأسر السؤال عنه.",
      },
    },
    {
      heading: { en: "Booking a time", ar: "حجز موعد" },
      prompt: {
        en: "How to book, how long each meeting lasts, and when booking closes.",
        ar: "طريقة الحجز، ومدة كل لقاء، وآخر موعد للحجز.",
      },
    },
    {
      heading: { en: "On the day", ar: "يوم اللقاء" },
      points: [
        {
          en: "Please arrive a few minutes before your time",
          ar: "يُرجى الحضور قبل الموعد ببضع دقائق",
        },
        { en: "Meetings are held in …", ar: "تُعقد اللقاءات في …" },
        {
          en: "Your child is welcome to come with you",
          ar: "يمكنكم اصطحاب أبنائكم",
        },
      ],
    },
    {
      heading: { en: "If you cannot come", ar: "إذا تعذّر الحضور" },
      prompt: {
        en: "How to ask for a call or another time.",
        ar: "كيف تطلبون اتصالًا هاتفيًا أو موعدًا آخر.",
      },
    },
  ],
};
