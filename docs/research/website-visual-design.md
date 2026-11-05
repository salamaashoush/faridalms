# Visual design for school websites

Researched 2026-09-27, as a follow-up to [website-builder.md](website-builder.md). Twelve school sites and about twenty marketing sites known for craft were loaded in a headless browser at 1440 and 390 px. Values come from `getComputedStyle`, a scan of each site's stylesheets (clamp, cubic-bezier, durations, shadows, reduced-motion blocks) and a probe of which elements animate on scroll. For the builders, the Gutenberg source (block.json files, theme.json, the typography PHP) and the vendors' help centres were read.

## 1. School sites that look designed

1. **Korowa Anglican Girls' School** ([site](https://www.korowa.vic.edu.au/), Webflow, Awwwards Honourable Mention).
   - Full-bleed parallax hero under a dark gradient and a radial vignette.
   - Two-voice headline: DM Sans 61.5px/550, an italic serif word (Pangaia 300, about 88px, crimson), and a phrase on a solid crimson highlight. An italic accent word appears in every heading, and stats sit in the display serif at 160px.
   - Eyebrows 13.8px/600, +0.04em, uppercase, with a flower motif drawn by `mask-image`.
   - A three-image rail joined into one top-rounded shape (`85.4px 85.4px 0 0`). Sticky images stack as you scroll. Warm card shadow `0 20px 24px -4px rgba(200,195,187,.08)`.
   - The header hides on scroll down and returns on scroll up (`.35s cubic-bezier(.165,.84,.44,1)`), keeping Tour, Enquire and Menu. GSAP with SplitText; images scale 1.03 to 1.1 on hover; reduced motion is respected.
2. **Bedales** ([site](https://www.bedales.org.uk/)).
   - One face, tracked negative up to -0.06em on an 80px H1.
   - Photos in organic blob masks, folk-pattern bands and a woodcut crest.
   - A transparent 111px header that condenses to 68px. A floating pill nav docked at the bottom of the screen. A motto footer.
3. **Bryanston** ([site](https://www.bryanston.co.uk/), Awwwards Honourable Mention).
   - Big Caslon 82px/400 with an italic accent, and uppercase serif section titles at 140px.
   - Hairline threads run from section to section. Circle-arrow button discs. Square photo corners.
   - One motion signature used everywhere: `cubic-bezier(.25,1,.5,1)` at 800ms (752 occurrences), mask line reveals, smooth scroll.
4. **Brighton College Dubai** ([site](https://www.brightoncollegedubai.ae/)).
   - Rhymes at 134px, variable weight 280, with an italic phrase. Eyebrows at weight 300, uppercase, +0.14 to 0.21em.
   - A crest motif above every section heading and a uniform 112px section padding. Backgrounds alternate cream, slate and navy.
   - Letter-split heading reveals and 300ms card staggers, with no reduced-motion rule.
5. **Choate Rosemary Hall** ([site](https://www.choate.edu/)).
   - A typographic lockup hero (one word rotated -90deg) with a tilted photo card behind.
   - Grain, colour blocks, "1/6" counters and clip-path wipes.
   - Named easings; the most common curve is `(.22,1,.36,1)`.
6. **Sevenoaks School** ([site](https://www.sevenoaksschool.org/)).
   - An inset video that grows to full-bleed on scroll.
   - 300/900 weight contrast in one line, display type at 102 to 145px and -0.04em, and a values marquee at 200px/900.
   - A seal watermark and a rotating "watch the film" badge.
7. **Avenues The World School** ([site](https://www.avenues.org/)).
   - A paragraph that fills in word by word from grey to black as you scroll.
   - Arc dividers, circle photo crops, 48px pill buttons and no shadows anywhere.
8. **International School Bangkok** ([site](https://www.isb.ac.th/)).
   - A video hero with a gold wave edge, layered SVG skylines and ambient 8 to 12s loops.
9. **Winchester College** ([site](https://www.winchestercollege.org/)).
   - A 10s slow zoom on the hero, weight-100 subtitles and circle-arrow buttons.
   - A motto footer at 110px.
10. **Westminster School** ([site](https://www.westminster.org.uk/)).
    - Every section break is a hairline with a small heraldic icon at its centre.
    - An eased scrim, `rgba(0,0,0,.5) 0%, .35 20%, .15 45%, 0 70%`.
11. **The Lawrenceville School** ([site](https://www.lawrenceville.org/)).
    - Translucent display type at 160px and a solid red block offset behind each photo.
    - The header turns solid on scroll with `backdrop-filter: blur(10px)`.
12. **Swiss International Scientific School Dubai** ([site](https://sisd.ae/)).
    - A video inset on a red field with a halftone dot band. Circle portraits on dot patterns.

**What the twelve share:**

- **Two-voice headlines** (an italic serif word, 300/900 contrast, accent colour or a highlight) appear on 8 of 12. This is the strongest single signal.
- **Type:** display type of 100px or more somewhere on the page on 8 of 12. Tracking is negative at large sizes, and display line-height is 0.9 to 1.02.
- **Hairlines as structure** on 7, and **heritage ornament** (crest, seal, motto) on 6.
- **Shape:** each site uses one shape and repeats it. Square photo corners on 9 of 13 measured. Card shadows are nearly absent; depth comes from colour blocks, offsets and overlaps.
- **Rhythm:** section padding of 80 to 140px, containers of 1280 to 1440px. Warm off-white backgrounds alternate with one or two saturated bands.
- **Motion:**
  - Micro-interactions run 200 to 300ms, reveals 400 to 800ms and ambient loops 8 to 12s.
  - Expressive out-curves `(.22,1,.36,1)`, `(.25,1,.5,1)` and `(.33,1,.68,1)` drive the reveals.
  - Four of 13 sites have no reduced-motion handling.

## 2. Marketing sites: reusable specifications

- **Stripe** ([stripe.com](https://stripe.com)).
  - Display 56px at -0.025em, body 18/25.2, paragraphs capped at 62 characters.
  - Section padding `clamp(72px, 10lvh, 144px)`. Two-layer tinted shadows.
  - Reveals are opacity only at 0.5s on `(.25,1,.5,1)`. Under reduced motion the slide is removed and the fade kept.
- **Linear** ([linear.app](https://linear.app)).
  - H1 64/64 at -0.022em, 128px sections, 1px rings instead of shadows.
  - Hover at 160ms. Reveals are a mask wipe over 0.8s and never replay.
- **Apple Education** ([apple.com/education](https://www.apple.com/education/)).
  - Headings from 80/84 at -0.015em. Sections of 144px on desktop and 112px on mobile.
  - Staggered reveals of 30px rise, 0.9s opacity and 0.15s steps.
- **Vercel** ([vercel.com](https://vercel.com)): fluid type and fluid tracking in the Utopia style. The marquee runs only when motion is allowed.
- **Squarespace education templates:** display type at line-height 0.98 and -0.03em. Global reveals of an 18px slide on `(.19,1,.22,1)`. Under reduced motion the reveals become pure fades, the best behaviour measured.
- **Framer and Webflow templates:** 100 to 250px travel and elastic easing, which is what reads as cheap. Most have no reduced-motion handling.
- **Published systems:**
  - Material 3 motion tokens: emphasized `(.2,0,0,1)`, durations 50 to 600ms.
  - IBM Carbon: productive and expressive curves.
  - [Utopia's clamp method](https://utopia.fyi/blog/clamp/).
  - [Butterick's line length](https://practicaltypography.com/line-length.html) of 45 to 90 characters.
  - [MDN on reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion): reduce means reduce, not remove.

## 3. Builder block and style systems

- **WordPress Gutenberg.**
  - Group, Row, Stack, Grid and Columns containers, and a Cover block that flips text colour from the image.
  - Block supports for colour, typography, spacing, border, shadow and dimensions.
  - [theme.json](https://github.com/WordPress/gutenberg/blob/trunk/lib/theme.json) presets for shadows, aspect ratios and duotones.
  - [Section styles](https://make.wordpress.org/core/2024/06/24/section-styles/) as block style variations.
  - Page-creation patterns in the new-page modal, and content-only locking.
  - No core animation; plugins add it.
- **Webflow:** variables with modes, components with props, and interactions powered by GSAP, including reduced-motion options.
- **Framer:** appear, scroll and ticker effects, with a site-level [reduced-motion setting](https://www.framer.com/help/articles/reduced-motion-settings/).
- **Squarespace 7.1:**
  - 5 palette colours generate 10 section themes, the model this builder already follows.
  - Font and button packs.
  - One site-wide animation setting with speeds.
  - Image effects such as film grain.
- **Wix Studio:** motion presets ranked by risk, with calmer presets swapped in under reduced motion.

**Guard rails that give non-designers good results:**

- Values come from presets, never free pixels.
- Colour schemes are derived from the palette.
- Fluid type has a floor.
- There is a spacing scale.
- Patterns are the starting point, not a blank canvas.
- One global motion switch has reduced-motion fallbacks.

None of these builders enforces contrast; this builder does.

## 4. What this builder takes from it

1. **Type voices** (`headingScale`):
   - classic: display `clamp(2.25rem, 1.667rem + 2.593cqi, 4rem)`.
   - editorial: `clamp(2.75rem, 1.833rem + 4.074cqi, 5.5rem)`, line-height 1.0.
   - statement: `clamp(3.25rem, 1.667rem + 7.037cqi, 8rem)`, weight 800, -0.04em, line-height 0.92.
   - Measures of 18ch for the display and 24ch for H2, with balanced headings and pretty paragraphs.
2. **Emphasis:** a school wraps words in asterisks, and the theme renders them as italic serif, weight contrast, accent colour, highlight or underline. Arabic has no italic or capitals, so italic becomes colour and the underline clears the descenders.
3. **Section rhythm:** density maps to fluid section padding.
   - compact `clamp(3rem, 2.333rem + 2.963cqi, 5rem)`
   - regular `clamp(4rem, 2.833rem + 5.185cqi, 7.5rem)`
   - airy `clamp(5.5rem, 4rem + 6.667cqi, 10rem)`
   - Adjacent sections on the same colour share one gap.
4. **Shapes and cards:**
   - Feature pictures take one theme shape: square, rounded, arch or leaf, written with logical properties so they mirror in Arabic.
   - Cards are flat, outlined or raised. Split heroes carry an offset colour block.
5. **Motion:**
   - Reveals rise 16px (subtle) or 24px (lively) on `cubic-bezier(.25,1,.5,1)`, with 800ms opacity and 600ms translate, and 80ms staggers capped at 6 items.
   - Content already on screen is never hidden. Figures count up.
   - Under reduced motion there is no travel, zoom or loop, and sections simply fade in.
   - Moving logos and slides have a visible pause control (WCAG 2.2.2).
6. **No photographs yet:**
   - Artwork is drawn from the palette, seeded by the section so it never changes between visits: mesh gradients with grain behind hero words, and Bauhaus-style compositions elsewhere.
   - People without photos show an initial in the heading face.
7. **Arabic:** letter-spacing 0, no uppercase, taller line heights (display 1.25, headings 1.35 to 1.4, body 1.8), and no per-letter animation.

**Left for later:**

- Photo tone (duotone, mono, warm).
- Crest ornaments and girih patterns.
- A smart hide/show header and a motto footer.
- Grow-on-scroll video.
- Scroll-filled statements.

## 5. Component craft

Measured 2026-11-05 from live computed styles at 1440 and 390px: Tailwind's
public templates Salient and Radiant, the Squarespace 7.1 Julian school demo,
Bryanston, Korowa, Avenues and the Framer template Harbor. It followed a
review of the builder's own output, whose faults were structural: headers and
sections on two different content edges, three header actions of equal
weight repeated in the menu panel and the dock, and colours mixed with white
in sRGB, which turned a black brand's buttons mid-grey on dark screens and
blurred artwork into grey and olive.

- **One edge.** Salient wraps header, sections and footer in one
  `max-w-7xl` (1280px) container; Korowa starts logo, headings and footer
  columns at the same x. The two least finished sites measured (Avenues,
  Harbor) each use three different edges.
- **Header.** 64 to 80px on desktop, 56 to 64px on phones. Nav at 15 to 16px,
  weight 500. Exactly one filled action (36 to 48px tall); everything else is
  a text link. A full-screen menu keeps the bar and its action visible above
  it and does not repeat that action inside.
- **Rhythm.** Eyebrow to heading 8px, heading to lead 16 to 24px, lead to
  content 40 to 64px. Section padding 80 to 128px (Salient `py-20 sm:py-32`),
  card padding 24 to 32px, card-grid gaps 32px.
- **Buttons.** 40px (`px-4`, 14 to 15px, weight 600) is the common size; 48px
  for heroes. Secondary is a 1px ring at the same height; tertiary is words
  and an arrow, used for "All news" and inside cards.
- **Cards.** News 3:2, people 4:5 or 1:1. Meta at 13 to 14px, muted,
  tabular, above the title. Testimonial quotes 20 to 24px.
- **Footer.** Brand block over two of six columns, then three or four link
  columns. Social links are icons in 40 to 48px targets on every site
  measured. A bottom bar at 12 to 14px holds the copyright, legal links and
  language.
- **Colour.** Tailwind v4 and Radix build ramps in OKLCH with chroma peaking
  mid-ramp; Material 3's monochrome scheme makes a black brand's dark-mode
  primary white with the brand colour as its text. Tints made by mixing with
  white or by alpha are what wash a palette to grey
  ([Ottosson](https://bottosson.github.io/posts/oklab/),
  [CSS Color 4 gamut mapping](https://www.w3.org/TR/css-color-4/#gamut-mapping)).
- **Artwork.** Built from the theme's own ramp, never hues outside it, with
  grain at 8 to 15% to stop banding, seeded so it is stable, and a scrim
  that keeps words over it at 4.5:1.
