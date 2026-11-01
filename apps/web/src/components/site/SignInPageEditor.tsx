import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";

import {
  headedContent,
  plainContent,
} from "@faridalms/domain/content-conversion";
import { resolveTheme } from "@faridalms/domain/site-theme";
import { documentWritten, otherLocale } from "@faridalms/domain/translations";
import { bodyIssues } from "@faridalms/domain/website";
import { Tabs, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { EyeOff, Send } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import type { signInPageQuery } from "~/queries/site";

import { SchoolPanel } from "~/components/auth/SchoolFace";
import { ContentEditor } from "~/components/content/ContentEditor";
import { LOCALE_LABEL, LOCALE_NAME } from "~/components/content/languages";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { usePicturePeople } from "~/components/files/PicturedPeople";
import { DocumentPage } from "~/components/system/DocumentPage";
import { SheetPanel } from "~/components/system/SheetPanel";
import { useAutosave } from "~/hooks/useAutosave";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { siteOverviewQuery } from "~/queries/site";
import {
  publishSignInPage,
  saveSignInPage,
  unpublishSignInPage,
} from "~/server/site";
import { getMessageFromError } from "~/utils/error";

import { ISSUE_LABEL } from "./studio/labels";

type Existing = Awaited<
  ReturnType<NonNullable<(typeof signInPageQuery)["queryFn"]>>
>;

interface Draft {
  body: ContentDocument;
  translation: ContentDocument;
}

/** What a school that has written nothing starts from, in the language it is for. */
function starter(locale: ContentLocale, school: string): ContentDocument {
  return headedContent([
    {
      heading: m.portalWelcomeTitle({ school }, { locale }),
      body: plainContent(m.portalWelcomeBody({}, { locale })),
    },
    {
      heading: m.signInPageHelpHeading({}, { locale }),
      body: plainContent(m.signInPageHelpBody({}, { locale })),
    },
  ]);
}

/**
 * The portal's sign-in page in the site studio: one document, in each of
 * the website's languages, shown beside the form to everyone before they
 * sign in. It saves as it is written and reaches the portal when published,
 * so a half-written welcome is never what a family meets.
 */
export function SignInPageEditor({
  existing,
  onClose,
}: {
  existing: Existing;
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const overview = useSuspenseQuery(siteOverviewQuery).data;
  const queryClient = useQueryClient();
  const documentMedia = useDocumentMedia();
  const pictured = usePicturePeople("website");
  const media = useMemo(
    () => ({ ...documentMedia, people: pictured.open }),
    [documentMedia, pictured.open],
  );
  const primary = existing.primaryLocale;
  const other = otherLocale(primary);
  const nameIn = (locale: ContentLocale) =>
    inLocale(user.school.nameEn, user.school.nameAr, locale);
  const [draft, setDraft] = useState<Draft>(() => ({
    body: existing.body ?? starter(primary, nameIn(primary)),
    translation:
      existing.translation ??
      (existing.body ? plainContent("") : starter(other, nameIn(other))),
  }));
  const [published, setPublished] = useState(existing.published);
  const [changed, setChanged] = useState(existing.changed);
  const [writing, setWriting] = useState<ContentLocale>(primary);
  const [editorKey, setEditorKey] = useState(0);
  const [valid, setValid] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [pending, setPending] = useState<"publish" | "remove" | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const persist = useCallback(
    async (value: Draft) => {
      if (!valid) throw new Error("content.invalid");
      const saved = await saveSignInPage({
        data: {
          body: value.body,
          translation: existing.bilingual ? value.translation : null,
        },
      });
      if (saved.changed) setChanged(true);
      await queryClient.invalidateQueries({ queryKey: ["site"] });
    },
    [valid, existing.bilingual, queryClient],
  );
  const autosave = useAutosave({ value: draft, save: persist });

  const change = useCallback((patch: Partial<Draft>) => {
    setIssues([]);
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

  const locales = existing.bilingual ? [primary, other] : [primary];
  const problems = () => {
    const found: string[] = [];
    if (!documentWritten(draft.body)) found.push(m.signInPageEmpty());
    for (const locale of locales) {
      const words = locale === primary ? draft.body : draft.translation;
      if (locale !== primary && !documentWritten(words)) continue;
      for (const code of bodyIssues(words))
        found.push(
          m.siteIssueIn({
            issue: ISSUE_LABEL[code](),
            language: LOCALE_NAME[locale](),
          }),
        );
    }
    return found;
  };

  const publish = async () => {
    const found = problems();
    setIssues(found);
    if (found.length) return;
    setPending("publish");
    try {
      await persist(draft);
      autosave.markSaved(draft);
      await publishSignInPage();
      setPublished(true);
      setChanged(false);
      await queryClient.invalidateQueries({ queryKey: ["site"] });
      toast.success(m.signInPagePublished());
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setPending(null);
    }
  };

  const takeDown = async () => {
    setPending("remove");
    try {
      await unpublishSignInPage();
      setPublished(false);
      setChanged(false);
      await queryClient.invalidateQueries({ queryKey: ["site"] });
      toast.success(m.signInPageTakenDown());
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setPending(null);
    }
  };

  const translating = existing.bilingual && writing === other;
  const shown: ContentLocale = translating ? other : primary;
  const status = published
    ? { label: m.siteStatePublished(), tone: "success" as const }
    : { label: m.siteStateDraft(), tone: "neutral" as const };

  return (
    <>
      <DocumentPage
        heading={m.signInPageTitle()}
        onBack={async () => {
          if (await autosave.flush()) onClose();
        }}
        status={status}
        saveState={autosave.state}
        onRetry={autosave.retry}
        primary={
          published && !changed
            ? undefined
            : {
                label: published
                  ? m.signInPagePublishChanges()
                  : m.signInPagePublish(),
                icon: Send,
                pending: pending === "publish",
                disabled: uploading,
                onClick: () => void publish(),
              }
        }
        preview={{
          label: m.signInPagePreview(),
          onClick: () => setPreviewing(true),
        }}
        history={{
          hostType: "site_sign_in",
          hostId: user.school.id,
          onRestore: (content) => {
            change({ body: content });
            setWriting(primary);
            setEditorKey((key) => key + 1);
          },
        }}
        menu={
          published
            ? [
                {
                  label: m.signInPageTakeDown(),
                  icon: EyeOff,
                  destructive: true,
                  onSelect: () => void takeDown(),
                  confirm: {
                    title: m.signInPageTakeDownTitle(),
                    body: m.signInPageTakeDownBody(),
                    label: m.signInPageTakeDown(),
                  },
                },
              ]
            : []
        }
        title={
          <div className="grid gap-3">
            <h2 className="text-[30px] leading-[38px] font-semibold">
              {m.signInPageTitle()}
            </h2>
            <p className="text-sm text-muted-foreground">
              {m.signInPageHint()}
            </p>
            {issues.length ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                <ul className="list-disc ps-5">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {existing.bilingual ? (
              <Tabs
                value={writing}
                onValueChange={(value: ContentLocale) => setWriting(value)}
              >
                <TabsList aria-label={m.contentLanguage()}>
                  <TabsTrigger value={primary} lang={primary}>
                    {LOCALE_LABEL[primary]()}
                  </TabsTrigger>
                  <TabsTrigger value={other} lang={other}>
                    {LOCALE_LABEL[other]()}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
          </div>
        }
      >
        <div lang={shown} className="min-w-0">
          <ContentEditor
            key={`${editorKey}-${shown}`}
            id={translating ? "sign-in-translation" : "sign-in-body"}
            label={
              translating
                ? `${m.translationTitle()} (${LOCALE_LABEL[shown]()})`
                : LOCALE_LABEL[shown]()
            }
            variant="document"
            value={translating ? draft.translation : draft.body}
            onChange={translating ? changeTranslation : changeBody}
            onValidityChange={setValid}
            onUploadingChange={setUploading}
            media={media}
          />
        </div>
      </DocumentPage>
      {pictured.sheet}
      <SheetPanel
        open={previewing}
        onOpenChange={setPreviewing}
        title={m.signInPagePreview()}
        description={m.signInPagePreviewHint({
          language: LOCALE_NAME[shown](),
        })}
      >
        <SchoolPanel
          className="overflow-hidden rounded-lg"
          face={{
            school: user.school.slug,
            name: { en: user.school.nameEn, ar: user.school.nameAr },
            theme: overview.settings.id
              ? resolveTheme(overview.settings.theme)
              : null,
            logoKey: overview.logoKey,
            page: null,
          }}
          page={{
            body: translating ? draft.translation : draft.body,
            locale: shown,
            media: {},
            fileUrl: (fileId) => `/files/${fileId}`,
          }}
        />
      </SheetPanel>
    </>
  );
}
