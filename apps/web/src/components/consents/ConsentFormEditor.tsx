import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";

import { contentPlainText } from "@faridalms/domain/content";
import {
  emptyContent,
  headedContent,
} from "@faridalms/domain/content-conversion";
import {
  CONTENT_LOCALES,
  otherLocale,
  translationState,
} from "@faridalms/domain/translations";
import { Button } from "@faridalms/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@faridalms/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { consentFormQuery } from "~/queries/consents";

import { ContentEditor } from "~/components/content/ContentEditor";
import { ContentView } from "~/components/content/ContentView";
import { LOCALE_LABEL, LOCALE_NAME } from "~/components/content/languages";
import { TranslationNote } from "~/components/content/TranslationNote";
import { CheckboxRow } from "~/components/people/fields";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
} from "~/components/system/DocumentPage";
import { SelectField } from "~/components/system/field";
import { SheetPanel } from "~/components/system/SheetPanel";
import { useAutosave } from "~/hooks/useAutosave";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import {
  discardConsentForm,
  publishConsentForm,
  reviewConsentForm,
  saveConsentForm,
} from "~/server/consents";
import { getMessageFromError } from "~/utils/error";

import { publishedDay } from "./format";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof consentFormQuery>["queryFn"]>>
>;
type Review = NonNullable<Data["draft"]>["translationReview"];

interface Draft {
  primaryLocale: ContentLocale;
  bilingual: boolean;
  body: ContentDocument;
  translation: ContentDocument;
}

/**
 * What a family must be told before agreeing: what is asked, which
 * information, who sees it, for how long, and that they may change their
 * mind (Egypt's consent guideline asks for each).
 */
const SECTIONS = [
  m.consentFormAsk,
  m.consentFormData,
  m.consentFormWho,
  m.consentFormHowLong,
  m.consentFormChange,
];

const outline = (locale: ContentLocale) =>
  headedContent(
    SECTIONS.map((heading) => ({
      heading: heading({}, { locale }),
      body: emptyContent(),
    })),
  );

function draftOf(data: Data): Draft {
  const source = data.draft ?? data.published;
  const primaryLocale =
    source?.primaryLocale ?? (getLocale() === "ar" ? "ar" : "en");
  return {
    primaryLocale,
    bilingual: source ? source.translation !== null : false,
    body:
      (source?.body as unknown as ContentDocument | null) ??
      outline(primaryLocale),
    translation:
      (source?.translation as unknown as ContentDocument | null) ??
      outline(otherLocale(primaryLocale)),
  };
}

/**
 * The words a school asks families to agree to for one purpose. Edits go to
 * a draft that saves itself; publishing freezes it as a new version and asks
 * every legal guardian who can answer in the app.
 */
export function ConsentFormEditor({
  data,
  onClose,
}: {
  data: Data;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const id = useRef(data.draft?.id ?? "");
  const version = useRef(data.draft?.version ?? 0);
  const [stored, setStored] = useState(data.draft !== null);
  const [draft, setDraft] = useState<Draft>(() => draftOf(data));
  const [valid, setValid] = useState(true);
  const [review, setReview] = useState<Review>(
    data.draft?.translationReview ?? null,
  );
  const [reviewing, setReviewing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pending, setPending] = useState<"publish" | "discard" | null>(null);
  const [writing, setWriting] = useState<ContentLocale>(draft.primaryLocale);
  const other = otherLocale(draft.primaryLocale);
  const translating = draft.bilingual && writing === other;
  const shown: ContentLocale = translating ? other : draft.primaryLocale;
  const purpose = inLocale(data.purpose.labelEn, data.purpose.labelAr);

  const persist = useCallback(
    async (value: Draft) => {
      if (!valid) throw new Error("content.invalid");
      const saved = await saveConsentForm({
        data: {
          id: id.current,
          expectedVersion: version.current,
          purposeId: data.purpose.id,
          primaryLocale: value.primaryLocale,
          body: value.body,
          translation: value.bilingual ? value.translation : null,
        },
      });
      id.current = saved.id;
      version.current = saved.version;
      setStored(true);
      setReview(saved.translationReview);
      await queryClient.invalidateQueries({ queryKey: ["consents"] });
    },
    [valid, queryClient, data.purpose.id],
  );

  const autosave = useAutosave({ value: draft, save: persist });

  const change = useCallback((patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);
  const changeBody = useCallback(
    (body: ContentDocument) => change({ body }),
    [change],
  );
  const changeTranslation = useCallback(
    (translation: ContentDocument) => change({ translation }),
    [change],
  );

  const translation = draft.bilingual
    ? translationState({
        translation: draft.translation,
        reviewed: review !== null,
        current: review?.current ?? false,
      })
    : null;

  const markReviewed = async (reviewed: boolean) => {
    setReviewing(true);
    try {
      await persist(draft);
      autosave.markSaved(draft);
      const out = await reviewConsentForm({
        data: { id: id.current, expectedVersion: version.current, reviewed },
      });
      version.current = out.version;
      setReview(out.review);
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setReviewing(false);
    }
  };

  const publish = async () => {
    setPending("publish");
    try {
      await persist(draft);
      autosave.markSaved(draft);
      const out = await publishConsentForm({
        data: { id: id.current, expectedVersion: version.current },
      });
      await queryClient.invalidateQueries({ queryKey: ["consents"] });
      toast.success(m.consentFormPublished({ count: out.asked }));
      onClose();
    } catch (error) {
      toast.error(getMessageFromError(error));
      setPending(null);
      setPublishing(false);
    }
  };

  const discard = async () => {
    setPending("discard");
    try {
      await autosave.flush();
      if (id.current)
        await discardConsentForm({
          data: { id: id.current, expectedVersion: version.current },
        });
      await queryClient.invalidateQueries({ queryKey: ["consents"] });
      toast.success(m.consentFormDiscarded());
      onClose();
    } catch (error) {
      toast.error(getMessageFromError(error));
      setPending(null);
    }
  };

  const written = contentPlainText(draft.body).trim() !== "";
  const label = data.draft?.versionLabel;

  return (
    <>
      <DocumentPage
        heading={m.consentFormEditing()}
        onBack={async () => {
          if (await autosave.flush()) onClose();
        }}
        status={
          stored
            ? {
                label: label
                  ? m.consentFormDraftVersion({ version: label })
                  : m.consentFormDraft(),
                tone: "neutral",
              }
            : data.published
              ? {
                  label: m.consentFormLive({
                    version: data.published.versionLabel,
                  }),
                  tone: "success",
                }
              : undefined
        }
        saveState={autosave.state}
        onRetry={autosave.retry}
        primary={{
          label: m.consentFormPublish(),
          icon: Send,
          pending: pending === "publish",
          disabled: !stored || !written || !valid,
          onClick: () => setPublishing(true),
        }}
        menu={
          stored
            ? [
                {
                  label: m.consentFormDiscard(),
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => void discard(),
                  confirm: {
                    title: m.consentFormDiscardTitle(),
                    body: data.published
                      ? m.consentFormDiscardBodyLive()
                      : m.consentFormDiscardBody(),
                    label: m.consentFormDiscard(),
                  },
                },
              ]
            : []
        }
        print={{
          title: purpose,
          content: translating ? draft.translation : draft.body,
          slip: [],
        }}
        title={
          <div className="grid gap-3">
            <h2 className="text-[30px] leading-[38px] font-semibold tracking-tight">
              {purpose}
            </h2>
            {data.published ? (
              <p className="text-sm leading-5 text-muted-foreground">
                {stored
                  ? m.consentFormLiveNote({
                      version: data.published.versionLabel,
                      date: data.published.publishedAt
                        ? publishedDay(
                            data.published.publishedAt,
                            user.school.timeZone,
                          )
                        : "",
                    })
                  : m.consentFormEditStarts()}
              </p>
            ) : null}
            {draft.bilingual ? (
              <Tabs
                value={writing}
                onValueChange={(value: ContentLocale) => setWriting(value)}
              >
                <TabsList aria-label={m.contentLanguage()}>
                  <TabsTrigger
                    value={draft.primaryLocale}
                    lang={draft.primaryLocale}
                  >
                    {LOCALE_LABEL[draft.primaryLocale]()}
                  </TabsTrigger>
                  <TabsTrigger value={other} lang={other}>
                    {LOCALE_LABEL[other]()}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
          </div>
        }
        summary={[
          draft.bilingual
            ? m.contentBothLanguages()
            : LOCALE_LABEL[draft.primaryLocale](),
        ]}
        aside={
          <DetailsPanel title={m.docDetails()}>
            <DetailsSection title={m.contentSectionLanguages()}>
              <SelectField
                id="consent-language"
                label={m.contentPrimaryLanguage()}
                hint={m.contentPrimaryLanguageHint()}
                value={draft.primaryLocale}
                options={CONTENT_LOCALES.map((locale) => ({
                  value: locale,
                  label: LOCALE_LABEL[locale](),
                }))}
                onChange={(primaryLocale) => {
                  change({ primaryLocale });
                  setWriting(primaryLocale);
                }}
              />
              <CheckboxRow
                label={m.contentBilingual({ language: LOCALE_NAME[other]() })}
                hint={m.consentFormBilingualHint()}
                checked={draft.bilingual}
                onChange={(bilingual) => {
                  change({ bilingual });
                  if (!bilingual) setWriting(draft.primaryLocale);
                }}
              />
            </DetailsSection>
            {draft.bilingual && translation ? (
              <DetailsSection title={m.translationTitle()}>
                <TranslationNote
                  state={translation}
                  review={review}
                  language={LOCALE_NAME[other]()}
                />
                <CheckboxRow
                  label={m.translationReviewedCheck()}
                  hint={m.translationReviewedHint({
                    language: LOCALE_NAME[draft.primaryLocale](),
                  })}
                  checked={translation === "reviewed"}
                  onChange={(checked) => {
                    if (!reviewing && stored) void markReviewed(checked);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start max-md:h-10"
                  onClick={() => setComparing(true)}
                >
                  {m.translationShowOriginal({
                    language: LOCALE_NAME[draft.primaryLocale](),
                  })}
                </Button>
              </DetailsSection>
            ) : null}
          </DetailsPanel>
        }
      >
        <div lang={shown} className="min-w-0">
          <ContentEditor
            key={shown}
            id={translating ? "consent-translation" : "consent-body"}
            label={
              translating
                ? `${m.translationTitle()} (${LOCALE_LABEL[shown]()})`
                : m.consentFormBody()
            }
            variant="document"
            value={translating ? draft.translation : draft.body}
            onChange={translating ? changeTranslation : changeBody}
            onValidityChange={setValid}
          />
        </div>
      </DocumentPage>
      <SheetPanel
        open={comparing}
        onOpenChange={setComparing}
        title={m.translationOriginalTitle({
          language: LOCALE_NAME[draft.primaryLocale](),
        })}
      >
        <div lang={draft.primaryLocale}>
          <ContentView
            document={draft.body}
            fileUrl={(fileId) => `/files/${fileId}`}
          />
        </div>
      </SheetPanel>
      <Dialog
        open={publishing}
        onOpenChange={(next) => {
          if (!next && pending !== "publish") setPublishing(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.consentFormPublishTitle()}</DialogTitle>
            <DialogDescription>
              {data.published
                ? m.consentFormPublishBodyNext()
                : m.consentFormPublishBody()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending === "publish"}
              onClick={() => setPublishing(false)}
            >
              {m.commonCancel()}
            </Button>
            <Button
              type="button"
              disabled={pending === "publish"}
              onClick={() => void publish()}
            >
              {m.consentFormPublish()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
