# Questions and answers

One model of a question and its answer, shared by lessons, quizzes, the
question bank and every form a family fills in: the website's enquiry form
and an intake's application form. A surface chooses settings (whether it
marks, which kinds it asks, whether a question may be required, who reads
the answers and where they are kept); it never keeps a question or an
answer of its own shape.

## What there was

Before this model, questions were written down three ways.

- **Editor question blocks.** A `question` node in the shared editor
  (`packages/editor/src/nodes/question.ts`), with its parts as child nodes
  (`question-prompt`, `question-option`, `question-answer`, pairs, groups,
  passages and gaps) and its settings on the node. `packages/domain`
  checks the node in `content.ts` (`questionKinds`, `NODE_RULES`), reads
  it as a check in `lesson-content.ts` (`questionBlock`), and declares the
  check's shape in `learning.ts` (`lessonBlockSchema`), the answer in
  `responseSchema`, whether an answer may be taken in `responseIssue` and
  its mark in `markResponse`, with typed and numeric comparison in
  `answers.ts` and mathematics in `math-marking.ts`. Lessons
  (`lesson_responses`), quizzes (`quiz_answers`), bank questions
  (`bank_questions`, a document of one question, `bank.ts`), the quiz's
  draws from the bank (`quiz_draws`, each the drawn node), mixed reviews
  (`practice.ts`), the reader's printed paper (`print/PaperQuestion.tsx`),
  QTI 2.1 and 1.2 and Common Cartridge (`qti.ts`, `qti12.ts`,
  `qti-read.ts`, `cartridge*.ts`), the xAPI statements of an answer
  (`xapi.ts`, `interactionType`), the teacher's answer boards and the
  Right now view all read it this way. Grading scales (`grading.ts`) are
  grades, not questions.
- **Website form questions.** Items of the `form` site section
  (`site-sections.ts`): a label, a hint, `required`, a kind of `short`,
  `long`, `choice`, `date` or `number`, and a choice's options typed one
  a line. `enquiries.ts` checked answers (`readAnswers`) and kept each as
  a label and a string (`EnquiryAnswer`) in `site_enquiries.answers`.
- **Application form questions.** `admission_forms.questions` and the
  published `admission_form_versions.questions` held `AdmissionQuestion`
  rows (`admissions.ts`): the same five kinds with a label, hint and
  options in each language, read in one language through `questionIn` and
  checked by the website's `readAnswers`. A draft kept its answers as
  strings in `admission_applications.form.questions`; a sent application
  kept `EnquiryAnswer` rows in `admission_applications.answers`.

Consent forms are documents (`consent_form`) a family agrees to or
refuses; the decision is a consent record with its legal basis, not an
answer, and stays one. A consent form asks no questions.

## The model

**A question is an editor question block.** Whatever asks it, it is
written in the editor as a `question` node and read by `questionBlock` as
one of the check shapes of `learning.ts`: its kind, prompt, parts and
their pictures and recordings (the accessibility text: every picture's
description, every recording), points, hints, explanation, tries and its
key. Two settings serve forms and are open to every kind that takes them:

- `required` on any question: a form will not take the answers without
  one to it. Lessons and quizzes, which never take an empty answer, do
  not read it.
- `date` on a typed answer: the answer is a day, chosen from a calendar
  and kept as `YYYY-MM-DD`; a lesson's key is typed the same way.

**The key belongs to marking, not to the question's shape.** A choice's
right options and a typed answer's accepted words may be absent from the
shape; `questionShapes` in `learning.ts` declares every kind without
requiring one. `lessonBlockSchema` is those shapes holding a key where the
kind is marked by its key, which is what lessons, quizzes, the bank and
the exports read. A form's questions are read with `questionShapes` and
their keys left out.

**An answer is a response.** `responseSchema` has one shape per kind;
`responseIssue` says whether a response fits its question; `markResponse`
marks it. A form's answer to a choice is the option's id, never its
words, so the same answer reads in either language.

**A form keeps what the family saw.** `questions.ts` reads a form's
document (`formQuestions`), checks a family's responses against it
(`readFormAnswers`: the kind's response, the question's options, a
required question answered, a day that exists, a number that reads, and
the form's limits on length) and keeps each answer as `FormAnswer`: the
question's id and kind, its prompt and the answer in the words the
family read, beside the response itself. Editing the form afterwards
changes no enquiry or application.

## Surfaces

| Surface       | Marks | Kinds asked                               | Required | Answers kept in                                        | Read by               |
| ------------- | ----- | ----------------------------------------- | -------- | ------------------------------------------------------ | --------------------- |
| Lesson        | yes   | every kind                                | no       | `lesson_responses`                                     | the student, teachers |
| Quiz          | yes   | every kind but gates                      | no       | `quiz_answers`, draws in `quiz_draws`                  | the student, teachers |
| Question bank | yes   | every kind                                | no       | none                                                   | teachers              |
| Enquiry form  | no    | typed (or a day), written, choice, number | yes      | `site_enquiries.answers` as `FormAnswer[]`             | the admissions office |
| Application   | no    | typed (or a day), written, choice, number | yes      | draft `form.answers`, sent `answers` as `FormAnswer[]` | the admissions office |

`FORM_SURFACE` in `questions.ts` is the form's settings; the editor takes
it as `questions="form"`, which offers only those kinds, hides points,
tries, keys and feedback, and offers Required. A form's written answer is
words alone, and a form's question carries no pictures, since a visitor
who is not signed in reads it.

A form is written in the language the school chose first, with its
translation beside it, as a lesson is: the original decides the questions,
their kinds, options and order, and the translation gives their words
(`translatedContent` in `lesson-translation.ts`). The website's form
section holds its questions as a `questions` field, the original's
document in the original section and the translation's in the
translation, read through the same merge. An application form keeps its
`body`, `primary_locale` and `translation` on the form and on each
published version.

## Stored answers and questions that moved

The migration `form_questions` rewrote every stored form question and
answer in place, inside the migration's transaction:

- each website form section's items, in page documents, their
  translations, their versions and the published pages, became a document
  of question blocks; an option's id is derived from its question's id and
  its place (`md5(question || ':' || place)`), so the original and its
  translation, built separately, name each option alike;
- each application form and published version became its English
  document as the original and its Arabic as the translation, or the
  other way round where only Arabic was written, with the same ids;
- each draft's answers became responses, a choice found among the
  version's options in the family's language;
- each kept answer (`EnquiryAnswer`) became a `FormAnswer` with the same
  words. An enquiry's choice names the option by its place on the form
  as published when the family wrote, or by its words where that page no
  longer offers it.

Nothing reads the old shapes any more, so nothing converts them.
