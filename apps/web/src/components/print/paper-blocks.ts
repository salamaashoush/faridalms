import type { LessonBlock, StudentBlock } from "@faridalms/domain/learning";

/**
 * A lesson block as a student received it, filled out to the shape its
 * paper form reads. A student's copy never held the answers, so the paper
 * cannot print them: every key is left empty.
 */
export function paperBlock(block: StudentBlock): LessonBlock {
  const blank = { hint: "", explanation: "" };
  switch (block.type) {
    case "choice":
      return {
        ...block,
        ...blank,
        options: block.options.map((option) => ({
          id: option.id,
          text: option.text,
          picture: option.picture ?? null,
          narration: option.narration ?? null,
          feedback: "",
        })),
        correctOptionIds: [],
      };
    case "text":
      return {
        ...block,
        ...blank,
        answers: [],
      };
    case "gaps":
      return {
        ...block,
        ...blank,
        segments: block.segments.map((segment) =>
          segment.type === "text" ? segment : { ...segment, answers: [] },
        ),
      };
    case "number":
      return {
        ...block,
        ...blank,
        mode: "exact",
        value: 0,
        tolerance: 0,
        percent: false,
        min: 0,
        max: 0,
      };
    case "matching": {
      // A prompt's own answer is the choice that carries its id.
      const prompts = new Set(block.prompts.map((prompt) => prompt.id));
      return {
        ...block,
        ...blank,
        pairs: block.prompts.map((prompt) => {
          const answer = block.choices.find(
            (choice) => choice.id === prompt.id,
          );
          return {
            id: prompt.id,
            prompt: prompt.text,
            promptPicture: prompt.picture ?? null,
            promptNarration: prompt.narration ?? null,
            answer: answer?.text ?? "",
            answerPicture: answer?.picture ?? null,
            answerNarration: answer?.narration ?? null,
          };
        }),
        distractors: block.choices
          .filter((choice) => !prompts.has(choice.id))
          .map((choice) => ({
            id: choice.id,
            text: choice.text,
            picture: choice.picture ?? null,
            narration: choice.narration ?? null,
          })),
      };
    }
    case "sorting":
      return {
        ...block,
        ...blank,
        items: block.items.map((item) => ({
          id: item.id,
          text: item.text,
          picture: item.picture ?? null,
          narration: item.narration ?? null,
          groupId: "",
        })),
      };
    case "spelling":
      return {
        ...block,
        ...blank,
        tiles: block.pile.slice(0, block.places).map((tile) => tile.text),
        extras: block.pile.slice(block.places).map((tile) => tile.text),
      };
    case "written":
    case "scratch":
    case "ordering":
    case "counting":
    case "tracing":
    case "hotspot":
      return { ...block, ...blank };
    default:
      return block;
  }
}
