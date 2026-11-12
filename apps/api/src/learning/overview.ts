import {
  contentOf,
  listNode,
  paragraphNode,
  textNode,
} from "@faridalms/domain/content-conversion";

/** What a module offered as a template is, for its preview: its summary and lessons. */
export function moduleOverview(
  summary: string,
  lessons: readonly { title: string }[],
) {
  return contentOf([
    ...(summary.trim() ? [paragraphNode([textNode(summary.trim())])] : []),
    listNode(
      "number",
      lessons.map((lesson) => [textNode(lesson.title)]),
    ),
  ]);
}
