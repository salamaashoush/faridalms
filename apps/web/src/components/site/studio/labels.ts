import type {
  IconId,
  SectionCategory,
  SectionStyle,
  SectionType,
  SectionVariant,
  SiteIssueCode,
} from "@faridalms/domain/site-sections";
import type { PageTemplate, StarterId } from "@faridalms/domain/site-templates";
import type {
  ButtonShape,
  Density,
  Divider,
  FooterStyle,
  HeaderStyle,
  HeadingCase,
  Palette,
  SchemeId,
  ThemeId,
} from "@faridalms/domain/site-theme";

import * as m from "~/i18n/messages";

export const SECTION_LABEL: Record<SectionType, () => string> = {
  hero: m.siteTypeHero,
  pageHeader: m.siteTypePageHeader,
  announcement: m.siteTypeAnnouncement,
  welcome: m.siteTypeWelcome,
  text: m.siteTypeText,
  imageText: m.siteTypeImageText,
  cards: m.siteTypeCards,
  divisions: m.siteTypeDivisions,
  stats: m.siteTypeStats,
  pillars: m.siteTypePillars,
  quote: m.siteTypeQuote,
  voices: m.siteTypeVoices,
  people: m.siteTypePeople,
  video: m.siteTypeVideo,
  gallery: m.siteTypeGallery,
  timeline: m.siteTypeTimeline,
  accordion: m.siteTypeAccordion,
  logos: m.siteTypeLogos,
  news: m.siteTypeNews,
  events: m.siteTypeEvents,
  admissions: m.siteTypeAdmissions,
  steps: m.siteTypeSteps,
  fees: m.siteTypeFees,
  contact: m.siteTypeContact,
  quickLinks: m.siteTypeQuickLinks,
  embed: m.siteTypeEmbed,
};

export const SECTION_HINT: Record<SectionType, () => string> = {
  hero: m.siteTypeHintHero,
  pageHeader: m.siteTypeHintPageHeader,
  announcement: m.siteTypeHintAnnouncement,
  welcome: m.siteTypeHintWelcome,
  text: m.siteTypeHintText,
  imageText: m.siteTypeHintImageText,
  cards: m.siteTypeHintCards,
  divisions: m.siteTypeHintDivisions,
  stats: m.siteTypeHintStats,
  pillars: m.siteTypeHintPillars,
  quote: m.siteTypeHintQuote,
  voices: m.siteTypeHintVoices,
  people: m.siteTypeHintPeople,
  video: m.siteTypeHintVideo,
  gallery: m.siteTypeHintGallery,
  timeline: m.siteTypeHintTimeline,
  accordion: m.siteTypeHintAccordion,
  logos: m.siteTypeHintLogos,
  news: m.siteTypeHintNews,
  events: m.siteTypeHintEvents,
  admissions: m.siteTypeHintAdmissions,
  steps: m.siteTypeHintSteps,
  fees: m.siteTypeHintFees,
  contact: m.siteTypeHintContact,
  quickLinks: m.siteTypeHintQuickLinks,
  embed: m.siteTypeHintEmbed,
};

/** The name of each layout, by section type then layout. */
export const VARIANT_LABEL: {
  [T in SectionType]: Record<SectionVariant<T>, () => string>;
} = {
  hero: {
    fullbleed: m.siteVariantHeroFullbleed,
    split: m.siteVariantHeroSplit,
    inset: m.siteVariantHeroInset,
    type: m.siteVariantHeroType,
  },
  pageHeader: {
    plain: m.siteVariantPageHeaderPlain,
    image: m.siteVariantPageHeaderImage,
  },
  announcement: {
    strip: m.siteVariantAnnouncementStrip,
    card: m.siteVariantAnnouncementCard,
  },
  welcome: {
    portraitStart: m.siteVariantWelcomePortraitStart,
    portraitEnd: m.siteVariantWelcomePortraitEnd,
    letter: m.siteVariantWelcomeLetter,
  },
  text: {
    narrow: m.siteVariantTextNarrow,
    columns: m.siteVariantTextColumns,
  },
  imageText: {
    mediaStart: m.siteVariantImageTextMediaStart,
    mediaEnd: m.siteVariantImageTextMediaEnd,
    overlap: m.siteVariantImageTextOverlap,
  },
  cards: {
    grid: m.siteVariantCardsGrid,
    imageButtons: m.siteVariantCardsImageButtons,
    icons: m.siteVariantCardsIcons,
    scroller: m.siteVariantCardsScroller,
  },
  divisions: {
    tall: m.siteVariantDivisionsTall,
    rows: m.siteVariantDivisionsRows,
  },
  stats: {
    row: m.siteVariantStatsRow,
    overImage: m.siteVariantStatsOverImage,
    captions: m.siteVariantStatsCaptions,
  },
  pillars: {
    icons: m.siteVariantPillarsIcons,
    numbered: m.siteVariantPillarsNumbered,
    alternating: m.siteVariantPillarsAlternating,
  },
  quote: {
    large: m.siteVariantQuoteLarge,
    portrait: m.siteVariantQuotePortrait,
    badge: m.siteVariantQuoteBadge,
  },
  voices: {
    grid: m.siteVariantVoicesGrid,
    carousel: m.siteVariantVoicesCarousel,
    tabs: m.siteVariantVoicesTabs,
  },
  people: {
    grid: m.siteVariantPeopleGrid,
    carousel: m.siteVariantPeopleCarousel,
  },
  video: {
    inset: m.siteVariantVideoInset,
    fullbleed: m.siteVariantVideoFullbleed,
    beside: m.siteVariantVideoBeside,
  },
  gallery: {
    grid: m.siteVariantGalleryGrid,
    masonry: m.siteVariantGalleryMasonry,
    carousel: m.siteVariantGalleryCarousel,
  },
  timeline: {
    vertical: m.siteVariantTimelineVertical,
    horizontal: m.siteVariantTimelineHorizontal,
  },
  accordion: {
    accordion: m.siteVariantAccordionAccordion,
    tabs: m.siteVariantAccordionTabs,
    columns: m.siteVariantAccordionColumns,
  },
  logos: {
    row: m.siteVariantLogosRow,
    grid: m.siteVariantLogosGrid,
  },
  news: {
    grid: m.siteVariantNewsGrid,
    featured: m.siteVariantNewsFeatured,
    list: m.siteVariantNewsList,
  },
  events: {
    list: m.siteVariantEventsList,
    cards: m.siteVariantEventsCards,
  },
  admissions: {
    triad: m.siteVariantAdmissionsTriad,
    banner: m.siteVariantAdmissionsBanner,
    keyDate: m.siteVariantAdmissionsKeyDate,
  },
  steps: {
    horizontal: m.siteVariantStepsHorizontal,
    vertical: m.siteVariantStepsVertical,
  },
  fees: {
    table: m.siteVariantFeesTable,
    dates: m.siteVariantFeesDates,
  },
  contact: {
    details: m.siteVariantContactDetails,
    map: m.siteVariantContactMap,
  },
  quickLinks: {
    tiles: m.siteVariantQuickLinksTiles,
    audience: m.siteVariantQuickLinksAudience,
    list: m.siteVariantQuickLinksList,
  },
  embed: {
    inset: m.siteVariantEmbedInset,
  },
};

export const CATEGORY_LABEL: Record<SectionCategory, () => string> = {
  intro: m.siteGroupIntro,
  story: m.siteGroupStory,
  people: m.siteGroupPeople,
  dynamic: m.siteGroupDynamic,
  conversion: m.siteGroupConversion,
};

/** The label of each field, by its name in the section declaration. */
export const FIELD_LABEL: Record<string, () => string> = {
  eyebrow: m.siteFieldEyebrow,
  heading: m.siteFieldHeading,
  text: m.siteFieldText,
  media: m.siteFieldMedia,
  actions: m.siteFieldActions,
  height: m.siteFieldHeight,
  date: m.siteFieldDate,
  body: m.siteFieldBody,
  portrait: m.siteFieldPortrait,
  name: m.siteFieldName,
  role: m.siteFieldRole,
  columns: m.siteFieldColumns,
  items: m.siteFieldItems,
  title: m.siteFieldTitle,
  image: m.siteFieldImage,
  icon: m.siteFieldIcon,
  href: m.siteFieldHref,
  ages: m.siteFieldAges,
  value: m.siteFieldValue,
  label: m.siteFieldLabel,
  caption: m.siteFieldCaption,
  source: m.siteFieldSource,
  quote: m.siteFieldQuote,
  badge: m.siteFieldBadge,
  audience: m.siteFieldAudience,
  embed: m.siteFieldEmbed,
  year: m.siteFieldYear,
  count: m.siteFieldCount,
  category: m.siteFieldCategory,
  location: m.siteFieldLocation,
  note: m.siteFieldNote,
  mapHref: m.siteFieldMapHref,
};

export const HEIGHT_LABEL: Record<string, () => string> = {
  s: m.siteHeightS,
  m: m.siteHeightM,
  l: m.siteHeightL,
  screen: m.siteHeightScreen,
};

export const AUDIENCE_LABEL: Record<string, () => string> = {
  student: m.siteAudienceStudent,
  parent: m.siteAudienceParent,
  staff: m.siteAudienceStaff,
  alumni: m.siteAudienceAlumni,
};

export const SCHEME_LABEL: Record<SchemeId, () => string> = {
  canvas: m.siteSchemeCanvas,
  soft: m.siteSchemeSoft,
  brand: m.siteSchemeBrand,
  accent: m.siteSchemeAccent,
  ink: m.siteSchemeInk,
};

export const SPACING_LABEL: Record<SectionStyle["spacing"], () => string> = {
  s: m.siteSpacingS,
  m: m.siteSpacingM,
  l: m.siteSpacingL,
};

export const WIDTH_LABEL: Record<SectionStyle["width"], () => string> = {
  contained: m.siteWidthContained,
  wide: m.siteWidthWide,
  full: m.siteWidthFull,
};

export const ALIGN_LABEL: Record<SectionStyle["align"], () => string> = {
  start: m.siteAlignStart,
  center: m.siteAlignCenter,
};

export const DIVIDER_LABEL: Record<Divider, () => string> = {
  none: m.siteDividerNone,
  curve: m.siteDividerCurve,
  wave: m.siteDividerWave,
  angle: m.siteDividerAngle,
};

export const THEME_LABEL: Record<ThemeId, () => string> = {
  heritage: m.siteThemeHeritage,
  meridian: m.siteThemeMeridian,
  brightStart: m.siteThemeBrightStart,
  oasis: m.siteThemeOasis,
  editorial: m.siteThemeEditorial,
  evergreen: m.siteThemeEvergreen,
  civic: m.siteThemeCivic,
};

export const THEME_HINT: Record<ThemeId, () => string> = {
  heritage: m.siteThemeHintHeritage,
  meridian: m.siteThemeHintMeridian,
  brightStart: m.siteThemeHintBrightStart,
  oasis: m.siteThemeHintOasis,
  editorial: m.siteThemeHintEditorial,
  evergreen: m.siteThemeHintEvergreen,
  civic: m.siteThemeHintCivic,
};

export const HEADER_LABEL: Record<HeaderStyle, () => string> = {
  classic: m.siteHeaderClassic,
  centered: m.siteHeaderCentered,
  overlay: m.siteHeaderOverlay,
  minimal: m.siteHeaderMinimal,
};

export const FOOTER_LABEL: Record<FooterStyle, () => string> = {
  sitemap: m.siteFooterSitemap,
  compact: m.siteFooterCompact,
  contact: m.siteFooterContact,
};

export const BUTTON_LABEL: Record<ButtonShape, () => string> = {
  square: m.siteButtonSquare,
  rounded: m.siteButtonRounded,
  pill: m.siteButtonPill,
};

export const DENSITY_LABEL: Record<Density, () => string> = {
  compact: m.siteDensityCompact,
  regular: m.siteDensityRegular,
  airy: m.siteDensityAiry,
};

export const CASE_LABEL: Record<HeadingCase, () => string> = {
  none: m.siteCaseNone,
  upper: m.siteCaseUpper,
};

export const PALETTE_LABEL: Record<keyof Palette, () => string> = {
  canvas: m.sitePaletteCanvas,
  surface: m.sitePaletteSurface,
  primary: m.sitePalettePrimary,
  accent: m.sitePaletteAccent,
  ink: m.sitePaletteInk,
};

export const TEMPLATE_LABEL: Record<PageTemplate, () => string> = {
  blank: m.siteTemplateBlank,
  homeClassic: m.siteTemplateHomeClassic,
  homeStory: m.siteTemplateHomeStory,
  homeAdmissions: m.siteTemplateHomeAdmissions,
  homeCommunity: m.siteTemplateHomeCommunity,
  about: m.siteTemplateAbout,
  admissions: m.siteTemplateAdmissions,
  visit: m.siteTemplateVisit,
  academics: m.siteTemplateAcademics,
  parents: m.siteTemplateParents,
  contact: m.siteTemplateContact,
};

export const TEMPLATE_HINT: Record<PageTemplate, () => string> = {
  blank: m.siteTemplateHintBlank,
  homeClassic: m.siteTemplateHintHomeClassic,
  homeStory: m.siteTemplateHintHomeStory,
  homeAdmissions: m.siteTemplateHintHomeAdmissions,
  homeCommunity: m.siteTemplateHintHomeCommunity,
  about: m.siteTemplateHintAbout,
  admissions: m.siteTemplateHintAdmissions,
  visit: m.siteTemplateHintVisit,
  academics: m.siteTemplateHintAcademics,
  parents: m.siteTemplateHintParents,
  contact: m.siteTemplateHintContact,
};

export const STARTER_LABEL: Record<StarterId, () => string> = {
  heritage: m.siteStarterHeritage,
  international: m.siteStarterInternational,
  earlyYears: m.siteStarterEarlyYears,
  arabicFirst: m.siteStarterArabicFirst,
  launch: m.siteStarterLaunch,
};

export const STARTER_HINT: Record<StarterId, () => string> = {
  heritage: m.siteStarterHintHeritage,
  international: m.siteStarterHintInternational,
  earlyYears: m.siteStarterHintEarlyYears,
  arabicFirst: m.siteStarterHintArabicFirst,
  launch: m.siteStarterHintLaunch,
};

export const ICON_LABEL: Record<IconId, () => string> = {
  none: m.siteIconNone,
  book: m.siteIconBook,
  graduation: m.siteIconGraduation,
  users: m.siteIconUsers,
  globe: m.siteIconGlobe,
  trophy: m.siteIconTrophy,
  palette: m.siteIconPalette,
  music: m.siteIconMusic,
  flask: m.siteIconFlask,
  heart: m.siteIconHeart,
  leaf: m.siteIconLeaf,
  star: m.siteIconStar,
  calendar: m.siteIconCalendar,
  map: m.siteIconMap,
  phone: m.siteIconPhone,
  mail: m.siteIconMail,
  shield: m.siteIconShield,
  lightbulb: m.siteIconLightbulb,
  bus: m.siteIconBus,
  utensils: m.siteIconUtensils,
  award: m.siteIconAward,
  compass: m.siteIconCompass,
  sparkles: m.siteIconSparkles,
  clock: m.siteIconClock,
};

export const ISSUE_LABEL: Record<SiteIssueCode, () => string> = {
  alt: m.siteIssueAlt,
  heading: m.siteIssueHeading,
  link: m.siteIssueLink,
  action: m.siteIssueAction,
  captions: m.siteIssueCaptions,
  label: m.siteIssueLabel,
};
