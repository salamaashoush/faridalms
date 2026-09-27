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

Types: hero, page header, announcement, welcome, text, image and text, cards,
divisions, stats, pillars, quote, voices, video, gallery, timeline, people,
collapsible content, logos, news, events, admissions actions, steps, fees and
dates, contact, quick links and embed. The enquiry form, social feed and
module-driven events wait for their own systems.

## Editor

A full-screen builder: the page's sections on the start side with drag
reorder and an add-section gallery rendered in the site's theme, the live
canvas in the middle at desktop, tablet or phone width in either language,
and an inspector on the end side with content, layout and style for the
chosen section or the page. Undo and redo, save, publish now or later,
publish checks, version history with restore. The site styles panel shows
the themes as live cards and the overrides with a contrast readout.

## Templates

Page templates (Home in four arrangements, About, Head's welcome, Admissions,
Visit, Academics, Division, Parents, News, Contact and more) and whole-site
starters (Independent heritage, International, Early years, Arabic-first
national, One-page launch) are domain data: sections with placeholder words
in both languages and no stock photographs.

## Publishing checks

Blocking: a picture without a description, a first-level heading in a body,
a vague link label, a button without its target, a video without captions,
a button label over 25 characters. Warning: missing translation, links to
unpublished pages.

## Deferred

Enquiry form and admissions leads, social feed, events from the calendar,
approval workflow, saved sections, page permissions, host-based routing, Hijri
dates.
