import type { PageSection, SiteLocale } from "@faridalms/domain/site-sections";
import type { BuiltTemplate } from "@faridalms/domain/site-templates";

import { Tabs } from "@base-ui/react/tabs";
import { savedSectionOf } from "@faridalms/domain/saved-sections";
import { siteThemeFor } from "@faridalms/domain/site-brand";
import {
  pagePlainText,
  sectionComplete,
  sectionWritten,
} from "@faridalms/domain/website";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@faridalms/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@faridalms/ui/dropdown-menu";
import { Input } from "@faridalms/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@faridalms/ui/sheet";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { Segmented } from "@faridalms/ui/system/panel";
import { StatusBadge } from "@faridalms/ui/system/status";
import { UnsavedChangesGuard } from "@faridalms/ui/system/unsaved-changes-guard";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  FileText,
  LayoutList,
  Monitor,
  Paintbrush,
  PanelsTopLeft,
  Redo2,
  Smartphone,
  SquarePen,
  Tablet,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import type { siteOverviewQuery, sitePageQuery } from "~/queries/site";

import { DocumentHistory } from "~/components/content/DocumentHistory";
import { useHeldDocument } from "~/components/content/held-document";
import { LOCALE_NAME } from "~/components/content/languages";
import { usePicturePeople } from "~/components/files/PicturedPeople";
import {
  HeldChanges,
  NotSaved,
  SaveIndicator,
} from "~/components/system/DocumentPage";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { siteClassesQuery } from "~/queries/site";
import { saveSharedSection } from "~/server/shared";
import {
  getSitePage,
  publishSitePage,
  saveSitePage,
  saveSiteSettings,
  unpublishSitePage,
} from "~/server/site";
import { formatNumber, instantFromLocal } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { SiteFrameModel } from "../render/frame";
import type { RenderContext } from "../render/parts";
import type { Device } from "./Canvas";
import type { Languages, PageDraft, SharedState, StudioDraft } from "./draft";
import type { Inserted, SharedInfo } from "./SavedSections";

import { STATE_LABEL, STATE_TONE } from "../format";
import { withNews } from "../render/frame-model";
import { PageSections } from "../render/page";
import { siteWords } from "../slots";
import { Canvas, DEVICES, Viewport } from "./Canvas";
import {
  canonicalValid,
  canvasSections,
  contentOf,
  issuesOf,
  otherOf,
  sharedChanged,
  sharedStateOf,
  slugOf,
  useUndoable,
  warningsOf,
} from "./draft";
import { SectionGallery } from "./Gallery";
import { Inspector } from "./Inspector";
import { ISSUE_LABEL, SECTION_LABEL } from "./labels";
import { Outline } from "./Outline";
import { PagePanel } from "./PagePanel";
import { SaveSectionDialog, SharedSectionBar } from "./SavedSections";
import { FramePanel, StylesPanel } from "./SitePanels";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof sitePageQuery>["queryFn"]>>
>;
type Overview = Awaited<
  ReturnType<NonNullable<(typeof siteOverviewQuery)["queryFn"]>>
>;

export type StudioPanel = "sections" | "page" | "styles" | "frame";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NO_PICTURE = { fileId: null, alt: "" };

const LOCALE_SHORT: Record<SiteLocale, () => string> = {
  en: m.siteLocaleShortEn,
  ar: m.siteLocaleShortAr,
};

function pageDraftOf(
  existing: Existing | null,
  template: BuiltTemplate | null,
  languages: Languages,
): PageDraft {
  if (existing) {
    const translated: Record<string, PageSection> = {};
    for (const section of existing.translation?.sections ?? [])
      translated[section.id] = section;
    return {
      titleEn: existing.titleEn,
      titleAr: existing.titleAr,
      slug: existing.slug,
      parentId: existing.parentId ?? "",
      inMenu: existing.inMenu,
      sections: existing.content.sections,
      translated,
      reviewed: existing.translation?.reviewed ?? [],
      description: existing.content.description,
      otherDescription: existing.translation?.description ?? "",
      socialPicture: existing.content.socialPicture,
      otherSocialPicture: existing.translation?.socialPicture ?? NO_PICTURE,
      canonical: existing.content.canonical,
      otherCanonical: existing.translation?.canonical ?? "",
      indexed: existing.indexed,
    };
  }
  const built = template ?? { content: [], translation: [] };
  return {
    titleEn: "",
    titleAr: "",
    slug: "",
    parentId: "",
    inMenu: true,
    sections: built.content,
    translated: languages.other
      ? Object.fromEntries(
          built.translation.map((section) => [section.id, section]),
        )
      : {},
    reviewed: [],
    description: "",
    otherDescription: "",
    socialPicture: NO_PICTURE,
    otherSocialPicture: NO_PICTURE,
    canonical: "",
    otherCanonical: "",
    indexed: true,
  };
}

/** A section as a page holds it on its own, no longer naming a shared section. */
function own(section: PageSection): PageSection {
  const { shared: _shared, ...rest } = section;
  return rest;
}

const editableTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

export interface SiteStudioProps {
  existing: Existing | null;
  overview: Overview;
  template: BuiltTemplate | null;
  initialPanel?: StudioPanel;
  /** Learns the address a new page was stored at, once its first save lands. */
  onCreated?: (id: string) => void;
}

/**
 * The website builder: the page drawn live in the site's theme, an outline
 * of its sections, the selected section's settings, and the site's styles
 * and frame, with undo, both languages and three device widths.
 */
export function SiteStudio({
  existing,
  overview,
  template,
  initialPanel = "sections",
  onCreated,
}: SiteStudioProps) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const classes = useSuspenseQuery(siteClassesQuery).data;
  const documentMedia = useDocumentMedia();
  const lent = useSlot(siteWords).map((each) => each.word);
  const pictured = usePicturePeople("website");
  const media = useMemo(
    () => ({ ...documentMedia, people: pictured.open }),
    [documentMedia, pictured.open],
  );
  const wide = useWide();
  const settings = overview.settings;
  const languages: Languages = {
    primary: settings.primaryLocale,
    other: settings.bilingual
      ? settings.primaryLocale === "en"
        ? "ar"
        : "en"
      : null,
  };
  const history = useUndoable<StudioDraft>(() => ({
    page: pageDraftOf(existing, template, languages),
    site: { theme: settings.theme, chrome: settings.chrome },
  }));
  const draft = history.value;
  const [shared, setShared] = useState<SharedState>(() =>
    sharedStateOf(draft.page.sections, draft.page.translated, existing?.shared),
  );
  const [keeping, setKeeping] = useState<string | null>(null);
  const [savingShared, setSavingShared] = useState(false);
  const [savedSite, setSavedSite] = useState(draft.site);
  const [pageId, setPageId] = useState(existing?.id ?? null);
  // What the server holds, read by saves that run one after another before
  // the next render.
  const versions = useRef({
    id: existing?.id ?? null,
    page: existing?.version ?? 0,
    settings: settings.version,
  });
  const [shownState, setShownState] = useState(existing?.shown ?? "draft");
  const [waiting, setWaiting] = useState(
    Boolean(existing && existing.revisedAt !== null),
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<StudioPanel>(initialPanel);
  const [chosenDevice, setDevice] = useState<Device>("desktop");
  const [locale, setLocale] = useState<SiteLocale>(languages.primary);
  const [galleryAt, setGalleryAt] = useState<number | null>(null);
  const [sheet, setSheet] = useState<"panel" | "inspector" | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [publishAt, setPublishAt] = useState("");
  const [attempted, setAttempted] = useState(false);
  const slugTouched = useRef(Boolean(existing));

  const device = wide ? chosenDevice : "phone";
  const otherLocale = languages.other;
  const page = draft.page;
  const theme = siteThemeFor(draft.site.theme, overview.school.brand);
  const siteDirty = JSON.stringify(draft.site) !== JSON.stringify(savedSite);

  const updatePage = useCallback(
    (change: (page: PageDraft) => PageDraft, key?: string) =>
      history.update(
        (current) => ({ ...current, page: change(current.page) }),
        key,
      ),
    [history],
  );
  const setSections = (
    change: (sections: PageSection[]) => PageSection[],
    key?: string,
  ) =>
    updatePage(
      (current) => ({ ...current, sections: change(current.sections) }),
      key,
    );

  const primaryTitle = languages.primary === "ar" ? page.titleAr : page.titleEn;
  const titleIn = (which: SiteLocale) =>
    (which === "ar" ? page.titleAr : page.titleEn) || primaryTitle;
  const errors = {
    title: primaryTitle.trim() ? null : m.siteTitleNeeded(),
    slug: existing?.isHome || SLUG.test(page.slug) ? null : m.siteSlugNeeded(),
  };
  const problems = issuesOf(page, languages);
  const warnings = warningsOf(page, languages);
  const problemIds = new Set(problems.map((entry) => entry.issue.sectionId));
  const untranslated = new Set(
    languages.other
      ? page.sections
          .filter(
            (section) =>
              sectionWritten(section) &&
              !sectionComplete(section, otherOf(page, section)),
          )
          .map((section) => section.id)
      : [],
  );

  const pages = useMemo(
    () => [
      ...overview.pages.map((row) => ({
        href: row.isHome ? "/" : `/pages/${row.slug}`,
        title:
          (languages.primary === "ar" ? row.titleAr : row.titleEn) ||
          row.titleEn ||
          row.titleAr,
      })),
      { href: "/news", title: m.siteNews() },
    ],
    [overview.pages, languages.primary],
  );

  const say = (words: { en: string; ar: string }) =>
    words[locale] || words[languages.primary];
  const chrome = draft.site.chrome;
  const logoUrl = user.school.logoFileId
    ? `/files/${user.school.logoFileId}`
    : null;
  const bannerWords =
    (locale === "ar" ? settings.bannerAr : settings.bannerEn) ||
    (languages.primary === "ar" ? settings.bannerAr : settings.bannerEn);
  const frame: SiteFrameModel = {
    name:
      (locale === "ar" ? overview.school.nameAr : null) ||
      overview.school.nameEn,
    tagline:
      (locale === "ar" ? settings.taglineAr : settings.taglineEn) ||
      (languages.primary === "ar" ? settings.taglineAr : settings.taglineEn),
    logoUrl,
    banner: bannerWords
      ? { text: bannerWords, tone: settings.bannerTone }
      : null,
    utility: chrome.utility.map((link) => ({
      id: link.id,
      label: say(link.label),
      href: link.href,
    })),
    actions: chrome.actions.map((link) => ({
      id: link.id,
      label: say(link.label),
      href: link.href,
      style: link.style,
    })),
    menu: withNews(
      [
        ...overview.pages
          .filter((row) => (row.id === pageId ? page.inMenu : row.inMenu))
          .map((row) => ({
            id: row.id,
            parentId: row.id === pageId ? page.parentId || null : row.parentId,
            label:
              row.id === pageId
                ? titleIn(locale)
                : (locale === "ar" ? row.titleAr : row.titleEn) ||
                  row.titleEn ||
                  row.titleAr,
            href: row.isHome
              ? "/"
              : `/pages/${row.id === pageId ? page.slug : row.slug}`,
          })),
        ...(pageId || !page.inMenu
          ? []
          : [
              {
                id: "new",
                parentId: page.parentId || null,
                label: titleIn(locale) || m.siteNewPage(),
                href: `/pages/${page.slug}`,
              },
            ]),
      ],
      [...chrome.utility, ...chrome.actions],
      m.siteNews({}, { locale }),
    ),
    footerColumns: chrome.footerColumns.map((column) => ({
      id: column.id,
      title: say(column.title),
      links: column.links.map((link) => ({
        id: link.id,
        label: say(link.label),
        href: link.href,
      })),
    })),
    footerNote: say(chrome.footerNote),
    dock: chrome.dock,
    socialLinks: settings.socialLinks,
    otherLanguage: languages.other
      ? {
          locale:
            locale === languages.primary ? languages.other : languages.primary,
          href: "",
        }
      : null,
    currentHref: existing?.isHome ? "/" : `/pages/${page.slug}`,
    // The builder shows the link without following it.
    signInHref: "/sign-in",
  };
  const context: RenderContext = {
    school: user.school.slug,
    locale,
    theme,
    fileUrl: (fileId) => `/files/${fileId}`,
    news: overview.news[locale].length
      ? overview.news[locale]
      : overview.news[languages.primary],
    events: overview.events,
    intakes: overview.intakes,
    classes: classes.shown[locale],
    today: overview.today,
    applyHref: () => "/apply",
    contact: overview.school.contact,
    editing: true,
    words: lent,
  };
  const sections = canvasSections(page, languages, locale);
  const selectedSection =
    page.sections.find((section) => section.id === selected) ?? null;
  const editingOther = languages.other !== null && locale !== languages.primary;

  const insert = (sample: Inserted) => {
    const known = new Set(["", ...pages.map((entry) => entry.href)]);
    const prune = (section: PageSection) =>
      JSON.parse(JSON.stringify(section), (key, value: unknown) =>
        key === "href" &&
        typeof value === "string" &&
        value.startsWith("/") &&
        !known.has(value)
          ? ""
          : value,
      ) as PageSection;
    // A shared section is shown as it is kept; only a copy is fitted to this site.
    const inserted = sample.shared
      ? sample
      : {
          content: prune(sample.content),
          translation: prune(sample.translation),
        };
    const sharing = sample.shared;
    if (sharing)
      setShared((current) => ({
        ...current,
        info: { ...current.info, [sharing.id]: sharing },
        base: current.base[sharing.id]
          ? current.base
          : {
              ...current.base,
              [sharing.id]: {
                section: sample.content,
                translation: languages.other ? sample.translation : null,
              },
            },
      }));
    const at = galleryAt ?? page.sections.length;
    updatePage((current) => ({
      ...current,
      sections: [
        ...current.sections.slice(0, at),
        inserted.content,
        ...current.sections.slice(at),
      ],
      translated: languages.other
        ? { ...current.translated, [inserted.content.id]: inserted.translation }
        : current.translated,
    }));
    setGalleryAt(null);
    setSelected(inserted.content.id);
    if (!wide) setSheet("inspector");
  };
  const moveSection = (id: string, by: -1 | 1) =>
    setSections((current) => {
      const index = current.findIndex((section) => section.id === id);
      const target = index + by;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [section] = next.splice(index, 1);
      if (section) next.splice(target, 0, section);
      return next;
    });
  const reorder = (from: number, to: number) =>
    setSections((current) => {
      const next = [...current];
      const [section] = next.splice(from, 1);
      if (section) next.splice(to, 0, section);
      return next;
    });
  const duplicate = (id: string) => {
    const shown = page.sections.find((section) => section.id === id);
    if (!shown) return;
    const copyId = crypto.randomUUID();
    updatePage((current) => {
      const index = current.sections.findIndex((section) => section.id === id);
      const original = current.sections[index];
      if (!original) return current;
      const itemIds = new Map<string, string>();
      const fresh = (section: PageSection) =>
        ({
          ...(JSON.parse(JSON.stringify(section), (key, value: unknown) => {
            if (
              key !== "id" ||
              typeof value !== "string" ||
              value === section.id
            )
              return value;
            const known = itemIds.get(value) ?? crypto.randomUUID();
            itemIds.set(value, known);
            return known;
          }) as PageSection),
          id: copyId,
        }) as PageSection;
      const words = current.translated[id];
      return {
        ...current,
        sections: [
          ...current.sections.slice(0, index + 1),
          fresh(original),
          ...current.sections.slice(index + 1),
        ],
        translated: words
          ? { ...current.translated, [copyId]: fresh(words) }
          : current.translated,
      };
    });
    setSelected(copyId);
  };
  const remove = (id: string) => {
    setSections((current) => current.filter((section) => section.id !== id));
    if (selected === id) setSelected(null);
  };

  // The selected section answers the keys people expect from a layout
  // editor; all of it can be undone.
  const onSectionKey = useEffectEvent((event: KeyboardEvent) => {
    if (
      reading ||
      !selected ||
      editableTarget(event.target) ||
      galleryAt !== null
    )
      return;
    const command = event.metaKey || event.ctrlKey;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(selected);
    } else if (command && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicate(selected);
    } else if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      moveSection(selected, event.key === "ArrowUp" ? -1 : 1);
    } else if (event.key === "Escape") {
      setSelected(null);
    }
  });
  useEffect(() => {
    const listen = (event: KeyboardEvent) => onSectionKey(event);
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, []);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["site"] });
  const settingsPayload = {
    live: settings.live,
    bilingual: settings.bilingual,
    taglineEn: settings.taglineEn,
    taglineAr: settings.taglineAr,
    socialLinks: settings.socialLinks,
    bannerEn: settings.bannerEn,
    bannerAr: settings.bannerAr,
    bannerTone: settings.bannerTone,
    bannerUntil: settings.bannerUntil ?? "",
  };
  const storePage = async (snapshot: PageDraft) => {
    const { content, translation } = contentOf(snapshot);
    const result = await saveSitePage({
      data: {
        id: versions.current.id ?? "",
        expectedVersion: versions.current.page,
        parentId: snapshot.parentId,
        slug: existing?.isHome ? existing.slug : snapshot.slug,
        titleEn: snapshot.titleEn.trim(),
        titleAr: snapshot.titleAr.trim(),
        inMenu: snapshot.inMenu,
        indexed: snapshot.indexed,
        content,
        translation: languages.other ? translation : null,
      },
    });
    versions.current.page = result.version;
    setWaiting(true);
    if (!versions.current.id) {
      versions.current.id = result.id;
      setPageId(result.id);
      onCreated?.(result.id);
    }
    await invalidate();
    // A save can name a shared section or stop naming one, which its uses say.
    await queryClient.invalidateQueries({ queryKey: ["shared", "uses"] });
  };
  const pageValid =
    !errors.title &&
    !errors.slug &&
    [page.canonical, page.otherCanonical].every(canonicalValid);
  const titleOf = (value: PageDraft) =>
    (languages.primary === "ar" ? value.titleAr : value.titleEn) ||
    value.titleEn ||
    value.titleAr ||
    m.siteUntitledPage();
  const { autosave, editing } = useHeldDocument({
    host: pageId ? { hostType: "site_page", hostId: pageId } : null,
    value: page,
    save: storePage,
    enabled: pageValid,
    version: () => versions.current.page,
    latest: async () => {
      const data = await getSitePage({
        data: { id: versions.current.id ?? "" },
      });
      return {
        value: pageDraftOf(data, null, languages),
        version: data.version,
        data,
      };
    },
    adopt: ({ value, version, data }) => {
      versions.current.page = version;
      history.reset((current) => ({ ...current, page: value }));
      setShared(sharedStateOf(value.sections, value.translated, data.shared));
      setShownState(data.shown);
      setWaiting(data.revisedAt !== null);
    },
    rebase: (version) => {
      versions.current.page = version;
    },
    render: (value) => (
      <Viewport width={DEVICES.tablet} theme={theme} locale={languages.primary}>
        <PageSections
          sections={canvasSections(value, languages, languages.primary)}
          title={titleOf(value)}
          context={{ ...context, locale: languages.primary, editing: false }}
        />
      </Viewport>
    ),
    text: (value) =>
      [titleOf(value), pagePlainText(contentOf(value).content)].join("\n\n"),
  });
  const reading = !editing.editable;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        reading ||
        !(event.metaKey || event.ctrlKey) ||
        editableTarget(event.target)
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        history.undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, reading]);
  const saveSite = useMutation({
    mutationFn: async (site: StudioDraft["site"]) => {
      const result = await saveSiteSettings({
        data: {
          ...settingsPayload,
          theme: site.theme,
          chrome: site.chrome,
          expectedVersion: versions.current.settings,
        },
      });
      versions.current.settings = result.version;
      setSavedSite(site);
      await invalidate();
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const publish = useMutation({
    mutationFn: (input: { id: string; version: number; at: string }) =>
      publishSitePage({
        data: {
          id: input.id,
          expectedVersion: input.version,
          publishAt: input.at,
        },
      }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const unpublish = useMutation({
    mutationFn: (id: string) =>
      unpublishSitePage({
        data: { id, expectedVersion: versions.current.page },
      }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });

  const showPageDetails = () => {
    setAttempted(true);
    setPanel("page");
    if (!wide) setSheet("panel");
    toast.error(m.siteFixPageDetails());
  };
  const doPublish = async (at: string) => {
    if (!pageValid) {
      showPageDetails();
      return;
    }
    if (page.sections.length === 0) {
      toast.error(m.siteSectionsNeeded());
      return;
    }
    if (problems.length) {
      setSelected(null);
      if (!wide) setSheet("inspector");
      toast.error(m.siteFixIssues());
      return;
    }
    if (!(await autosave.flush()) || !versions.current.id) {
      toast.error(m.docSaveFailed());
      return;
    }
    if (siteDirty) {
      try {
        await saveSite.mutateAsync(draft.site);
      } catch {
        return;
      }
    }
    try {
      const published = await publish.mutateAsync({
        id: versions.current.id,
        version: versions.current.page,
        at,
      });
      versions.current.page = published.version;
    } catch {
      return;
    }
    setShownState(at ? "scheduled" : "published");
    setWaiting(false);
    setScheduling(false);
    await invalidate();
    toast.success(at ? m.siteScheduled() : m.sitePublished());
  };
  const busy = saveSite.isPending || publish.isPending || unpublish.isPending;
  const published = shownState === "published" || shownState === "scheduled";

  const fieldContext = {
    locale,
    wordsOnly: editingOther,
    pages,
    media,
    intakes: overview.intakes.map((intake) => ({
      id: intake.id,
      label:
        (locale === "ar"
          ? (intake.titleAr ?? intake.titleEn)
          : (intake.titleEn ?? intake.titleAr)) ?? "",
    })),
    classes: classes.choices.map((row) => ({
      id: row.id,
      label:
        (locale === "ar"
          ? (row.titleAr ?? row.titleEn)
          : (row.titleEn ?? row.titleAr)) ?? row.code,
      shown: row.shown,
    })),
    courses: classes.courses.map((course) => ({
      id: course.id,
      label:
        (locale === "ar"
          ? (course.titleAr ?? course.titleEn)
          : (course.titleEn ?? course.titleAr)) ?? "",
    })),
  };
  const sharedWaiting = Object.keys(shared.base).some((id) =>
    sharedChanged(page, shared, id),
  );
  const selectedShared = selectedSection?.shared ?? null;
  const selectedInfo =
    selectedSection &&
    selectedShared &&
    !shared.gone.includes(selectedSection.id)
      ? (shared.info[selectedShared] ?? null)
      : null;
  const fixed = (section: PageSection) =>
    Boolean(section.shared) &&
    (shared.gone.includes(section.id) ||
      !shared.info[section.shared ?? ""]?.editable);

  /** Puts a shared section's words back as they were kept, wherever the page shows it. */
  const discardShared = (sharedId: string) => {
    const base = shared.base[sharedId];
    if (!base) return;
    updatePage((current) => {
      const translated = { ...current.translated };
      const restored = current.sections.map((section) => {
        if (section.shared !== sharedId) return section;
        if (base.translation)
          translated[section.id] = {
            ...base.translation,
            id: section.id,
            shared: sharedId,
          };
        return {
          ...base.section,
          id: section.id,
          shared: sharedId,
        };
      });
      return { ...current, sections: restored, translated };
    });
  };

  /** Saves a shared section as the page now shows it, so every page shows the change. */
  const saveShared = async (section: PageSection) => {
    const sharedId = section.shared;
    const info = sharedId ? shared.info[sharedId] : undefined;
    if (!sharedId || !info) return;
    setSavingShared(true);
    try {
      const translation = languages.other ? otherOf(page, section) : null;
      const saved = await saveSharedSection({
        data: {
          id: sharedId,
          expectedVersion: info.version,
          title: info.title,
          scope: info.scope,
          section: savedSectionOf(section, translation, languages.primary),
        },
      });
      setShared((current) => ({
        ...current,
        info: {
          ...current.info,
          [sharedId]: { ...info, version: saved.version },
        },
        base: {
          ...current.base,
          [sharedId]: { section, translation },
        },
      }));
      // Another place on this page showing it shows the change too.
      updatePage((current) => ({
        ...current,
        sections: current.sections.map((other) =>
          other.shared === sharedId && other.id !== section.id
            ? { ...section, id: other.id }
            : other,
        ),
      }));
      await queryClient.invalidateQueries({ queryKey: ["shared"] });
      await invalidate();
      toast.success(m.siteSharedSectionSaved());
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setSavingShared(false);
    }
  };

  const keptSection = keeping
    ? page.sections.find((section) => section.id === keeping)
    : undefined;

  /** The page now shows a section it just kept as a shared section. */
  const markShared = (section: PageSection, info: SharedInfo) => {
    const mark = (from: PageSection): PageSection => ({
      ...from,
      shared: info.id,
    });
    const words = page.translated[section.id];
    setShared((current) => ({
      ...current,
      info: { ...current.info, [info.id]: info },
      base: {
        ...current.base,
        [info.id]: {
          section: mark(section),
          translation: words ? mark(words) : null,
        },
      },
    }));
    updatePage((current) => {
      const theirs = current.translated[section.id];
      return {
        ...current,
        sections: current.sections.map((item) =>
          item.id === section.id ? mark(item) : item,
        ),
        translated: theirs
          ? { ...current.translated, [section.id]: mark(theirs) }
          : current.translated,
      };
    });
  };

  /** Keeps a shared section on this page as its own copy, no longer kept in step. */
  const detach = (sectionId: string) =>
    updatePage((current) => {
      const words = current.translated[sectionId];
      return {
        ...current,
        sections: current.sections.map((section) =>
          section.id === sectionId ? own(section) : section,
        ),
        translated: words
          ? { ...current.translated, [sectionId]: own(words) }
          : current.translated,
      };
    });

  const inspector = selectedSection ? (
    <Inspector
      key={`${selectedSection.id}-${locale}`}
      section={selectedSection}
      shown={editingOther ? otherOf(page, selectedSection) : selectedSection}
      locale={locale}
      languages={languages}
      fieldContext={fieldContext}
      renderContext={context}
      issues={problems
        .filter(
          (entry) =>
            entry.issue.sectionId === selectedSection.id &&
            entry.locale === locale,
        )
        .map((entry) => entry.issue.code)}
      reviewed={page.reviewed.includes(selectedSection.id)}
      onChange={(next, key) =>
        setSections(
          (current) =>
            current.map((section) => (section.id === next.id ? next : section)),
          key,
        )
      }
      onWords={(next, key) =>
        updatePage(
          (current) => ({
            ...current,
            translated: { ...current.translated, [next.id]: next },
          }),
          key,
        )
      }
      onReviewed={(reviewed) =>
        updatePage((current) => ({
          ...current,
          reviewed: reviewed
            ? [...current.reviewed, selectedSection.id]
            : current.reviewed.filter((id) => id !== selectedSection.id),
        }))
      }
      onClose={() => {
        setSelected(null);
        setSheet(null);
      }}
      readOnly={fixed(selectedSection)}
      onKeep={selectedShared ? undefined : () => setKeeping(selectedSection.id)}
      notice={
        selectedShared ? (
          <SharedSectionBar
            shared={selectedInfo}
            dirty={sharedChanged(page, shared, selectedShared)}
            saving={savingShared}
            onSave={() => void saveShared(selectedSection)}
            onDiscard={() => discardShared(selectedShared)}
            onDetach={() => detach(selectedSection.id)}
            onRemove={() => remove(selectedSection.id)}
          />
        ) : undefined
      }
    />
  ) : (
    <div className="grid content-start gap-4 p-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">{m.siteChecks()}</h2>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.siteSelectToEdit()}
        </p>
      </div>
      {problems.length === 0 &&
      untranslated.size === 0 &&
      warnings.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2.5 text-sm text-success">
          <CircleCheck aria-hidden className="size-4" />
          {m.siteReadyToPublish()}
        </p>
      ) : null}
      {problems.length ? (
        <ul className="grid gap-1.5">
          {problems.map((entry) => {
            const section = page.sections.find(
              (item) => item.id === entry.issue.sectionId,
            );
            return (
              <li
                key={`${entry.locale}-${entry.issue.sectionId}-${entry.issue.code}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setLocale(entry.locale);
                    setSelected(entry.issue.sectionId);
                  }}
                  className="flex w-full items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-start text-sm hover:bg-destructive/10"
                >
                  <CircleAlert
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                  />
                  <span className="grid gap-0.5">
                    <span className="font-medium">
                      {ISSUE_LABEL[entry.issue.code]()}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {section ? SECTION_LABEL[section.type]() : ""}
                      {languages.other
                        ? ` · ${LOCALE_NAME[entry.locale]()}`
                        : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {untranslated.size && languages.other ? (
        <p className="rounded-lg bg-warning/10 px-3 py-2.5 text-[13px] leading-[18px] text-warning-foreground dark:text-warning">
          {m.siteUntranslatedCount({
            count: untranslated.size,
            value: formatNumber(untranslated.size),
            language: LOCALE_NAME[languages.other](),
          })}
        </p>
      ) : null}
      {warnings.length ? (
        <ul className="grid gap-1.5">
          {warnings.map((entry) => (
            <li key={`${entry.locale}-${entry.code}`}>
              <button
                type="button"
                onClick={() => {
                  setPanel("page");
                  if (!wide) setSheet("panel");
                }}
                className="flex w-full items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-start text-[13px] leading-[18px] text-warning-foreground hover:bg-warning/15 dark:text-warning"
              >
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {languages.other
                  ? m.siteNoDescriptionIn({
                      language: LOCALE_NAME[entry.locale](),
                    })
                  : m.siteNoDescription()}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  const railTabs: {
    value: StudioPanel;
    label: string;
    icon: typeof LayoutList;
  }[] = [
    { value: "sections", label: m.siteRailSections(), icon: LayoutList },
    { value: "page", label: m.siteRailPage(), icon: FileText },
    { value: "styles", label: m.siteRailStyles(), icon: Paintbrush },
    { value: "frame", label: m.siteRailFrame(), icon: PanelsTopLeft },
  ];
  const panelBody =
    panel === "sections" ? (
      <Outline
        sections={page.sections}
        selected={selected}
        locale={locale}
        problems={problemIds}
        untranslated={untranslated}
        onSelect={(id) => {
          setSelected(id);
          if (!wide) setSheet("inspector");
        }}
        onReorder={reorder}
        onAdd={() => setGalleryAt(page.sections.length)}
      />
    ) : panel === "page" ? (
      <PagePanel
        draft={page}
        languages={languages}
        isHome={Boolean(existing?.isHome)}
        parents={
          existing
            ? existing.parents
            : overview.pages
                .filter((row) => !row.isHome)
                .map((row) => ({
                  id: row.id,
                  title:
                    (languages.primary === "ar" ? row.titleAr : row.titleEn) ||
                    row.titleEn ||
                    row.titleAr,
                }))
        }
        errors={attempted ? errors : { title: null, slug: null }}
        onPeople={pictured.open}
        onHistory={pageId ? () => setHistoryOpen(true) : undefined}
        onSlugTouched={() => {
          slugTouched.current = true;
        }}
        onChange={(change, key) =>
          updatePage(
            (current) => ({
              ...current,
              ...change,
              ...(change.titleEn !== undefined &&
              !slugTouched.current &&
              !existing?.isHome
                ? { slug: slugOf(change.titleEn) }
                : {}),
            }),
            key,
          )
        }
      />
    ) : panel === "styles" ? (
      <StylesPanel
        theme={draft.site.theme}
        brand={overview.school.brand}
        onChange={(next, key) =>
          history.update(
            (current) => ({
              ...current,
              site: { ...current.site, theme: next },
            }),
            key,
          )
        }
      />
    ) : (
      <FramePanel
        chrome={chrome}
        languages={languages}
        pages={pages}
        logoUrl={logoUrl}
        onChange={(next, key) =>
          history.update(
            (current) => ({
              ...current,
              site: { ...current.site, chrome: next },
            }),
            key,
          )
        }
      />
    );
  const rail = (
    <Tabs.Root
      value={panel}
      onValueChange={(value) => setPanel(value as StudioPanel)}
      orientation="vertical"
      className="flex min-h-0 flex-1"
    >
      <Tabs.List className="flex w-[72px] shrink-0 flex-col items-stretch gap-1 border-e bg-muted/30 px-2 py-3">
        {railTabs.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            className="group flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] leading-tight font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:bg-primary/12 data-active:text-primary"
          >
            <tab.icon aria-hidden className="size-5" />
            <span className="max-w-full text-center">{tab.label}</span>
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <Tabs.Panel
        value={panel}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto outline-none"
      >
        <h2 className="border-b px-4 py-3 text-sm font-semibold">
          {railTabs.find((tab) => tab.value === panel)?.label}
        </h2>
        {panelBody}
      </Tabs.Panel>
    </Tabs.Root>
  );

  const title = titleIn(languages.primary) || m.siteUntitledPage();
  return (
    <div className="flex h-dvh flex-col bg-background">
      <UnsavedChangesGuard
        isDirty={() =>
          autosave.busy() || autosave.dirty || siteDirty || sharedWaiting
        }
        pending={busy}
      />
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 lg:px-3">
        <ButtonLink
          to="/website"
          variant="ghost"
          size="icon"
          className="max-md:size-10"
          aria-label={m.siteBackToWebsite()}
        >
          <ArrowLeft aria-hidden className="rtl:rotate-180" />
        </ButtonLink>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                className="max-w-[16rem] min-w-0 gap-1.5 px-2 max-md:h-10 max-sm:max-w-[7.5rem]"
              />
            }
          >
            <span className="truncate font-semibold">{title}</span>
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{m.siteSwitchPage()}</DropdownMenuLabel>
              {overview.pages.map((row) => (
                <DropdownMenuItem
                  key={row.id}
                  disabled={row.id === pageId}
                  onClick={() =>
                    void navigate({
                      to: "/site-page-editor",
                      search: { id: row.id },
                    })
                  }
                >
                  {(languages.primary === "ar" ? row.titleAr : row.titleEn) ||
                    row.titleEn ||
                    row.titleAr}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                void navigate({ to: "/site-page-editor", search: {} })
              }
            >
              {m.siteNewPage()}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <StatusBadge tone={STATE_TONE[shownState]} className="max-sm:hidden">
          {STATE_LABEL[shownState]()}
        </StatusBadge>
        <div className="mx-auto flex items-center gap-2 max-lg:hidden">
          <Segmented
            label={m.siteDevice()}
            value={device}
            options={[
              {
                value: "desktop",
                label: m.siteDesktop(),
                icon: <Monitor aria-hidden className="size-4" />,
              },
              {
                value: "tablet",
                label: m.siteTablet(),
                icon: <Tablet aria-hidden className="size-4" />,
              },
              {
                value: "phone",
                label: m.sitePhone(),
                icon: <Smartphone aria-hidden className="size-4" />,
              },
            ]}
            onChange={setDevice}
          />
          {languages.other ? (
            <Segmented
              label={m.siteLanguage()}
              value={locale}
              options={[languages.primary, languages.other].map((value) => ({
                value,
                label: LOCALE_NAME[value](),
              }))}
              onChange={setLocale}
            />
          ) : null}
        </div>
        <div className="ms-auto flex items-center gap-1 lg:ms-0">
          {otherLocale ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="max-md:h-10 lg:hidden"
              onClick={() =>
                setLocale(
                  locale === languages.primary
                    ? otherLocale
                    : languages.primary,
                )
              }
            >
              {LOCALE_SHORT[
                locale === languages.primary ? otherLocale : languages.primary
              ]()}
            </Button>
          ) : null}
          {reading ? null : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="max-md:size-10"
                aria-label={m.siteUndo()}
                disabled={!history.canUndo}
                onClick={history.undo}
              >
                <Undo2 aria-hidden className="rtl:-scale-x-100" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="max-md:size-10 max-sm:hidden"
                aria-label={m.siteRedo()}
                disabled={!history.canRedo}
                onClick={history.redo}
              >
                <Redo2 aria-hidden className="rtl:-scale-x-100" />
              </Button>
              <div className="flex min-w-0 items-center gap-2 px-1 max-xl:hidden">
                {!pageValid && autosave.dirty ? (
                  <NotSaved reason={errors.title ?? errors.slug ?? ""} />
                ) : (
                  <SaveIndicator
                    state={autosave.state}
                    onRetry={autosave.retry}
                  />
                )}
                {published && waiting && !siteDirty ? (
                  <span className="text-[13px] text-muted-foreground">
                    {m.siteChangesWaiting()}
                  </span>
                ) : null}
              </div>
              {siteDirty ? (
                <HeldChanges
                  waiting={m.siteStylesWaiting()}
                  onDiscard={() =>
                    history.update(
                      (current) => ({ ...current, site: savedSite }),
                      "site:discard",
                    )
                  }
                  onUpdate={() => void saveSite.mutateAsync(draft.site)}
                  pending={saveSite.isPending}
                  quiet
                />
              ) : null}
            </>
          )}
          {published && pageId && !existing?.isHome ? (
            <ButtonLink
              to="/site/$school/pages/$slug"
              params={{ school: user.school.slug, slug: page.slug }}
              target="_blank"
              variant="ghost"
              size="icon"
              className="max-md:size-10 max-sm:hidden"
              aria-label={m.siteViewLive()}
            >
              <ExternalLink aria-hidden />
            </ButtonLink>
          ) : published && existing?.isHome ? (
            <ButtonLink
              to="/site/$school"
              params={{ school: user.school.slug }}
              target="_blank"
              variant="ghost"
              size="icon"
              className="max-md:size-10 max-sm:hidden"
              aria-label={m.siteViewLive()}
            >
              <ExternalLink aria-hidden />
            </ButtonLink>
          ) : null}
          <div className={cn("flex", reading && "hidden")}>
            <Button
              type="button"
              className="rounded-e-none max-md:h-10"
              disabled={busy}
              onClick={() => void doPublish("")}
            >
              <span className="max-sm:hidden">
                {published ? m.sitePublishChanges() : m.sitePublish()}
              </span>
              <span className="sm:hidden">{m.sitePublish()}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="icon"
                    className="rounded-s-none border-s border-primary-foreground/20 max-md:size-10"
                    aria-label={m.siteMorePublishing()}
                    disabled={busy}
                  />
                }
              >
                <ChevronDown aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setScheduling(true)}>
                  <CalendarClock aria-hidden />
                  {m.siteSchedule()}
                </DropdownMenuItem>
                {published && pageId ? (
                  <DropdownMenuItem
                    onClick={() =>
                      void unpublish
                        .mutateAsync(pageId)
                        .then(async (result) => {
                          versions.current.page = result.version;
                          setShownState("draft");
                          await invalidate();
                          toast.success(m.siteUnpublished());
                        })
                    }
                  >
                    <X aria-hidden />
                    {m.siteUnpublish()}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      {editing.notice ? (
        <div className="shrink-0 border-b px-2 py-2 lg:px-3">
          {editing.notice}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label={m.siteBuilderPanels()}
          inert={reading}
          className="flex w-[360px] shrink-0 flex-col border-e max-lg:hidden"
        >
          {rail}
        </aside>
        <main className="min-w-0 flex-1" aria-label={m.siteCanvas()}>
          <Canvas
            device={device}
            locale={locale}
            frame={frame}
            context={context}
            sections={sections}
            title={titleIn(locale)}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              if (!wide) setSheet("inspector");
            }}
            onMove={moveSection}
            onDuplicate={duplicate}
            onRemove={remove}
            onInsert={(at) => setGalleryAt(at)}
            readOnly={reading}
            onText={(id, field, value) => {
              const section = page.sections.find((item) => item.id === id);
              if (!section || fixed(section)) return;
              const target = editingOther ? otherOf(page, section) : section;
              const next = {
                ...target,
                data: { ...target.data, [field]: value },
              } as PageSection;
              if (editingOther)
                updatePage((current) => ({
                  ...current,
                  translated: { ...current.translated, [id]: next },
                }));
              else
                setSections((current) =>
                  current.map((item) => (item.id === id ? next : item)),
                );
            }}
          />
        </main>
        <aside
          aria-label={m.siteInspector()}
          inert={reading}
          className="flex w-[360px] shrink-0 flex-col border-s max-lg:hidden"
        >
          {inspector}
        </aside>
      </div>
      <nav
        aria-label={m.siteBuilderPanels()}
        className="grid shrink-0 grid-cols-5 border-t lg:hidden"
      >
        {railTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setPanel(tab.value);
              setSheet("panel");
            }}
            className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
          >
            <tab.icon aria-hidden className="size-5" />
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSheet("inspector")}
          className={cn(
            "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
            selected ? "text-primary" : "text-muted-foreground",
          )}
        >
          <SquarePen aria-hidden className="size-5" />
          {m.siteRailEdit()}
        </button>
      </nav>
      <Sheet
        open={sheet !== null && !wide}
        onOpenChange={(open) => !open && setSheet(null)}
      >
        <SheetContent
          side="bottom"
          showCloseButton={!(sheet === "inspector" && selectedSection)}
          className="h-[85dvh] gap-0 rounded-t-2xl p-0"
        >
          <div
            aria-hidden
            className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
          />
          <SheetHeader
            className={cn(
              "border-b",
              // The section's own settings carry its name and a close button.
              sheet === "inspector" && selectedSection && "sr-only",
            )}
          >
            <SheetTitle>
              {sheet === "inspector"
                ? selectedSection
                  ? SECTION_LABEL[selectedSection.type]()
                  : m.siteChecks()
                : railTabs.find((tab) => tab.value === panel)?.label}
            </SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div inert={reading} className="contents">
              {sheet === "inspector" ? inspector : panelBody}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <SectionGallery
        open={galleryAt !== null}
        onOpenChange={(open) => !open && setGalleryAt(null)}
        context={context}
        primary={languages.primary}
        onPick={insert}
      />
      <Dialog open={scheduling} onOpenChange={setScheduling}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.siteSchedule()}</DialogTitle>
            <DialogDescription>{m.siteScheduleHint()}</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-sm font-medium">
            {m.sitePublishAt()}
            <Input
              type="datetime-local"
              value={publishAt}
              className="max-md:h-10"
              onChange={(event) => setPublishAt(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setScheduling(false)}
            >
              {m.commonCancel()}
            </Button>
            <Button
              type="button"
              disabled={!publishAt || busy}
              onClick={() => void doPublish(instantFromLocal(publishAt))}
            >
              {m.siteSchedule()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {keptSection ? (
        <SaveSectionDialog
          section={keptSection}
          translation={languages.other ? otherOf(page, keptSection) : null}
          primary={languages.primary}
          onClose={() => setKeeping(null)}
          onShared={(info) => markShared(keptSection, info)}
        />
      ) : null}
      {pictured.sheet}
      {editing.compare}
      {pageId ? (
        <DocumentHistory
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          hostType="site_page"
          hostId={pageId}
          onRestore={(restored) => {
            if (restored.kind !== "page") return;
            const words = restored.page;
            updatePage((current) =>
              restored.locale === languages.other
                ? {
                    ...current,
                    translated: Object.fromEntries(
                      words.sections.map((section) => [section.id, section]),
                    ),
                    otherDescription: words.description,
                    otherSocialPicture: words.socialPicture,
                    otherCanonical: words.canonical,
                  }
                : {
                    ...current,
                    sections: words.sections,
                    description: words.description,
                    socialPicture: words.socialPicture,
                    canonical: words.canonical,
                    reviewed: words.reviewed,
                  },
            );
          }}
        />
      ) : null}
    </div>
  );
}
