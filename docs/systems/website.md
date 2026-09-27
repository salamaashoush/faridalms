# School website

The public website of a school: its pages, news and settings, edited by the
office in a live canvas and read by visitors without signing in. Built on the
foundation's documents, file publications and the `site` role. Evidence:
[../research/website-builder.md](../research/website-builder.md).

## Model

- **Settings** (`core.site_settings`, one row per school): live flag, first
  language, bilingual flag, tagline, banner, social links, plus two JSON
  documents validated in `packages/domain/src/site-theme.ts`:
  - `theme`: the chosen theme id and the school's overrides (palette roles,
    font per role and script, radius, button shape, density, header and footer
    variant, heading case, divider).
  - `chrome`: the logo, utility links, up to three header actions (Enquire,
    Visit, Apply), footer columns and note, and the mobile action dock.
    Labels in `chrome` are `{ en, ar }` pairs; they are short and belong to the
    settings rather than to a document.
- **Pages** (`core.site_pages`): the page tree is the menu. A page's sections
  are the `page` document hosted as `site_page`; the second language is its
  translation document.
- **Posts** (`core.site_posts`): news, with the body as a `rich_text`
  document and its translation.
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
strip), news, events, admissions actions, steps, fees and dates, contact,
enquiry form, quick links and embed.

- **Slider:** slides with their own picture, words and buttons. They turn
  every 7 or 10 seconds, with previous, next, dot and pause controls, and
  stay still for visitors who ask for less motion.
- **Blocks:** the open canvas. A layout of one to four columns (1, 1:1, 2:1,
  1:2, 1:1:1, 1:1:1:1), each a stack of blocks: heading, text, picture,
  buttons, list, figure, quote, feature, video, space and divider. Blocks
  take preset sizes, shapes and proportions, never free pixels; the
  translation overlay and the checks reach into them.
- **Enquiry form:** name and email, with phone optional, required or hidden
  and the child's year asked or hidden, for an admissions enquiry, a visit
  request or a general message. Messages land in the website screen's
  Enquiries tab.
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
drags into place, and crops and zooms keep it in view.

## Templates

Page templates (Home in four arrangements, About, Head's welcome, Admissions,
Visit, Academics, Division, Parents, News, Contact and more) and whole-site
starters (Independent heritage, International, Early years, Arabic-first
national, One-page launch) are domain data: sections with placeholder words
in both languages and no stock photographs.

## Enquiries

The site role may add an enquiry and read back only the organisation,
network key, status and time, which it needs to count a flood. A form sent
with its hidden field filled, or within 2.5 seconds of opening, is answered
as received and dropped. Five an hour from one network and sixty an hour for
a school are the limits. The network key is an HMAC of the /24 or /48
prefix under a per-tenant key, so no address is stored. Staff see open and
handled enquiries, reply by email and mark each one dealt with.

## Publishing checks

Blocking: a picture without a description, a first-level heading in a body,
a vague link label, a button without its target, a video without captions,
a button label over 25 characters. Warning: missing translation, links to
unpublished pages.

## Next

Builder work still to do, most useful first:

1. **Media library.** Pictures uploaded once are chosen again from a library
   in any section or page, with their description kept and a focal point per
   use.
2. **Saved sections.** A school saves a finished section and inserts it on
   other pages, as a copy or kept in step everywhere it appears.
3. **Visibility by screen.** A section can be hidden on phones or on larger
   screens, shown in the builder with a marker.
4. **Events from the calendar.** The events section lists the school's public
   calendar events instead of items typed by hand.
5. **Form fields.** A form chooses its own fields (choice, date, number,
   consent) beyond the fixed enquiry set, and its enquiries keep them.
6. **Copy and paste sections** between pages and languages, and drag to
   reorder on the canvas as well as in the outline.
7. **Heritage ornament.** Crest and girih patterns as section textures, a motto
   footer, a film that grows to full width as it scrolls in, and a statement
   whose words fill in as it scrolls.
8. **Focal point on video posters.**

Later: admissions pipeline beyond the enquiry inbox, social feed, approval
workflow, page permissions, host-based routing, Hijri dates.
