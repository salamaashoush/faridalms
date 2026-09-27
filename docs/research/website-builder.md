# School website builder

Researched 2026-09-27. Sources are cited inline. For section 3 I loaded each live site in a headless browser and read the computed fonts, colours, heading order and navigation from the DOM, so the hex values and font names are measured, not guessed.

## 0. Headline findings

- The school CMS incumbents (Finalsite, Blackbaud, Edlio, Apptegy, SchoolStatus/Campus Suite) all say "drag and drop", but the parts that matter are designed by the vendor. Finalsite's own training deck tells schools not to change the home page structure, add or delete elements, or change element settings, because "the home page contains custom coding" ([Finalsite training PDF](https://resources.finalsite.net/images/v1745901043/schoolsscsk12org/onurfhqx8uc23ybm1i6q/Session_1__Composer_Resources_Overview_and_Site_Setup.pdf)). A home page that the school can safely rearrange, with themes it can switch without a services engagement, is a real differentiator.
- General builders have settled on one model: a small **palette** with named roles, a few **section colour schemes** generated from it and chosen per section, a **font pairing**, a **shape/button** preset, and **sections with layout variants**. Squarespace 7.1 (5 colours, 10 section themes), WordPress Twenty Twenty-Five (6 accessible section styles) and Webflow (variable modes applied to a section wrapper) all work this way.
- Great school home pages are very consistent: a video or photo hero, an admissions triad (**Enquire / Visit / Apply**), a stats band, division or entry-point cards, a head's welcome, community voices, news and events, then a footer that doubles as a sitemap. The section library below is built around that.
- None of the Gulf international schools I checked on Finalsite (ASD, Dubai College, AIS Riyadh) publishes authored Arabic. ASD and Shady Side use a "Translate this page" widget instead. The Arabic-first site (Kingdom Schools Riyadh) is a custom build. First-class authored bilingual content with correct RTL is still open ground.

## 1. School website platforms

### Finalsite Composer (includes SchoolPointe, acquired July 2021)

- **Editor.** The editing happens on the page itself. You toggle "Compose mode", hover an element to add, move, copy, open settings or delete it, and turn Compose off to preview. Page structure is a **page tree**: the domain, then the main navigation pages as the trunk, then "branches". Branches are folders outside the navigation, used for utility pages (login, 404), footer and header utility links, home page icon links, a **Style Guide** branch and an **Instructions** branch that the design team writes for each site ([training PDF](https://resources.finalsite.net/images/v1745901043/schoolsscsk12org/onurfhqx8uc23ybm1i6q/Session_1__Composer_Resources_Overview_and_Site_Setup.pdf)).
- **Layout.** A page has a layout plus "banners" (top header, bottom footer, left and right sidebars). There are 12 page layout diagrams, or 14 according to the marketing page ([support](https://www.finalsitesupport.com/hc/en-us/articles/115000857648-Anatomy-of-a-page), [CMS page](https://www.finalsite.com/school-websites/cms-for-schools)). The element library has tabs for Standard, Module, Layout, Social and Shared. Layout elements are 2 columns, 2 columns wide left or right, 3 and 4 columns, accordions, tabs, containers and personalisation ([support](https://www.finalsitesupport.com/hc/en-us/articles/115000865748-Column-Layout-elements)). Marketing cites 41 elements.
- **Styling.** A "Themes" area holds styles and design assets, with the note "leave this to the experts". Text styles come from a Styles dropdown (lead-in, callout, blockquote, table), and button styles from a "Class" field on links ([support](https://www.finalsitesupport.com/hc/en-us/articles/36452594955917-Customize-with-text-styles-in-a-Content-element)). Template themes (30+) only have their fonts, colours and logos customised by Finalsite Professional Services ([themes](https://www.finalsite.com/school-websites/template-design-portfolio)).
- **Workflow.** Statuses are colour-coded: Published (green), New (yellow), Draft (orange), Scheduled (light blue). Publish Now, Publish Later and "Request to Publish" to an admin group, with approve or deny by email. Page history, restore to the last published version, clone and unpublish are all available. Permissions (view, edit, publish, delete) can be set per page, per branch or globally. A "Locations" module feeds each campus's header and footer.
- **Modules.** Posts (news), Calendar, Directories, Athletics, Forms and registration, Resources and Galleries (a resource can sit in many galleries; deleted items are recoverable for 30 days; "where used" and "replace everywhere"), alerts and notifications, portals, an AI chatbot, newsletters, and "Create Once, Publish Everywhere" to the app ([CMS page](https://www.finalsite.com/school-websites/cms-for-schools)).
- **Accessibility.** An accessibility checker in the editor with a Quick Fix button (alt text, heading order, vague links), a setting that makes alt text mandatory, and device preview from 320x480 to 1080p ([blog](https://www.finalsite.com/blog/p/~board/b/post/10-ways-composer-saves-your-school-time)).

### Apptegy (Thrillshare)

Drag-and-drop pages built from text, photos, headlines, videos, galleries and tables. Templates and "global design controls" keep a district look while each campus sets its own colours and logo. Role-based create, edit, approve and publish permissions, and "page changes can be held for approval". A Live Feed publishes one post to the site, the app and social channels. News, calendar (Google and Microsoft sync), and ADA-compliant templates ([Apptegy CMS](https://www.apptegy.com/solutions/cms-school-websites/)). A reviewer describes it as a "standardized look" suited to a single webmaster ([EdTech Review](https://www.edtechreview.com/2024/01/product-comparison-website-app.html)).

### Edlio

Pages are organised as Categories, then Sections, then Pages. A page has a top **hero area** (one Links block allowed there), a main column and a **side panel** that takes the section menu plus content, photo, file and staff blocks ([help](https://help.edlio.com/apps/pages/add-links-page-blocks)). Modules: news, calendars (Google and iCal), a searchable staff directory, teacher and club pages, forms with payments, bell schedules, food menus, pop-up alerts, "photo shuffles" and spotlight messages, a newsletter sender. An AI accessibility checker "automatically fixes common accessibility errors", and designs claim WCAG 2.1 ([Edlio](https://www.edlio.com/websites)).

### Blackbaud School Website System

A classic grid builder. **Master layouts** hold shared chrome (logo, navigation) plus a required "Page Content" widget. Layouts nest **Regions** (full width), **Rows** and **Columns** on a 24-column grid (one grid unit is 35px, up to 1,185px). Styles are applied afterwards with a paintbrush tool and an "Edit styles" option ([help](https://webfiles-sc1.blackbaud.com/files/support/helpfiles/education/k12/panel/content/sws-master-layouts.html)). There are 50+ widgets: carousels, directories, event registration, donation forms, course descriptions, athletic rosters and schedules, faculty profiles ([Blackbaud](https://www.blackbaud.com/products/school-website-cms)).

### Campus Suite (now SchoolStatus Sites)

A no-code builder with ADA-compliant templates and "400 customizable layouts". Widgets and hubs cover calendar, news, staff directory, galleries and blogs. Also banners and alerts, translation into 130+ languages, automated plus human accessibility reports, multi-site for districts, draft review and approval, custom roles and activity logs ([SchoolStatus Sites](https://www.schoolstatus.com/products/sites/), [accessibility](https://www.campussuite.com/accessibility-center)).

### Middle East

I found no dominant regional school website builder. Regional SIS vendors (EduX, Skoolia) sell bilingual management systems but no site builder ([EduX](https://dc-edux.com/en/)). Websites are agency builds: Digital Gravity and Formulate in Dubai, and UK-based Interactive Schools, which built BSAK Abu Dhabi. They sit on WordPress or Finalsite ([Digital Gravity](https://www.digitalgravity.ae/industry/education/education-website-design-and-development/), [Formulate](https://www.formulatecreative.com/our-services/web-design/school-website-design-and-development-dubai)). Juniper Websites (UK) markets to international schools with "adaptable languages", but no documented RTL support ([Juniper](https://websites.junipereducation.org/page/?pid=32&title=International+schools)).

**Accessibility context.** For US public schools, the DOJ Title II rule requires WCAG 2.1 AA. An interim final rule on 2026-04-20 moved the deadlines to 2027-04-26 (large entities) and 2028-04-26 (smaller ones) ([Federal Register](https://www.federalregister.gov/documents/2026/04/20/2026-07663/extension-of-compliance-dates-for-nondiscrimination-on-the-basis-of-disability-accessibility-of-web)). WCAG 2.1 AA is the right bar to design for.

**What to take from the incumbents:** a page tree with non-navigation branches; statuses, scheduled publish, request-to-publish and restore; shared (saved) sections; a media library with "where used" and required alt text; an in-editor accessibility checker; sections driven by modules (news, events, staff). **What to beat:** home pages locked to the vendor, themes that need professional services to change, and no authored RTL.

## 2. General builders' theme and token models

**Squarespace 7.1**

- **Palette.** Five colours named Lightest, Light, Bright, Dark and Darkest. From these it generates **10 colour themes** (Lightest 1/2, Light 1/2, Bright 1/2, Dark 1/2, Darkest 1/2). The "1" themes use black or white text; the "2" themes pull text from the palette. Each section chooses a theme, and the default is Lightest 1 ([guide](https://launchthedamnthing.com/blog/choose-color-palette-and-edit-color-themes), [forum](https://forum.squarespace.com/topic/195414-change-text-styles-on-different-71-color-schemes-light-lightest-bright-dark-darkest/)).
- **Fonts.** Font packs (sans, serif, mixed) with heading, paragraph, button and misc categories, all scaling from one **base size** ([help](https://support.squarespace.com/hc/en-us/articles/206545327-Changing-fonts)).
- **Buttons.** Primary, secondary and tertiary, set up through "button packs", with shape (square, rounded, pill, plus newer oval and petal), outline thickness and S/M/L padding. Squarespace recommends button labels under 25 characters ([help](https://support.squarespace.com/hc/en-us/articles/206544727-Styling-buttons)).
- **Section options.** Height (S/M/L/custom), content width, alignment (top, center, bottom), background image, video or art (full-bleed or inset, with overlay opacity), dividers (shape, stroke, thickness), and saved sections ([help](https://support.squarespace.com/hc/en-us/articles/46489938125965-Style-page-sections)).
- **Header.** Layout presets, fixed or "show on scroll up", and border, blur and gradient styles ([help](https://support.squarespace.com/hc/en-us/articles/360000667707-Build-your-site-header)).
- **Onboarding.** Blueprint asks for one of 7 brand personalities (Professional, Playful, Sophisticated, Friendly, Bold, Quirky, Innovative), each with recommended palettes and two font pairings ([Website Builder Expert](https://www.websitebuilderexpert.com/website-builders/squarespace-blueprint-ai/)).

**WordPress block themes**

- **theme.json.** Presets for colour palettes, gradients, font families and fluid font sizes, a spacing scale, `layout.contentSize` and `wideSize`, radius sizes and shadows. They compile to CSS variables of the form `--wp--preset--color--{slug}`. Styles cascade from global to element (link, button, heading) to block ([theme.json guide](https://developer.wordpress.org/block-editor/how-to-guides/themes/global-settings-and-styles/), [reference](https://developer.wordpress.org/block-editor/reference-guides/theme-json-reference/theme-json-living/)).
- **Section styles (WP 6.6).** A block style variation on Group or Columns sets background, text, link, button and heading styles for everything nested inside ([dev blog](https://developer.wordpress.org/news/2024/06/styling-sections-nested-elements-and-more-with-block-style-variations-in-wordpress-6-6/)).
- **Twenty Twenty-Five in practice.** 9 style variations, each colour palette and font pair also available on its own so they can be mixed, **6 section styles** ("each with a unique accessible colour combination"), 70+ patterns (Hero, About, Events, Testimonials, CTA and so on) and full-page patterns. It also ships the Arabic font **Beiruti** ([TT5 docs](https://wordpress.org/documentation/article/twenty-twenty-five/)).

**Webflow**
Five variable types: colour, size, percentage, number and font family. Variables live in collections, and collections have **modes** (for example light, dark or brand) that are applied to a class or a section wrapper, so every child inherits that mode's values ([Webflow Way](https://webflow.com/webflow-way/design-systems/variables), [API](https://developers.webflow.com/designer/reference/managing-variable-modes-style)). The common section taxonomy is Relume's 1,000+ component library: Navbars, Hero Headers, Headers, Features, CTA, Stats, Team, Testimonials, Logos, FAQ, Gallery, Timeline, Events and Event Headers, Blog, Contact, Banners, Footers ([Relume](https://www.relume.io/categories/stats-sections)).

**Framer**
Colour styles hold a light and a dark value, with semantic names (background, text, border, accent). Text styles carry breakpoint overrides for desktop, tablet and mobile ([Academy](https://www.framer.com/academy/lessons/framer-fundamentals-themes), [text styles](https://www.framer.com/help/articles/how-to-use-text-styles/)). Prebuilt sections cover hero, features, testimonials, pricing, FAQ and footers ([marketplace](https://www.framer.com/marketplace/components/category/sections/)).

**Wix Studio**
Six default site colours with fixed roles: primary background, secondary background, disabled, secondary text, primary text, links and actions. Up to 25 colours in total. Colour and text themes can be applied as presets ([help](https://support.wix.com/en/article/studio-editor-working-with-site-colors), [theme](https://support.wix.com/en/article/wix-editor-customizing-your-sites-theme-and-design)).

**The token model worth copying:**

- **Palette.** Roles, not raw colours.
- **Section schemes.** A handful of named, contrast-checked schemes generated from the palette and chosen per section. Five is enough: Squarespace's ten confuse users, and TT5 ships six.
- **Font pairing.** Heading and body fonts with a base size and a scale ratio.
- **Shape.** One radius scale plus a button shape.
- **Spacing density.**
- **Header and footer variants.**
- **Section variants.** A layout choice, plus background type, height, width and alignment.

## 3. What great school sites look like (16 examined)

**Phillips Exeter Academy** ([exeter.edu](https://www.exeter.edu/), Webflow front end)

- Home page: a minimal full-bleed photo hero, "Exeter Stories", a "Go figure" numbers section, and a footer mega-sitemap (Visit, How to Apply, Give, Contact).
- Navigation: a hamburger plus seven items and an Apply button.
- Type and colour: Graphik at 90px; crimson #A31F34 on a warm white #FCF9F8.

**Eton College** ([etoncollege.com](https://www.etoncollege.com/), WordPress)

- Home page: the H1 "Honouring Tradition." over pillar tiles (Academic, Sport); a stats band (250, £10.06m, 16,000, 105, 51); an ISI inspection pull quote; news cards and "Next up..."; a footer with columns for Purpose, Entry, Contact and Quick links.
- Navigation: 10 main items plus a utility group (Parent Portal, Employment, EtonX, Collections, OEA, Facilities for Hire), opened from a hamburger overlay even on desktop.
- Type and colour: Vesterbro (light serif H1, bold H2) with Nunito Sans; navy #223C59, sage #A0D1CA, off-white #EFF3F0; square buttons.

**Groton School** ([groton.org](https://www.groton.org/), Finalsite)

- Home page: a full-bleed video hero; stats (40%, 4:1, 56%, $611M, 380 and more); a values quartet (Affordability, Family, Scholarship, Inclusion); a "Next Step" triad (Request Info, Explore, Apply Now); News & Views; social; mission; contact.
- Navigation: a utility bar (News, Alumni, Parents, Calendar, myGroton) above main navigation with dropdown panels.
- Type and colour: Zen Antique serif at 62px with Rethink Sans body and Gabarito buttons; crimson #AE0940, charcoal #262626; 2px radius.

**Brighton College** ([brightoncollege.org.uk](https://www.brightoncollege.org.uk/))

- Home page: an announcement bar ("Join us at our next College Open Morning... BOOK ONLINE"), then a photo hero; the Principal's welcome; divisions (Prep, College, Sixth Form); Record Results; news; "Our Wider Family of Schools" (13 campuses, including Abu Dhabi, Dubai and Al Ain).
- Navigation: a persistent **ENQUIRE | APPLY | VISIT** triad in the header.
- Type and colour: Rhymes serif with a sans body; navy #21313C, gold #B48D00, cream #F6F7F0; 8px radius, uppercase buttons.

**St Dunstan's College** ([stdunstans.org.uk](https://www.stdunstans.org.uk/), Finalsite, 2025 award)

- Home page: an **inset** video montage (990x656, not full-bleed) with "An independent school like no other"; "Our Entry Points" (Junior, Senior, Sixth Form); an Excellence band (outcomes, destinations, awards, sport, drama); an Instagram grid; news.
- Navigation: a utility bar (Visit, Contact, Parents & Pupils, Alumni) above 9 main items.
- Type and colour: Platypi serif with Albert Sans at 64px; burgundy #7E1D2C with cream text #EAE1D6, blue #264477; a circular "Discover more" button.

**Shady Side Academy** ([shadysideacademy.org](https://www.shadysideacademy.org/), Finalsite, "best of 2025")

- Home page: a full-bleed video hero "Make your move" with a "Watch Full Video" button; scrolling "...so you can..." statements; a division trio named Explore, Grow and Flourish (Pre-K to 5, 6 to 8, 9 to 12); a "Learning that moves" pillars block; a carousel of 7 community profiles ([Finalsite 2025](https://www.finalsite.com/blog/p/~board/b/post/best-independent-school-websites-of-the-year)).
- Navigation: audience-intent labels (Meet Us, Explore Admission, Belong Here, Forever SSA), a Portals menu and a translate widget.
- Type and colour: Geologica throughout, 72px uppercase headings; navy #041E42, gold #FFB81C, stone #F2F3EE.

**Wellington College** ([wellingtoncollege.org.uk](https://www.wellingtoncollege.org.uk/), WordPress)

- Home page: a full-screen video hero "Discover your potential" with an Unmute control; Meet the Master; stats (1st, 92%, 6500+) interleaved with parent quotes; #OurWellington; values; What's new; and a **"Where next?"** audience router (Current families, Old Wellingtonians, Prospective families).
- Navigation: a large dropdown menu whose Admissions column lists Joining at 11+, 13+, 14+ and 16+, the Enquiry form, Visiting, a Virtual Tour and Scholarships.
- Type and colour: Euclid Circular A; black #101010, yellow #F7D117, orange #F27D00, mint #A6D6C9; 40px pill buttons.

**Bryn Mawr School** ([brynmawrschool.org](https://www.brynmawrschool.org/), Finalsite)

- Home page: a hero of rotating questions ("Nail the choreography? Make the winning shot?"); divisions (Little, Lower, Middle, Upper, Online); Why Bryn Mawr; **Community Voices** video testimonials; a heritage line ("For 140 years").
- Navigation: Quicklinks, Community and a "MAIN MENU" overlay.
- Type and colour: Merriweather at 60px with mr-eaves-sans; forest #07302D, green #00664F, warm white #FFFBF8.

**Dubai College** ([dubaicollege.org](https://www.dubaicollege.org/), Finalsite)

- Home page: a welcome hero "Deep learning, good character, flourishing lives"; latest news; testimonials in three tabs (student, staff, parent); stats (1140 students, 63 nationalities, 10:1, 19 acres); "Continue the Journey".
- Navigation: a utility bar (Vacancies, Parent Portal) above a large dropdown menu.
- Type and colour: Tinos serif H1 with Montserrat; navy #032E47.

**American School of Dubai** ([asdubai.org](https://www.asdubai.org/), Finalsite)

- Home page: a full-bleed video hero "Future ready."; "Why ASD?" flip stats (100% non-profit, 60 years, 400+ activities, 87 nationalities); Nurture, Inspire, Include All; divisions (Early Learning to High School); a community stories carousel.
- Navigation: a utility bar (Apply, Work at ASD, Login, Translate).
- Type and colour: Montserrat; red #B11F28.

**Repton Dubai** ([reptondubai.org](https://www.reptondubai.org/), WordPress)

- Home page: welcome; "first UK independent school in the Middle East"; campus; Repton Family of Schools; the KHDA "Outstanding" claim; "Start your child's Repton Journey" and Book a School Tour.
- Navigation: a phone number plus **Enquire | Visit | Apply** in the utility bar; main navigation includes "Admissions & Fees" and "Parent Essentials".
- Type and colour: Montserrat; navy #243253, teal #33747A, sand #F4F2ED.

**Cairo American College** ([cacegypt.org](https://www.cacegypt.org/))

- Home page: a full-bleed video; a burger menu with large dropdown panels; "Why choose CAC?" (PYP, IB and American diploma; programs; campus; university acceptances); core values; "Eagles who inspire" profiles; upcoming events; an Inquire, Explore, Apply band.
- Type and colour: Raleway uppercase on a white canvas.

**JESS Dubai** ([jess.sch.ae](https://www.jess.sch.ae/))

- Home page: a video hero; the Director's welcome; JESS Life; an educational journey in two stages; community; values.
- Navigation: a utility bar (Working at JESS, Parent Portal) above six main items.
- Type and colour: ff-dax-pro with Roboto; navy #03224C; 35px uppercase pill buttons.

**British School Al Khubairat, Abu Dhabi** ([britishschool.sch.ae](https://www.britishschool.sch.ae/), built by Interactive Schools)

- Home page: a 77px Montserrat H1 "EXCEEDING EXPECTATIONS"; Enquire, Visit and Apply; news plus a vacancy; Discover, Inspiring Students and Experience BSAK; a footer with directions.
- Navigation: audience links (Students, Parents, Staff).
- Colour: blue #0F537E.

**American International School Riyadh** ([aisr.org](https://www.aisr.org/), Finalsite)

- Home page: a video hero with the mission statement; "Be an AIS-R Eagle" pillars; "Excellence... since 1963"; outcome stats (over $5.5M in scholarships, 300 universities, 68 nationalities); an Admissions 2026/27 band.
- Navigation: a yellow (#FFCA00) CONTACT button in the header.

**Kingdom Schools Riyadh** ([kingdomschools.edu.sa](https://kingdomschools.edu.sa/), Arabic-first, `lang=ar dir=rtl`)

- Home page: a video hero; a tagline set with decorative tatweel ("نصنــــــع قادة المستقبل"); about; "Why choose Kingdom Schools?"; programmes; a scholarship; a team carousel; a gallery; a dated news list.
- Navigation: a sticky header with Home, Team, Academic Calendar, News, Studio and "English". The footer lists the welcome message, vision and mission, admission policy, tuition fees, e-learning and careers.
- Type and colour: Cairo at 42px; teal #004D5A, gold #B29A51 pill buttons (50px radius).

**Patterns across the set:**

- **Heroes.** 8 of 16 use a muted, autoplaying full-bleed video. One uses an inset video. The rest use a still photo or a typographic hero.
- **Admissions paths.** An Enquire/Visit/Apply (or Request Info/Explore/Apply) triad appears in 7.
- **Stats bands** appear in 7, and division or entry-point cards in 9.
- **Welcome and voices.** A head's welcome appears in 6, and community voices or testimonials in 7.
- **Group and inspection blocks.** "Family of schools" blocks (Brighton, Repton) and inspection quotes (ISI, KHDA) both recur.
- **Navigation.** 12 of 16 have a **utility bar** with audience or portal links. A hamburger on desktop that opens a full-screen menu is a deliberate prestige choice (Eton, Exeter, Wellington, Repton, CAC, Bryn Mawr).
- **Type.** UK and US heritage schools pair a serif display face with a sans body. Gulf schools lean on geometric sans, with Montserrat on 5 sites.
- **Colour.** One deep anchor (navy, crimson or forest), one warm accent (gold, yellow or sage) and a **warm off-white canvas**: #F6F7F0, #FCF9F8, #FFFBF8, #F4F2ED, #F2F3EE. Almost nobody uses pure white.
- **Button shape** splits three ways: square (0 to 2px), soft (8px) or pill (35 to 50px).

## 4. Recommendations

### 4.1 Token model (per site, per theme)

- `palette`: canvas, surface, primary, accent, ink-muted, ink. Six roles, a superset of Squarespace's five with a separate brand and CTA colour.
- `schemes`: **Canvas, Soft, Brand, Accent, Ink**, each generated from the palette. Each scheme defines bg, heading, body, muted, link, border, card bg, button (bg/fg), secondary button and focus ring. Validate WCAG AA at generation time (4.5:1 for body text, 3:1 for large text and UI), and block or auto-fix any scheme that fails. This is how TT5 gets "accessible" section styles.
- `type`: a per-locale family for heading and body; base size (16 to 18px); scale ratio (1.2, 1.25 or 1.333); heading weight; heading case (none or uppercase, and Latin only); tracking (Latin only).
- `shape`: radius (0, 4, 8, 16 or 24) and button shape (square, rounded, pill); card style (flat, bordered, raised); image radius.
- `space`: density (compact, regular, airy), which maps to section padding; container width (1120, 1240 or 1320).
- `buttons`: primary is solid; secondary is outline, soft or underline.
- `header` and `footer` variants (below), `motion` (none or subtle, and always respect `prefers-reduced-motion`), and a `divider` shape (none, curve, wave, angle).

Store themes as data, never as CSS the school edits. Switching theme then re-skins the site without touching content, which is the Squarespace 7.1 promise and the thing Finalsite themes lack.

### 4.2 Seven themes

1. **Heritage**
   - Palette: canvas #F7F4EC, surface #ECE6D8, primary navy #1F2A44, accent crimson #9B1B30, ink #1A1A1A.
   - Fonts: Latin Cormorant Garamond (display) with Source Sans 3; Arabic Amiri (display) with Noto Naskh Arabic or IBM Plex Sans Arabic.
   - Radius 0 to 2; square solid buttons.
   - Header: a utility bar, centred crest, full-width navigation with dropdown panels.
   - Mood: established, scholarly. Suits British-curriculum and boarding schools, and "since 19xx" schools. Evidence: Eton, Groton, Exeter, Dubai College.
2. **Meridian**
   - Palette: canvas #F8F9FB, surface #EAF0F7, primary #0B3D91, accent teal #0FA3A3, ink #0F172A.
   - Fonts: Alexandria for headings (Latin and Arabic in one family, co-designed by Montserrat's designer, so it fits the Gulf's Montserrat habit) with IBM Plex Sans and IBM Plex Sans Arabic.
   - Radius 8.
   - Header: logo at the start, inline navigation, and the Enquire/Visit/Apply triad at the end; sticky.
   - Mood: global, organised. Suits IB, American and international schools. Evidence: ASD, AISR, JESS.
3. **Bright Start**
   - Palette: canvas #FFF9EF, primary #1E6FD9, accents sunflower #FFC845, coral #FF6B5A and grass #3BB273, ink #1F2937.
   - Fonts: Baloo Bhaijaan 2 for headings (one family covering Latin and Arabic) with Rubik (Latin and Arabic).
   - Radius 20; pill buttons; wave dividers.
   - Header: large logo with pill navigation.
   - Mood: warm and playful. Suits nurseries, early years and primary. Evidence: ISKL's rounded, gradient style ([Finalsite UK/Intl 2025](https://www.finalsite.com/blog/p/~board/b/post/best-uk-and-international-school-websites-of-the-year)), Aidan Montessori.
4. **Oasis**
   - Palette: canvas #F6F1E7, surface #E9E0CF, primary teal #004D5A, accent gold #B29A51, ink #14272B.
   - Fonts: El Messiri for headings with Cairo for body (both Latin and Arabic).
   - Radius 12; pill buttons.
   - Header: transparent over the hero, then solid and sticky, with a prominent language switch.
   - Mood: contemporary Gulf and Arabian, dignified. Suits Arabic-first national and bilingual private schools in KSA, Egypt and the UAE. Evidence: Kingdom Schools.
5. **Editorial**
   - Palette: canvas #FFFFFF, surface #F2F2F0, primary ink #101010, one signature accent (default yellow #F5C400), secondary orange #F27D00.
   - Fonts: Plus Jakarta Sans (display at 800) with Inter; Arabic Readex Pro, a variable font designed for readability.
   - Radius 40 on buttons and 0 on images.
   - Header: minimal logo plus a burger that opens a full-screen overlay menu with two CTAs.
   - Mood: confident, magazine-like. Suits ambitious senior schools and sixth forms. Evidence: Wellington, Exeter.
6. **Evergreen**
   - Palette: canvas #FBF8F2, surface #EEF0E6, primary forest #1F3D2B, accent clay #C8643B, ink #1B1F1A.
   - Fonts: Fraunces with Nunito Sans; Arabic Markazi Text (serif) with Tajawal.
   - Radius 12; organic curve dividers.
   - Header: centred logo with navigation split on either side.
   - Mood: calm, nature-led. Suits Montessori, Reggio, progressive and green-campus schools. Evidence: Bryn Mawr, Paideia, Garrison Forest.
7. **Civic**
   - Palette: canvas #FFFFFF, surface #F1F4F8, primary #12355B, accent #D14900, ink #111111. Base size 18px.
   - Fonts: Noto Sans with Noto Kufi Arabic (headings) and Noto Sans Arabic (body).
   - Radius 6.
   - Header: always-visible alert slot, plain navigation and a search field.
   - Mood: clear and accessible first. Suits public, charter and multi-campus groups. Evidence: Apptegy and SchoolStatus positioning.

### 4.3 Arabic fonts and licensing

Every font below is on Google Fonts under **SIL OFL 1.1** and includes Latin as well as Arabic, per google/fonts METADATA ([repo](https://github.com/google/fonts/tree/main/ofl)).

- **IBM Plex Sans Arabic**: static weights 100 to 700. Neutral UI sans.
- **Noto Kufi Arabic**: variable, 100 to 900. Geometric Kufi, good for headings.
- **Noto Naskh Arabic**: variable, 400 to 700. Traditional Naskh, the most readable for long text.
- **Noto Sans Arabic**: weight 100 to 900 plus a width axis.
- **Cairo**: weight 200 to 1000 plus a slant axis.
- **Tajawal**: 200 to 900.
- **Readex Pro**: weight 160 to 700 plus an HEXP axis. Designed for legibility; co-designed by Nadine Chahine.
- **Almarai**: 300, 400, 700 and 800. Very clean at small sizes.
- **Alexandria**: 100 to 900.
- **El Messiri**: 400 to 700.
- **Amiri**: 400 and 700. Classical, suited to heritage themes.
- **Markazi Text**: 400 to 700.
- **Rubik**: 300 to 900. The Arabic is by Omaima Dajani.
- **Baloo Bhaijaan 2**: 400 to 800. Playful.
- Also usable: **Vazirmatn**, **Changa**, **Beiruti**.

The OFL allows embedding, self-hosting and modification (under a new name), but not selling the fonts on their own. **Self-host** the files rather than linking the Google CDN: a Munich court (LG München I, 3 O 17493/20, 2022) found that remote Google Fonts leak visitors' IP addresses. Several top sites use commercial fonts (Graphik, Euclid Circular, Effra, ff-dax-pro, mr-eaves). Keep the themes OFL-only.

### 4.4 Starter templates

**Whole-site starters** (each is a theme, a page set, navigation, footer, sample bilingual copy and placeholder photos):

1. **Independent Heritage** (Heritage theme): Home, About (Head's welcome, History, Leadership), Admissions (Enquire, Visit, Apply, Fees, Scholarships), Academics, Sixth Form, Boarding, Co-curricular, News, Events, Contact, Careers.
2. **International** (Meridian): Home, About, Programmes (PYP, MYP, DP or US diploma), Divisions, Admissions, Community stories, Calendar, News, Contact, Careers.
3. **Early Years & Primary** (Bright Start): Home, Our Day, Classes, Admissions, Gallery, News, Parents, Contact.
4. **National Bilingual, Arabic-first** (Oasis): الرئيسية (Home), عن المدرسة (About: vision and mission, welcome message), البرامج التعليمية (Programmes), القبول والرسوم (Admission policy and fees), فريقنا (Team), التقويم الدراسي (Academic calendar), الأخبار (News), معرض الصور (Gallery), التوظيف (Careers), تواصل معنا (Contact). This mirrors the Kingdom Schools information architecture.
5. **School Group** (Civic or Meridian): group home with campus cards ("Family of schools") and one page per campus with its own contact details.
6. **One-page Launch** (any theme): hero, about, programmes, admissions CTA, enquiry form, contact. For new schools and small centres.

**Page templates:** Home (4 variants: Classic, Story-led, Admissions-first, Community); About; Head's Welcome; Mission & Values; History; Leadership & Governance; Admissions Overview; How to Apply; Fees & Scholarships; Visit / Open Day landing; Academics / Curriculum; Division page; Student Life / Co-curricular; Athletics; Parents hub (quick links, term dates, calendar); Staff directory; News index and article; Events index and event; Careers; Policies & Documents; Contact.

### 4.5 Section library (28)

Every section gets these shared controls:

- **Colour scheme:** Canvas, Soft, Brand, Accent or Ink.
- **Background:** none, image (with focal point and overlay 0 to 80%) or video (with a poster and a mandatory pause button).
- **Spacing:** S, M or L.
- **Width:** contained, wide or full.
- **Alignment:** start or centre.
- **Top and bottom divider.**
- **Anchor id** and **hide per locale.**

Layout variants are named start/end, never left/right, so they mirror automatically in RTL. In the list below, **[extends X]** marks one of the ten existing types.

Intro

1. **Hero** [extends hero]: full-bleed media with overlay text; split (text beside media); inset video montage; typographic over colour or pattern. Up to 3 CTAs. Height S, M, L or full screen.
2. **Page header** (interior): title on colour; title over an image band; title with breadcrumb and intro.
3. **Announcement strip**: dated promotion ("Open Morning, 10 Oct: Book"), dismissible, with an optional countdown. Separate from the existing alert banner tones.
4. **Welcome message**: portrait at start or end with a quote and signature; video welcome; letter style.

Story 5. **Rich text** [extends text]: narrow reading column; two columns; with a section sub-menu sidebar (Edlio's side panel). 6. **Image + text** [extends imageText]: media at start or end; overlapping card; half-bleed media. 7. **Cards / programmes** [extends cards]: 2, 3 or 4 columns; image buttons (Finalsite's "image buttons"); icon grid; horizontal scroller. 8. **Divisions / entry points**: tall image cards with age ranges; tabs; stacked rows. 9. **Stats band**: 3 to 6 figures in a row; figures over an image; figures with captions and a source line; count-up animation only when motion is allowed. 10. **Pillars / values**: icon grid; numbered list; alternating rows. 11. **Quote / endorsement**: large pull quote; quote with portrait; inspection badge plus quote (ISI, KHDA, Ofsted, BSO, NEASC). 12. **Community voices**: card carousel; grid; video testimonials; tabbed by audience (students, parents, staff). 13. **Video feature**: inset player with poster; full-bleed with a "Watch full video" button; video beside text. Captions field required. 14. **Gallery** [extends gallery]: grid; masonry; carousel; all with a lightbox. 15. **Timeline / history**: horizontal scroller; vertical. 16. **People**: leadership grid; team carousel; searchable directory (module-driven). 17. **Collapsible content** [extends accordion]: accordion; tabs; two-column FAQ. 18. **Logos / accreditations**: row; grid; slow marquee (pausable). 19. **Campus spotlight**: image mosaic; map with points; virtual-tour link.

Dynamic (module-driven) 20. **News** [extends news]: featured story plus list; 3-card grid; carousel; compact list. 21. **Events**: date-badge list; cards; mini month view. Filter by category or division. 22. **Social feed**: Instagram-style grid; single-row strip.

Conversion 23. **Admissions CTA** [extends action]: Enquire/Visit/Apply triad tiles; single-CTA banner; CTA with a key date. 24. **Admissions steps**: horizontal numbered steps; vertical timeline. 25. **Fees & key dates**: accessible data table; term-dates list; downloadable fee schedule. 26. **Enquiry form**: inline form; split with contact details; multi-step. Submissions go to the admissions leads inbox. 27. **Contact & locations** [extends contact]: map plus details; multi-campus cards; simple list. 28. **Quick links / audience router**: icon tiles; "Where next?" audience cards (Wellington); plain list. Also covers documents and policies as file cards.

Keep **Embed** [existing] as an advanced escape hatch. Global chrome is configured once, outside the section list:

- **Header** in 4 variants: Classic (logo start, navigation, CTA), Centred crest (with utility bar), Overlay (transparent over the hero), Minimal (burger plus full-screen menu).
- **Utility bar**: portals, audiences, phone number, language switch.
- **Footer** in 4 variants: Sitemap columns, Compact, Contact-first with map, Multi-campus.
- **Mobile sticky CTA dock**: Enquire and Apply.

### 4.6 Editor UX

- **Live canvas.** It renders the actual public components in the active theme and locale. The left rail holds the **page tree** (navigation pages plus non-navigation branches, as in Finalsite) and a section outline; the right panel is an **inspector** with Content, Layout and Style tabs.
- **Add-section gallery.** Opens from a "+" between sections. Categories follow 4.5, with thumbnails **rendered live in the site's theme and language** rather than static images, a search box, and "Saved sections" (Finalsite shared elements, Squarespace saved sections).
- **Per-section controls.**
  - A thumbnail strip for layout variants.
  - Scheme swatches that preview background, text and button together.
  - Background with focal point and overlay; spacing, width and alignment; dividers.
  - Repeaters (cards, stats, steps) with drag handles.
  - Inline text editing on the canvas.
- **Reorder.** Drag in the canvas or the outline, plus keyboard move up/down buttons. Duplicate, hide, and delete with undo.
- **Preview.**
  - Device frames: desktop 1440, tablet 820, mobile 390.
  - An **EN/AR toggle** that flips `dir` on the canvas.
  - A side-by-side translation view with a per-section "missing Arabic/English" badge.
  - Preview as a visitor (chrome off).
- **History.** Undo/redo (Cmd/Ctrl+Z), autosaved drafts, version history with "restore last published", scheduled publish, request-to-publish with comments, and page-level permissions for view, edit and publish. All of these are in Finalsite's workflow.
- **Site styles panel.** Theme cards first, then tweaks: the palette roles with a live contrast readout, font pairing per locale, shape, density, button style, header and footer variant, and "reset to theme".
- **Publish checks (blocking or warning).**
  - Missing alt text (Finalsite can make it mandatory).
  - One H1 per page, and heading order.
  - Contrast failures in custom palettes.
  - Missing translations, and empty sections or placeholder copy.
  - Broken links, or links to unpublished pages.
  - Video without captions, or autoplay without pause.
  - Oversized images.
  - Missing SEO title or description.
  - An enquiry form with no recipient.
  - Button labels over 25 characters.
- **Guardrails.** Colours come only from the palette (no free hex per section). Cap hero slides at 5 with a pause control. The home page is always fully editable.

### 4.7 Bilingual and RTL

- **Author both languages per field.** A machine-translate widget is not the answer. Store `{en, ar}` per text field, and let a section be hidden in one locale.
- **Build with logical CSS** (`margin-inline-start`, `inset-inline`, `text-align: start`) and name variants start/end so every layout mirrors automatically.
- **Mirror direction-dependent icons only.** Arrows, chevrons and carousel order mirror. Logos, play buttons and clock icons do not ([Material bidirectionality](https://m2.material.io/design/usability/bidirectionality.html)).
- **Arabic typography.**
  - Body line-height 1.7 to 1.8.
  - No letter-spacing, which breaks joins, and no uppercase transform.
  - No synthetic italic; emphasise with weight or colour.
  - Avoid `text-align: justify`: good Arabic justification needs kashida handling ([W3C alreq](https://www.w3.org/TR/alreq/)). Decorative tatweel in display headings, as Kingdom Schools uses it, is fine when authored by hand.
  - Where the heading face is Latin-only, set Arabic about 5 to 10% larger.
- **Numbers and dates.** A site setting chooses Western (0-9) or Eastern Arabic (٠-٩) digits, passed as an explicit `numberingSystem` to `Intl.NumberFormat` and `Intl.DateTimeFormat`. Offer optional Hijri dates for KSA schools on events and calendars.
- **Mixed-direction text.** Wrap phone numbers, emails, English names and codes inside Arabic text in `<bdi>` or `dir="auto"`, so things like "+971 4 361 9019" and "IB DP" render correctly.
- **Language switch.** It goes to the _equivalent page_ (a shared page id with a locale path, `/en/...` and `/ar/...`) and emits `hreflang` alternates. Show it in the utility bar and the mobile menu.
- **Theme previews.** Every theme preview and section thumbnail exists in both directions, and every theme ships a tested Latin and Arabic font pair.
