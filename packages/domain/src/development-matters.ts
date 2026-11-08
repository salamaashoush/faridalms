import type { GoalItem } from "./early-goals";

import { DEVELOPMENT_MATTERS_IDENTIFIER } from "./early-goals";

/**
 * Development Matters, the Department for Education's non-statutory
 * curriculum guidance for the Early Years Foundation Stage (September 2023
 * revision), as a framework a school adds in one step to follow younger
 * children by: each area of learning, its three age bands, and the
 * "children will be learning to" statements of each, worded as printed.
 * The identifiers are fixed, so adding it again brings a school's copy back
 * to these rather than making a second.
 *
 * Source: https://assets.publishing.service.gov.uk/media/64e6002a20ae890014f26cbc/DfE_Development_Matters_Report_Sep2023.pdf
 * Contains public sector information licensed under the Open Government
 * Licence v3.0 (Crown copyright 2021, the guidance's page 128).
 */

interface Band {
  identifier: string;
  band: string;
  statements: readonly (readonly [identifier: string, statement: string])[];
}

interface Area {
  identifier: string;
  code: string;
  name: string;
  bands: readonly Band[];
}

const AREAS: readonly Area[] = [
  {
    identifier: "0015c7be-d9a2-4fa0-af7c-ddfa0e4b622c",
    code: "CL",
    name: "Communication and Language",
    bands: [
      {
        identifier: "2622d718-2b6a-454b-b4ba-43f2ffe5dac1",
        band: "Birth to three",
        statements: [
          [
            "ff85da80-b06e-4217-85d3-ad0b1fa612f6",
            "Turn towards familiar sounds. They are also startled by loud noises and accurately locate the source of a familiar person’s voice, such as their key person or a parent.",
          ],
          [
            "b26a204e-bb31-4e7e-be6f-bf06a2382f8e",
            "Gaze at faces, copying facial expressions and movements like sticking out their tongue. Make eye contact for longer periods.",
          ],
          [
            "6d6dfc8e-594a-4a7d-b5cf-424d445182cf",
            "Watch someone’s face as they talk.",
          ],
          [
            "784287ad-44fe-40f1-947e-b4590615899b",
            "Copy what adults do, taking ‘turns’ in conversations (through babbling) and activities. Try to copy adult speech and lip movements.",
          ],
          [
            "d83644f9-bcc3-4b23-a164-8809d86c94c5",
            "Enjoy singing, music and toys that make sounds.",
          ],
          [
            "5b06e5d1-4701-4866-8147-7cb79b94c1ee",
            "Recognise and are calmed by a familiar and friendly voice.",
          ],
          [
            "1a56a1fb-2349-4668-9175-f662f0004458",
            "Listen and respond to a simple instruction.",
          ],
          [
            "d602c7ad-7457-4cb0-afdc-d8eefda0c5f7",
            "Make sounds to get attention in different ways (for example, crying when hungry or unhappy, making gurgling sounds, laughing, cooing or babbling).",
          ],
          [
            "007389b9-cd6a-4fcd-878e-f8d95074cc38",
            "Babble, using sounds like ‘baba’, ‘mamama’.",
          ],
          [
            "7a7e9a08-ed2b-4bac-a933-00d670245bfc",
            "Use gestures like waving and pointing to communicate.",
          ],
          [
            "cc3a0cd2-2d35-4f7d-a858-6dce46b71139",
            "Reach or point to something they want while making sounds.",
          ],
          [
            "c8745afb-329e-4faa-85a5-3b49077a1c03",
            "Copy your gestures and words.",
          ],
          [
            "a879f8e6-1b77-4a69-a134-5d5ee673eca8",
            "Constantly babble and use single words during play.",
          ],
          [
            "6d65a201-7f42-4012-86f0-772f5ce07457",
            "Use intonation, pitch and changing volume when ‘talking’.",
          ],
          [
            "0787ce46-f572-4a9f-974b-624230e66aa2",
            "Understand single words in context – ‘cup’, ‘milk’, ‘daddy’.",
          ],
          [
            "e90b266c-09ad-4c59-b69f-f852b1b2c341",
            "Understand frequently used words such as ‘all gone’, ‘no’ and ‘bye-bye’.",
          ],
          [
            "5c379da8-6008-47ea-ae78-c9e944d7449f",
            "Understand simple instructions like “give to nanny” or “stop”.",
          ],
          [
            "07c421a1-f812-4df7-8288-9a5c8d3e4026",
            "Recognise and point to objects if asked about them.",
          ],
          [
            "bcd186e3-ec07-4599-9c6d-8640b67db4a9",
            "Generally focus on an activity of their own choice and find it difficult to be directed by an adult.",
          ],
          [
            "2cc33435-d2cb-455b-aff8-f0465557b8be",
            "Listen to other people’s talk with interest but can easily be distracted by other things.",
          ],
          [
            "860fa672-f6bc-4296-a420-877758f947a4",
            "Make themselves understood and can become frustrated when they cannot.",
          ],
          [
            "bc77bff1-4a22-4853-a943-5f702a5b0daa",
            "Start to say how they are feeling, using words as well as actions.",
          ],
          [
            "a00befb3-2490-4ff5-97c9-b794faf9db72",
            "Start to develop conversation, often jumping from topic to topic.",
          ],
          [
            "32bd6d53-9936-4277-a718-4900d69a217f",
            "Develop pretend play: ‘putting the baby to sleep’ or ‘driving the car to the shops’.",
          ],
          [
            "2c87da76-acde-4274-8410-a73e4b957f9e",
            "Use the speech sounds p, b, m, w.",
          ],
          [
            "932949a5-dc96-4456-bbe7-7e463df3b702",
            "Pronounce:\n• l/r/w/y\n• f/th\n• s/sh/ch/dz/j\n• multi-syllabic words such as ‘banana’ and ‘computer’",
          ],
          [
            "be3c9297-be63-4f7e-9036-4625baf92ac5",
            "Listen to simple stories and understand what is happening, with the help of the pictures.",
          ],
          [
            "b85a5a1a-0cca-4565-9f96-e8be9670cac6",
            "Identify familiar objects and properties for practitioners when they are described: for example: ‘Katie’s coat’, ‘blue car’, ‘shiny apple’.",
          ],
          [
            "a7efc199-f11a-41a8-a42d-8159c4f2bdf8",
            "Understand and act on longer sentences like ‘make teddy jump’ or ‘find your coat’.",
          ],
          [
            "dceb776e-099f-4362-99ec-b90ec24c75c9",
            "Understand simple questions about ‘who’, ‘what’ and ‘where’ (but generally not ‘why’).",
          ],
        ],
      },
      {
        identifier: "79771946-8c23-4015-b56f-e4a1012ddb51",
        band: "3 and 4-year-olds",
        statements: [
          [
            "e3efe54f-66d1-4fee-a6d9-f08194a50550",
            "Enjoy listening to longer stories and can remember much of what happens.",
          ],
          [
            "fd293f79-2415-4368-9703-dc9824a9a3ae",
            "Pay attention to more than one thing at a time, which can be difficult.",
          ],
          [
            "faf3d0e2-477d-4a48-b8aa-c9ed2338ab9e",
            "Use a wider range of vocabulary.",
          ],
          [
            "e881e00b-4483-4b90-b998-d5e885acac2b",
            "Understand a question or instruction that has two parts, such as: “Get your coat and wait at the door”.",
          ],
          [
            "36185a47-424a-4f8c-8b3d-644b10998eea",
            "Understand ‘why’ questions, like: “Why do you think the caterpillar got so fat?”",
          ],
          [
            "183ce7a7-a8ba-42f3-8b98-6b9237b7c123",
            "Sing a large repertoire of songs.",
          ],
          [
            "a0164f06-30f6-4dec-9ca6-a7e8bcca76a3",
            "Know many rhymes, be able to talk about familiar books, and be able to tell a long story.",
          ],
          [
            "d2c5483c-c2fc-4a38-b001-0c5d7fd1305e",
            "Develop their communication but may continue to have problems with irregular tenses and plurals, such as ‘runned’ for ‘ran’, ‘swimmed’ for ‘swam’.",
          ],
          [
            "60665e79-ca0f-46b7-86c3-4d82974239b0",
            "Develop their pronunciation but may have problems saying:\n• some sounds: r, j, th, ch, and sh\n• multi-syllabic words such as ‘pterodactyl’, ‘planetarium’ or ‘hippopotamus’.",
          ],
          [
            "12224b8a-23ce-4253-a9ee-3ceb5b3d5c33",
            "Use longer sentences of four to six words.",
          ],
          [
            "3d1b4775-6638-4c6d-b772-6f68f0cfc196",
            "Be able to express a point of view and to debate when they disagree with an adult or a friend, using words as well as actions.",
          ],
          [
            "14c4ad11-23a4-4e94-bff2-d789ab28efa8",
            "Start a conversation with an adult or a friend and continue it for many turns.",
          ],
          [
            "29ea243b-4ee4-4ee2-942a-a7e4cb68d141",
            "Use talk to organise themselves and their play: “Let’s go on a bus... you sit there... I’ll be the driver.”",
          ],
        ],
      },
      {
        identifier: "d671b9c0-fd5f-484f-bf6b-505c013d1927",
        band: "Children in reception",
        statements: [
          [
            "98712d57-0c57-434a-9631-36e79e4c445d",
            "Understand how to listen carefully and why listening is important.",
          ],
          ["f5835096-1736-444c-a009-9038a84e0852", "Learn new vocabulary."],
          [
            "e2bfdf81-d769-4840-89fa-42753b17eb82",
            "Use new vocabulary through the day.",
          ],
          [
            "6500c9bf-87ac-4b52-b05f-6ae8505c1bfd",
            "Ask questions to find out more and to check they understand what has been said to them.",
          ],
          [
            "52f57a73-7f31-4326-ae02-a50b91390bfa",
            "Articulate their ideas and thoughts in well-formed sentences.",
          ],
          [
            "ff301e3f-fa22-405f-9a7d-9fda3f657391",
            "Connect one idea or action to another using a range of connectives.",
          ],
          [
            "877c128f-d401-4b0f-9619-fa4d630e6f63",
            "Describe events in some detail.",
          ],
          [
            "0d029468-d7f4-40ce-8c01-c25102d7b57d",
            "Use talk to help work out problems and organise thinking and activities, and to explain how things work and why they might happen.",
          ],
          ["1324c500-55ca-44f2-a60d-017dd6d202de", "Develop social phrases."],
          ["138fea0c-9832-4fd5-a421-91d954a466f4", "Engage in storytimes."],
          [
            "8368db0d-943f-4d69-8344-d475403aaa16",
            "Listen to and talk about stories to build familiarity and understanding.",
          ],
          [
            "bcdddff0-3598-499a-9451-0f97f2033f25",
            "Retell the story, once they have developed a deep familiarity with the text, some as exact repetition and some in their own words.",
          ],
          [
            "f706e163-9772-4bc8-8ebd-e66fd4f9ed18",
            "Use new vocabulary in different contexts.",
          ],
          [
            "684b9bce-e6c8-4cce-ad0d-57541210baa8",
            "Listen carefully to rhymes and songs, paying attention to how they sound.",
          ],
          [
            "2f7d3599-618d-47de-a247-ec63157c1a29",
            "Learn rhymes, poems and songs.",
          ],
          [
            "3bdeeb8a-5f7b-41f5-ba98-07f4281cef9b",
            "Engage in non-fiction books.",
          ],
          [
            "4a39cdd5-3954-4b05-a9a2-7bde6a7189f9",
            "Listen to and talk about selected non-fiction to develop a deep familiarity with new knowledge and vocabulary.",
          ],
        ],
      },
    ],
  },
  {
    identifier: "a9672a2d-87e3-4b4d-b5ea-61cebc5615e7",
    code: "PSED",
    name: "Personal, Social and Emotional Development",
    bands: [
      {
        identifier: "b4495e46-9745-4372-9f4b-ff66b9a7dd4e",
        band: "Birth to three",
        statements: [
          [
            "47fa757e-8d1e-417f-9322-f34b82eac9f7",
            "Find ways to calm themselves, through being calmed and comforted by their key person.",
          ],
          [
            "7f17f896-f350-49f6-a370-599ee2b3d2c0",
            "Establish their sense of self.",
          ],
          [
            "85aeac44-d402-4f26-ac96-1064d1ad4a77",
            "Express preferences and decisions. They also try new things and start establishing their autonomy.",
          ],
          [
            "10d58e4d-10b2-4c9f-be95-166b2ec7db7e",
            "Engage with others through gestures, gaze and talk.",
          ],
          [
            "76b7380f-cc8c-4a50-8193-ab1e8c220411",
            "Use that engagement to achieve a goal. For example, gesture towards their cup to say they want a drink.",
          ],
          [
            "6e83afd3-300c-4a20-bcf8-7e6c54d5d2cd",
            "Find ways of managing transitions, for example from their parent to their key person.",
          ],
          [
            "c42c03fc-89e5-4c39-a072-ae3cbe3c57fe",
            "Thrive as they develop self-assurance.",
          ],
          [
            "7c2680ea-a125-4c73-b07f-78c6de15ccf8",
            "Look back as they crawl or walk away from their key person. Look for clues about how to respond to something interesting.",
          ],
          [
            "fbfa662a-47ea-4798-b3c8-8e2a58eaa3ed",
            "Play with increasing confidence on their own and with other children, because they know their key person is nearby and available.",
          ],
          [
            "6fd453ab-0905-4c01-9ce9-95285d24929c",
            "Feel confident when taken out around the local neighbourhood and enjoy exploring new places with their key person.",
          ],
          [
            "dd9ae1b0-4b06-4c08-aa05-c6d331cde81c",
            "Feel strong enough to express a range of emotions.",
          ],
          [
            "afd8cbe9-3323-41fb-b598-a9dccfdb4828",
            "Grow in independence, rejecting help (“me do it”). Sometimes this leads to feelings of frustration and tantrums.",
          ],
          [
            "51d9544f-4cf2-4cca-943b-931e2b90d603",
            "Begin to show ‘effortful control’. For example, waiting for a turn and resisting the strong impulse to grab what they want or push their way to the front.",
          ],
          [
            "b0a1cff4-6321-43d2-b270-071d5d655dc9",
            "Be increasingly able to talk about and manage their emotions.",
          ],
          [
            "9341f9f3-98d7-46fb-b983-05a8ac291776",
            "Notice and ask questions about differences, such as skin colour, types of hair, gender, special needs and disabilities, religion and so on.",
          ],
          [
            "cc54a754-c582-4b28-b52f-b24acc0f37f3",
            "Develop friendships with other children.",
          ],
          [
            "8d79d951-60ac-4042-a360-4dd4245532d9",
            "Safely explore emotions beyond their normal range through play and stories.",
          ],
          [
            "55d4906e-645d-4fd1-99a3-e7791dc2bd9c",
            "Talk about their feelings in more elaborated ways: “I’m sad because…” or “I love it when …”.",
          ],
          [
            "a9339733-1e77-458c-abec-0baa113f94ec",
            "Learn to use the toilet with help, and then independently.",
          ],
        ],
      },
      {
        identifier: "1b69a1f2-236e-4e10-a43e-86f06403d53e",
        band: "3 and 4-year-olds",
        statements: [
          [
            "cba7f5d8-aad5-401d-ba5a-3d4e3eb5cd09",
            "Select and use activities and resources, with help when needed. This helps them to achieve a goal they have chosen, or one which is suggested to them.",
          ],
          [
            "0fef95e6-dd54-4849-9057-435a45c6dcb1",
            "Develop their sense of responsibility and membership of a community.",
          ],
          [
            "b78b724a-df2a-4345-9039-03d9aa026303",
            "Become more outgoing with unfamiliar people, in the safe context of their setting.",
          ],
          [
            "751732c3-1292-4fa7-9d91-5e16591e684b",
            "Show more confidence in new social situations.",
          ],
          [
            "5f51c583-ca54-4a06-b7ff-3c8594b8fc4a",
            "Play with one or more other children, extending and elaborating play ideas.",
          ],
          [
            "0519cf0e-924f-486b-8198-5d6b8653b634",
            "Find solutions to conflicts and rivalries. For example, accepting that not everyone can be Spider-Man in the game, and suggesting other ideas.",
          ],
          [
            "11eb37f0-8e87-4ec3-90ef-cf8f228490fc",
            "Increasingly follow rules, understanding why they are important.",
          ],
          [
            "04ece0da-87b7-4b70-9b4e-7f3e85e97303",
            "Remember rules without needing an adult to remind them.",
          ],
          [
            "c1a09a62-1c04-4964-9eb6-9e1fb518bb86",
            "Develop appropriate ways of being assertive.",
          ],
          [
            "ab94b6b0-cb6c-4ea5-9515-584f3a105b73",
            "Talk with others to solve conflicts.",
          ],
          [
            "01939948-8fe7-42f1-91ac-fcafe61122e7",
            "Talk about their feelings using words like ‘happy’, ‘sad’, ‘angry’ or ‘worried’.",
          ],
          [
            "c37e6cab-e805-4e44-a84b-bee404a593bc",
            "Understand gradually how others might be feeling.",
          ],
          [
            "6df1bdd3-5c09-4e6d-b614-153d1be8635d",
            "Be increasingly independent in meeting their own care needs, e.g., brushing teeth, using the toilet, washing and drying their hands thoroughly.",
          ],
          [
            "19a10a4d-863a-4b82-9e5d-3673e8fdfeb6",
            "Make healthy choices about food, drink, activity and toothbrushing.",
          ],
        ],
      },
      {
        identifier: "ab624282-9d2a-4198-80de-c55972a04f89",
        band: "Children in reception",
        statements: [
          [
            "1b1ff390-e0f3-46ec-b477-25b81bedb441",
            "See themselves as a valuable individual.",
          ],
          [
            "195fdc82-9c2f-431e-bf0d-b93c483c379d",
            "Build constructive and respectful relationships.",
          ],
          [
            "10d80c48-214a-4077-9898-00d2de6cc548",
            "Express their feelings and consider the feelings of others.",
          ],
          [
            "6c32a91e-efa0-4ca7-998a-b440a49426dd",
            "Show resilience and perseverance in the face of challenge.",
          ],
          [
            "be4f74d9-2bdc-4477-a97d-6f4232a575b6",
            "Identify and moderate their own feelings socially and emotionally.",
          ],
          [
            "4fe7270c-c3bb-4498-a405-3c28fde1023a",
            "Think about the perspectives of others.",
          ],
          [
            "e43501c9-4dd9-417b-bb4a-0527cfa50c0b",
            "Manage their own needs.\n• Personal hygiene",
          ],
          [
            "04cad757-e9eb-4fea-a6de-d965e1809b50",
            "Know and talk about the different factors that support their overall health and wellbeing:\n• regular physical activity\n• healthy eating\n• toothbrushing\n• sensible amounts of ‘screen time’\n• having a good sleep routine\n• being a safe pedestrian",
          ],
        ],
      },
    ],
  },
  {
    identifier: "948fef90-ffce-4134-b9dd-803d24d5cd92",
    code: "PD",
    name: "Physical development",
    bands: [
      {
        identifier: "6814c617-e77f-4ae1-8514-a4169c990137",
        band: "Birth to three",
        statements: [
          [
            "52220577-78be-4b71-a639-500763b7f53f",
            "Lift their head while lying on their front.",
          ],
          [
            "4deb0f21-b7da-4774-b417-7460925514f2",
            "Push their chest up with straight arms.",
          ],
          [
            "1e70dfd4-85d4-455c-a69c-af0f85c325ff",
            "Roll over: from front to back, then back to front.",
          ],
          [
            "4cf3b11a-7d90-4d9b-a3f6-0b530c946d59",
            "Enjoy moving when outdoors and inside.",
          ],
          ["bd75a1ce-2289-475c-9c63-c1f252c888c6", "Sit without support."],
          [
            "823e974d-a2cc-4982-ad9a-7cfb0ae4891d",
            "Begin to crawl in different ways and directions.",
          ],
          [
            "7d0845dd-4491-4896-9a3d-b56810dcc3aa",
            "Pull themselves upright and bouncing in preparation for walking.",
          ],
          [
            "d989c766-e47d-4f8d-af98-0893bd1dab32",
            "Reach out for objects as co-ordination develops.",
          ],
          [
            "f793f004-836f-4b0f-8f26-8b7f333cae50",
            "Pass things from one hand to the other. Let go of things and hand them to another person, or drop them.",
          ],
          [
            "9d2c23c7-c018-4a9f-bbae-8eb8d4026fdd",
            "Gradually gain control of their whole body through continual practice of large movements, such as waving, kicking, rolling, crawling and walking.",
          ],
          ["f6f81914-c7ad-49b6-a36c-0a3a1c5b2738", "Clap and stamp to music."],
          [
            "a9d15983-2205-4ed6-9e36-52697dac5eab",
            "Fit themselves into spaces, like tunnels, dens and large boxes, and move around in them.",
          ],
          [
            "7fea9935-e404-44ce-8e40-52ee28bdb34b",
            "Enjoy starting to kick, throw and catch balls.",
          ],
          [
            "0cb9d62f-f079-46da-a59c-3ac84b322284",
            "Build independently with a range of appropriate resources.",
          ],
          [
            "4926e48f-6ce3-4b3c-9203-b5dd9d3ba724",
            "Begin to walk independently – choosing appropriate props to support at first.",
          ],
          [
            "4377f35b-8799-4d1a-bdef-83941b2739bc",
            "Walk, run, jump and climb – and start to use the stairs independently.",
          ],
          [
            "9d0d7fe5-2efc-4d6f-af6c-506ad5d9f9b3",
            "Spin, roll and independently use ropes and swings (for example, tyre swings).",
          ],
          [
            "9a2b569d-40ca-4616-88b9-47c687688b97",
            "Sit on a push-along wheeled toy, use a scooter or ride a tricycle.",
          ],
          [
            "0c56224b-a08f-48d9-8779-35142dd783a2",
            "Use large and small motor skills to do things independently, for example manage buttons and zips, and pour drinks.",
          ],
          [
            "e3be6414-2c1d-4195-8051-d469946d0da9",
            "Show an increasing desire to be independent, such as wanting to feed themselves and dress or undress.",
          ],
          [
            "32ba4305-8d55-4c6c-8a2c-7da12ab39f87",
            "Start eating independently and learning how to use a knife and fork.",
          ],
          [
            "d56fad00-fd45-4474-9bb3-76bb44f055f1",
            "Develop manipulation and control.",
          ],
          [
            "e2d7b2b0-98c7-49ed-8a8d-b89e1b771410",
            "Explore different materials and tools.",
          ],
        ],
      },
      {
        identifier: "112d4a05-1f1e-495b-a263-1298b72cc3c7",
        band: "3 and 4-year-olds",
        statements: [
          [
            "0dae2dda-61d0-4350-8c6c-ba1939d3e231",
            "Continue to develop their movement, balancing, riding (scooters, trikes and bikes) and ball skills.",
          ],
          [
            "3741758d-c4c3-4878-bbfc-65698aaed827",
            "Go up steps and stairs, or climb up apparatus, using alternate feet.",
          ],
          [
            "8e72cfa8-c7d7-47dd-9a34-56751d4b63f5",
            "Skip, hop, stand on one leg and hold a pose for a game like musical statues.",
          ],
          [
            "9fd6c452-5f0b-4be1-ad2c-a7bba4742103",
            "Use large-muscle movements to wave flags and streamers, paint and make marks.",
          ],
          [
            "55860f6f-b556-43d7-b46a-79ef5f948ac5",
            "Start taking part in some group activities which they make up for themselves, or in teams.",
          ],
          [
            "5de7892c-7ea6-4ca0-9cfc-549e7ea77b6e",
            "Increasingly be able to use and remember sequences and patterns of movements which are related to music and rhythm.",
          ],
          [
            "99235c50-6251-4336-9b8d-a6607e23c056",
            "Match their developing physical skills to tasks and activities in the setting. For example, they decide whether to crawl, walk or run across a plank, depending on its length and width.",
          ],
          [
            "64d66343-e325-4a16-81da-35ec72ddcffb",
            "Choose the right resources to carry out their own plan. For example, choosing a spade to enlarge a small hole they dug with a trowel.",
          ],
          [
            "37909b2e-d86c-49f2-85f5-9bd35aa0f137",
            "Collaborate with others to manage large items, such as moving a long plank safely, carrying large hollow blocks.",
          ],
          [
            "fd272757-9381-4243-b4be-09299fbfaa1a",
            "Use one-handed tools and equipment, for example, making snips in paper with scissors.",
          ],
          [
            "02ed2c79-47c6-416b-aef7-f27e94478e29",
            "Use a comfortable grip with good control when holding pens and pencils.",
          ],
          [
            "2aba1d11-55ac-4f10-a1ff-b569102e4ea1",
            "Show a preference for a dominant hand.",
          ],
          [
            "bf821978-7387-4f69-84f2-8606180b6036",
            "Be increasingly independent as they get dressed and undressed, for example, putting coats on and doing up zips.",
          ],
        ],
      },
      {
        identifier: "338f3d2a-dc37-4917-8da7-109a70ebee86",
        band: "Children in reception",
        statements: [
          [
            "fe149928-4d79-42c0-8dfe-3a9259a6bb2b",
            "Revise and refine the fundamental movement skills they have already acquired:\n• rolling\n• crawling\n• walking\n• jumping\n• running\n• hopping\n• skipping\n• climbing",
          ],
          [
            "a874d9f0-8dd3-431c-aa18-e3128c725be2",
            "Progress towards a more fluent style of moving, with developing control and grace.",
          ],
          [
            "2641c4ee-9166-4368-be89-8bf3c3c27bc5",
            "Develop the overall body strength, co-ordination, balance and agility needed to engage successfully with future physical education sessions and other physical disciplines including dance, gymnastics, sport and swimming.",
          ],
          [
            "f811ba4b-9082-436f-a1c2-905a709c93fb",
            "Develop their small motor skills so that they can use a range of tools competently, safely and confidently. Suggested tools: pencils for drawing and writing, paintbrushes, scissors, knives, forks and spoons.",
          ],
          [
            "571afa71-fe92-4f73-90b3-c5a430e57048",
            "Use their core muscle strength to achieve a good posture when sitting at a table or sitting on the floor.",
          ],
          [
            "af2e4ba5-ce91-4587-b572-ab1594976e57",
            "Combine different movements with ease and fluency.",
          ],
          [
            "2db0b81c-6aae-4b7a-8dab-5d18c591760c",
            "Confidently and safely use a range of large and small apparatus indoors and outside, alone and in a group.",
          ],
          [
            "31649204-e62b-498d-be14-4d9102480cf8",
            "Develop overall body-strength, balance, co-ordination and agility.",
          ],
          [
            "df1d76da-c15f-4ee6-b68a-f41de2ad0633",
            "Further develop and refine a range of ball skills including: throwing, catching, kicking, passing, batting, and aiming.",
          ],
          [
            "61179059-d828-477c-9495-ad6da8c544b2",
            "Develop confidence, competence, precision and accuracy when engaging in activities that involve a ball.",
          ],
          [
            "630d87c9-2f2c-4613-b9e3-893f7cf33b0d",
            "Develop the foundations of a handwriting style which is fast, accurate and efficient.",
          ],
          [
            "ffd0bbb2-b8dc-4ffb-a85f-f84cc7002e22",
            "Further develop the skills they need to manage the school day successfully:\n• lining up and queuing\n• mealtimes",
          ],
        ],
      },
    ],
  },
  {
    identifier: "3095f126-d197-48b1-b81e-d56690753fa6",
    code: "L",
    name: "Literacy",
    bands: [
      {
        identifier: "2439d09c-4588-4288-b47d-a149e7e9b718",
        band: "Birth to three",
        statements: [
          [
            "bf95f238-eca3-43e9-a463-f3ba65fe2ccf",
            "Enjoy songs and rhymes, tuning in and paying attention.",
          ],
          [
            "ace38e7c-0ec6-41fd-88b5-b3309f7bc918",
            "Join in with songs and rhymes, copying sounds, rhythms, tunes and tempo.",
          ],
          [
            "0d065086-ef12-4c07-bbee-7c88e25c1767",
            "Say some of the words in songs and rhymes.",
          ],
          [
            "2654acd6-0162-494e-b96a-f4599c34bead",
            "Copy finger movements and other gestures.",
          ],
          [
            "1119e013-a804-4219-b78a-2c071a566e89",
            "Sing songs and say rhymes independently, for example, singing whilst playing.",
          ],
          [
            "6fcedec5-582f-4fc8-99df-1a517905189f",
            "Enjoy sharing books with an adult.",
          ],
          [
            "d79a8078-454b-42c3-b623-68f20bcbb060",
            "Pay attention and respond to the pictures or the words.",
          ],
          [
            "1814943b-9ce7-40e3-9096-33651a0e3271",
            "Have favourite books and seek them out, to share with an adult, with another child, or to look at alone.",
          ],
          [
            "485ae5f9-acd7-4ef2-95ce-4b42899a12fc",
            "Repeat words and phrases from familiar stories.",
          ],
          [
            "a8835ac5-1bb3-496c-aaf9-4523f224e82a",
            "Ask questions about the book. Make comments and shares their own ideas.",
          ],
          [
            "61e5d54f-5ba4-405c-986c-2d4e00d8f687",
            "Develop play around favourite stories using props.",
          ],
          [
            "ecce0eeb-36e7-4489-946e-e7f496682866",
            "Notice some print, such as the first letter of their name, a bus or door number, or a familiar logo.",
          ],
          ["09976362-dcbf-4048-ba1a-09bc20cd5173", "Enjoy drawing freely."],
          [
            "ed0ed9a8-d83e-4e3d-93c9-ef8d129fc507",
            "Add some marks to their drawings, which they give meaning to. For example: “That says mummy.”",
          ],
          [
            "251da7be-6844-43bb-870f-493fcc6fe93f",
            "Make marks on their picture to stand for their name.",
          ],
        ],
      },
      {
        identifier: "d109bc73-d4a1-4535-ba57-29da998dff41",
        band: "3 and 4-year-olds",
        statements: [
          [
            "c604ee20-4781-4841-b91a-24cb69559217",
            "Understand the five key concepts about print:\n• print has meaning\n• print can have different purposes\n• we read English text from left to right and from top to bottom\n• the names of the different parts of a book\n• page sequencing",
          ],
          [
            "232be1a9-494c-4810-a05d-d82869a24a4e",
            "Develop their phonological awareness, so that they can:\n• spot and suggest rhymes\n• count or clap syllables in a word\n• recognise words with the same initial sound, such as money and mother",
          ],
          [
            "8c200b23-2ab9-4abe-bde9-ee0ead637ba5",
            "Engage in extended conversations about stories, learning new vocabulary.",
          ],
          [
            "aff42c43-e7b1-4335-b0d1-3cdbad836c64",
            "Use some of their print and letter knowledge in their early writing. For example: writing a pretend shopping list that starts at the top of the page; writing ‘m’ for mummy.",
          ],
          [
            "e5ab22bb-7114-424f-8536-61c343115caf",
            "Write some or all of their name.",
          ],
          [
            "15568c19-c90c-4181-8735-72457c53d8df",
            "Write some letters accurately.",
          ],
        ],
      },
      {
        identifier: "577dd89a-de52-4578-907d-49233cb68779",
        band: "Children in reception",
        statements: [
          [
            "9f562c89-aa69-4ea0-8e69-2edb2ab8a853",
            "Read individual letters by saying the sounds for them.",
          ],
          [
            "91ea1c61-1da1-45e9-860d-cd36c95d0a7c",
            "Blend sounds into words, so that they can read short words made up of known letter– sound correspondences.",
          ],
          [
            "d1473010-54f2-4b13-a0e8-f4a38eca7432",
            "Read some letter groups that each represent one sound and say sounds for them.",
          ],
          [
            "74ce2128-12f8-442a-b307-428ec14511a4",
            "Read a few common exception words matched to the school’s phonic programme.",
          ],
          [
            "87cd6f62-bb13-4e9f-8ed3-ad030ff46d8c",
            "Read simple phrases and sentences made up of words with known letter–sound correspondences and, where necessary, a few exception words.",
          ],
          [
            "8d5d004a-592d-462e-b44e-c008bf41d700",
            "Re-read these books to build up their confidence in word reading, their fluency and their understanding and enjoyment.",
          ],
          [
            "97615cac-61b8-49ad-ae52-3868c4fb146d",
            "Form lower-case and capital letters correctly.",
          ],
          [
            "9d237b13-a250-4752-ad84-ed232bc8d304",
            "Spell words by identifying the sounds and then writing the sound with letter/s.",
          ],
          [
            "9a3770ae-b96b-44c9-9356-4a1b3ecf398f",
            "Write short sentences with words with known sound-letter correspondences using a capital letter and full stop.",
          ],
          [
            "08c31ecb-674d-4f40-9126-36071b15a8d1",
            "Re-read what they have written to check that it makes sense.",
          ],
        ],
      },
    ],
  },
  {
    identifier: "d7402166-164b-4cb6-9b77-ac7df79f9561",
    code: "M",
    name: "Mathematics",
    bands: [
      {
        identifier: "406a8176-0c8c-45ab-9f3a-97ba20cf6280",
        band: "Birth to three",
        statements: [
          [
            "6a5d5353-41d3-44e3-a795-4dcc45f6d8eb",
            "Combine objects like stacking blocks and cups. Put objects inside others and take them out again.",
          ],
          [
            "78742c4f-9f62-4d67-8bf9-b0a5ea27e2e6",
            "Take part in finger rhymes with numbers.",
          ],
          [
            "207a7650-2b45-4b7f-a284-1289230004c0",
            "React to changes of amount in a group of up to three items.",
          ],
          [
            "169f8fbb-ad97-42c2-89aa-1a1557a9cf34",
            "Compare amounts, saying ‘lots’, ‘more’ or ‘same’.",
          ],
          [
            "1192cf46-b008-4e03-a899-0ccb77158bb2",
            "Develop counting-like behaviour, such as making sounds, pointing or saying some numbers in sequence.",
          ],
          [
            "0c807ecc-cf25-4b70-bcb5-d70c3cc7f7a6",
            "Count in everyday contexts, sometimes skipping numbers – ‘1-2-3-5’.",
          ],
          [
            "2581cf45-85db-4125-ac64-c1582d9a0c60",
            "Climb and squeeze themselves into different types of spaces.",
          ],
          [
            "e3c5d388-3e5e-4a3d-a762-d5f890b2b07f",
            "Build with a range of resources.",
          ],
          ["0ce82efd-e392-4b08-890f-313508d1eaf6", "Complete inset puzzles."],
          [
            "29f612fe-bfb4-483f-8298-9ac3253318ee",
            "Compare sizes, weights etc. using gesture and language - ‘bigger/little/smaller’, ‘high/low’, ‘tall’, ‘heavy’.",
          ],
          [
            "4749ace7-03e4-4664-88fd-4ea2d5817678",
            "Notice patterns and arrange things in patterns.",
          ],
        ],
      },
      {
        identifier: "1ac0b808-f4ee-469a-aa53-e18c91ae9e97",
        band: "3 and 4-year-olds",
        statements: [
          [
            "828e6baf-dd6d-42b8-9046-78fc2ee73bd7",
            "Develop fast recognition of up to 3 objects, without having to count them individually (‘subitising’).",
          ],
          ["1a273be6-a189-4516-a73a-36c473e07d11", "Recite numbers past 5."],
          [
            "9518045e-bc95-4e81-891f-97e23af3bdc7",
            "Say one number for each item in order: 1,2,3,4,5.",
          ],
          [
            "9d8f1cf6-e83b-4f6c-abe2-4105fb17dd7f",
            "Know that the last number reached when counting a small set of objects tells you how many there are in total (‘cardinal principle’).",
          ],
          [
            "934dcbc8-8117-4eab-bf8f-cb1941e86841",
            "Show ‘finger numbers’ up to 5.",
          ],
          [
            "603fa14b-0232-4769-b246-097f02d81248",
            "Link numerals and amounts: for example, showing the right number of objects to match the numeral, up to 5.",
          ],
          [
            "fbfec929-f3e5-4431-97d8-b460992466d5",
            "Experiment with their own symbols and marks as well as numerals.",
          ],
          [
            "80c560ed-a66c-42f0-8066-8dfa9b8e51d2",
            "Solve real world mathematical problems with numbers up to 5.",
          ],
          [
            "08b020da-3cc3-4ffd-8798-1139e937430c",
            "Compare quantities using language: ‘more than’, ‘fewer than’.",
          ],
          [
            "9039bf71-0580-4afe-b805-a53f40f81258",
            "Talk about and explore 2D and 3D shapes (for example, circles, rectangles, triangles and cuboids) using informal and mathematical language: ‘sides’, ‘corners’; ‘straight’, ‘flat’, ‘round’.",
          ],
          [
            "1ac9df19-03a8-41f2-9a33-6aac7667dbee",
            "Understand position through words alone – for example, “The bag is under the table,” – with no pointing.",
          ],
          [
            "b12ba15d-fdeb-4282-a9f1-0af8cd09f77e",
            "Describe a familiar route.",
          ],
          [
            "afc1307d-ca09-47ca-b4a6-1f69d8eda000",
            "Discuss routes and locations, using words like ‘in front of’ and ‘behind’.",
          ],
          [
            "16103c7c-5b17-4c8a-8204-3f3330859fa1",
            "Make comparisons between objects relating to size, length, weight and capacity.",
          ],
          [
            "1f403817-b3b9-4faa-b0b4-5d5444db72c3",
            "Select shapes appropriately: flat surfaces for building, a triangular prism for a roof, etc.",
          ],
          [
            "a7c9dfbe-bf34-407e-ab4c-8e23e69c3c22",
            "Combine shapes to make new ones – an arch, a bigger triangle, etc.",
          ],
          [
            "f4a7390d-c40e-41f8-b79c-a27e47b3ee41",
            "Talk about and identify the patterns around them. For example: stripes on clothes, designs on rugs and wallpaper. Use informal language like ‘pointy’, ‘spotty’, ‘blobs’, etc.",
          ],
          [
            "24d7d002-f5a8-43b5-b9d0-ec33acd7847d",
            "Extend and create ABAB patterns – stick, leaf, stick, leaf.",
          ],
          [
            "cbc21828-1eef-4ab5-87d5-9079807deba4",
            "Notice and correct an error in a repeating pattern.",
          ],
          [
            "cc8b2c00-5bef-47df-ae95-d3f55e32cf5f",
            "Begin to describe a sequence of events, real or fictional, using words such as ‘first’, ‘then...’",
          ],
        ],
      },
      {
        identifier: "fdc887dd-1a8d-4193-b0ec-c35d61790935",
        band: "Children in reception",
        statements: [
          [
            "bdafdb58-4b77-41a2-8f86-1e0b40b718ae",
            "Count objects, actions and sounds.",
          ],
          ["640d50d6-a8d0-4ba8-8bc3-49631e0114e3", "Subitise."],
          [
            "7f56afa1-c60a-4150-9a59-d229e6c3feb5",
            "Link the number symbol (numeral) with its cardinal number value.",
          ],
          ["cbaf7062-44a8-4ec9-9893-7a0f3e04544c", "Count beyond ten."],
          ["e758534a-b7b7-4e5c-bdba-886c719d1d8a", "Compare numbers."],
          [
            "e32cb48f-4465-4d58-a0ef-30ac4658a963",
            "Understand the ‘one more than/one less than’ relationship between consecutive numbers.",
          ],
          [
            "bb1a1423-0c53-49ac-84de-89adc1ce36a7",
            "Explore the composition of numbers to 10.",
          ],
          [
            "d3c5a846-3052-4e60-b82c-b7116f0f08aa",
            "Automatically recall number bonds for numbers 0–5 and some to 10.",
          ],
          [
            "daf3ec12-7956-4b11-b8ff-37bcebf79149",
            "Select, rotate and manipulate shapes to develop spatial reasoning skills.",
          ],
          [
            "9d018080-4060-4503-ba45-72a0e30730d2",
            "Compose and decompose shapes so that children recognise a shape can have other shapes within it, just as numbers can.",
          ],
          [
            "52a5c442-fa53-4373-b653-6a7330c7ebd4",
            "Continue, copy and create repeating patterns.",
          ],
          [
            "b55e5040-6104-4934-ac26-bca285c9f692",
            "Compare length, weight and capacity.",
          ],
        ],
      },
    ],
  },
  {
    identifier: "fe722806-b648-49fe-a24d-ecd8a6773c19",
    code: "UW",
    name: "Understanding the world",
    bands: [
      {
        identifier: "53868e3f-4f9f-448b-a372-5a8568669499",
        band: "Birth to three",
        statements: [
          [
            "0bbc1fa0-f59f-44ec-9334-d43ad05cfe9b",
            "Repeat actions that have an effect.",
          ],
          [
            "ea6aa22e-9f13-4597-bfd3-c7aa94680618",
            "Explore materials with different properties.",
          ],
          [
            "cd189fa5-485f-46b0-b60b-99ec3f9cc531",
            "Explore natural materials, indoors and outside.",
          ],
          [
            "84ecb20d-4a2d-457c-be9e-076642808b18",
            "Explore and respond to different natural phenomena in their setting and on trips.",
          ],
          [
            "40fc9211-740f-4d37-bb50-0777a9f5713d",
            "Make connections between the features of their family and other families.",
          ],
          [
            "940e599d-9b77-43d5-934b-0c14b4424ed9",
            "Notice differences between people.",
          ],
        ],
      },
      {
        identifier: "861c997d-9597-4787-9885-462b44f7a3a7",
        band: "3 and 4-year-olds",
        statements: [
          [
            "cbbc0eef-1ad8-49fb-a361-1941e0216d72",
            "Use all their senses in hands-on exploration of natural materials.",
          ],
          [
            "bcab237c-d0ae-4d86-b318-d423e58e56d5",
            "Explore collections of materials with similar and/or different properties.",
          ],
          [
            "ab428672-1c2e-4c79-aa92-4ec6289f1979",
            "Talk about what they see, using a wide vocabulary.",
          ],
          [
            "5482c826-6517-400a-9a2b-72d38503637b",
            "Begin to make sense of their own life-story and family’s history.",
          ],
          [
            "afcd311a-a550-494e-9252-183a63777949",
            "Show interest in different occupations.",
          ],
          ["ae7579e7-7cf7-49a4-84f9-c7a68e66e050", "Explore how things work."],
          [
            "80268344-038e-48fc-96b8-6c0e95b45704",
            "Plant seeds and care for growing plants.",
          ],
          [
            "905757ae-83d6-4426-a9c8-425e746d9588",
            "Understand the key features of the life cycle of a plant and an animal.",
          ],
          [
            "473c4d23-1af8-45ef-b357-265999924fd8",
            "Begin to understand the need to respect and care for the natural environment and all living things.",
          ],
          [
            "84c0a42d-44eb-48b6-be91-6758959560eb",
            "Explore and talk about different forces they can feel.",
          ],
          [
            "c5b48bc8-2fda-4a40-b7ba-48a35717665b",
            "Talk about the differences between materials and changes they notice.",
          ],
          [
            "45c55e20-9db7-4924-b41d-070a58bb752e",
            "Continue developing positive attitudes about the differences between people.",
          ],
          [
            "fb4294d0-b869-4740-bdd2-f47ee2c76e3e",
            "Know that there are different countries in the world and talk about the differences they have experienced or seen in photos.",
          ],
        ],
      },
      {
        identifier: "dff16d6f-58dd-4f5e-8f97-e1cebf71eb1f",
        band: "Children in reception",
        statements: [
          [
            "c1cb1669-58bb-4775-a18f-6f379fc61cd2",
            "Talk about members of their immediate family and community.",
          ],
          [
            "24b91043-d313-4c50-8fa7-b7bf255b4e1f",
            "Name and describe people who are familiar to them.",
          ],
          [
            "754b1eda-e77a-4c90-a055-ef548ac4a834",
            "Comment on images of familiar situations in the past.",
          ],
          [
            "1866b91b-5282-4da2-9076-72f9f5d374d5",
            "Compare and contrast characters from stories, including figures from the past.",
          ],
          [
            "024b3537-f927-414d-a79b-f32fa26dde41",
            "Draw information from a simple map.",
          ],
          [
            "6de54cc6-725b-4541-b478-1c9bd29b7320",
            "Understand that some places are special to members of their community.",
          ],
          [
            "3876ea41-c6fd-4829-aaed-c8f47435d00e",
            "Recognise that people have different beliefs and celebrate special times in different ways.",
          ],
          [
            "164314e6-20ac-4ca4-8461-1cb3c06a869a",
            "Recognise some similarities and differences between life in this country and life in other countries.",
          ],
          [
            "078745c8-89e4-4389-a2d5-caef4af14bb3",
            "Explore the natural world around them.",
          ],
          [
            "dd8a652e-95cc-41c3-afc3-2f6a5aee9934",
            "Describe what they see, hear and feel whilst outside.",
          ],
          [
            "aee0a3f0-bad3-4990-b168-bafdf09b1840",
            "Recognise some environments that are different from the one in which they live.",
          ],
          [
            "1482624e-d0b7-4124-8d79-b9d574c4a55f",
            "Understand the effect of changing seasons on the natural world around them.",
          ],
        ],
      },
    ],
  },
  {
    identifier: "1d4e3c3d-c202-4e54-a8b0-8e0f5f0043a3",
    code: "EAD",
    name: "Expressive arts and design",
    bands: [
      {
        identifier: "8b3e8a59-171c-4d1a-a521-e723023095de",
        band: "Birth to three",
        statements: [
          [
            "b823a509-3092-47cb-900f-eef04475c59b",
            "Show attention to sounds and music.",
          ],
          [
            "5767551f-c073-4a43-bc3d-3e81739f6dc3",
            "Respond emotionally and physically to music when it changes.",
          ],
          ["98e912b3-18fc-416a-8c3c-00d19ed778cf", "Move and dance to music."],
          [
            "c6ec6ddb-b089-47ab-a131-ede9780d02f8",
            "Anticipate phrases and actions in rhymes and songs, like ‘Peepo’.",
          ],
          [
            "1e694b9c-5a27-4c3f-b4bf-3db86f920fd4",
            "Explore their voices and enjoy making sounds.",
          ],
          [
            "b80489fe-9bec-4b42-92d7-1fa039f3a901",
            "Join in with songs and rhymes, making some sounds.",
          ],
          [
            "e6defbb4-4d2c-4f5b-a580-d619fa25c4a6",
            "Make rhythmical and repetitive sounds.",
          ],
          [
            "a6751c53-552c-4d59-bc6a-24180878ee62",
            "Explore a range of soundmakers and instruments and play them in different ways.",
          ],
          [
            "62b1b339-0e19-4bd9-bc5a-2301d4b8c386",
            "Notice patterns with strong contrasts and be attracted by patterns resembling the human face.",
          ],
          [
            "02325131-10eb-4ccd-9765-9dd05908c8ef",
            "Start to make marks intentionally.",
          ],
          [
            "1b27b231-5b08-44b3-8706-113ff7c27be0",
            "Explore paint, using fingers and other parts of their bodies as well as brushes and other tools.",
          ],
          [
            "8e2db65c-70ba-4d8d-8792-535b38edc910",
            "Express ideas and feelings through making marks, and sometimes give a meaning to the marks they make.",
          ],
          [
            "71040b13-20b5-429c-bf94-3cfb3fa4e690",
            "Enjoy and take part in action songs, such as ‘Twinkle, Twinkle Little Star’.",
          ],
          [
            "e18538e8-17dd-49c2-b45f-d53647b0480e",
            "Start to develop pretend play, pretending that one object represents another. For example, a child holds a wooden block to her ear and pretends it’s a phone.",
          ],
          [
            "e6718f02-c209-466c-9ec5-585d5b42c865",
            "Explore different materials, using all their senses to investigate them. Manipulate and play with different materials.",
          ],
          [
            "deeb04fa-4712-41a3-8a3f-d277afdad49c",
            "Use their imagination as they consider what they can do with different materials.",
          ],
          [
            "e76c239e-4484-4d75-a488-a237d02f2bcc",
            "Make simple models which express their ideas.",
          ],
        ],
      },
      {
        identifier: "d1c4e0e1-fa75-491f-ab26-2182abd4f0dd",
        band: "3 and 4-year-olds",
        statements: [
          [
            "c28db438-3f43-41d8-8fe1-1cff0befe247",
            "Take part in simple pretend play, using an object to represent something else even though they are not similar.",
          ],
          [
            "36878c16-48e5-4f75-b8e0-f033ff968407",
            "Begin to develop complex stories using small world equipment like animal sets, dolls and dolls houses, etc.",
          ],
          [
            "2866564d-b25d-44be-ba40-556b3cce3b7c",
            "Make imaginative and complex ‘small worlds’ with blocks and construction kits, such as a city with different buildings and a park.",
          ],
          [
            "1f5bbe5b-4750-4f7d-b5bd-2f656540df1f",
            "Explore different materials freely, to develop their ideas about how to use them and what to make.",
          ],
          [
            "c3844988-0a93-41c9-ae52-31d1e21dff20",
            "Develop their own ideas and then decide which materials to use to express them.",
          ],
          [
            "f472c312-adb9-4419-9f52-402707fa904c",
            "Join different materials and explore different textures.",
          ],
          [
            "6584d836-fda3-450a-bfe7-9e315fc9533a",
            "Create closed shapes with continuous lines and begin to use these shapes to represent objects.",
          ],
          [
            "18bbb841-1822-4e36-ab52-5de0c6a3090e",
            "Draw with increasing complexity and detail, such as representing a face with a circle and including details.",
          ],
          [
            "2f1cbd95-7534-4c62-b1b1-87053d7c48e9",
            "Use drawing to represent ideas like movement or loud noises.",
          ],
          [
            "59abfd7c-42a8-43dd-88ac-f83e86c2e613",
            "Show different emotions in their drawings and paintings, like happiness, sadness, fear, etc.",
          ],
          [
            "dacabba6-d97e-48bb-9e9b-c57be54e36bf",
            "Explore colour and colour mixing.",
          ],
          [
            "562cec52-da7c-486a-89f5-09bb6706d913",
            "Show different emotions in their drawings – happiness, sadness, fear, etc.",
          ],
          [
            "bf6f90d0-99b6-417c-8001-e4b2e7d52121",
            "Listen with increased attention to sounds.",
          ],
          [
            "3ec3bb93-aaee-4bbe-b5f8-d1ff97bb4acd",
            "Respond to what they have heard, expressing their thoughts and feelings.",
          ],
          [
            "19cebf17-ec1d-4229-bd59-443fe3063d36",
            "Remember and sing entire songs.",
          ],
          [
            "7945b122-6820-4747-b02c-b5c07063fc9a",
            "Sing the pitch of a tone sung by another person (‘pitch match’).",
          ],
          [
            "9468a709-f21b-4b96-937e-b3f403e9d7f1",
            "Sing the melodic shape (moving melody, such as up and down, down and up) of familiar songs.",
          ],
          [
            "4ebeb1c2-d152-4029-bf68-d196eb2d8ab5",
            "Create their own songs or improvise a song around one they know.",
          ],
          [
            "ef301cc3-4bd4-4292-800b-edd44e4c4d1a",
            "Play instruments with increasing control to express their feelings and ideas.",
          ],
        ],
      },
      {
        identifier: "c35934f2-125d-466e-a706-4bec2337a4de",
        band: "Children in reception",
        statements: [
          [
            "9cd6783a-ae9d-4ac1-b8ac-f5309d88ed1c",
            "Explore, use and refine a variety of artistic effects to express their ideas and feelings.",
          ],
          [
            "5d7b78a9-b871-4056-89b5-c3ae00827604",
            "Return to and build on their previous learning, refining ideas and developing their ability to represent them.",
          ],
          [
            "21aab6c0-f93d-4277-9c0e-cb0de4f84047",
            "Create collaboratively, sharing ideas, resources and skills.",
          ],
          [
            "d4a71571-80f0-4122-ac74-85cfd204664b",
            "Listen attentively, move to and talk about music, expressing their feelings and responses.",
          ],
          [
            "082747b1-9898-473b-9ae5-946e3b526db8",
            "Watch and talk about dance and performance art, expressing their feelings and responses.",
          ],
          [
            "9d782ec0-afcc-4b6b-8018-6ec83ce1b330",
            "Sing in a group or on their own, increasingly matching the pitch and following the melody.",
          ],
          [
            "70c2cd58-7a49-4b8c-81d2-f1bb43f98ffe",
            "Develop storylines in their pretend play.",
          ],
          [
            "ece93097-46ff-4758-9b60-caae9cef2ace",
            "Explore and engage in music making and dance, performing solo or in groups.",
          ],
        ],
      },
    ],
  },
];

export const DEVELOPMENT_MATTERS = {
  identifier: DEVELOPMENT_MATTERS_IDENTIFIER,
  title: "Development Matters",
  description:
    "The Department for Education's non-statutory guidance for the Early Years Foundation Stage: what children will be learning, area by area, from birth to three, at three and four, and in Reception. Crown copyright, under the Open Government Licence v3.0.",
  items: itemsOf(AREAS),
};

function itemsOf(areas: readonly Area[]): GoalItem[] {
  const items: GoalItem[] = [];
  for (const [at, area] of areas.entries()) {
    items.push({
      identifier: area.identifier,
      parentIdentifier: null,
      position: at,
      code: area.code,
      statement: area.name,
      itemType: "Area of learning",
    });
    for (const [place, band] of area.bands.entries()) {
      items.push({
        identifier: band.identifier,
        parentIdentifier: area.identifier,
        position: place,
        code: "",
        statement: band.band,
        itemType: "Age band",
      });
      for (const [order, [identifier, statement]] of band.statements.entries())
        items.push({
          identifier,
          parentIdentifier: band.identifier,
          position: order,
          code: "",
          statement,
          itemType: "Statement",
        });
    }
  }
  return items;
}

/**
 * The framework, its areas and age bands in Arabic, for families who read
 * it; its statements are the guidance's own English words.
 */
export const DEVELOPMENT_MATTERS_ARABIC: Readonly<Record<string, string>> = {
  [DEVELOPMENT_MATTERS_IDENTIFIER]:
    "دليل النمو في السنوات المبكرة (Development Matters)",
  "0015c7be-d9a2-4fa0-af7c-ddfa0e4b622c": "التواصل واللغة",
  "2622d718-2b6a-454b-b4ba-43f2ffe5dac1": "من الولادة حتى سن الثالثة",
  "79771946-8c23-4015-b56f-e4a1012ddb51": "أطفال الثالثة والرابعة",
  "d671b9c0-fd5f-484f-bf6b-505c013d1927": "أطفال مرحلة الاستقبال",
  "a9672a2d-87e3-4b4d-b5ea-61cebc5615e7": "النمو الشخصي والاجتماعي والعاطفي",
  "b4495e46-9745-4372-9f4b-ff66b9a7dd4e": "من الولادة حتى سن الثالثة",
  "1b69a1f2-236e-4e10-a43e-86f06403d53e": "أطفال الثالثة والرابعة",
  "ab624282-9d2a-4198-80de-c55972a04f89": "أطفال مرحلة الاستقبال",
  "948fef90-ffce-4134-b9dd-803d24d5cd92": "النمو الجسدي",
  "6814c617-e77f-4ae1-8514-a4169c990137": "من الولادة حتى سن الثالثة",
  "112d4a05-1f1e-495b-a263-1298b72cc3c7": "أطفال الثالثة والرابعة",
  "338f3d2a-dc37-4917-8da7-109a70ebee86": "أطفال مرحلة الاستقبال",
  "3095f126-d197-48b1-b81e-d56690753fa6": "القراءة والكتابة",
  "2439d09c-4588-4288-b47d-a149e7e9b718": "من الولادة حتى سن الثالثة",
  "d109bc73-d4a1-4535-ba57-29da998dff41": "أطفال الثالثة والرابعة",
  "577dd89a-de52-4578-907d-49233cb68779": "أطفال مرحلة الاستقبال",
  "d7402166-164b-4cb6-9b77-ac7df79f9561": "الرياضيات",
  "406a8176-0c8c-45ab-9f3a-97ba20cf6280": "من الولادة حتى سن الثالثة",
  "1ac0b808-f4ee-469a-aa53-e18c91ae9e97": "أطفال الثالثة والرابعة",
  "fdc887dd-1a8d-4193-b0ec-c35d61790935": "أطفال مرحلة الاستقبال",
  "fe722806-b648-49fe-a24d-ecd8a6773c19": "فهم العالم",
  "53868e3f-4f9f-448b-a372-5a8568669499": "من الولادة حتى سن الثالثة",
  "861c997d-9597-4787-9885-462b44f7a3a7": "أطفال الثالثة والرابعة",
  "dff16d6f-58dd-4f5e-8f97-e1cebf71eb1f": "أطفال مرحلة الاستقبال",
  "1d4e3c3d-c202-4e54-a8b0-8e0f5f0043a3": "الفنون التعبيرية والتصميم",
  "8b3e8a59-171c-4d1a-a521-e723023095de": "من الولادة حتى سن الثالثة",
  "d1c4e0e1-fa75-491f-ab26-2182abd4f0dd": "أطفال الثالثة والرابعة",
  "c35934f2-125d-466e-a706-4bec2337a4de": "أطفال مرحلة الاستقبال",
};
