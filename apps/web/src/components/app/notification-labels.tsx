import type {
  NotificationPayload,
  NotificationType,
} from "@faridalms/domain/notification";

import * as m from "~/i18n/messages";

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, () => string> = {
  assignment_published: m.notifTypeAssignment,
  assessment_released: m.notifTypeAssessment,
  message_received: m.notifTypeMessage,
  announcement_published: m.notifTypeAnnouncement,
  newsletter_published: m.notifTypeNewsletter,
};

type Text = { title: string; body: string };
const TEXT: Record<
  NotificationType,
  (payload: NotificationPayload, actor: string) => Text
> = {
  assignment_published: (payload, actor) => ({
    title: m.notifAssignmentTitle({ title: payload.title }),
    body: m.notifAssignmentBody({ actor, context: payload.preview }),
  }),
  assessment_released: (payload) => ({
    title: m.notifAssessmentTitle({ title: payload.title }),
    body: m.notifAssessmentBody({
      student: payload.studentName ?? m.notifYourChild(),
      score: payload.preview,
    }),
  }),
  message_received: (payload, actor) => ({
    title: m.notifMessageTitle({ actor }),
    body: `${payload.title}: ${payload.preview}`,
  }),
  announcement_published: (payload) => ({
    title: payload.title,
    body: payload.preview,
  }),
  newsletter_published: (payload) => ({
    title: m.notifNewsletterTitle({ title: payload.title }),
    body: payload.preview,
  }),
};

/** The in-app sentence for a notification, from the same payload the other channels use. */
export function notificationText(
  type: NotificationType,
  payload: NotificationPayload,
): Text {
  return TEXT[type](payload, payload.actorName ?? m.notifSomeone());
}
