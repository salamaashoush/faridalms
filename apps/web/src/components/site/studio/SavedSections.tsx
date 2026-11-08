import type { SavedSection } from "@faridalms/domain/saved-sections";
import type { SharedScope } from "@faridalms/domain/shared";
import type { PageSection, SiteLocale } from "@faridalms/domain/site-sections";

import {
  savedSectionOf,
  sectionPair,
  withFreshIds,
} from "@faridalms/domain/saved-sections";
import { MAX_SHARED_TITLE } from "@faridalms/domain/shared";
import { sectionWords, wordless } from "@faridalms/domain/site-sections";
import { defaultTheme, resolveTheme } from "@faridalms/domain/site-theme";
import { Button } from "@faridalms/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@faridalms/ui/dialog";
import { Input } from "@faridalms/ui/input";
import { Label } from "@faridalms/ui/label";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Share2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ScopeField, SharedUses } from "~/components/content/SharedBlocks";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { sectionTemplateQuery } from "~/queries/library";
import { sharedSectionQuery } from "~/queries/shared";
import { siteOverviewQuery } from "~/queries/site";
import { listShared, saveSharedSection } from "~/server/shared";
import { listTemplates, saveSectionTemplate } from "~/server/templates";
import { getMessageFromError } from "~/utils/error";

import type { RenderContext } from "../render/parts";

import { SiteSection } from "../render/sections";
import { Viewport } from "./Canvas";
import { SECTION_LABEL } from "./labels";

const THUMB_WIDTH = 1200;

/** A shared section a page shows, as the builder knows it. */
export interface SharedInfo {
  id: string;
  version: number;
  title: string;
  scope: SharedScope;
  editable: boolean;
  ownerNameEn: string | null;
  ownerNameAr: string | null;
}

/** A section put on a page, in both languages, and the shared section it is when it is one. */
export interface Inserted {
  content: PageSection;
  translation: PageSection;
  shared?: SharedInfo;
}

export interface SectionThumbnailProps {
  section: PageSection;
  context: RenderContext;
}

/** A section drawn small, for choosing; it cannot be focused or clicked into. */
export function SectionThumbnail({ section, context }: SectionThumbnailProps) {
  return (
    <div
      aria-hidden
      inert
      className="pointer-events-none max-h-56 overflow-hidden bg-white"
    >
      <Viewport
        width={THUMB_WIDTH}
        theme={context.theme}
        locale={context.locale}
      >
        <SiteSection
          section={section}
          shownIn={context.locale}
          context={context}
          first={false}
        />
      </Viewport>
    </div>
  );
}

export interface SavedSectionPreviewProps {
  saved: SavedSection;
}

/**
 * A kept section drawn in the school's own website theme, in the reader's
 * language where it has it, as the library shows it.
 */
export function SavedSectionPreview({ saved }: SavedSectionPreviewProps) {
  const user = useCurrentUser();
  const overview = useQuery(siteOverviewQuery).data;
  const locale = getLocale();
  const context: RenderContext = {
    school: user.school.slug,
    locale,
    theme: resolveTheme(overview?.settings.theme ?? defaultTheme()),
    fileUrl: (fileId) => `/files/${fileId}`,
    news: [],
    contact: overview?.school.contact ?? null,
    editing: true,
  };
  return (
    <div className="overflow-hidden rounded-lg border">
      <SectionThumbnail
        section={sectionPair(saved, locale).content}
        context={context}
      />
    </div>
  );
}

type KeptAs = "template" | "shared";

export interface SaveSectionDialogProps {
  section: PageSection;
  /** The section's words in the site's other language, when it has one. */
  translation: PageSection | null;
  primary: SiteLocale;
  onClose: () => void;
  /** The section became a shared section, which the page now names. */
  onShared: (shared: SharedInfo) => void;
}

/**
 * Keeps a section, in both languages, to use again: as a library template
 * a new section starts from, reviewed as any library piece is, or as a
 * shared section the page then shows, kept the same on every page.
 */
export function SaveSectionDialog({
  section,
  translation,
  primary,
  onClose,
  onShared,
}: SaveSectionDialogProps) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const noteId = useId();
  const [title, setTitle] = useState(
    () =>
      sectionWords(section)
        .find((words) => words.trim())
        ?.replaceAll(/\s+/gu, " ")
        .trim()
        .slice(0, 60) ?? SECTION_LABEL[section.type](),
  );
  const [as, setAs] = useState<KeptAs>("shared");
  const [scope, setScope] = useState<SharedScope>("school");
  const [description, setDescription] = useState("");
  const saved = savedSectionOf(section, translation, primary);
  const keep = useMutation({
    mutationFn: async () => {
      if (as === "template") {
        const kept = await saveSectionTemplate({
          data: { title, description, section: saved },
        });
        return { as, kept } as const;
      }
      const kept = await saveSharedSection({
        data: { id: "", expectedVersion: 0, title, scope, section: saved },
      });
      return { as, kept } as const;
    },
    onSuccess: async (done) => {
      if (done.as === "template") {
        await queryClient.invalidateQueries({ queryKey: ["templates"] });
        toast.success(
          done.kept.state === "pending"
            ? m.siteSectionTemplateWaiting()
            : m.siteSectionTemplateKept(),
        );
      } else {
        await queryClient.invalidateQueries({ queryKey: ["shared"] });
        onShared({
          id: done.kept.id,
          version: done.kept.version,
          title,
          scope,
          editable: true,
          ownerNameEn: null,
          ownerNameAr: null,
        });
        toast.success(m.siteSharedSectionKept());
      }
      onClose();
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !keep.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-lg">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            keep.mutate();
          }}
        >
          <div className="grid gap-2">
            <DialogTitle className="text-base font-semibold">
              {m.siteSaveSectionTitle()}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {m.siteSaveSectionBody()}
            </DialogDescription>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={titleId}>{m.sharedTitle()}</Label>
            <Input
              id={titleId}
              dir="auto"
              required
              value={title}
              maxLength={MAX_SHARED_TITLE}
              onChange={(event) => setTitle(event.target.value)}
              className="max-md:h-10"
            />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              {m.siteSaveSectionAs()}
            </legend>
            <RadioGroup
              value={as}
              onValueChange={(value) => setAs(value as KeptAs)}
              className="gap-2.5"
            >
              {(["shared", "template"] as const).map((value) => (
                <Label
                  key={value}
                  className="flex items-start gap-3 font-normal"
                >
                  <RadioGroupItem value={value} className="mt-0.5" />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">
                      {value === "shared"
                        ? m.siteSaveAsShared()
                        : m.siteSaveAsTemplate()}
                    </span>
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {value === "shared"
                        ? m.siteSaveAsSharedHint()
                        : m.siteSaveAsTemplateHint()}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
          {as === "shared" ? (
            <ScopeField kind="section" scope={scope} onChange={setScope} />
          ) : (
            <div className="grid gap-2">
              <Label htmlFor={noteId}>{m.siteSaveSectionNote()}</Label>
              <Textarea
                id={noteId}
                dir="auto"
                rows={2}
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={keep.isPending}
              onClick={onClose}
            >
              {m.docCancel()}
            </Button>
            <Button type="submit" disabled={keep.isPending || !title.trim()}>
              {keep.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : null}
              {m.sharedKeepAction()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface SharedSectionBarProps {
  /** The shared section, or null when it was taken out. */
  shared: SharedInfo | null;
  /** The page holds changes to it not saved where it is shared. */
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** Keeps the section on this page as its own, no longer shared. */
  onDetach: () => void;
  onRemove: () => void;
}

/**
 * What the builder says of a shared section above its settings: that it is
 * shared and where, that a change reaches every page once saved, or that
 * only whoever kept it may change it, or that it was taken out.
 */
export function SharedSectionBar({
  shared,
  dirty,
  saving,
  onSave,
  onDiscard,
  onDetach,
  onRemove,
}: SharedSectionBarProps) {
  if (!shared)
    return (
      <div className="grid gap-2 border-b bg-warning/10 px-4 py-3">
        <p className="text-[13px] leading-[18px] text-warning-foreground dark:text-warning">
          {m.siteSharedSectionGone()}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit max-md:h-10"
          onClick={onRemove}
        >
          {m.siteRemoveSection()}
        </Button>
      </div>
    );
  const owner = inLocale(shared.ownerNameEn, shared.ownerNameAr);
  return (
    <div className="grid gap-2 border-b bg-primary/5 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Share2 aria-hidden className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 truncate">
          {m.siteSharedSectionNamed({ title: shared.title })}
        </span>
      </p>
      <SharedUses id={shared.id} kind="section" />
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {shared.editable
          ? dirty
            ? m.siteSharedSectionChanged()
            : m.siteSharedSectionHint()
          : owner
            ? m.siteSharedSectionNotYours({ owner })
            : m.siteSharedSectionNotYoursUnnamed()}
      </p>
      <div className="flex flex-wrap gap-2">
        {shared.editable && dirty ? (
          <>
            <Button
              type="button"
              size="sm"
              className="max-md:h-10"
              disabled={saving}
              onClick={onSave}
            >
              {saving ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : null}
              {m.siteSharedSectionSave()}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="max-md:h-10"
              disabled={saving}
              onClick={onDiscard}
            >
              {m.siteSharedSectionDiscard()}
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="max-md:h-10"
          disabled={saving}
          onClick={onDetach}
        >
          {m.siteSharedSectionDetach()}
        </Button>
      </div>
    </div>
  );
}

interface SavedCardProps {
  title: string;
  hint: string;
  /** The kept section, once it has been read. */
  saved: SavedSection | undefined;
  context: RenderContext;
  onPick: (saved: SavedSection) => void;
}

function SavedCard({ title, hint, saved, context, onPick }: SavedCardProps) {
  const shown = saved ? sectionPair(saved, context.locale).content : null;
  return (
    <li className="grid content-start overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="group relative grid text-start">
        <button
          type="button"
          disabled={!saved}
          onClick={() => saved && onPick(saved)}
          className="absolute inset-0 z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          aria-label={m.siteAddSavedSection({ title })}
        />
        <div className="min-h-24 border-b transition-opacity group-hover:opacity-90">
          {shown ? (
            <SectionThumbnail section={shown} context={context} />
          ) : (
            <div aria-busy="true" className="h-24" />
          )}
        </div>
        <span className="grid gap-0.5 p-3">
          <span dir="auto" className="text-sm font-semibold">
            {title}
          </span>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {hint}
          </span>
        </span>
      </div>
    </li>
  );
}

interface SharedCardProps {
  id: string;
  title: string;
  context: RenderContext;
  onPick: (saved: SavedSection) => void;
}

function SharedCard({ id, title, context, onPick }: SharedCardProps) {
  const saved = useQuery(sharedSectionQuery(id)).data?.section;
  return (
    <SavedCard
      title={title}
      hint={m.siteSharedSectionCardHint()}
      saved={saved}
      context={context}
      onPick={onPick}
    />
  );
}

interface TemplateCardProps {
  id: string;
  title: string;
  hint: string;
  context: RenderContext;
  onPick: (saved: SavedSection) => void;
}

function TemplateCard({ id, title, hint, context, onPick }: TemplateCardProps) {
  const saved = useQuery(sectionTemplateQuery(id)).data?.section;
  return (
    <SavedCard
      title={title}
      hint={hint}
      saved={saved}
      context={context}
      onPick={onPick}
    />
  );
}

export interface SavedSectionsProps {
  context: RenderContext;
  primary: SiteLocale;
  /** Words to narrow the list by, as the gallery's search box holds them. */
  search: string;
  onPick: (inserted: Inserted) => void;
}

/**
 * The sections the school kept: its shared sections, which a page shows
 * as they stand and every change to which it follows, and the library's
 * section templates, each copied onto the page to change freely.
 */
export function SavedSections({
  context,
  primary,
  search,
  onPick,
}: SavedSectionsProps) {
  const needle = search.trim().toLocaleLowerCase();
  const templates = useQuery({
    queryKey: ["templates", "list", "section"],
    queryFn: () => listTemplates({ data: { kind: "section" } }),
  });
  const shared = useQuery({
    queryKey: ["shared", "list", "section", needle],
    queryFn: () =>
      listShared({
        data: { kind: "section", search: needle, scope: "all", after: null },
      }),
  });
  if (templates.isPending || shared.isPending)
    return <div aria-busy="true" className="min-h-40" />;
  const pieces = (templates.data ?? []).filter(
    (row) =>
      (row.state === "shared" || row.mine) &&
      (!needle || row.title.toLocaleLowerCase().includes(needle)),
  );
  const kept = shared.data?.rows ?? [];
  if (pieces.length === 0 && kept.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        {needle ? m.siteNoSectionsFound() : m.siteNoSavedSections()}
      </p>
    );
  return (
    <div className="grid gap-6">
      {kept.length ? (
        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">{m.siteSharedSections()}</h3>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {kept.map((row) => (
              <SharedCard
                key={row.id}
                id={row.id}
                title={row.title}
                context={context}
                onPick={(saved) => {
                  const pair = sectionPair(saved, primary);
                  const id = crypto.randomUUID();
                  const content = {
                    ...pair.content,
                    id,
                    shared: row.id,
                  } as PageSection;
                  onPick({
                    content,
                    translation: pair.translation
                      ? {
                          ...pair.translation,
                          id,
                          shared: row.id,
                        }
                      : wordless(content),
                    shared: {
                      id: row.id,
                      version: row.version,
                      title: row.title,
                      scope: row.scope,
                      editable: row.mine,
                      ownerNameEn: row.ownerNameEn,
                      ownerNameAr: row.ownerNameAr,
                    },
                  });
                }}
              />
            ))}
          </ul>
        </section>
      ) : null}
      {pieces.length ? (
        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">{m.siteSectionTemplates()}</h3>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pieces.map((row) => (
              <TemplateCard
                key={row.id}
                id={row.id}
                title={row.title}
                hint={row.description || m.siteSectionTemplateCardHint()}
                context={context}
                onPick={(saved) => {
                  const pair = sectionPair(saved, primary);
                  const fresh = withFreshIds(pair.content, pair.translation);
                  onPick({
                    content: fresh.content,
                    translation: fresh.translation ?? wordless(fresh.content),
                  });
                }}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
