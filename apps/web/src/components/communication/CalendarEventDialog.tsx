import type { ContentDocument } from "@faridalms/domain/content";
import type { CalendarEventInput } from "@faridalms/domain/school-schema";

import { contentPlainText } from "@faridalms/domain/content";
import { plainContent } from "@faridalms/domain/content-conversion";
import {
  calendarEventFormSchema,
  EVENT_CATEGORIES,
} from "@faridalms/domain/school-schema";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, Check, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "~/components/app/dialog";
import { Field, FieldLabel, FieldError } from "~/components/app/field";
import { EVENT_CATEGORY_LABEL } from "~/components/app/labels";
import { ContentEditor } from "~/components/content/ContentEditor";
import { ContentView } from "~/components/content/ContentView";
import { ClassPicker } from "~/components/teach/ClassPicker";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import * as m from "~/i18n/messages";
import { saveCalendarEvent } from "~/server/school";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { SchoolEvent } from "./calendar-model";

export function CalendarEventDialog({
  event,
  date,
  canManage,
  onClose,
}: {
  event?: SchoolEvent;
  date: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(!event);
  const [failure, setFailure] = useState<string>();
  const [valid, setValid] = useState(true);
  const [document, setDocument] = useState<ContentDocument>(
    () => event?.document ?? plainContent(event?.description ?? ""),
  );
  const mutation = useMutation({
    mutationFn: saveCalendarEvent,
    onSuccess: () => {
      toast.success(m.calendarSaved());
      onClose();
    },
  });
  const defaults: Omit<CalendarEventInput, "document"> = {
    id: event?.id,
    expectedRevision: event?.revision,
    title: event?.title ?? "",
    description: event?.description ?? "",
    category: event?.category ?? "general",
    startsOn: event?.startsOn ?? date,
    endsOn: event?.endsOn ?? date,
    provisional: event?.provisional ?? false,
  };
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: calendarEventFormSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ data: { ...value, document } });
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <div className="mb-2 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <CalendarDays aria-hidden />
        </div>
        <DialogTitle>
          {editing
            ? event
              ? m.calendarEditEvent()
              : m.calendarAddEvent()
            : event?.title}
        </DialogTitle>
        <DialogDescription>
          {editing ? m.calendarEditorHint() : m.calendarEventDetails()}
        </DialogDescription>
        {editing && canManage ? (
          <form
            className="space-y-5"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              setFailure(undefined);
              if (!valid) {
                setFailure(getMessageFromError(new Error("content.invalid")));
                return;
              }
              try {
                await form.handleSubmit();
              } catch (error) {
                setFailure(getMessageFromError(error));
              }
            }}
          >
            {failure ? (
              <p role="alert" className="text-sm text-destructive">
                {failure}
              </p>
            ) : null}
            <form.Field name="title">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="event-title">
                    {m.calendarEventTitle()}
                  </FieldLabel>
                  <Input
                    id="event-title"
                    required
                    maxLength={255}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <div className="grid grid-cols-2 gap-4">
              {(["startsOn", "endsOn"] as const).map((name) => (
                <form.Field key={name} name={name}>
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={`event-${name}`}>
                        {name === "startsOn"
                          ? m.calendarStartsOn()
                          : m.calendarEndsOn()}
                      </FieldLabel>
                      <Input
                        id={`event-${name}`}
                        type="date"
                        required
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
              ))}
            </div>
            <form.Field name="category">
              {(field) => (
                <ClassPicker
                  id="event-category"
                  label={m.commCalendarCategories()}
                  value={field.state.value}
                  classes={EVENT_CATEGORIES.map((id) => ({
                    id,
                    name: EVENT_CATEGORY_LABEL[id](),
                  }))}
                  onChange={(value) => {
                    const category = EVENT_CATEGORIES.find(
                      (item) => item === value,
                    );
                    if (category) field.handleChange(category);
                  }}
                />
              )}
            </form.Field>
            <ContentEditor
              id="event-description"
              label={m.calendarDescription()}
              value={document}
              onChange={setDocument}
              onValidityChange={setValid}
              disabled={mutation.isPending}
            />
            <form.Field name="provisional">
              {(field) => (
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={field.state.value}
                    onChange={(e) => field.handleChange(e.target.checked)}
                  />
                  {m.commonProvisional()}
                </label>
              )}
            </form.Field>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="ghost" onClick={onClose}>
                {m.commonClose()}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                <Check aria-hidden />
                {m.calendarSaveEvent()}
              </Button>
            </div>
          </form>
        ) : event ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-muted/50 p-4">
              <p className="font-medium">
                {formatDate(event.startsOn)}
                {event.endsOn !== event.startsOn
                  ? ` · ${formatDate(event.endsOn)}`
                  : ""}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {EVENT_CATEGORY_LABEL[event.category]()} · {m.calendarAllDay()}
              </p>
            </div>
            {event.document && contentPlainText(event.document).trim() ? (
              <ContentView document={event.document} />
            ) : (
              <p className="text-sm leading-7 whitespace-pre-wrap">
                {event.description || m.calendarNoDescription()}
              </p>
            )}
            {event.provisional ? (
              <p className="text-sm text-warning">{m.commonProvisional()}</p>
            ) : null}
            {canManage ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                {m.calendarEditEvent()}
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
