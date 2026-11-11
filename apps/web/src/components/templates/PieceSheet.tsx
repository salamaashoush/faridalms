import type { TemplateKind } from "@faridalms/domain/templates";

import { Button } from "@faridalms/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@faridalms/ui/sheet";
import { FormField, SelectField } from "@faridalms/ui/system/form-field";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { templatesQuery } from "~/queries/templates";

import { classTitle } from "~/components/classes/format";
import { ContentView } from "~/components/content/ContentView";
import { SavedSectionPreview } from "~/components/site/studio/SavedSections";
import { inLocale, useCapability } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { consentFormsQuery } from "~/queries/consents";
import { courseworkOptionsQuery } from "~/queries/coursework";
import { learningOptionsQuery } from "~/queries/learning";
import { sectionTemplateQuery, templateQuery } from "~/queries/templates";
import { moduleFromTemplate } from "~/server/learning";
import { reviewTemplate } from "~/server/templates";
import { getMessageFromError } from "~/utils/error";

export const KIND_LABEL: Record<TemplateKind, () => string> = {
  lesson: m.templateKindLesson,
  assignment: m.templateKindAssignment,
  unit_plan: m.templateKindPlan,
  announcement: m.templateKindAnnouncement,
  event: m.templateKindEvent,
  consent_form: m.templateKindConsentForm,
  module: m.templateKindModule,
  message: m.templateKindMessage,
  admission_letter: m.templateKindAdmissionLetter,
  section: m.templateKindSection,
};

export type Piece = Awaited<
  ReturnType<NonNullable<ReturnType<typeof templatesQuery>["queryFn"]>>
>["rows"][number];

export interface PieceSheetProps {
  piece: Piece;
  reviewing: boolean;
  open: boolean;
  onClose: () => void;
}

/**
 * A template as it reads, with what can be done with it: started in a
 * module or class as the teacher's own copy, or, waiting for review, shared
 * with the school or sent back to its owner with a note.
 */
export function PieceSheet({
  piece,
  reviewing,
  open,
  onClose,
}: PieceSheetProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reviews = useCapability("templates:review");
  const section = piece.kind === "section";
  // A reply is used from inside a message, and a letter of admission is
  // the school's own to edit; neither starts a document of its own here.
  const reply = piece.kind === "message";
  const letter = piece.kind === "admission_letter";
  const opened = useQuery({ ...templateQuery(piece.id), enabled: !section });
  const kept = useQuery({
    ...sectionTemplateQuery(piece.id),
    enabled: section,
  }).data;
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const modules = useQuery({
    ...learningOptionsQuery,
    enabled: piece.kind === "lesson" || piece.kind === "unit_plan",
  }).data?.modules;
  const classes = useQuery({
    ...courseworkOptionsQuery,
    enabled: piece.kind === "assignment" || piece.kind === "module",
  }).data?.classes;
  const purposes = useQuery({
    ...consentFormsQuery,
    enabled: piece.kind === "consent_form",
  }).data?.purposes;
  // A lesson or plan starts in a module, an assignment in a class, and a
  // consent form as the form of one purpose.
  const places =
    piece.kind === "assignment" || piece.kind === "module"
      ? (classes ?? []).map((row) => ({
          value: row.id,
          label: classTitle(row),
        }))
      : piece.kind === "lesson" || piece.kind === "unit_plan"
        ? (modules ?? []).map((row) => ({ value: row.id, label: row.title }))
        : piece.kind === "consent_form"
          ? (purposes ?? []).map((row) => ({
              value: row.id,
              label: inLocale(row.labelEn, row.labelAr),
            }))
          : [];
  const chosen = target || (places[0]?.value ?? "");
  const decide = useMutation({
    mutationFn: (share: boolean) =>
      reviewTemplate({ data: { id: piece.id, share, note: note.trim() } }),
    onSuccess: async (_, share) => {
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success(share ? m.templatesShared() : m.templatesSentBack());
      onClose();
    },
  });
  const startModule = useMutation({
    mutationFn: () =>
      moduleFromTemplate({ data: { id: piece.id, classId: chosen } }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ["learning"] });
      onClose();
      void navigate({ to: "/modules/$moduleId", params: { moduleId: id } });
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const use = () => {
    if (piece.kind === "module") {
      startModule.mutate();
      return;
    }
    onClose();
    if (piece.kind === "lesson")
      void navigate({
        to: "/lesson-editor",
        search: { moduleId: chosen, template: piece.id },
      });
    else if (piece.kind === "unit_plan")
      void navigate({
        to: "/module-plan",
        search: { moduleId: chosen, template: piece.id },
      });
    else if (piece.kind === "announcement")
      void navigate({
        to: "/announcement-editor",
        search: { template: piece.id },
      });
    else if (piece.kind === "event")
      void navigate({ to: "/event-editor", search: { template: piece.id } });
    else if (piece.kind === "consent_form")
      void navigate({
        to: "/consent-form-editor",
        search: { purpose: chosen, template: piece.id },
      });
    else if (letter)
      void navigate({
        to: "/admissions/letter-editor",
        search: { id: piece.id },
      });
    else
      void navigate({
        to: "/assignment-editor",
        search: { template: piece.id, ...(chosen ? { classId: chosen } : {}) },
      });
  };
  const side = getTextDirection(getLocale()) === "rtl" ? "left" : "right";
  const facts = [
    KIND_LABEL[piece.kind](),
    piece.mine
      ? m.tplYours()
      : inLocale(piece.ownerNameEn, piece.ownerNameAr) || null,
  ].filter(Boolean);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !decide.isPending) onClose();
      }}
    >
      <SheetContent
        side={side}
        className="gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[680px] data-[side=right]:sm:max-w-[680px]"
      >
        <SheetHeader className="border-b px-6 py-4 pe-14 max-md:pe-16">
          <SheetTitle dir="auto" className="text-base leading-6 font-semibold">
            {piece.title}
          </SheetTitle>
          <SheetDescription className="text-[13px] leading-[18px]">
            {facts.join(" · ")}
          </SheetDescription>
          {piece.description ? (
            <p dir="auto" className="text-sm leading-5 text-muted-foreground">
              {piece.description}
            </p>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {section ? (
            kept ? (
              <SavedSectionPreview saved={kept.section} />
            ) : (
              <div aria-busy="true" className="min-h-40" />
            )
          ) : opened.data ? (
            <ContentView document={opened.data.content} />
          ) : (
            <div aria-busy="true" className="min-h-40" />
          )}
        </div>
        <SheetFooter className="mt-0 grid gap-4 border-t px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {decide.error ? (
            <p role="alert" className="text-sm leading-5 text-destructive">
              {getMessageFromError(decide.error)}
            </p>
          ) : null}
          {reviewing && reviews ? (
            <>
              <FormField
                id="template-note"
                label={m.templatesNote()}
                hint={m.templatesNoteHint()}
                optional
              >
                {(control) => (
                  <Textarea
                    {...control}
                    dir="auto"
                    rows={2}
                    maxLength={500}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                )}
              </FormField>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="max-md:h-10"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate(true)}
                >
                  {decide.isPending && decide.variables ? (
                    <LoaderCircle className="animate-spin" aria-hidden />
                  ) : null}
                  {m.templatesShare()}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="max-md:h-10"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate(false)}
                >
                  {m.templatesSendBack()}
                </Button>
              </div>
            </>
          ) : (
            <>
              {places.length > 0 ? (
                <SelectField
                  id="template-use-in"
                  label={
                    piece.kind === "assignment" || piece.kind === "module"
                      ? m.templatesClass()
                      : piece.kind === "consent_form"
                        ? m.templatesPurpose()
                        : m.templatesModule()
                  }
                  hint={
                    piece.kind === "unit_plan"
                      ? m.templatesPlanHint()
                      : piece.kind === "consent_form"
                        ? m.templatesPurposeHint()
                        : undefined
                  }
                  value={chosen}
                  options={places}
                  onChange={setTarget}
                />
              ) : null}
              {section || reply ? (
                <p className="text-sm leading-5 text-muted-foreground">
                  {section ? m.templatesSectionHint() : m.templatesReplyHint()}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {section || reply ? null : (
                  <Button
                    type="button"
                    className="max-md:h-10"
                    disabled={
                      startModule.isPending ||
                      ((piece.kind === "lesson" ||
                        piece.kind === "unit_plan" ||
                        piece.kind === "consent_form" ||
                        piece.kind === "module") &&
                        !chosen)
                    }
                    onClick={use}
                  >
                    {letter ? m.templatesEditLetter() : m.templatesUse()}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="max-md:h-10"
                  onClick={onClose}
                >
                  {m.docCancel()}
                </Button>
              </div>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
