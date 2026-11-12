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
  (`practice.ts`), the printed paper (`print/PaperQuestion.tsx`), the
  teacher's answer boards and the Right now view all read it this way. Grading scales (`grading.ts`) are grades, not
  questions.
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
refuses. The decision is a consent record with its legal basis, method and
evidence, not an answer, and stays one. A consent form asks no questions
of its own; when one does, it is a form surface like the two below, its
answers kept beside the consent record.

## The model

**A question is an editor question block.** Whatever asks it, it is
written in the editor as a `question` node and read by `questionBlock` as
one of the check shapes of `learning.ts`: its kind, prompt, parts and
their pictures and recordings (every picture's description, every
recording that reads it aloud), points, hints, explanation, tries and its
key. Two settings serve forms and are open to every surface:

- `required`, on any question: a form will not take the answers without
  one to it. Lessons and quizzes, which take answers one at a time, do not
  read it.
- `date`, on a typed answer: the answer is a day, chosen from a calendar
  and kept as `YYYY-MM-DD`. A lesson's key is typed the same way, and the
  player offers the calendar.

**The key belongs to marking, not to the question's shape.** A choice's
right options and a typed answer's accepted words may be absent from its
shape: `choiceShape` and `textShape` in `learning.ts` declare those kinds
without one, beside `numberSchema` and `writtenSchema`.
`lessonBlockSchema`, which lessons, quizzes, the bank and the exports
read, is the same shapes holding a key where the kind is marked by one,
and no more than eight options to a choice. A form asks with
`formQuestionSchema` in `questions.ts`, those four shapes with up to
twenty options, and leaves any key a block carries out.

**An answer is a response.** `responseSchema` has one shape per kind;
`responseIssue` says whether a response fits its question; `markResponse`
marks it. A form's answer to a choice names the option's id, never its
words, so the same answer reads in either language.

**A form keeps what the family saw.** `questions.ts` reads a form's
document (`formQuestions`), checks a family's responses against it
(`readFormAnswers`: the kind's response, an option the question offers,
one unless it takes several, a required question answered, a day that
exists, a number that reads, and the form's limits on length) and keeps
each answer as `FormAnswer`: the question's id and kind, its prompt, the
response and the answer in the words the family read, marked `date` for
a day. Editing the form afterwards changes no enquiry or application.
`formResponse` and `formValue` turn a form's inputs into responses and
back, for the website's form and the family's application alike.

**What a form may hold.** `formIssue` refuses a question of a kind a form
does not ask (anything but typed, written, choice and number), a written
answer spoken or drawn, a draw or a gate, a question with words but not
finished (a choice of fewer than two options), and any picture or file,
which a visitor who is not signed in cannot open. A question with no
words yet is not asked and holds nothing up.

## Surfaces

- **Lesson.** Marks; every kind; answers in `lesson_responses`, read by
  the student and the module's teachers.
- **Quiz.** Marks; every kind but gates; answers in `quiz_answers`, draws
  in `quiz_draws`; read by the student and teachers.
- **Question bank.** Marks; every kind; keeps no answers.
- **Enquiry form.** Marks nothing; typed (or a day), written, choice and
  number; a question may be required; answers kept in
  `site_enquiries.answers` as `FormAnswer[]`, read by the admissions
  office.
- **Application form.** As the enquiry form; a draft keeps responses in
  `admission_applications.form.answers`, a sent application `FormAnswer[]`
  in `admission_applications.answers`, read by the admissions office.

The editor takes a form surface as `forms` beside `questions`: its slash
menu offers only a form's kinds (and a day), a new question is worth
nothing and has no key, the floating bar offers Required and Answer is a
date but no points, tries, keys, feedback or explanation, and an option
cannot be marked right (`setQuestionsAsked`, `data-asked`).

A form is written in the language the school chose first, with its
translation beside it, as a lesson is: the original decides the questions,
their kinds, options and order, and the translation gives their words
(`translatedContent` in `lesson-translation.ts`, which `translatedLesson`
and `translatedQuiz` read through too). The website's form section holds
its questions as a rich field with `questions` set: the original's
document in the original section, the translation's in the translation,
merged by `overlay`, and a translation starts from the original's words.
An application form keeps `primary_locale`, `body` and `translation` on
the form and on each published version; `questionsIn` gives a family the
document in their language.

## Stored questions and answers that moved

Three migrations moved every stored form question and answer, in place
and in one transaction: `form_questions` added the application form's
documents, `form_questions_data` rewrote the data, and
`form_questions_columns` dropped the old question rows.

- Each website form section's items, in page documents, their
  translations and versions, and the published pages, became a document
  of question blocks. An option's id is its question's id and its place
  (`md5(question || ':' || place)`), so the original and its translation,
  moved separately, name each option alike.
- Each application form and published version became its English
  document as the original and its Arabic as the translation (Arabic the
  original where no question had English words), each field borrowing the
  other language's words where it had none, as `questionIn` read them.
- Each draft's answers became responses, a choice found by its words
  among the version's options in the family's language; empty answers and
  answers to questions the version no longer asks were dropped, as
  sending would have dropped them.
- Each kept answer became a `FormAnswer` in the same words. An enquiry's
  choice names its option by its place on the page as published when the
  family wrote, or, where that page no longer offers it, by an id made
  from its words.

The move was checked on a seeded cell holding every kind in both
languages, inside a transaction rolled back afterwards: every page,
published page, form, draft and kept answer read by the new schemas, both
languages asked the same questions, and every question and answer turned
back into its old shape matched what was there before, short and date
answers aside, which the old shape told apart only by `date`. Nothing
reads the old shapes any more, so nothing converts them.

A quiz's marks, scores, views, draws and exports were written down before
the move (`marks.test.ts`) and read the same after it.
