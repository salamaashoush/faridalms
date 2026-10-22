/**
 * The IB's planning concepts as frameworks a school adds in one step: the
 * MYP's key concepts and global contexts, and the PYP's key concepts and
 * transdisciplinary themes. A unit plan names them and a coordinator reads
 * them across units; they frame units rather than being assessed. The
 * identifiers are fixed, so adding them again brings a school's copies
 * back to these rather than making second ones.
 */

export interface ConceptFramework {
  identifier: string;
  title: string;
  description: string;
  items: {
    identifier: string;
    parentIdentifier: null;
    position: number;
    code: string;
    statement: string;
    itemType: string;
  }[];
}

const listed = (
  itemType: string,
  entries: readonly (readonly [string, string])[],
): ConceptFramework["items"] =>
  entries.map(([identifier, statement], position) => ({
    identifier,
    parentIdentifier: null,
    position,
    code: "",
    statement,
    itemType,
  }));

const MYP_KEY_CONCEPTS: ConceptFramework = {
  identifier: "41f6a1eb-29d4-4582-b705-4ae76c7f02f9",
  title: "IB MYP key concepts",
  description:
    "The sixteen key concepts of the IB Middle Years Programme. One drives each unit; it frames the unit rather than being assessed.",
  items: listed("Key concept", [
    ["a47b5ab1-4aad-479a-a01b-887e9c59839d", "Aesthetics"],
    ["3851e246-4045-497b-91ec-4aac52123210", "Change"],
    ["e640763e-6cec-4db1-b121-7b5bc39bd6fe", "Communication"],
    ["f7135a60-8d6b-4439-92dc-8db7bf5d297b", "Communities"],
    ["e59276c4-b742-4ed8-9569-6e2411949c8a", "Connections"],
    ["12be11a2-0971-4aba-9182-5747ef666503", "Creativity"],
    ["a78b586e-bf87-44c7-b21e-cc2d6da43a00", "Culture"],
    ["42ae2906-0efe-4951-ae33-cb275ffbc5c7", "Development"],
    ["ca29cba0-ec1c-4690-b3dd-ea190808738a", "Form"],
    ["fee973fe-07dc-47a9-af97-77e3f11a61b5", "Global interactions"],
    ["34f60767-c796-4e96-a0ef-052dc880385f", "Identity"],
    ["eed719dd-23e7-4022-bde8-d705bb9382e0", "Logic"],
    ["4a60aaa1-9686-4843-af88-52982232892e", "Perspective"],
    ["b200598b-f152-4f93-aaf4-d7e4a569114b", "Relationships"],
    ["9a3237aa-1d17-470b-98fb-35826dac8574", "Systems"],
    ["039080fa-1f3e-48d7-9084-d755506883c3", "Time, place and space"],
  ]),
};

const MYP_GLOBAL_CONTEXTS: ConceptFramework = {
  identifier: "f6171578-04ac-41a7-a448-6128f0253423",
  title: "IB MYP global contexts",
  description:
    "The six global contexts of the IB Middle Years Programme, one of which sets each unit in a context for learning.",
  items: listed("Global context", [
    ["13d4c420-1505-4963-8c0d-54512f9992e8", "Identities and relationships"],
    ["e2282b41-2e3c-4706-a6a7-97bed9666f32", "Orientation in space and time"],
    [
      "77b64d66-3d39-4e67-98c0-3dfda25c8fac",
      "Personal and cultural expression",
    ],
    [
      "afda5280-513c-4d08-a114-dccfd1424805",
      "Scientific and technical innovation",
    ],
    [
      "17bd4c16-5219-452c-936a-4279e9576752",
      "Globalization and sustainability",
    ],
    ["5a6c0b8f-34b7-4c37-a692-cce485abfc1f", "Fairness and development"],
  ]),
};

const PYP_KEY_CONCEPTS: ConceptFramework = {
  identifier: "e3f226e5-cad0-437c-b2c9-c7cd28c345f6",
  title: "IB PYP key concepts",
  description:
    "The seven key concepts of the IB Primary Years Programme, each with the question it asks, that frame a unit of inquiry.",
  items: listed("Key concept", [
    ["afa3e9fa-58be-44d3-b972-a60f09c0a542", "Form: what is it like?"],
    ["f4db398a-1d20-4c62-bc4f-69db0b876e9f", "Function: how does it work?"],
    ["ff981a81-21c4-40ca-bbcf-bda900170554", "Causation: why is it as it is?"],
    ["0c83200e-01f9-43b0-8887-7866a368b36a", "Change: how is it transforming?"],
    [
      "fe75efb9-fa3d-40c9-b8b9-51938ccfd562",
      "Connection: how is it linked to other things?",
    ],
    [
      "de8899fb-b53c-46be-a2f5-8939f948112a",
      "Perspective: what are the points of view?",
    ],
    [
      "c75d544f-21ef-4081-b5d6-a31be462e84e",
      "Responsibility: what are our obligations?",
    ],
  ]),
};

const PYP_THEMES: ConceptFramework = {
  identifier: "dcd37484-f527-4f18-aafe-8c53f32084a0",
  title: "IB PYP transdisciplinary themes",
  description:
    "The six transdisciplinary themes of the IB Primary Years Programme, under one of which each unit of inquiry sits.",
  items: listed("Transdisciplinary theme", [
    ["df2eac2d-0dfb-4fd5-a552-ef6f1e293d69", "Who we are"],
    ["2b913d4e-47e4-452b-81f2-7eda5a93b8c8", "Where we are in place and time"],
    ["b4ce7566-2b51-4950-835c-90a40f7fd1e1", "How we express ourselves"],
    ["5e83e415-85b2-4ad2-99d6-3d684d99d77e", "How the world works"],
    ["ea16678b-522e-4574-baa6-25f75cc6f0e3", "How we organize ourselves"],
    ["89350b6a-65dc-46f5-a788-5878e8ab7dd4", "Sharing the planet"],
  ]),
};

export const IB_CONCEPTS: readonly ConceptFramework[] = [
  MYP_KEY_CONCEPTS,
  MYP_GLOBAL_CONTEXTS,
  PYP_KEY_CONCEPTS,
  PYP_THEMES,
];
