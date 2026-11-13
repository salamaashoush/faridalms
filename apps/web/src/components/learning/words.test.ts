import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const arabic = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../../../../messages/ar.json"),
    "utf8",
  ),
) as Record<string, string>;

const NAMING_A_CLASS = [
  "lrnClass",
  "lrnClasses",
  "lrnErrClass",
  "lrnNoClassesBody",
  "lrnChooseClasses",
  "lrnClassesNeeded",
  "lrnNoStudents",
];

// «الصف» and «الصفوف» are a grade level in the product's Arabic; a class is «الفصل».
const GRADE_LEVEL = /(^|[^\p{L}])(ال)?(صف|صفًا|صفوف)(?=$|[^\p{L}])/u;
const CLASS = /فصل|فصول/;

describe("the e-learning strings that name a class, in Arabic", () => {
  const keys = NAMING_A_CLASS.flatMap((key) =>
    [key, `${key}Core`].filter((each) => each in arabic),
  );

  it.each(keys)("%s says «الفصل», not a grade level", (key) => {
    const line = arabic[key] ?? "";
    expect(line).toMatch(CLASS);
    expect(line).not.toMatch(GRADE_LEVEL);
  });
});
