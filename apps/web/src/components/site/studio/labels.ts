import type {
  BlockType,
  IconId,
  Pattern,
  SectionCategory,
  SectionStyle,
  SectionType,
  SectionVariant,
  SiteIssueCode,
} from "@faridalms/domain/site-sections";
import type { PageTemplate, StarterId } from "@faridalms/domain/site-templates";
import type {
  ButtonShape,
  CardStyle,
  Density,
  Divider,
  FooterStyle,
  HeaderStyle,
  Emphasis,
  EyebrowStyle,
  HeadingCase,
  HeadingScale,
  ImageShape,
  Motion,
  Palette,
  PhotoTone,
  SchemeId,
  ThemeId,
} from "@faridalms/domain/site-theme";

import * as m from "~/i18n/messages";

export const SECTION_LABEL: Record<SectionType, () => string> = {
  hero: m.siteTypeHero,
  slides: m.siteTypeSlides,
  pageHeader: m.siteTypePageHeader,
  announcement: m.siteTypeAnnouncement,
  welcome: m.siteTypeWelcome,
  text: m.siteTypeText,
  blocks: m.siteTypeBlocks,
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
  form: m.siteTypeForm,
  quickLinks: m.siteTypeQuickLinks,
  embed: m.siteTypeEmbed,
};

export const SECTION_HINT: Record<SectionType, () => string> = {
  hero: m.siteTypeHintHero,
  slides: m.siteTypeHintSlides,
  pageHeader: m.siteTypeHintPageHeader,
  announcement: m.siteTypeHintAnnouncement,
  welcome: m.siteTypeHintWelcome,
  text: m.siteTypeHintText,
  blocks: m.siteTypeHintBlocks,
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
  form: m.siteTypeHintForm,
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
    collage: m.siteVariantHeroCollage,
    statement: m.siteVariantHeroStatement,
  },
  slides: {
    fullbleed: m.siteVariantSlidesFullbleed,
    split: m.siteVariantSlidesSplit,
  },
  blocks: {
    columns: m.siteVariantBlocksColumns,
  },
  pageHeader: {
    plain: m.siteVariantPageHeaderPlain,
    image: m.siteVariantPageHeaderImage,
    banner: m.siteVariantPageHeaderBanner,
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
    marquee: m.siteVariantLogosMarquee,
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
  form: {
    split: m.siteVariantFormSplit,
    stacked: m.siteVariantFormStacked,
    card: m.siteVariantFormCard,
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
  size: m.siteFieldSize,
  shape: m.siteFieldShape,
  ratio: m.siteFieldRatio,
  style: m.siteFieldStyle,
  interval: m.siteFieldInterval,
  layout: m.siteFieldLayout,
  valign: m.siteFieldValign,
  more: m.siteFieldMore,
  purpose: m.siteFieldPurpose,
  email: m.siteFieldEmail,
  phone: m.siteFieldPhone,
  child: m.siteFieldChild,
  grade: m.siteFieldGrade,
  message: m.siteFieldMessage,
  questions: m.siteFieldQuestions,
  hint: m.siteFieldHint,
  answer: m.siteFieldAnswer,
  required: m.siteFieldRequired,
  options: m.siteFieldOptions,
  submit: m.siteFieldSubmit,
  thanks: m.siteFieldThanks,
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
  form_contact: m.siteIssueFormContact,
  form_question: m.siteIssueFormQuestion,
};

/** A line under a field's label, where its declaration alone would not say enough. */
export const FIELD_HINT: Record<string, () => string> = {
  options: m.siteFieldOptionsHint,
  questions: m.siteFieldQuestionsHint,
};

export const SCALE_LABEL: Record<HeadingScale, () => string> = {
  classic: m.siteScaleClassic,
  editorial: m.siteScaleEditorial,
  statement: m.siteScaleStatement,
};

export const CARD_LABEL: Record<CardStyle, () => string> = {
  flat: m.siteCardFlat,
  outlined: m.siteCardOutlined,
  raised: m.siteCardRaised,
};

export const SHAPE_LABEL: Record<ImageShape, () => string> = {
  square: m.siteShapeSquare,
  rounded: m.siteShapeRounded,
  arch: m.siteShapeArch,
  leaf: m.siteShapeLeaf,
};

export const EYEBROW_LABEL: Record<EyebrowStyle, () => string> = {
  plain: m.siteEyebrowPlain,
  rule: m.siteEyebrowRule,
  pill: m.siteEyebrowPill,
};

export const EMPHASIS_LABEL: Record<Emphasis, () => string> = {
  italic: m.siteEmphasisItalic,
  weight: m.siteEmphasisWeight,
  colour: m.siteEmphasisColour,
  highlight: m.siteEmphasisHighlight,
  underline: m.siteEmphasisUnderline,
};

export const PATTERN_LABEL: Record<Pattern, () => string> = {
  none: m.sitePatternNone,
  dots: m.sitePatternDots,
  grid: m.sitePatternGrid,
  lines: m.sitePatternLines,
  grain: m.sitePatternGrain,
};

export const TONE_LABEL: Record<PhotoTone, () => string> = {
  natural: m.siteToneNatural,
  warm: m.siteToneWarm,
  mono: m.siteToneMono,
  duotone: m.siteToneDuotone,
};

export const MOTION_LABEL: Record<Motion, () => string> = {
  none: m.siteMotionNone,
  subtle: m.siteMotionSubtle,
  lively: m.siteMotionLively,
};

export const BLOCK_LABEL: Record<BlockType, () => string> = {
  heading: m.siteBlockHeading,
  paragraph: m.siteBlockParagraph,
  image: m.siteBlockImage,
  buttons: m.siteBlockButtons,
  list: m.siteBlockList,
  stat: m.siteBlockStat,
  quote: m.siteBlockQuote,
  feature: m.siteBlockFeature,
  video: m.siteBlockVideo,
  spacer: m.siteBlockSpacer,
  divider: m.siteBlockDivider,
};

/** The words for each option of a choice field, by field name then option. */
export const CHOICE_LABEL: Record<string, Record<string, () => string>> = {
  source: {
    calendar: m.siteChoiceSourceCalendar,
    typed: m.siteChoiceSourceTyped,
  },
  height: {
    s: m.siteChoiceHeightS,
    m: m.siteChoiceHeightM,
    l: m.siteChoiceHeightL,
    screen: m.siteChoiceHeightScreen,
  },
  size: {
    s: m.siteChoiceSizeS,
    m: m.siteChoiceSizeM,
    l: m.siteChoiceSizeL,
    xl: m.siteChoiceSizeXl,
  },
  shape: {
    theme: m.siteChoiceShapeTheme,
    square: m.siteChoiceShapeSquare,
    rounded: m.siteChoiceShapeRounded,
    circle: m.siteChoiceShapeCircle,
  },
  ratio: {
    landscape: m.siteChoiceRatioLandscape,
    square: m.siteChoiceRatioSquare,
    portrait: m.siteChoiceRatioPortrait,
    wide: m.siteChoiceRatioWide,
  },
  style: {
    line: m.siteChoiceStyleLine,
    dots: m.siteChoiceStyleDots,
    ornament: m.siteChoiceStyleOrnament,
  },
  interval: {
    "7": m.siteChoiceInterval7,
    "10": m.siteChoiceInterval10,
    off: m.siteChoiceIntervalOff,
  },
  layout: {
    "1-1": m.siteChoiceLayout11,
    "2-1": m.siteChoiceLayout21,
    "1-2": m.siteChoiceLayout12,
    "1-1-1": m.siteChoiceLayout111,
    "1-1-1-1": m.siteChoiceLayout1111,
    "1": m.siteChoiceLayout1,
  },
  valign: {
    start: m.siteChoiceValignStart,
    center: m.siteChoiceValignCenter,
  },
  purpose: {
    enquiry: m.siteChoicePurposeEnquiry,
    visit: m.siteChoicePurposeVisit,
    general: m.siteChoicePurposeGeneral,
  },
  email: {
    require: m.siteChoiceEmailRequire,
    ask: m.siteChoiceEmailAsk,
    hide: m.siteChoiceEmailHide,
  },
  phone: {
    ask: m.siteChoicePhoneAsk,
    require: m.siteChoicePhoneRequire,
    hide: m.siteChoicePhoneHide,
  },
  child: {
    hide: m.siteChoiceChildHide,
    ask: m.siteChoiceChildAsk,
  },
  grade: {
    ask: m.siteChoiceGradeAsk,
    hide: m.siteChoiceGradeHide,
  },
  message: {
    ask: m.siteChoiceMessageAsk,
    hide: m.siteChoiceMessageHide,
  },
  answer: {
    short: m.siteChoiceAnswerShort,
    long: m.siteChoiceAnswerLong,
    choice: m.siteChoiceAnswerChoice,
    date: m.siteChoiceAnswerDate,
    number: m.siteChoiceAnswerNumber,
  },
  required: {
    optional: m.siteChoiceRequiredOptional,
    required: m.siteChoiceRequiredRequired,
  },
};
