/**
 * The early learning goals of England's Early Years Foundation Stage, by
 * name under its seven areas of learning, as a framework a school adds in
 * one step to judge its Reception children against. The identifiers are
 * fixed, so adding it again brings a school's copy back to these rather
 * than making a second.
 */

/** An item of a ready-made framework, under its parent by identifier. */
export interface GoalItem {
  identifier: string;
  parentIdentifier: string | null;
  position: number;
  code: string;
  statement: string;
  itemType: string;
}

const area = (
  identifier: string,
  position: number,
  code: string,
  statement: string,
): GoalItem => ({
  identifier,
  parentIdentifier: null,
  position,
  code,
  statement,
  itemType: "Area of learning",
});

const goal = (
  identifier: string,
  parentIdentifier: string,
  position: number,
  statement: string,
): GoalItem => ({
  identifier,
  parentIdentifier,
  position,
  code: "",
  statement,
  itemType: "Early learning goal",
});

export const EYFS_GOALS = {
  identifier: "701c25d0-9f28-45fb-a533-1ded3c949259",
  title: "EYFS early learning goals",
  description:
    "The seventeen early learning goals of the Early Years Foundation Stage, under its seven areas of learning. At the end of Reception each child is judged emerging or expected against each.",
  items: [
    area(
      "acab5dd0-da31-47af-a862-29b6a53af111",
      0,
      "CL",
      "Communication and Language",
    ),
    goal(
      "f9563fd3-eaa5-4fcc-8fb7-56dce8736d0b",
      "acab5dd0-da31-47af-a862-29b6a53af111",
      0,
      "Listening, Attention and Understanding",
    ),
    goal(
      "ea93983e-a85f-4e05-9b3f-8ee6266e7767",
      "acab5dd0-da31-47af-a862-29b6a53af111",
      1,
      "Speaking",
    ),
    area(
      "d1daf047-828d-46fd-bfc0-5c1bb421f9e6",
      1,
      "PSED",
      "Personal, Social and Emotional Development",
    ),
    goal(
      "a8f76ab0-ee12-4a50-ad5d-f33736b0628a",
      "d1daf047-828d-46fd-bfc0-5c1bb421f9e6",
      0,
      "Self-Regulation",
    ),
    goal(
      "188882a0-8167-46da-869a-918dc4e51c65",
      "d1daf047-828d-46fd-bfc0-5c1bb421f9e6",
      1,
      "Managing Self",
    ),
    goal(
      "6efabcc6-9716-4dd2-8f8f-4d92d398ae99",
      "d1daf047-828d-46fd-bfc0-5c1bb421f9e6",
      2,
      "Building Relationships",
    ),
    area(
      "1a9d5271-0019-445e-8fa9-e834d629be02",
      2,
      "PD",
      "Physical Development",
    ),
    goal(
      "69fafa55-187c-42c9-baa7-5a34a7fe1d27",
      "1a9d5271-0019-445e-8fa9-e834d629be02",
      0,
      "Gross Motor Skills",
    ),
    goal(
      "d1d53364-e3b9-41b8-8d0e-9d05efccf40e",
      "1a9d5271-0019-445e-8fa9-e834d629be02",
      1,
      "Fine Motor Skills",
    ),
    area("44726b0b-5307-44ea-9b27-46fba63d1497", 3, "L", "Literacy"),
    goal(
      "9510de3b-40a7-4a93-aaf7-0132dbff734d",
      "44726b0b-5307-44ea-9b27-46fba63d1497",
      0,
      "Comprehension",
    ),
    goal(
      "f98d6069-87fc-4703-93ce-a6c314917afc",
      "44726b0b-5307-44ea-9b27-46fba63d1497",
      1,
      "Word Reading",
    ),
    goal(
      "3dd56e29-f8f7-4434-915a-25734116e2ac",
      "44726b0b-5307-44ea-9b27-46fba63d1497",
      2,
      "Writing",
    ),
    area("959cb326-1b53-414d-806b-ca340cd52edc", 4, "M", "Mathematics"),
    goal(
      "3c0622e2-e1d7-478e-8ed2-d40aabe6e069",
      "959cb326-1b53-414d-806b-ca340cd52edc",
      0,
      "Number",
    ),
    goal(
      "94a3e786-54ee-4d1b-86de-2a3af72ecbe7",
      "959cb326-1b53-414d-806b-ca340cd52edc",
      1,
      "Numerical Patterns",
    ),
    area(
      "326aa410-0508-46cc-a0e5-d3aef0fd4a5e",
      5,
      "UW",
      "Understanding the World",
    ),
    goal(
      "40114868-9be0-482c-9784-4f9a7533218c",
      "326aa410-0508-46cc-a0e5-d3aef0fd4a5e",
      0,
      "Past and Present",
    ),
    goal(
      "b48ebbea-2765-45cf-b47e-4c4487edef68",
      "326aa410-0508-46cc-a0e5-d3aef0fd4a5e",
      1,
      "People, Culture and Communities",
    ),
    goal(
      "f023c346-3490-48e1-a5d4-352dc1be466e",
      "326aa410-0508-46cc-a0e5-d3aef0fd4a5e",
      2,
      "The Natural World",
    ),
    area(
      "801993e3-6e2e-46ba-a617-2d6f5858c7dd",
      6,
      "EAD",
      "Expressive Arts and Design",
    ),
    goal(
      "689da2b8-8bcd-4bfd-b749-7794c51bd70f",
      "801993e3-6e2e-46ba-a617-2d6f5858c7dd",
      0,
      "Creating with Materials",
    ),
    goal(
      "8628e26e-d4dd-487b-b826-844615575400",
      "801993e3-6e2e-46ba-a617-2d6f5858c7dd",
      1,
      "Being Imaginative and Expressive",
    ),
  ],
} as const satisfies {
  identifier: string;
  title: string;
  description: string;
  items: readonly GoalItem[];
};

/**
 * Development Matters' identifier, kept apart from its three hundred
 * statements so a page can tell the framework without loading them.
 */
export const DEVELOPMENT_MATTERS_IDENTIFIER =
  "f5dc4454-7840-4b3f-a825-d733f930ff79";

/**
 * Where each goal sits in the EYFS profile return, by its identifier: the
 * subject and component the Department for Education's assessment
 * component file (A_comp 2026, FSP sheet) gives it.
 */
export const EYFS_RETURN_CODES: Readonly<
  Record<string, { subject: string; component: string }>
> = {
  "f9563fd3-eaa5-4fcc-8fb7-56dce8736d0b": { subject: "COM", component: "E01" },
  "ea93983e-a85f-4e05-9b3f-8ee6266e7767": { subject: "COM", component: "E02" },
  "a8f76ab0-ee12-4a50-ad5d-f33736b0628a": { subject: "PSE", component: "E03" },
  "188882a0-8167-46da-869a-918dc4e51c65": { subject: "PSE", component: "E04" },
  "6efabcc6-9716-4dd2-8f8f-4d92d398ae99": { subject: "PSE", component: "E05" },
  "69fafa55-187c-42c9-baa7-5a34a7fe1d27": { subject: "PHY", component: "E06" },
  "d1d53364-e3b9-41b8-8d0e-9d05efccf40e": { subject: "PHY", component: "E07" },
  "9510de3b-40a7-4a93-aaf7-0132dbff734d": { subject: "LIT", component: "E08" },
  "f98d6069-87fc-4703-93ce-a6c314917afc": { subject: "LIT", component: "E09" },
  "3dd56e29-f8f7-4434-915a-25734116e2ac": { subject: "LIT", component: "E10" },
  "3c0622e2-e1d7-478e-8ed2-d40aabe6e069": { subject: "MAT", component: "E11" },
  "94a3e786-54ee-4d1b-86de-2a3af72ecbe7": { subject: "MAT", component: "E12" },
  "40114868-9be0-482c-9784-4f9a7533218c": { subject: "UTW", component: "E13" },
  "b48ebbea-2765-45cf-b47e-4c4487edef68": { subject: "UTW", component: "E14" },
  "f023c346-3490-48e1-a5d4-352dc1be466e": { subject: "UTW", component: "E15" },
  "689da2b8-8bcd-4bfd-b749-7794c51bd70f": { subject: "EXP", component: "E16" },
  "8628e26e-d4dd-487b-b826-844615575400": { subject: "EXP", component: "E17" },
};

/** The framework, its goals and their areas in Arabic, for families who read it. */
export const EYFS_GOALS_ARABIC: Readonly<Record<string, string>> = {
  "701c25d0-9f28-45fb-a533-1ded3c949259": "أهداف التعلّم المبكر في EYFS",
  "acab5dd0-da31-47af-a862-29b6a53af111": "التواصل واللغة",
  "f9563fd3-eaa5-4fcc-8fb7-56dce8736d0b": "الاستماع والانتباه والفهم",
  "ea93983e-a85f-4e05-9b3f-8ee6266e7767": "التحدّث",
  "d1daf047-828d-46fd-bfc0-5c1bb421f9e6": "النمو الشخصي والاجتماعي والعاطفي",
  "a8f76ab0-ee12-4a50-ad5d-f33736b0628a": "التنظيم الذاتي",
  "188882a0-8167-46da-869a-918dc4e51c65": "إدارة الذات",
  "6efabcc6-9716-4dd2-8f8f-4d92d398ae99": "بناء العلاقات",
  "1a9d5271-0019-445e-8fa9-e834d629be02": "النمو الجسدي",
  "69fafa55-187c-42c9-baa7-5a34a7fe1d27": "المهارات الحركية الكبرى",
  "d1d53364-e3b9-41b8-8d0e-9d05efccf40e": "المهارات الحركية الدقيقة",
  "44726b0b-5307-44ea-9b27-46fba63d1497": "القراءة والكتابة",
  "9510de3b-40a7-4a93-aaf7-0132dbff734d": "الفهم",
  "f98d6069-87fc-4703-93ce-a6c314917afc": "قراءة الكلمات",
  "3dd56e29-f8f7-4434-915a-25734116e2ac": "الكتابة",
  "959cb326-1b53-414d-806b-ca340cd52edc": "الرياضيات",
  "3c0622e2-e1d7-478e-8ed2-d40aabe6e069": "العدد",
  "94a3e786-54ee-4d1b-86de-2a3af72ecbe7": "الأنماط العددية",
  "326aa410-0508-46cc-a0e5-d3aef0fd4a5e": "فهم العالم",
  "40114868-9be0-482c-9784-4f9a7533218c": "الماضي والحاضر",
  "b48ebbea-2765-45cf-b47e-4c4487edef68": "الناس والثقافة والمجتمعات",
  "f023c346-3490-48e1-a5d4-352dc1be466e": "العالم الطبيعي",
  "801993e3-6e2e-46ba-a617-2d6f5858c7dd": "الفنون التعبيرية والتصميم",
  "689da2b8-8bcd-4bfd-b749-7794c51bd70f": "الإبداع بالخامات",
  "8628e26e-d4dd-487b-b826-844615575400": "الخيال والتعبير",
};
