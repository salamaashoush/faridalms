import type { Database } from "@faridalms/database";
import type { LessonDocument } from "@faridalms/domain/learning";

import { schema } from "@faridalms/database";
import { plainContent } from "@faridalms/domain/content-conversion";

/** Switches e-learning on and publishes one module for a class the teacher teaches. */
export async function seedLearning(
  db: Database,
  input: { adminId: string; teacherId: string; classId: string },
) {
  await db
    .insert(schema.schoolFeatures)
    .values({ key: "elearning", enabled: true, updatedById: input.adminId });
  const offering = await db.query.classSubjects.findFirst({
    where: { classId: input.classId, teacherId: input.teacherId },
    columns: { subjectId: true },
  });
  if (!offering) throw new Error("learning seed needs a taught subject");
  const now = new Date();
  const moduleId = crypto.randomUUID();
  await db.insert(schema.learningModules).values({
    id: moduleId,
    classId: input.classId,
    subjectId: offering.subjectId,
    title: "Exploring our neighbourhood",
    summary: "Maps, symbols and the places around the school.",
    status: "published",
    revision: 2,
    authorId: input.teacherId,
    publishedAt: now,
  });
  const symbolOptions = [
    { id: crypto.randomUUID(), text: "A red cross" },
    { id: crypto.randomUUID(), text: "A book" },
    { id: crypto.randomUUID(), text: "A tree" },
  ];
  const lessons: { title: string; document: LessonDocument }[] = [
    {
      title: "What is a map?",
      document: {
        version: 1,
        blocks: [
          {
            id: crypto.randomUUID(),
            type: "content",
            content: plainContent(
              "A map is a drawing of a place seen from above. It shows roads, buildings and rivers much smaller than they really are.",
            ),
          },
          {
            id: crypto.randomUUID(),
            type: "reflection",
            prompt: "Which places near your home would you put on a map?",
          },
        ],
      },
    },
    {
      title: "Map symbols",
      document: {
        version: 1,
        blocks: [
          {
            id: crypto.randomUUID(),
            type: "content",
            content: plainContent(
              "Maps use small pictures called symbols. A key explains what each symbol means.",
            ),
          },
          {
            id: crypto.randomUUID(),
            type: "quiz",
            question: "Which symbol marks a school on our map?",
            options: symbolOptions,
            correctOptionIds: [symbolOptions[1]?.id ?? ""],
            explanation:
              "The book stands for learning, so it marks the school.",
          },
        ],
      },
    },
  ];
  await db.insert(schema.lessons).values(
    lessons.map((lesson, index) => ({
      id: crypto.randomUUID(),
      moduleId,
      position: index,
      title: lesson.title,
      document: lesson.document,
    })),
  );
  await db.insert(schema.learningModules).values({
    id: crypto.randomUUID(),
    classId: input.classId,
    subjectId: offering.subjectId,
    title: "Weather diary",
    summary: "A draft module still being written.",
    status: "draft",
    authorId: input.teacherId,
  });
}
