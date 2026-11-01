import * as v from "valibot";

import type { Capability } from "./capabilities";

import { contentDocumentSchema } from "./content";

/** What a school keeps templates for: documents its staff start often. */
export const TEMPLATE_KINDS = [
  "lesson",
  "assignment",
  "unit_plan",
  "news",
  "announcement",
  "event",
  "consent_form",
  "module",
  "message",
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Who writes each kind of document, and so may keep and use its templates. */
export const TEMPLATE_AUTHORS: Record<TemplateKind, readonly Capability[]> = {
  lesson: ["learning:author"],
  assignment: ["assignments:author"],
  unit_plan: ["learning:author"],
  news: ["news:manage"],
  announcement: ["announcements:manage"],
  event: ["calendar:manage", "calendar:author"],
  consent_form: ["privacy:manage"],
  module: ["learning:author"],
  message: ["admissions:manage", "attendance:manage"],
};

/** The kinds of document someone holding these capabilities writes. */
export const kindsWritten = (capabilities: readonly string[]) =>
  TEMPLATE_KINDS.filter((kind) =>
    TEMPLATE_AUTHORS[kind].some((capability) =>
      capabilities.includes(capability),
    ),
  );

const id = v.pipe(v.string(), v.uuid());

const optionalId = v.optional(v.union([v.literal(""), id]), "");
const note = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), "");

/** Kinds kept as one document; a module is kept whole, lessons and all. */
export const DOCUMENT_TEMPLATE_KINDS = [
  "lesson",
  "assignment",
  "unit_plan",
  "news",
  "announcement",
  "event",
  "consent_form",
  "message",
] as const satisfies readonly TemplateKind[];
export type DocumentTemplateKind = (typeof DOCUMENT_TEMPLATE_KINDS)[number];

export const saveTemplateSchema = v.object({
  kind: v.picklist(DOCUMENT_TEMPLATE_KINDS),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  /** What it is for and how it is taught, as the library shows it. */
  description: note,
  subjectId: optionalId,
  content: contentDocumentSchema,
});
export type SaveTemplate = v.InferOutput<typeof saveTemplateSchema>;

export const templateKindSchema = v.object({
  kind: v.picklist(TEMPLATE_KINDS),
});
export const templateRefSchema = v.object({ id });

/** A whole module offered to the library, its lessons and plan with it. */
export const shareModuleSchema = v.object({
  moduleId: id,
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  description: note,
  subjectId: optionalId,
});

/** A module from the library started for one of the teacher's classes. */
export const moduleFromLibrarySchema = v.object({ id, classId: id });

/** The school library as its teachers browse it. */
export const librarySchema = v.object({
  kind: v.optional(v.union([v.literal(""), v.picklist(TEMPLATE_KINDS)]), ""),
  subjectId: optionalId,
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
});

/** A reviewer shares a piece with the school, or sends it back with a note. */
export const reviewTemplateSchema = v.object({
  id,
  share: v.boolean(),
  note,
});

/** The fields a message template may hold, filled in when it is put in the composer. */
export const MESSAGE_FIELDS = ["name", "child", "school", "sender"] as const;
export type MessageField = (typeof MESSAGE_FIELDS)[number];

/** What fills a message template's fields; a family's name or child left unknown reads neutrally. */
export function messageFields(
  locale: "en" | "ar",
  fields: Readonly<Record<MessageField, string>>,
): Record<MessageField, string> {
  const fallback =
    locale === "ar"
      ? { child: "طفلكم", name: "ولي الأمر" }
      : { child: "your child", name: "parent" };
  return {
    name: fields.name.trim() || fallback.name,
    child: fields.child.trim() || fallback.child,
    school: fields.school.trim(),
    sender: fields.sender.trim(),
  };
}

/**
 * The replies an office sends most, in both languages, given to every
 * school when it is made as message templates it may edit or remove. The
 * email's subject is the conversation's, so a family's mail program keeps
 * every message of it together. A custom migration gave them to the
 * schools that existed before; it copies these words.
 */
export const BUILTIN_MESSAGE_TEMPLATES: readonly {
  key: string;
  locale: "en" | "ar";
  title: string;
  body: string;
}[] = [
  {
    key: "enquiry_thanks_en",
    locale: "en",
    title: "Thank you for your enquiry",
    body: "Dear {name},\n\nThank you for your interest in {school}. We have received your enquiry and would be glad to tell you more about the school and how admission works.\n\nPlease reply to this email with any questions, or let us know a good time to call you.\n\nKind regards,\n{sender}\n{school}",
  },
  {
    key: "enquiry_thanks_ar",
    locale: "ar",
    title: "شكرًا لاستفساركم",
    body: "مرحبًا {name}،\n\nنشكركم على اهتمامكم بـ{school}. وصلنا استفساركم، ويسعدنا أن نعرّفكم بالمدرسة وبخطوات القبول.\n\nيمكنكم الرد على هذه الرسالة بأي سؤال، أو إخبارنا بالوقت المناسب للاتصال بكم.\n\nمع خالص التحية،\n{sender}\n{school}",
  },
  {
    key: "enquiry_visit_en",
    locale: "en",
    title: "Arranging a visit",
    body: "Dear {name},\n\nThank you for asking to visit. We would be delighted to show you around and answer your questions in person.\n\nPlease reply with two or three days and times that suit you, and we will confirm one.\n\nKind regards,\n{sender}\n{school}",
  },
  {
    key: "enquiry_visit_ar",
    locale: "ar",
    title: "ترتيب زيارة",
    body: "مرحبًا {name}،\n\nنشكركم على طلب الزيارة، ويسعدنا أن نرافقكم في جولة بالمدرسة ونجيب عن أسئلتكم.\n\nنرجو الرد بيومين أو ثلاثة وبالأوقات المناسبة لكم، وسنؤكد لكم أحدها.\n\nمع خالص التحية،\n{sender}\n{school}",
  },
  {
    key: "enquiry_information_en",
    locale: "en",
    title: "A little more about your child",
    body: "Dear {name},\n\nThank you for your enquiry. To advise you properly, could you tell us {child}'s date of birth, the year you are hoping for, and the school {child} attends now?\n\nKind regards,\n{sender}\n{school}",
  },
  {
    key: "enquiry_information_ar",
    locale: "ar",
    title: "معلومات إضافية عن طفلكم",
    body: "مرحبًا {name}،\n\nنشكركم على استفساركم. حتى نتمكن من إفادتكم على النحو الصحيح، نرجو إخبارنا بتاريخ ميلاد {child}، والصف الذي ترغبون في التقديم له، ومدرسته الحالية إن وُجدت.\n\nمع خالص التحية،\n{sender}\n{school}",
  },
  {
    key: "enquiry_places_en",
    locale: "en",
    title: "No place at the moment",
    body: "Dear {name},\n\nThank you for your enquiry. We do not have a place in the year you asked about at the moment. We would be glad to keep your details and contact you as soon as one becomes available.\n\nKind regards,\n{sender}\n{school}",
  },
  {
    key: "enquiry_places_ar",
    locale: "ar",
    title: "لا يتوفر مقعد حاليًا",
    body: "مرحبًا {name}،\n\nنشكركم على استفساركم. لا يتوفر لدينا حاليًا مقعد في الصف الذي سألتم عنه، ويسعدنا الاحتفاظ ببياناتكم والتواصل معكم فور توفر مقعد.\n\nمع خالص التحية،\n{sender}\n{school}",
  },
  {
    key: "enquiry_general_en",
    locale: "en",
    title: "Thank you for your message",
    body: "Dear {name},\n\nThank you for your message.\n\n\n\nKind regards,\n{sender}\n{school}",
  },
  {
    key: "enquiry_general_ar",
    locale: "ar",
    title: "شكرًا لرسالتكم",
    body: "مرحبًا {name}،\n\nنشكركم على رسالتكم.\n\n\n\nمع خالص التحية،\n{sender}\n{school}",
  },
];
