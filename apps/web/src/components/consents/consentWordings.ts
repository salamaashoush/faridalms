type Text = { en: string; ar: string };

/** What a family is told under each of a consent form's five headings. */
export interface ConsentWording {
  ask: Text;
  data: Text;
  who: Text;
  howLong: Text;
  change: Text;
}

const MAY_CHANGE: Text = {
  en: "You may change your answer at any time in the app or at the school office. Saying no does not affect your child's place or learning at the school.",
  ar: "يمكنكم تغيير إجابتكم في أي وقت عبر التطبيق أو من خلال مكتب المدرسة، ولا يؤثر الرفض على مكان طفلكم في المدرسة أو على تعلّمه.",
};

const also = (more: Text): Text => ({
  en: `${MAY_CHANGE.en} ${more.en}`,
  ar: `${MAY_CHANGE.ar} ${more.ar}`,
});

/**
 * Ready wording for the purposes schools most often ask consent for, by
 * the meaning a school's purpose carries, so a purpose of its own naming
 * finds the same words. Each is plain enough for a family to decide on and
 * gives what a consent must say; a school edits it to its own practice.
 */
export const CONSENT_WORDINGS: Partial<Record<string, ConsentWording>> = {
  photo_website: {
    ask: {
      en: "May we show photographs of your child taking part in school life on the school's public website?",
      ar: "هل تسمحون لنا بنشر صور لطفلكم وهو يشارك في أنشطة المدرسة على موقع المدرسة العام؟",
    },
    data: {
      en: "Photographs and short videos in which your child can be seen. We do not put your child's full name beside a picture.",
      ar: "صور ومقاطع فيديو قصيرة يظهر فيها طفلكم، ولا نكتب اسمه الكامل بجانب الصورة.",
    },
    who: {
      en: "Anyone who visits the website, which is open to the public.",
      ar: "كل من يزور الموقع، فهو متاح للجميع.",
    },
    howLong: {
      en: "We take your child's pictures off the website when they leave the school, or sooner if you ask.",
      ar: "نحذف صور طفلكم من الموقع عند مغادرته المدرسة، أو قبل ذلك متى طلبتم.",
    },
    change: also({
      en: "If you withdraw, we take down the pictures already shown.",
      ar: "وإن سحبتم موافقتكم، نحذف الصور المنشورة.",
    }),
  },
  photo_social: {
    ask: {
      en: "May we share photographs of your child at school on the school's social media accounts?",
      ar: "هل تسمحون لنا بنشر صور لطفلكم في المدرسة على حسابات المدرسة في وسائل التواصل الاجتماعي؟",
    },
    data: {
      en: "Photographs and short videos in which your child can be seen, without their name.",
      ar: "صور ومقاطع فيديو قصيرة يظهر فيها طفلكم، دون ذكر اسمه.",
    },
    who: {
      en: "Anyone who can see the school's accounts. Others may share or copy a post, which the school cannot prevent.",
      ar: "كل من يطّلع على حسابات المدرسة. وقد يشارك آخرون المنشور أو ينسخونه، وهو ما لا تستطيع المدرسة منعه.",
    },
    howLong: {
      en: "Posts stay on the school's accounts until we remove them. We remove your child's pictures whenever you ask.",
      ar: "تبقى المنشورات على حسابات المدرسة حتى نحذفها، ونحذف صور طفلكم متى طلبتم.",
    },
    change: also({
      en: "If you withdraw, we delete our posts that show your child, though copies others made may remain.",
      ar: "وإن سحبتم موافقتكم، نحذف منشوراتنا التي يظهر فيها طفلكم، وقد تبقى نسخ احتفظ بها آخرون.",
    }),
  },
  photo_internal: {
    ask: {
      en: "May we show photographs of your child in the school news that the school's families read in the app?",
      ar: "هل تسمحون لنا بعرض صور لطفلكم في أخبار المدرسة التي تقرؤها أسر المدرسة عبر التطبيق؟",
    },
    data: {
      en: "Photographs and short videos of school events in which your child can be seen.",
      ar: "صور ومقاطع فيديو قصيرة من فعاليات المدرسة يظهر فيها طفلكم.",
    },
    who: {
      en: "The school's staff, students and families, signed in to the app. This news is not public.",
      ar: "العاملون في المدرسة وطلابها وأسرها ممن يسجّلون الدخول إلى التطبيق، وهذه الأخبار غير متاحة للعامة.",
    },
    howLong: {
      en: "Pictures stay with the news they appear in. We remove your child's pictures when they leave the school, or sooner if you ask.",
      ar: "تبقى الصور مع الأخبار التي نُشرت فيها، ونحذف صور طفلكم عند مغادرته المدرسة أو قبل ذلك متى طلبتم.",
    },
    change: MAY_CHANGE,
  },
  directory_sharing: {
    ask: {
      en: "May we share your contact details with the other families of your child's class, so that you can reach one another?",
      ar: "هل تسمحون لنا بمشاركة بيانات التواصل الخاصة بكم مع أسر زملاء طفلكم في الفصل، ليتواصل بعضكم مع بعض؟",
    },
    data: {
      en: "Your name, your child's name, and the phone number and email address you choose to share.",
      ar: "اسمكم واسم طفلكم، ورقم الهاتف والبريد الإلكتروني اللذان تختارون مشاركتهما.",
    },
    who: {
      en: "The families of your child's class, and no one else.",
      ar: "أسر فصل طفلكم فقط.",
    },
    howLong: {
      en: "While your child is in the class. A new list is shared each school year.",
      ar: "طوال وجود طفلكم في الفصل، وتُشارك قائمة جديدة كل عام دراسي.",
    },
    change: also({
      en: "Families who already have your details may keep them.",
      ar: "وقد تحتفظ الأسر التي اطّلعت على بياناتكم بها.",
    }),
  },
  administer_medicine: {
    ask: {
      en: "May trained school staff give your child the medicine you send to school, as you and its label direct?",
      ar: "هل تسمحون لموظفي المدرسة المدرَّبين بإعطاء طفلكم الدواء الذي ترسلونه إلى المدرسة، وفق تعليماتكم وتعليمات العبوة؟",
    },
    data: {
      en: "The medicine's name, the dose and when it is given, your child's health needs, and a record of each dose given.",
      ar: "اسم الدواء والجرعة وموعد إعطائها، واحتياجات طفلكم الصحية، وسجل بكل جرعة تُعطى له.",
    },
    who: {
      en: "The school's nursing staff or the staff trained to give medicine, and your child's teachers as far as they need to know.",
      ar: "طاقم التمريض في المدرسة أو الموظفون المدرَّبون على إعطاء الدواء، ومعلمو طفلكم بقدر ما يحتاجون إلى معرفته.",
    },
    howLong: {
      en: "This school year. The record of doses given is kept as long as the school keeps its health records.",
      ar: "طوال هذا العام الدراسي، ويُحفظ سجل الجرعات طوال مدة حفظ المدرسة لسجلاتها الصحية.",
    },
    change: {
      en: "You may withdraw at any time in the app or at the school office. Please tell us at once if the medicine or its dose changes.",
      ar: "يمكنكم سحب موافقتكم في أي وقت عبر التطبيق أو من خلال مكتب المدرسة. ويُرجى إبلاغنا فورًا إذا تغيّر الدواء أو جرعته.",
    },
  },
  voice_recording: {
    ask: {
      en: "May your child's voice be recorded in lessons, for reading practice, language work and spoken answers?",
      ar: "هل تسمحون بتسجيل صوت طفلكم في الدروس، للتدرّب على القراءة وتعلّم اللغات والإجابات الشفهية؟",
    },
    data: {
      en: "Recordings of your child speaking or reading aloud, kept with their work.",
      ar: "تسجيلات لطفلكم وهو يتحدث أو يقرأ بصوت مرتفع، تُحفظ مع أعماله.",
    },
    who: {
      en: "Your child, their teachers and you. Recordings are not shared outside the school.",
      ar: "طفلكم ومعلموه وأنتم، ولا تُشارك التسجيلات خارج المدرسة.",
    },
    howLong: {
      en: "As long as your child's work is kept, and no longer than they are at the school.",
      ar: "ما دامت أعمال طفلكم محفوظة، وبما لا يتجاوز مدة بقائه في المدرسة.",
    },
    change: also({
      en: "Your child can still take part in every lesson without being recorded.",
      ar: "ويستطيع طفلكم المشاركة في كل الدروس دون تسجيل صوته.",
    }),
  },
  child_data_processing: {
    ask: {
      en: "May the school keep and use your child's records to teach and care for them: their enrolment, attendance, work, marks and reports?",
      ar: "هل تسمحون للمدرسة بحفظ سجلات طفلكم واستخدامها في تعليمه ورعايته: بيانات القيد والحضور والأعمال والدرجات والتقارير؟",
    },
    data: {
      en: "Your child's name, date of birth and contact details, their attendance, the work they hand in, their marks, and their teachers' reports.",
      ar: "اسم طفلكم وتاريخ ميلاده وبيانات التواصل، وحضوره، والأعمال التي يسلّمها، ودرجاته، وتقارير معلميه.",
    },
    who: {
      en: "Your child's teachers, the school staff who need it for their work, and you. We share it outside the school only where the law requires.",
      ar: "معلمو طفلكم وموظفو المدرسة الذين يحتاجون إليها في عملهم، وأنتم. ولا نشاركها خارج المدرسة إلا حيث يُلزمنا القانون.",
    },
    howLong: {
      en: "While your child is at the school, and afterwards for as long as the law requires the school to keep its records.",
      ar: "طوال وجود طفلكم في المدرسة، ثم للمدة التي يُلزم القانون المدرسة بحفظ سجلاتها خلالها.",
    },
    change: {
      en: "You may ask to see or correct your child's records, or withdraw, at any time at the school office. Some records the school must keep by law.",
      ar: "يمكنكم طلب الاطلاع على سجلات طفلكم أو تصحيحها، أو سحب موافقتكم، في أي وقت من خلال مكتب المدرسة. وبعض السجلات تلتزم المدرسة بحفظها بحكم القانون.",
    },
  },
};
