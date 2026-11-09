import type { FormEvent, ReactNode, Ref } from "react";

import { Button } from "../button";
import { useHydrated } from "@tanstack/react-router";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { ConfirmDialog } from "./confirm-dialog";
import { mayMoveFocus } from "./focus-after-submit";
import { Page } from "./page";
import { PageHeader } from "./page-header";
import { useDesignSystem } from "./provider";
import { UnsavedChangesGuard } from "./unsaved-changes-guard";

/** GOV.UK: forms longer than this open with a summary of what to fix. */
const SUMMARY_AFTER = 5;

interface Problem {
  id: string;
  label: string;
  message: string;
}

interface Scan {
  fields: number;
  problems: Problem[];
}

/**
 * Reads the fields as FormField rendered them, so the summary always lists
 * exactly the errors on screen, whichever control and validator produced them.
 */
function scan(root: HTMLElement): Scan {
  const fields = root.querySelectorAll<HTMLElement>('[data-slot="form-field"]');
  const problems: Problem[] = [];
  for (const field of fields) {
    if (!field.hasAttribute("data-invalid")) continue;
    const label = field.querySelector("label");
    if (!label?.htmlFor) continue;
    problems.push({
      id: label.htmlFor,
      label: label.textContent,
      message:
        root.ownerDocument.getElementById(`${label.htmlFor}-error`)
          ?.textContent ?? "",
    });
  }
  return { fields: fields.length, problems };
}

function sameScan(a: Scan, b: Scan) {
  return (
    a.fields === b.fields &&
    a.problems.length === b.problems.length &&
    a.problems.every((problem, index) => {
      const other = b.problems[index];
      return other?.id === problem.id && other.message === problem.message;
    })
  );
}

export interface DangerAction {
  title: string;
  description: string;
  label: string;
  confirmTitle: string;
  confirmBody: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<unknown>;
}

export interface FormSectionProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="grid min-w-0 gap-4">
      <div>
        <h2 id={headingId} className="text-base leading-6 font-semibold">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="grid min-w-0 gap-6">{children}</div>
    </section>
  );
}

interface ErrorSummaryProps {
  problems: Problem[];
  failure: string | null;
  ref: Ref<HTMLDivElement>;
}

function ErrorSummary({ problems, failure, ref }: ErrorSummaryProps) {
  const { strings } = useDesignSystem();
  const headingId = useId();
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby={headingId}
      className="grid gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 outline-none focus-visible:ring-3 focus-visible:ring-destructive/30"
    >
      <h2
        id={headingId}
        className="flex items-center gap-2 text-base leading-6 font-semibold"
      >
        <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
        {strings.errorSummaryTitle}
      </h2>
      {failure ? <p className="text-sm leading-5">{failure}</p> : null}
      {problems.length ? (
        <ul className="grid gap-1.5 text-sm leading-5">
          {problems.map((problem) => (
            <li key={problem.id}>
              <a
                href={`#${problem.id}`}
                className="font-medium text-destructive underline underline-offset-2"
                onClick={(event) => {
                  const control = document.getElementById(problem.id);
                  if (!control) return;
                  // The label says what the field is, so it scrolls into view
                  // with the control rather than the control alone.
                  event.preventDefault();
                  control
                    .closest('[data-slot="form-field"]')
                    ?.scrollIntoView({ block: "start" });
                  control.focus({ preventScroll: true });
                }}
              >
                {strings.errorSummaryItem(problem.label, problem.message)}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface DangerZoneProps {
  action: DangerAction;
}

function DangerZone({ action }: DangerZoneProps) {
  const { strings, errorMessage } = useDesignSystem();
  const headingId = useId();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <section aria-labelledby={headingId} className="mt-12 grid gap-4">
      <h2 id={headingId} className="text-base leading-6 font-semibold">
        {strings.dangerZone}
      </h2>
      <div className="flex flex-col gap-4 rounded-lg border border-destructive/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm leading-5 font-semibold">{action.title}</p>
          <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
            {action.description}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="self-start text-destructive hover:text-destructive max-md:h-10 sm:self-center"
          onClick={() => {
            setError(undefined);
            setConfirming(true);
          }}
        >
          {action.label}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={action.confirmTitle}
        body={action.confirmBody}
        confirmLabel={action.confirmLabel}
        pending={pending}
        error={error}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setPending(true);
          setError(undefined);
          void Promise.resolve()
            .then(action.onConfirm)
            .then(
              () => setConfirming(false),
              (failure: unknown) => setError(errorMessage(failure)),
            )
            .finally(() => setPending(false));
        }}
      />
    </section>
  );
}

/**
 * A page for creating or editing one record: a single column, sections of
 * fields, then Save and Cancel at the bottom on the start side. The buttons
 * are sticky, which only has an effect once the form outgrows the screen.
 *
 * `onSubmit` receives the `value` of the button that submitted, so a second
 * submit button (Save and add another) can share the validation path.
 */
/** A second way to submit, such as Save and add another. */
export interface SecondarySubmit {
  label: string;
  /** Passed to onSubmit as the intent. */
  intent: string;
}

export interface RecordFormProps {
  title: string;
  description?: string;
  onSubmit: (intent: string | undefined) => void | Promise<unknown>;
  onCancel: () => void;
  isDirty: () => boolean;
  pending?: boolean;
  error?: string | null;
  submitLabel?: string;
  secondary?: SecondarySubmit;
  danger?: DangerAction;
  children: ReactNode;
}

export function RecordForm({
  title,
  description,
  onSubmit,
  onCancel,
  isDirty,
  pending = false,
  error,
  submitLabel,
  secondary,
  danger,
  children,
}: RecordFormProps) {
  const { strings, errorMessage } = useDesignSystem();
  const hydrated = useHydrated();
  const busy = !hydrated || pending;
  const formRef = useRef<HTMLFormElement>(null);
  const fieldsRef = useRef<HTMLFieldSetElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [thrown, setThrown] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [fields, setFields] = useState<Scan>({ fields: 0, problems: [] });
  const [focusRequest, setFocusRequest] = useState(0);
  const focusedAtSubmit = useRef<Element | null>(null);

  const failure = error ?? thrown;
  const summary =
    fields.fields > SUMMARY_AFTER &&
    submitted &&
    (fields.problems.length > 0 || Boolean(failure));

  // Errors change as the person types (validation is live once submitted),
  // and the summary follows them until nothing is left to fix.
  useEffect(() => {
    const root = fieldsRef.current;
    if (!root) return undefined;
    const update = () =>
      setFields((previous) => {
        const next = scan(root);
        return sameScan(previous, next) ? previous : next;
      });
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-invalid"],
    });
    return () => observer.disconnect();
  }, []);

  // The top bar and the Save bar both stick over the page, and a control
  // half under either still counts as visible, so moving focus would not
  // scroll it clear. Scroll padding makes focus and scrollIntoView stop short
  // of both bars.
  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return undefined;
    const root = footer.ownerDocument.documentElement;
    const reserve = () => {
      const bar = footer.ownerDocument.querySelector<HTMLElement>(
        '[data-slot="top-bar"]',
      );
      const lifted = Number.parseFloat(getComputedStyle(footer).bottom) || 0;
      root.style.scrollPaddingTop = `${bar?.offsetHeight ?? 0}px`;
      root.style.scrollPaddingBottom = `${footer.offsetHeight + lifted + 8}px`;
    };
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(footer);
    window.addEventListener("resize", reserve);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reserve);
      root.style.removeProperty("scroll-padding-top");
      root.style.removeProperty("scroll-padding-bottom");
    };
  }, []);

  useEffect(() => {
    if (!focusRequest) return;
    if (!mayMoveFocus(focusedAtSubmit.current, document)) return;
    if (summaryRef.current) {
      summaryRef.current.focus();
      return;
    }
    const invalid = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    if (invalid) invalid.focus();
    else alertRef.current?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (!summary) return undefined;
    const previous = document.title;
    document.title = strings.errorDocumentTitle(previous);
    return () => {
      document.title = previous;
    };
  }, [summary, strings]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const native = event.nativeEvent;
    const submitter = "submitter" in native ? native.submitter : null;
    const intent =
      submitter instanceof HTMLButtonElement && submitter.value
        ? submitter.value
        : undefined;
    setThrown(null);
    focusedAtSubmit.current = form.ownerDocument.activeElement;
    try {
      await onSubmit(intent);
    } catch (failed) {
      setThrown(errorMessage(failed));
    }
    // Field errors render after validation settles, so the scan waits a frame.
    requestAnimationFrame(() => {
      if (!form.isConnected || !fieldsRef.current) return;
      setFields(scan(fieldsRef.current));
      setSubmitted(true);
      setFocusRequest((count) => count + 1);
    });
  };

  return (
    <Page width="form">
      <PageHeader title={title} description={description} />
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => void submit(event)}
        className="[&_[data-slot=form-field]]:scroll-mt-8"
      >
        {summary ? (
          <div className="mb-8">
            <ErrorSummary
              ref={summaryRef}
              problems={fields.problems}
              failure={failure}
            />
          </div>
        ) : failure ? (
          <p
            ref={alertRef}
            role="alert"
            tabIndex={-1}
            className="mb-8 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm leading-5 text-destructive outline-none"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {failure}
          </p>
        ) : null}
        <fieldset
          ref={fieldsRef}
          disabled={busy}
          className="grid min-w-0 gap-10"
        >
          {children}
        </fieldset>
        <div
          ref={footerRef}
          data-slot="record-form-footer"
          className="sticky bottom-0 z-10 mt-10 flex flex-wrap items-center gap-2 border-t bg-background py-4 max-md:bottom-[calc(var(--shell-bottom-bar,0px)+env(safe-area-inset-bottom))]"
        >
          <Button type="submit" className="max-md:h-10" disabled={busy}>
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : null}
            {submitLabel ?? strings.save}
          </Button>
          {secondary ? (
            <Button
              type="submit"
              variant="outline"
              value={secondary.intent}
              className="max-md:h-10"
              disabled={busy}
            >
              {secondary.label}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            disabled={busy}
            onClick={onCancel}
          >
            {strings.cancel}
          </Button>
        </div>
      </form>
      {danger ? <DangerZone action={danger} /> : null}
      <UnsavedChangesGuard isDirty={isDirty} pending={pending} />
    </Page>
  );
}
