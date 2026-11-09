# School website

The public website of a school: its pages, news and settings, edited by the
office in a live canvas and read by visitors without signing in. Built on the
foundation's documents, file publications and the `site` role. Evidence:
[../research/website-builder.md](../research/website-builder.md).

## Model

- **Settings** (`core.site_settings`, one row per school): live flag,
  bilingual flag, tagline, banner, social links, plus two JSON
  documents validated in `packages/domain/src/site-theme.ts`:
  - `theme`: the chosen theme id and the school's overrides (palette roles,
    font per role and script, radius, button shape, density, header and footer
    variant, heading case, divider).
  - `chrome`: utility links, up to three header actions (Enquire, Visit,
    Apply), footer columns and note, and the mobile action dock.
    The website's first language and its logo are the school's own
    (`orgs.default_locale`, `orgs.logo_file_id`), edited in school settings;
    the logo's public copy is published for the `org` host when it is saved.
    Labels in `chrome` are `{ en, ar }` pairs; they are short and belong to the
    settings rather than to a document.
- **Pages** (`core.site_pages`): the page tree is the menu. A page's sections
  are the `page` document hosted as `site_page`; the second language is its
  translation document. Beside its sections each language of the document
  holds the page's settings for the world outside the site: its search
  description, its social picture and its canonical address. Whether search
  engines may list the page at all (`indexed`) is one switch for both
  languages, on the row.
- **Redirects** (`core.site_redirects`): an old address of the school's
  site, sent on to one of its pages (by id, so a renamed page keeps its
  redirects) or to a path or web address. The site role reads where an
  address leads, never who added it.
- **Posts** (`core.broadcasts` of kind `news`): the school's news,
  written in the News screen rather than the website builder, one of the two
  kinds of broadcast beside announcements. A post's body is a `rich_text`
  document hosted as `news` in its own first language, with the other
  language as its translation. Only posts whose `visibility` is `public` get published
  copies; `school` posts reach their audience inside the app and never the
  website.
- **Published copies** (`core.site_published_pages`, `site_published_posts`):
  one row per language, written at publish time; the only content the `site`
  role reads.

## Themes

A theme is data: `palette` (canvas, surface, primary, accent, ink, muted),
fonts (heading and body, Latin and Arabic), `radius` (0, 4, 8, 16, 24),
`button` (square, rounded, pill), `density` (compact, regular, airy), `header`
(classic, centred, overlay, minimal), `footer` (sitemap, compact, contact),
`headingCase` (none, upper; Latin only) and `divider` (none, curve, wave,
angle).

Six tokens give a theme its voice, with values measured from school sites
that read as designed ([research](../research/website-visual-design.md)):

- `headingScale`: classic, editorial or statement type, from 36 to 128px
  display sizes, with Arabic keeping a taller line and no negative tracking.
- `emphasis`: how words a school wraps in `*asterisks*` inside a heading are
  set: italic serif, weight contrast, accent colour, highlight or underline.
  Arabic has no italic, so italic becomes colour.
- `card`: flat, outlined or raised.
- `image`: the shape of feature pictures: square, rounded, arch or leaf,
  written with logical properties so it mirrors in Arabic.
- `eyebrow`: plain, with a rule, or a tag.
- `motion`: none, subtle (16px rise) or lively (24px). Sections rise into view
  on `cubic-bezier(.25,1,.5,1)`, lists stagger by 80ms, figures count up.
  Content already on screen is never hidden, and under reduced motion
  sections only fade.

Five **colour schemes** are generated from the palette: canvas, soft, brand,
accent and ink. Each fixes background, heading, body, muted, link, border,
card and button colours, and every text pair is checked for WCAG AA (4.5:1
body, 3:1 large text and controls); a failing pair falls back to black or
white. A section picks a scheme; it never picks a colour.

Colour is computed in OKLCH (`packages/domain/src/site-theme.ts`), never by
mixing with white in sRGB, which washes a palette to grey:

- **Dark screens** keep each school colour's hue and chroma and raise only
  its lightness until it reads at 5.5:1; a black or grey brand becomes
  near-white, never a mid grey. Pages are near-black tinted with the brand's
  hue, cards are raised lighter than the section they sit on, and a brand or
  ink band that would melt into the dark page is lifted until it stands apart.
- **Artwork** uses one ramp (`artPalette`): deep, base, bright and light
  tones of the main hue and the accent. The deep tone holds white words at
  7:1, so words over artwork sit on a scrim of the art's own deep tone, not
  black. A neutral brand gets charcoal tones, and its accent is drawn only as
  crisp shapes, since a bright colour blurred into near-black turns olive.

## Layout and rhythm

`apps/web/src/styles/site.css` is the site's design system; sections use its
primitives and do not set their own widths, gaps or type sizes.

- **One edge.** The banner, header, every section and the footer share one
  container (80rem with a fluid gutter), so their content starts on the same
  line. `wide` and `full` widths widen that container; nothing else sets one.
- **Reading measure.** Narrow content (a text section, a letter, the FAQ, a
  stacked form) is 44rem and aligns as its section does: at the container's
  start edge, or centred only when the section is centred.
- **Primitives.** `site-stack` (eyebrow, heading, lead, actions),
  `site-intro` above a section's content, `site-grid` with a column count,
  `site-split` for media beside words, `site-rail` for carousels, and
  `site-card` with `site-card-body`. A row of items takes as many columns as
  fill whole rows, so two news posts never leave a third column empty.
- **Type ramp.** `site-display-xl`, `site-display`, `site-h2`, `site-h3`,
  `site-h4`, `site-lead`, `site-text`, `site-small` and `site-meta`.
- **Actions.** One button shape in three sizes (40, 48 and 56px): filled for
  the main action, outlined beside it, ghost in the header, and words with an
  arrow (`TextLink`) for "All news" and "Learn more".
- **Shape follows the theme.** Cards, tiles, inputs and dropdowns take the
  theme radius; a square theme stays square everywhere.

## Frame

- **Header.** The bar holds the name, the menu and one filled action. The
  school's utility links and its quieter actions sit in a small row above,
  and any of them that leads to a page the menu already lists is left out,
  so no page is offered twice side by side.
- **Menu panel.** Pages large, each with the pages under it, and beside them
  only what the bar cannot show at that width. On phones the dock holds the
  actions, so the panel does not repeat them.
- **Footer.** The school's name, contact details and social icons, then its
  link columns; the bottom bar holds the copyright, the language, the portal
  sign-in and the light or dark choice.

Seven themes ship: Heritage, Meridian, Bright Start, Oasis, Editorial,
Evergreen and Civic (palettes and fonts in the research, section 4.2). Fonts
are OFL, self-hosted through Fontsource, and every theme names a Latin and an
Arabic face.

## Sections

A section is `{ id, type, variant, style, data }`.

- `style`: scheme, background (none, image or video with overlay), spacing
  (s, m, l), width (contained, wide, full), alignment (start, centre),
  dividers, an anchor, and the languages it is hidden in.
- `variant`: the layout, named with start and end so it mirrors in Arabic.
- `data`: the section's fields, declared once per type in
  `packages/domain/src/site-sections.ts`. The declaration drives validation,
  the editor's inspector, the translation overlay (words from the
  translation, structure from the original), plain text for search and the
  publish checks.

Types: hero, slider, page header, announcement, welcome, text, blocks,
image and text, cards, divisions, stats, pillars, quote, voices, video,
gallery, timeline, people, collapsible content, logos (including a moving
strip), news, events, admissions, register and apply, steps, fees and
dates, contact, enquiry form, quick links and embed.

- **Slider:** slides with their own picture, words and buttons. They turn
  every 7 or 10 seconds, with previous, next, dot and pause controls, and
  stay still for visitors who ask for less motion.
- **Blocks:** the open canvas. A layout of one to four columns (1, 1:1, 2:1,
  1:2, 1:1:1, 1:1:1:1), each a stack of blocks: heading, text, picture,
  buttons, list, figure, quote, feature, video, space and divider. Blocks
  take preset sizes, shapes and proportions, never free pixels; the
  translation overlay and the checks reach into them.
- **Enquiry form:** for an admissions enquiry, a visit request or a
  general message. Its fixed core is a name and a way to reply: email and
  phone are each required, optional or hidden, never both hidden. The
  child's name, year and a message are asked or hidden. The school adds up
  to ten questions of its own as question blocks in the editor, each
  optional or required: a typed answer or a day, words, a choice or a
  number ([questions.md](questions.md)). Each answer is kept with the
  enquiry in the words the family saw, so editing the form later changes
  no enquiry. Enquiries land in the admissions inbox.
- **Admissions:** the intakes still to close, read from the admissions
  system: each grade and year, when families apply, when decisions come
  and the fees, with the way in to applying for an open one. The site
  role reads only those columns of an intake, never its places or how it
  ranks. A school that takes no applications here types its own panels.
- **Register and apply:** the way in to applying, a link to the portal's
  apply door, preset to the intake the builder picks or open to all; a
  closed intake says so instead.
- **The portal's pages are not website pages.** Sign-in, registration and
  applying (`/sign-in`, `/register` and `/apply` on the portal host) are the
  app's own pages in its own design system, branded with the school's logo,
  name and main colour, with its office's email and phone for help. The
  builder does not make or style them; the website links to them.
- **No photographs yet:** where a picture belongs but none is chosen, the
  section draws artwork from the palette, seeded by the section so it never
  changes between visits. Heroes get a mesh gradient with grain; other slots
  get geometric compositions.
- **Rhythm:** adjacent sections on the same colour share one gap.
- **New fields:** a field added to a section later takes its initial value in
  content saved before it, and published copies are read through the schema.

## Editor

A full-screen builder: the page's sections on the start side with drag
reorder and an add-section gallery rendered in the site's theme, the live
canvas in the middle at desktop, tablet or phone width in either language,
and an inspector on the end side with content, layout and style for the
chosen section or the page. Undo and redo, save, publish now or later,
publish checks, version history with restore. The site styles panel shows
the themes as live cards and the overrides with a contrast readout.

Headings, labels and leads of the selected section are typed straight on the
canvas, asterisks and all. Every picture carries a focal point the school
drags into place, and crops and zooms keep it in view. A picture or video
field uploads or chooses from the school's media
([media.md](media.md)); a chosen picture starts from the
item's description and credit, which the section may say otherwise, and
its focal point is the section's own.

## Templates

Page templates (Home in four arrangements, About, Head's welcome, Admissions,
Visit, Academics, Division, Parents, News, Contact and more) and whole-site
starters (Independent heritage, International, Early years, Arabic-first
national, One-page launch) are domain data: sections with placeholder words
in both languages and no stock photographs.

- Sample words read like a real school's, a sentence or two per item, so a
  starter looks composed before the school edits it.
- Each page sets its own colour rhythm (canvas, soft and brand alternating),
  so two bands of one colour meet only where the page means them to.
- A starter's header actions lead to the forms themselves (`#enquire`,
  `#book-a-visit`, `#apply`), not to pages the menu already lists, and its
  footer groups pages under "Explore" and "Join us". The domain tests refuse
  a starter link whose page or anchor does not exist.

## Saved sections

A finished section is kept to use again through the school's two reuse
systems, in both languages (`packages/domain/src/saved-sections.ts`), from
the save button on a section's settings:

- **As a section template**: a template of kind `section`
  (`templates.saveSection`), held by whoever manages the website, reviewed
  as any template is and listed in Templates. The gallery's Saved
  group offers it, and choosing it puts a copy on the page with new ids,
  changed freely there. A template kept while the site's first language was
  the other one turns round to match.
- **As a shared section**: a shared block of kind `section`
  (`shared.saveSection`), kept once with its pictures and files and shown
  wherever a page names it. A page names it by a section carrying
  `shared`, beside a copy of how it stood; reading the page draws the
  shared section as it stands now, and saving the page keeps the shared
  one's words, so only the shared section itself changes them. In the
  builder its settings say so, list the pages showing it, and offer to save
  a change to every page, to put it back, or to keep a copy on this page
  only. As with shared blocks, only whoever kept it changes or takes it
  out, and one kept for the school may be shown by anyone who manages the
  website, who sees its settings without changing them.
- **Published pages follow it.** A saved change, or taking it out, draws
  every published page showing it again from the words that page was last
  published with (so none of the page's own waiting changes go out),
  checked as publishing checks them, and refused if a published page could
  not carry it. The copy's `revised_at` moves the sitemap's `lastmod`. A
  page publishing later draws it as it stands, and one taken out leaves
  nothing; the builder shows such a section as gone, to remove.
- Taking one out names the pages that show it first, published ones
  marked, as taking out a shared block names its documents.

## Enquiries

The site role may add an enquiry, only as an unworked website one, and read
back only the organisation, network key, status and time, which it needs to
count a flood. A form sent with its hidden field filled, or within 2.5
seconds of opening, is answered as received and dropped. Five an hour from
one network and sixty an hour for a school are the limits. The network key
is an HMAC of the /24 or /48 prefix under a per-tenant key, so no address is
stored.

Where `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set, the form
also renders Cloudflare Turnstile, and the API checks its token with
siteverify before anything is written: solved, for the `enquiry` action, on
a host of that school, and not used before. Without the keys the checks
above are the protection.

Once written, the enquiry is the admissions system's: an inbox for whoever
holds `admissions:read` or `admissions:manage`, with its states, assignee,
thread and replies ([plan, section 6.1](../plans/school-front-door.md)).

## Search engines and sharing

A page's settings panel in the builder holds what it says of itself outside
the site, per language: the search description, a social picture (with
the words for those who cannot see it, and who it shows, like any website
picture) and a canonical address for a page that repeats one published
elsewhere. The other language shows the first's picture until it has its
own. A switch keeps the page out of search engines.

- **Head.** Every website page names the school, its line and its logo
  (`og:site_name`, `og:title`, `og:description`, `og:image`), and the school's
  own X account (`twitter:site`) when its social links include one. The
  platform's name, picture and accounts never appear there; the portal names
  no X account. A published page adds its own title, description, social
  picture (`summary_large_image`), `og:url`, `rel=canonical`, `robots:
  noindex` when kept out of search, and `hreflang` alternates for each
  language it is published in its own words plus `x-default`; a page in one
  language names none. Addresses are absolute, on the school's website host
  (its own canonical one once active), whichever host the page was read on.
  The first language answers at the bare path, the other at `?lang=`.
  News posts name their summary and cover picture the same way.
- **`/sitemap.xml`** on the website host lists every published page not kept
  out of search and every published post, once per language it is written
  in, each with its alternates and `lastmod` from when that copy was
  published. **`/robots.txt`** allows everything and names the sitemap: a
  page kept out of search says so in its own head, which a crawler must be
  allowed to read. Both answer 404 for a site that is not live.
- **Redirects.** The Redirects tab of the Website screen maps an old path to
  a page or another address. A visitor is sent on with a 301 only from an
  address that finds nothing else: an unknown path, or a page or post
  address that is no longer published. Paths match without their query,
  case or trailing slash. A redirect to a page that is not published leads
  nowhere, and a visitor reading the other language keeps it.

## Publishing checks

Blocking: a picture without a description, a first-level heading in a body,
a vague link label, a button without its target, a video without captions,
a button label over 25 characters. Warning: missing translation, links to
unpublished pages, a language without a search description.

## Next

Builder work still to do, most useful first:

1. **Visibility by screen.** A section can be hidden on phones or on larger
   screens, shown in the builder with a marker.
2. **Events from the calendar.** The events section lists the school's public
   calendar events instead of items typed by hand.
3. **Consent on forms.** A form asks for a consent (marketing, the privacy
   notice) through the consents system, with its wording version.
4. **Copy and paste sections** between pages and languages, and drag to
   reorder on the canvas as well as in the outline.
5. **Heritage ornament.** Crest and girih patterns as section textures, a motto
   footer, a film that grows to full width as it scrolls in, and a statement
   whose words fill in as it scrolls.
6. **Focal point on video posters.**
7. **History of a shared section.** Its versions are kept on every save, as
   a shared block's are, but the builder offers no history to restore one.

Later: social feed, approval
workflow, page permissions, host-based routing, Hijri dates.
