import {
  answerCommentSchema,
  assessSchema,
  discussionPostSchema,
  editDiscussionPostSchema,
  hideDiscussionPostSchema,
  hidePeerReviewSchema,
  peerReviewInputSchema,
  extendSchema,
  feedbackRecordingSchema,
  handInSchema,
  markQuizAnswerSchema,
  practiseQuizSchema,
  publishSchema,
  removeCommentSchema,
  reusableSchema,
  replyToCommentSchema,
  restoreCommentSchema,
  showGradeSchema,
  saveAssignmentSchema,
  saveBankCommentSchema,
  saveCommentSchema,
  saveDraftSchema,
  saveGroupSchema,
  saveQuizAnswerSchema,
  saveRubricSchema,
  studentWorkActionSchema,
  teacherListSchema,
  reuseSchema,
} from "@faridalms/domain/coursework";
import { reviewTranslationSchema } from "@faridalms/domain/translations";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

const uuid = v.pipe(v.string(), v.uuid());

export const getCourseworkOptions = createServerFn({ method: "GET" }).handler(
  () => record(backend().coursework.options()),
);

export const getReusable = createServerFn({ method: "GET" })
  .validator(checked(reusableSchema))
  .handler(({ data }) => record(backend().coursework.reusable(data)));

export const reuseAssignment = createServerFn({ method: "POST" })
  .validator(checked(reuseSchema))
  .handler(({ data }) => backend().coursework.reuse(data));

export const getCoursework = createServerFn({ method: "GET" })
  .validator(checked(teacherListSchema))
  .handler(({ data }) => record(backend().coursework.list(data)));

export const getAssignmentEditor = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().coursework.editor(data)));

export const getAssignmentRecord = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().coursework.record(data)));

export const getGrading = createServerFn({ method: "GET" })
  .validator(checked(v.object({ assignmentId: uuid, studentId: uuid })))
  .handler(({ data }) => record(backend().coursework.grading(data)));

export const getQuizAnswers = createServerFn({ method: "GET" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => record(backend().coursework.quizAnswers(data)));

export const getMyWork = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().coursework.work(data)));

export const getMyCoursework = createServerFn({ method: "GET" }).handler(() =>
  record(backend().coursework.mine()),
);

export const getSharedWork = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: uuid })))
  .handler(({ data }) => backend().coursework.shared(data));

export const getSharedPiece = createServerFn({ method: "GET" })
  .validator(checked(v.object({ attemptId: uuid })))
  .handler(({ data }) => backend().coursework.sharedPiece(data));

export const getChildCoursework = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: uuid })))
  .handler(({ data }) => record(backend().coursework.child(data)));

export const getStudentCoursework = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: uuid })))
  .handler(({ data }) => record(backend().coursework.student(data)));

export const getClassGroups = createServerFn({ method: "GET" })
  .validator(checked(v.object({ classId: uuid })))
  .handler(({ data }) => record(backend().coursework.groups(data)));

export const saveAssignment = createServerFn({ method: "POST" })
  .validator(checked(saveAssignmentSchema))
  .handler(({ data }) => backend().coursework.save(data));

export const publishAssignment = createServerFn({ method: "POST" })
  .validator(checked(publishSchema))
  .handler(({ data }) => backend().coursework.publish(data));

export const archiveAssignment = createServerFn({ method: "POST" })
  .validator(checked(publishSchema))
  .handler(({ data }) => backend().coursework.archive(data));

export const actOnWork = createServerFn({ method: "POST" })
  .validator(checked(studentWorkActionSchema))
  .handler(({ data }) => backend().coursework.act(data));

export const extendDueDates = createServerFn({ method: "POST" })
  .validator(checked(extendSchema))
  .handler(({ data }) => backend().coursework.extend(data));

export const assessAttempt = createServerFn({ method: "POST" })
  .validator(checked(assessSchema))
  .handler(({ data }) => backend().coursework.assess(data));

export const commentOnWork = createServerFn({ method: "POST" })
  .validator(checked(saveCommentSchema))
  .handler(({ data }) => backend().coursework.comment(data));

export const removeWorkComment = createServerFn({ method: "POST" })
  .validator(checked(removeCommentSchema))
  .handler(({ data }) => backend().coursework.uncomment(data));

export const addFeedbackRecording = createServerFn({ method: "POST" })
  .validator(checked(feedbackRecordingSchema))
  .handler(({ data }) => backend().coursework.addFeedbackRecording(data));

export const removeFeedbackRecording = createServerFn({ method: "POST" })
  .validator(checked(feedbackRecordingSchema))
  .handler(({ data }) => backend().coursework.removeFeedbackRecording(data));

export const showHeldGrade = createServerFn({ method: "POST" })
  .validator(checked(showGradeSchema))
  .handler(({ data }) => backend().coursework.showGrade(data));

export const restoreWorkComment = createServerFn({ method: "POST" })
  .validator(checked(restoreCommentSchema))
  .handler(({ data }) => backend().coursework.restoreWorkComment(data));

export const answerComment = createServerFn({ method: "POST" })
  .validator(checked(answerCommentSchema))
  .handler(({ data }) => backend().coursework.answerComment(data));

export const replyToComment = createServerFn({ method: "POST" })
  .validator(checked(replyToCommentSchema))
  .handler(({ data }) => backend().coursework.replyToComment(data));

export const getCommentBank = createServerFn({ method: "GET" }).handler(() =>
  backend().coursework.commentBank(),
);

export const saveToCommentBank = createServerFn({ method: "POST" })
  .validator(checked(saveBankCommentSchema))
  .handler(({ data }) => backend().coursework.saveBankComment(data));

export const removeFromCommentBank = createServerFn({ method: "POST" })
  .validator(checked(removeCommentSchema))
  .handler(({ data }) => backend().coursework.removeFromBank(data));

export const saveMyDraft = createServerFn({ method: "POST" })
  .validator(checked(saveDraftSchema))
  .handler(({ data }) => backend().coursework.saveDraft(data));

export const handInWork = createServerFn({ method: "POST" })
  .validator(checked(handInSchema))
  .handler(({ data }) => backend().coursework.handIn(data));

// A code exercise is marked by running it, which the API does on its own
// path; every other answer is kept as it is.
export const saveQuizAnswer = createServerFn({ method: "POST" })
  .validator(checked(saveQuizAnswerSchema))
  .handler(({ data }) =>
    data.response?.type === "program"
      ? backend().coursework.saveQuizProgram({
          assignmentId: data.assignmentId,
          blockId: data.blockId,
          code: data.response.code,
        })
      : backend().coursework.saveQuizAnswer(data),
  );

export const practiseQuiz = createServerFn({ method: "POST" })
  .validator(checked(practiseQuizSchema))
  .handler(({ data }) => backend().coursework.practiseQuiz(data));

export const startQuiz = createServerFn({ method: "POST" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => backend().coursework.startQuiz(data));

export const markQuizAnswer = createServerFn({ method: "POST" })
  .validator(checked(markQuizAnswerSchema))
  .handler(({ data }) => backend().coursework.markQuizAnswer(data));

export const undoHandIn = createServerFn({ method: "POST" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => backend().coursework.undoHandIn(data));

export const saveClassGroup = createServerFn({ method: "POST" })
  .validator(checked(saveGroupSchema))
  .handler(({ data }) => backend().coursework.saveClassGroup(data));

export const getDiscussion = createServerFn({ method: "GET" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => record(backend().coursework.discussion(data)));

export const postInDiscussion = createServerFn({ method: "POST" })
  .validator(checked(discussionPostSchema))
  .handler(({ data }) => backend().coursework.post(data));

export const editDiscussionPost = createServerFn({ method: "POST" })
  .validator(checked(editDiscussionPostSchema))
  .handler(({ data }) => backend().coursework.editPost(data));

export const hideDiscussionPost = createServerFn({ method: "POST" })
  .validator(checked(hideDiscussionPostSchema))
  .handler(({ data }) => backend().coursework.hidePost(data));

export const saveRubric = createServerFn({ method: "POST" })
  .validator(checked(saveRubricSchema))
  .handler(({ data }) => backend().coursework.saveTeacherRubric(data));

export const getPeerOverview = createServerFn({ method: "GET" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => record(backend().peer.overview(data)));

export const startPeerReview = createServerFn({ method: "POST" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => backend().peer.start(data));

export const releasePeerReviews = createServerFn({ method: "POST" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => backend().peer.release(data));

export const hidePeerReview = createServerFn({ method: "POST" })
  .validator(checked(hidePeerReviewSchema))
  .handler(({ data }) => backend().peer.hide(data));

export const getMyPeerReviews = createServerFn({ method: "GET" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => record(backend().peer.mine(data)));

export const sendPeerReview = createServerFn({ method: "POST" })
  .validator(checked(peerReviewInputSchema))
  .handler(({ data }) => backend().peer.send(data));

export const reviewBriefTranslation = createServerFn({ method: "POST" })
  .validator(checked(reviewTranslationSchema))
  .handler(({ data }) => backend().coursework.reviewBriefTranslation(data));
