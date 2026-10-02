# Early-years UX for Farida: evidence and design rules

Scope: children aged 3 to 7 (KG1 to Grade 2) answering question blocks inside a lesson document, mostly on shared classroom iPads, in English and Arabic. Ages are split 3-5 and 6-8 wherever the evidence allows. Every finding carries a tag:

- [measured] means a controlled study or measured data.
- [guideline] means a published guideline from a research or standards body.
- [official] means a government or statutory document.
- [product] means what a shipping product documents in its own help centre or store listing.
- [derived] means my own calculation or judgement from the cited inputs. These are marked so they can be challenged.

Method note: the session's web-search quota ran out partway through, so product help centres were read through their public Zendesk article APIs and papers through PubMed and OpenAlex. Primary PDFs (Vatavu 2015, Nacher 2015, Anthony 2012/2013, Hiniker 2015, TIDRC 2019, Sesame 2012, Hourcade 2022, Wilkins 2009, Walker 2018, Lepper 1973, Deci et al. 1999, Takacs 2015, Kaminski 2013, the EYFS 2026 framework and profile handbook) were read in full. Unverified items are listed at the end.

Unit conversion used throughout [derived]:

- iPad 11-inch (A16): 2360 x 1640 at 264 ppi (https://www.apple.com/ipad-11/specs/). At a device pixel ratio of 2 the CSS viewport is 1180 x 820, so 1 CSS px = 0.192 mm and 1 mm = 5.2 CSS px.
- iPhone 17: 2622 x 1206 at 460 ppi (https://www.apple.com/iphone-17/specs/). At a ratio of 3 the viewport is 874 x 402, so 1 CSS px = 0.166 mm and 1 mm = 6.0 CSS px.
- Worked values: 20 mm is 104 px on the iPad and 121 px on the iPhone; 10 mm is 52 px and 60 px; 4 mm is 21 px and 24 px.

---

## 1. Interaction: tap, drag, targets, gestures, layout

### Tap versus drag versus tap-then-place

- [measured] Children aged 3 to 6 (n = 89) completed taps 98.7% of the time, single-finger drag-and-drop 92.0%, double taps 82.8% and two-finger drags 53.7%. On a 10-inch tablet only 30.7% of two-finger drags succeeded, against 80% on a phone. Completion rose with age: 73.5% below 4 years, 82.2% at 4 to 5 and 89.2% above 5. Single-finger drags failed on 11.5% of tablet attempts against 4.2% on the phone, because drags on the tablet were longer. Vatavu et al. 2015: https://doi.org/10.1016/j.ijhcs.2014.10.007 (preprint: https://mintviz.usv.ro/publications/ijhcs2015.pdf)
- [measured] In two studies, 5- and 6-year-olds finished faster and made fewer errors with click-move-click (pick up, then place) than with drag-and-drop. The problem appeared on long drags, not short ones, and there was no difference for older children. Inkpen then recommended click-move-click over dragging. This is Joiner et al. 1998 as summarised in Hourcade, _Child-Computer Interaction_, 2nd ed., 2022: https://jphourcade.com/book/
- [measured] Children aged 6 to 11 made 35% more drag errors with a finger than with a stylus (12.6% against 9.3%). Cassidy, Read & MacKenzie 2019: https://doi.org/10.1007/978-3-030-29387-1_38
- [measured] For children aged 2 to 3, tap and drag succeeded about 90% of the time. Double tap, long press (500 ms hold) and two-finger rotation had the lowest success. Nacher et al. 2015: https://doi.org/10.1016/j.ijhcs.2014.08.004
- [measured] Children aged 2 to 8 (n = 90): only 27% of 2- and 3-year-olds tapped the intended place. At 4 to 6, 57% could tap and slide. Only 30% of 7- and 8-year-olds performed drag-and-drop. Yadav et al. 2020: https://doi.org/10.3345/cep.2019.00997
- [guideline] NN/g: when a child moves an object, support both dragging it and tapping the destination. In testing, a precise-drag game made a 5-year-old give up. A PBS KIDS game offered tap-then-tap as an alternative to dragging, but no child in the study discovered it, so the alternative must be the primary path, not a hidden one. https://www.nngroup.com/articles/children-ux-physical-development/
- [guideline] Sesame Workshop: children can drag but struggle to keep a finger on the glass, so support partial completion. Program fling and flick so that tap and drag also work. Sesame Workshop, _Best Practices: Designing Touch Tablet Experiences for Preschoolers_, 2012. The original URL is http://www.sesameworkshop.org/wp_install/wp-content/uploads/2013/04/Best-PracticesDocument-11-26-12.pdf. The current sesameworkshop.org copy at /sites/default/files/imce/SW_iPad_Best_Practices.pdf returned 404 on 2026-10-02, and the text was read from an archived copy.
- [guideline] TIDRC is a synthesis of 31 studies. Recommendation TG43 is to avoid drag-and-drop, rotate and pinch for ages 2 to 4, yet 44% of 50 popular apps still used drag. Soni et al. 2019: https://doi.org/10.1145/3311927.3323149
- [guideline] WCAG 2.5.7 (AA) requires a single-pointer alternative to any dragging movement: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html

### Target size and spacing

- [guideline] NN/g recommends touch targets of at least 2 cm x 2 cm for young children, four times the 1 cm x 1 cm adult figure. A 5 mm close button defeated two 7-year-olds. https://www.nngroup.com/articles/children-ux-physical-development/
- [measured] Mean tap offset from the target centre was 4.5 mm at age 3, 3.8 mm at 4 and 3.4 mm above 5 (adults: 2.1 to 3.3 mm). Offsets were larger on the tablet (4.5 mm) than on the phone (3.3 mm). Vatavu et al. set the targets at 20 mm on the tablet and counted a hit anywhere within a 23 mm circle. Their recommendation is to accept offsets up to 10 mm and press times up to 5 s for 3-year-olds. https://doi.org/10.1016/j.ijhcs.2014.10.007
- [measured] Hourcade et al. 2004 (mouse, ages 4 to 5) found 4-year-olds reached 90% accuracy only with 64 px targets, 23.7 mm on screen. 5-year-olds managed half that diameter, and adults needed 16 px. Source: Hourcade 2022, https://jphourcade.com/book/
- [measured] Children aged 7 to 10 miss 7 mm targets almost 30% of the time and still miss Android-size 9 mm targets once in six attempts. Anthony et al. 2013: https://doi.org/10.1007/s00779-013-0749-9 (as cited in Vatavu 2015). Children aged 7 to 16 reached about 90% accuracy with 9.5 mm targets and over 95% with 12.7 mm. Anthony et al. 2012: https://doi.org/10.1145/2396636.2396671
- [measured] "Holdovers" are taps that land where the previous screen's target was, because the child is still tapping when the screen changes. They were 3.9% of touches for ages 7 to 10 against 0.6% for adults, and appeared on 38.8% of targets. Anthony et al. 2013: https://doi.org/10.1007/s00779-013-0749-9
- [measured] Insetting targets 10 px from the screen edge nearly doubled the miss rate compared with targets flush to the edge, because the edge acts as a backstop. Same source.
- [guideline] Platform minimums: Apple sets 44 x 44 pt as the default and 28 x 28 pt as the minimum (https://developer.apple.com/design/human-interface-guidelines/accessibility). Android sets 48 dp. Both are adult figures.
- [derived] On a classroom iPad, 2 cm is 104 CSS px. Farida's plan says "targets about 76px" (docs/plans/documents-editor-modules.md), which is 14.6 mm. That is fine for ages 6 to 8 and below the NN/g figure for ages 3 to 5. Today's answer rows are 64 px high (`youngRow`, `min-h-16`, in apps/web/src/components/learning/Checks.tsx) and the read-aloud button is 44 px (`size-11`, in apps/web/src/components/learning/ReadAloud.tsx). Both are adult-sized.

### Long press, double tap, repeated taps, accidental touches, swipe

- [measured] Under-4s held "taps" for up to 5.1 s, 4- to 5-year-olds for up to 4.2 s, and over-5s for up to 1.5 s, against an adult maximum of 0.9 s. Vatavu recommends treating these as taps and giving feedback after 1 to 2 s so that the child knows it can let go. https://doi.org/10.1016/j.ijhcs.2014.10.007
- [guideline] Children tap too hard, too long or several times, which triggers unwanted zoom, until they see that the tap registered, so registration should show on touch rather than on lift. Use double tap only as a guard against accidental navigation, such as leaving an activity. Children use multi-touch unintentionally. Children rest their wrists on the bottom edge of the tablet, so active icons there get "bumped". Sesame 2012 (URL above).
- [official] WCAG 2.5.2 Pointer Cancellation (A) requires completion on the up-event unless it can be aborted, undone or reversed: https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html
- [derived] The way to meet both: show the pressed state on pointerdown (within 100 ms, per https://www.nngroup.com/articles/response-times-3-important-limits/) and commit on pointerup. Selecting an answer stays reversible until the answer is checked.
- [guideline] Swiping is intuitive only when the swipe area is visually indicated. Pair it with a tappable arrow, and keep hot spots out of the swipe area. Sesame 2012.
- [guideline] Menus that are hidden or hierarchical are "particularly dire" below age 7. Flat sets of icons that the child can swipe through work. Hourcade 2022, Appendix B: https://jphourcade.com/book/

### How many choices, one item per screen, phones against tablets

- [guideline] NN/g recommends avoiding scrolling for young children, saying some scrolling is acceptable for older children. "Multiple/redundant navigation" is "very confusing" for children. Its age bands are 3-5, 6-8 and 9-12, and its sessions found that a 6-year-old called content for 4- or 5-year-olds "for babies". https://www.nngroup.com/articles/childrens-websites-usability-issues/
- [guideline] Vertical scrolling below the fold is conceptually difficult for children. Horizontal movement through a film strip is easier. "All important interactive elements should be on screen upon initial load." Sesame 2012.
- [guideline] Preschoolers tend to hold a tablet in landscape. Sesame 2012.
- [measured] Working-memory capacity grows roughly linearly from age 4 to 15, and the adult structure appears by age 6. Gathercole et al. 2004: https://doi.org/10.1037/0012-1649.40.2.177. NN/g notes that children's smaller working memory demands self-explanatory screens: https://www.nngroup.com/articles/kids-cognition/
- [product] Seesaw gives younger learners a drag-and-drop format and Grades 3 to 5 multiple choice: https://help.seesaw.me/hc/en-us/articles/18122738209677-Formative-Assessment-student-experience
- [derived] No study found measures the best number of answer options for ages 3 to 7. The rule in the decisions section (2 to 3 options at ages 3 to 5, up to 4 at 6 to 8) comes from two inputs. One is working memory. The other is geometry: four 2 cm cards with 6 mm gaps fit comfortably in one row on a landscape iPad, and in a 2 x 2 grid on a 402 px phone.

---

## 2. Audio-first design for pre-readers

### When and how instructions play

- [guideline] Assume preschoolers cannot read. Deliver primary instructions both verbally and visually, because children do not attend to audio alone. Keep essential audio short, and put the action at the end of the sentence ("To give Elmo a crayon, tap on the X"). Make prompts that are not essential interruptible, especially on replay. If the child is inactive, give a short suggestion after 3 to 5 s in stories and 6 to 8 s in games. Freeze hot spots in stories until the page has been read. Sesame 2012.
- [measured] Children under 3 followed only a live adult model. Ability rose sharply between 3 and 3.5 years, after which children could follow in-app audio instructions and on-screen demonstrations. Children who understood the audio and hand-animation prompts averaged 4;3 and 4;2 years. Static visual cues alone failed at every age. Hiniker et al. 2015: https://doi.org/10.1145/2771839.2771851
- [guideline] TIDRC I21 says to pair audio prompts with visual support, and only 4% of 50 apps did. L27 says to give text an audio label, and only 36% did. https://doi.org/10.1145/3311927.3323149
- [product] In Khan Academy Kids, the guide character Kodi gives "instructions, helpful tips, encouragement", so that "students can navigate the app completely independently": https://khankids.zendesk.com/hc/en-us/articles/360041862972-All-about-Teacher-Tools-in-Khan-Academy-Kids
- [product] Seesaw lets teachers add voice or video instructions and voice labels to any content "to support pre-readers": https://help.seesaw.me/hc/en-us/articles/360047206692-Accessibility-and-Seesaw

### Word highlighting while reading aloud

- [measured] During shared reading, preschoolers rarely look at print. In one study only 5 to 6% of fixations landed on it (Justice et al. 2008: https://doi.org/10.1037/0012-1649.44.3.855), and in another fixations on text did not track how much text there was (Evans & Saint-Aubin 2005: https://doi.org/10.1111/j.1467-9280.2005.01636.x). Pointing to and tracking the print raised attention to it. Print referencing in a 30-week RCT (n = 550) had effects on reading, spelling and comprehension two years later. Piasta et al. 2012: https://doi.org/10.1111/j.1467-8624.2012.01754.x
- [measured] In an e-book with synchronised highlighting, 4- to 5-year-olds looked at the print for 38% of reading time against 19% without it, and print awareness improved after four weeks. _Computers & Education_ 2019: https://doi.org/10.1016/j.compedu.2019.103703
- [product] In Seesaw's Read-with-Me, the teacher records the passage and AI transcription syncs word-by-word highlighting. It highlights one word at a time, works in English and Spanish only, and limits each passage to 2 minutes: https://help.seesaw.me/hc/en-us/articles/40166304781837-How-to-use-the-Read-with-Me-tool. Duolingo ABC stories read aloud "highlighting each word spoken": https://apps.apple.com/us/app/learn-to-read-duolingo-abc/id1440502568
- [guideline] Parents prefer word-by-word highlighting, but give adults an option to turn it off so they can read at their own pace. Sesame 2012.

### Teacher's recorded voice against synthesised speech

- [measured] Children with normal and impaired language both understood DECtalk synthetic speech significantly worse than natural speech. Reynolds & Fucci 1998: https://doi.org/10.1044/jslhr.4102.458. DECtalk is old, but the direction holds.
- [measured] Preschoolers who heard an expressive voice concentrated more, retold the story more fully and identified more target words than those who heard a flat, TTS-like voice. Kory Westlund et al. 2017: https://doi.org/10.3389/fnhum.2017.00295
- [measured] Children recognise words better from familiar talkers. Children with weaker language do not generalise to unfamiliar voices. Levi 2015 (https://doi.org/10.1017/S0305000914000506); Levi et al. 2019 (https://doi.org/10.1044/2019_JSLHR-L-18-0160)
- [measured] Preschoolers selectively trust native-accented speakers. Kinzler et al. 2011: https://doi.org/10.1111/j.1467-7687.2010.00965.x
- [measured] For children who have specific reading difficulties, text-to-speech has a weighted average effect on comprehension of 0.35. This is a population of older children with reading disabilities. Wood et al. 2018: https://doi.org/10.1177/0022219416688170
- [product] On iPadOS, the system Arabic voices (Mariam, Laila, Tarik, Majed) are rated low to normal quality. Only Majed has a high-quality variant. Readium speech voice list: https://github.com/readium/speech (json/ar.json)
- [product] Seesaw's "Generate Voice" pre-generates narration into a stored audio file, previewed by the teacher, in every Seesaw Translation language including Arabic. It adds pronunciation guidance for Arabic, and Seesaw warns that output "can vary slightly between generations". https://help.seesaw.me/hc/en-us/articles/48437060986765-How-to-add-AI-generated-voice-to-Seesaw-Activities
- [guideline] Children and parents enjoy a "record your own voice" feature. Sesame 2012.
- The earlier research note also applies: unvowelled Arabic read by TTS is unsafe for young readers (docs/research/interactive-coursework.md, section 2.5).

### Autoplay restrictions

- [spec, measured from source] In WebKit on iOS and iPadOS, `speechSynthesis.speak()` silently returns without speaking unless it is called inside a user gesture. The first gesture-initiated `speak()` lifts the restriction for that document. https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/speech/SpeechSynthesis.cpp
- [spec, measured from source] An `AudioContext` starts restricted until it is resumed inside a gesture. https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/webaudio/AudioContext.cpp. A media element lifts its gesture restrictions after its first gesture-initiated play, through `removeBehaviorRestrictionsAfterFirstUserGesture`. https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/HTMLMediaElement.cpp
- [spec] On iOS, unmuted media cannot autoplay, and `play()` returns a rejected promise. https://webkit.org/blog/6784/new-video-policies-for-ios/
- [spec] Chrome allows autoplay with sound once the user has interacted with the domain. An `AudioContext` created before a gesture is "suspended" until `resume()` is called after a gesture (https://developer.chrome.com/blog/autoplay). Since Chrome 71, `speechSynthesis.speak()` "immediately fires an error" if the document has not received user activation (https://chromestatus.com/feature/5687444770914304).
- [product] On iPad, the Control Center mute bell silences Khan Kids: https://khankids.zendesk.com/hc/en-us/articles/360007053151-Why-can-t-I-hear-the-sound. A web page cannot detect this state.
- [derived] The practical rule follows. In a single-page app the document persists across routes, so one deliberate "Start" or "Hear it" tap at the start of a session unlocks every later instruction. Reuse a single unlocked audio element or AudioContext. Because a mute switch can silence the device, every audio cue needs a visual twin.

### Sound effects, music and mute

- [guideline] Children expect immediate feedback, and a sound on each registered touch tells them it registered. Correct-answer payoffs should have a sound effect plus light animation. Background music can raise engagement but must not compete with gameplay. Parents want to be able to turn off music, sound and hot spots. Sesame 2012.
- [measured] For 4- to 6-year-olds (RCT, n = 99), music and background sounds in digital books did not help story comprehension and lowered receptive vocabulary. Animated illustrations helped comprehension. Sarı et al. 2019: https://doi.org/10.1016/j.jecp.2018.11.006
- [official] UK DfE guidance for early years settings says to avoid "complex audio with lots of fast-talking characters or overlapping music and dialogue": https://help-for-early-years-providers.education.gov.uk/screen-use
- [guideline] TIDRC S10 says not to use background music with videos, and 80% of apps broke it. https://doi.org/10.1145/3311927.3323149

---

## 3. Feedback and motivation

### Right answers

- [guideline] Make payoffs reflect the concept and what the child chose ("Nice job choosing the letter A!"), with a sound effect and light animation. Sesame 2012.
- [product] Khan Academy Kids characters praise "what the child has done (e.g., 'You traced the letter D.')" rather than "Yay!", and its scripts follow a growth mindset. Children collect bugs, hats and toys for the characters as they complete lessons. https://khankids.zendesk.com/hc/en-us/articles/360049358751-Learn-more-about-the-characters-inside-Khan-Academy-Kids
- [measured] Positive verbal feedback raised intrinsic motivation overall (d = 0.33). In the seven studies with children the effect was not significant (d = 0.11), so praise is not a lever to pull hard. Deci, Koestner & Ryan 1999: https://doi.org/10.1037/0033-2909.125.6.627

### Wrong answers and retries

- [guideline] Treat a wrong answer as a learning moment with encouraging, incremental feedback, in three scaffolded levels:
  1. Name the choice as wrong and encourage ("That's not it. Try again!").
  2. Name it wrong, restate the goal, give a hint and encourage.
  3. Restate, give the hint, highlight the correct answer and ask the child to tap it, repeating until the child does. A struggling child may be moved on after a set time.
     Source: Sesame 2012.
- [product] Seesaw's Practice Mode gives a "Check Work" option with real-time hints and tracks attempts. Assessment Mode shows no correctness and holds results until the teacher approves them. https://help.seesaw.me/hc/en-us/articles/18122738209677-Formative-Assessment-student-experience
- [guideline] 3- to 5-year-olds cannot read subtle feedback and need exaggerated, explicit cues. From about age 6 children start to read subtle facial cues. https://www.nngroup.com/articles/kids-cognition/
- [derived] No study isolates a red X or a shake for young children. Sesame itself uses a red X for "No" in confirmation dialogs, so the icon is not taboo. The case against red-only marking rests on two other points. Colour vision deficiency affects about 1 in 12 men, mostly red-green (https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/color-blindness). And wrong-answer feedback is meant to be "encouraging". Today Farida shows a red `CircleX` for "not quite" (apps/web/src/components/learning/Checks.tsx).

### Rewards, celebrations and overjustification

- [measured] Preschoolers who expected an award spent 8.6% of later free time on the activity. Those given no award spent 16.7%, and those given an unexpected award 18.1%. Lepper, Greene & Nisbett 1973: https://doi.org/10.1037/h0035519
- [measured] Tangible rewards undermined children's free-choice motivation (d = -0.39, 57 studies), and expected rewards did too. Unexpected tangible rewards had no effect (d = 0.01). Deci, Koestner & Ryan 1999: https://doi.org/10.1037/0033-2909.125.6.627
- [measured] Fifth graders praised for intelligence chose performance goals, and almost 40% of them lied about their scores, against about 10% of those praised for effort. Mueller & Dweck 1998: https://doi.org/10.1037/0022-3514.75.1.33. Dweck's process-praise examples are at https://www.ascd.org/el/articles/the-perils-and-promises-of-praise
- [measured] Person praise ("You're so smart!") and inflated praise ("incredibly beautiful") backfire in children with low self-esteem. Brummelman et al. 2016: https://doi.org/10.1111/cdep.12171
- [measured] In apps used by 160 children aged 3 to 5, manipulative "lures" appeared in 45% of apps. These included tokens, rewards, candy, virtual toys and "hot item!" words. Parasocial pressure from characters appeared in 25%, and time pressure in 17%. Radesky et al. 2022: https://doi.org/10.1001/jamanetworkopen.2022.17641
- [guideline] TIDRC FM33 says to avoid heavy extrinsic rewards such as points (70% of apps complied). FM30 and FM31 recommend auditory, positive feedback. CI16 says to limit clickable items to their sole purpose with no extraneous animation, because children take an animation to be the item's whole function. https://doi.org/10.1145/3311927.3323149

### Animation, confetti and distraction

- [measured] Across 43 studies and 2,147 children, multimedia that matches the story (animation, music, sound) helped comprehension (g+ = 0.39). Interactive extras such as hotspots, games and dictionaries did not help, and hurt disadvantaged children. Takacs, Swart & Bus 2015: https://doi.org/10.3102/0034654314566989
- [measured] Motion that matches the narration guides 4- to 6-year-olds' eyes to the relevant parts of a picture. Takacs & Bus 2016: https://doi.org/10.3389/fpsyg.2016.01591
- [measured] Hirsh-Pasek et al. 2015 cite three findings on distraction. 3.5-year-olds' task performance suffered under any distraction, and 4-year-olds' under continuous distraction (Kannass & Colombo 2007). E-book "bells and whistles" distracted 3-year-olds (Parish-Morris et al. 2013). "Extraneous animations, sound effects, and tangential games" add appeal but not understanding. https://doi.org/10.1177/1529100615569721
- [measured] Kindergartners in a highly decorated classroom were more off task and learned less (Fisher, Godwin & Seltman 2014: https://doi.org/10.1177/0956797614533801). In real classrooms there was no habituation over 15 weeks (Godwin et al. 2022: https://doi.org/10.1111/cogs.13093).
- [measured] 6- to 8-year-olds learned to read bar graphs worse when the bars were made of countable pictures, because they counted the objects instead. Teachers preferred the decorated version. Kaminski & Sloutsky 2013: https://doi.org/10.1037/a0031040
- [official] UK DfE guidance calls for content that is "slow-paced, repetitive and predictable". It says to avoid content with "a lot of cuts, movement and flashing" and to avoid "activities which provide an automatic response without any effort on the part of the child". https://help-for-early-years-providers.education.gov.uk/screen-use

### Reduced motion

- [official] WCAG 2.3.3 (AAA): motion animation triggered by interaction can be disabled, using `prefers-reduced-motion`. Opacity and colour changes do not count as motion. This protects people with vestibular disorders. https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- [official] WCAG 2.2.2 (A) requires pause, stop or hide only for moving content that starts automatically, lasts more than 5 s and runs in parallel with other content. A celebration under 5 s falls outside it. https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html

---

## 4. Navigation and flow for children who cannot read

- [guideline] NN/g: children use an in-app back button when it is prominent, but young children do not use the browser's back button. They want instant gratification, prefer user control and are quick to leave. https://www.nngroup.com/articles/childrens-websites-usability-issues/
- [guideline] Keep a menu reachable at all times. Gate parent content behind a "baby gate". Use double tap only to prevent accidental navigation out of an activity. Design for how the experience ends and how the child replays. Help should come as dialogue in context, not text, with a How-To for adults. Sesame 2012.
- [guideline] At ages 6 to 8, bare numbers confuse children ("2" without its puppy icon), so tie quantities to pictures. https://www.nngroup.com/articles/kids-cognition/
- [product] Khan Academy Kids: students start the Learning Path by tapping "the big play button on The Kids' Club" (https://khankids.zendesk.com/hc/en-us/articles/360048828572-Learn-more-about-the-Learning-Path). Assigned lessons show a heart (https://khankids.zendesk.com/hc/en-us/articles/360046489851-Quick-start-guide-for-preschool-through-2nd-grade-teachers).
- [product] Seesaw: the student opens the Activities tab and sees "To Do" and "In Progress". They tap the green Start, tap the green Check when finished, and resume through "Finish Response". "If you accidentally close the app or browser, Seesaw saves a copy of your work on that device." https://help.seesaw.me/hc/en-us/articles/44437621768845-How-do-students-respond-to-an-Activity
- [product] Abjadiyat shows students "how many classroom and homework assignments they have completed and how many they have remaining" (https://apps.apple.com/ae/app/abjadiyat-%D8%A3%D8%A8%D8%AC%D8%AF%D9%8A%D8%A7%D8%AA/id1235509585). I Read Arabic gates games behind task completion ("unlock games after completing tasks"), which is the expected-reward pattern Lepper warns against (https://apps.apple.com/ae/app/i-read-arabic-fun-learning/id1078563088).
- [official] UK early years settings should not let children use screens "alone or with other children without adult co-engagement". Content should be "free of scrolling and autoplay features" so that children do not stay on longer than planned, and screen time at ages 2 to 5 should stay under 1 hour a day across home and setting. The EYFS statutory framework (dated 13 July 2026, effective 1 September 2026, para 3.94) makes this guidance something providers "must have regard to". https://help-for-early-years-providers.education.gov.uk/screen-use and https://www.gov.uk/government/publications/early-years-foundation-stage-framework--2
- [derived] I found no study comparing progress indicators (dots, bar, path) for pre-readers. The rules below follow NN/g's "numbers without context confuse" and Sesame's "indicate more".

---

## 5. Visual design

### Latin type for early readers

- [measured] The typical x-height in early readers is about 4 mm at age 5, falling to about 2 mm by age 11. Children aged 7 to 9 verified sentences 9% faster at a 5.0 mm x-height than at 4.2 mm, and keeping the type large raised measured reading age by 4 months. Sassoon Primary was read and searched more slowly than Verdana: visual search was 43% slower and passage time 45% longer. Wilkins et al. 2009: https://doi.org/10.1111/j.1467-9817.2009.01402.x
- [measured] Infant characters (single-storey a and g) made no difference to children's reading, and serif and sans read equally well. Recommended practice is word spacing "a little wider than for adult reading", ragged-right lines broken by sense, and line spacing visibly larger than word spacing. Walker et al. 2018: https://centaur.reading.ac.uk/78226/
- [measured] The Dyslexie font did not benefit reading in children with or without dyslexia. Kuster et al. 2018: https://pmc.ncbi.nlm.nih.gov/articles/PMC5934461/
- [guideline] Recommended minimum sizes are 14 pt for young children (NN/g, https://www.nngroup.com/articles/childrens-websites-usability-issues/) and 14 pt or 0.5 cm (TIDRC F7). Sesame recommends a sans serif close to Zaner-Bloser, the handwriting model US children are taught.
- [derived] Measured from the font files with HarfBuzz and fontTools, x-heights are: Andika 0.498 em, Lexend 0.525, Comic Neue 0.494, Atkinson Hyperlegible 0.496, Playpen Sans 0.546. Hitting a 4 mm x-height on the iPad (21 CSS px) needs Andika at about 42 px. A 3.3 mm x-height, Wilkins' 24 pt print size, needs about 34 px.

### Arabic

- [measured] Vowels (harakat) and context both helped word recognition for poor and skilled native Arabic readers. Abu-Rabia 1997: https://doi.org/10.1023/a:1025034220924. The earlier note also applies: wrong harakat are worse than none, and unvowelled text arrives around Grade 4 (docs/research/interactive-coursework.md, 2.5).
- [derived] Measured from the font files with HarfBuzz shaping of a fully vowelled sample sentence:
  - Vowelled ink span from highest mark to lowest descent: Noto Naskh Arabic 1.38 em, Baloo Bhaijaan 2 1.40, Cairo 1.39, Readex Pro 1.64, Scheherazade New 1.68, Amiri 1.72.
  - Height of the seen tooth, a proxy for Arabic body size: Noto Naskh 0.34 em, Amiri 0.29, Scheherazade New 0.28, Lateef 0.20, Readex Pro 0.44, Cairo 0.50.
  - So a naskh face needs roughly 1.3 to 1.5 times the Latin font size to look equally large. With full tashkeel it needs a line height of at least 1.8 (Noto Naskh) or 2.2 (Scheherazade, Amiri) so that marks do not collide between lines.
  - All of these fonts cover the 12 harakat and ship mark and mkmk positioning.
- [product] Arabic early-reading apps lean on read-aloud. I Read Arabic reads every book aloud and records the child reading (https://apps.apple.com/ae/app/i-read-arabic-fun-learning/id1078563088). Nahla wa Nahil is for ages 4 to 11 and was written by Arabic teachers (https://apps.apple.com/ae/app/nahla-wa-nahil/id1263102973). Abjadiyat covers ages 3 to 8 with teacher assignments (store link above).

### Colour, clutter and illustrations

- [guideline] Make interactive elements visually distinct, and make objects look touchable only when they are touchable. Pick a highlight colour distinct from the palette, such as bright yellow or neon green. Sesame 2012.
- [measured] In a content analysis of 100 recommended children's apps, 14% had missing or ineffective contrast and 78% did not make the game's goal clear. Crescenzi-Lanna & Grané 2016: https://doi.org/10.3916/C46-2016-08
- [measured] A picture congruent with the narration substantially improved 4- to 6-year-olds' retelling over an incongruent picture. Takacs & Bus 2018: https://doi.org/10.1016/j.jecp.2018.04.013
- [measured] Extraneous perceptual detail hurts learning at ages 6 to 8 (Kaminski & Sloutsky 2013, above). Decorated surroundings cost attention and do not habituate (Fisher 2014; Godwin 2022, above).

### Characters and mascots

- [measured] Pedagogical agents had a small but significant effect on learning (43 studies, n = 3,088), larger for K-12 than for adults. Schroeder, Adesope & Gilbert 2013: https://doi.org/10.2190/ec.49.1.a
- [measured] Toddlers learned a task better from a video of a socially meaningful character (Lauricella et al. 2011: https://doi.org/10.1080/15213269.2011.573465). Children's parasocial relationship with an intelligent character predicted quicker, more accurate maths responses (Calvert et al. 2019: https://doi.org/10.1111/cdev.13341).
- [guideline] TIDRC G3 recommends interactive on-screen characters (60% of apps had one). Radesky 2022 found characters used for parasocial pressure in 25% of apps. https://doi.org/10.1145/3311927.3323149 and https://doi.org/10.1001/jamanetworkopen.2022.17641
- [derived] The benefit comes from social meaning. In a school, the most socially meaningful figure the child knows is their own teacher. That argues for the teacher's voice and photo as the guide rather than an invented brand mascot. Any helper figure must never plead or pressure.

---

## 6. Sign-in for young children

- [product] Seesaw has four sign-in modes. "Class Code (Shared Devices)" is for PreK to Grade 3: the student scans a QR or text code, taps their name and confirms with a check mark. In this mode students "can add items to their journal and other journals in the class" and cannot save drafts. Seesaw's advice: if wrong-journal sign-in is a worry, do not post the QR poster, and have students come to the teacher to scan. On 1:1 devices students stay signed in up to a year. Home Learning Codes are individual QR or text codes for home, and "the Class Code should not be sent home". https://help.seesaw.me/hc/en-us/articles/203495019-Student-sign-in-modes
- [product] Khan Academy Kids: the device scans or types the class code. On shared devices the teacher picks "the whole class", which shows every child's avatar, and Khan recommends that teachers help students pick their name. Students never enter an email. https://khankids.zendesk.com/hc/en-us/articles/360042944271-FAQ-How-do-I-use-a-Class-Code-to-sign-in
- [product] ClassDojo: a class QR code plus "find your name", or individual QR codes and links. It recommends individual links, individual QR codes or Google login "for the most secure login option". https://help.classdojo.com/hc/en-us/articles/360018581572-How-Do-Student-Logins-Work and https://help.classdojo.com/hc/en-us/articles/360023120452-Student-Login-with-a-Class-QR-Code
- [product] Epic: class code, then the student selects their profile: https://support.getepic.com/hc/en-us/articles/115001263046-How-do-my-students-log-into-my-educator-classroom
- [product] Clever Badges are QR logins "voided each year to reduce cybersecurity risks". Teachers can generate backup codes for lost badges, and admins can void and regenerate them. Upper grades pair a badge with a 6-digit PIN. https://www.clever.com/products/badges
- [guideline] Sesame: young children are assisted at login by an adult. Logins should let children "recognize their own profile (such as their name and a unique icon)". Sesame 2012.
- [measured] In a study of graphical passwords with children aged 7 and up, children recalled passwords made of distinct object images best. The two 7-year-olds struggled with word-based tiles. No data exists for ages 3 to 5. Assal, Imran & Chiasson 2018: https://doi.org/10.1016/j.ijcci.2018.06.003
- [derived] The trade-off schools accept for PreK to Grade 3 on shared devices is a class code plus a name and photo picker. Any child in the room can pick a classmate's name. Vendors contain this by limiting what the shared mode can do and by keeping the class code physically in the classroom. Individual codes are reserved for home and 1:1 use.

---

## 7. Teacher side

- [product] Khan Academy Kids reports show score history per lesson, with percentages and "fractions [that] show how many skills have been mastered". Teachers can assign, edit and preview lessons from the report, and respond to a low Main score by assigning the Basic lesson. https://khankids.zendesk.com/hc/en-us/articles/4403614100109-Progress-reports-in-the-Khan-Academy-Kids-app
- [product] Seesaw admins pick a 4-star or 5-star grading scale per school or district: https://help.seesaw.me/hc/en-us/articles/26534090667277-Managing-Sitewide-Standards-and-Grading-Scales
- [official] The EYFS profile (England, end of Reception) has two judgements per Early Learning Goal: "expected" or "emerging". There is no "exceeding". Judgements are best fit from professional knowledge, and teachers "should not tick off these bullet points one by one". "Sources of written or photographic evidence are not required." https://www.gov.uk/government/publications/early-years-foundation-stage-profile-handbook
- [official] EYFS framework 2.2: "Assessment should not involve long breaks from interaction with children or require excessive paperwork." https://www.gov.uk/government/publications/early-years-foundation-stage-framework--2
- [official] DfE screen-use guidance: "Pre-reception assessments should not involve asking a child to do activities on a screen in order to determine their level of development but should be based on observation." https://help-for-early-years-providers.education.gov.uk/screen-use
- [derived] No vendor documents a "preview as child" mode in detail. Khan Kids previews from reports, and Seesaw documents the student experience in its help centre. In Farida the preview should be the same young-mode player, so the teacher hears the audio the child will hear.

---

## Decisions for Farida

Numbers assume the 11-inch iPad (1 mm = 5.2 CSS px) unless a phone is named. "3-5" is KG1 to KG2; "6-8" is Grade 1 to 2.

1. **One item per screen, no vertical scrolling.** In young mode a lesson plays as a paged presentation: one block per screen, all interactive parts visible on load at 1180 x 820 landscape and 820 x 1180 portrait. Overflow reflows; it never scrolls. Sources: NN/g usability issues; Sesame 2012; UK DfE "free of scrolling".
2. **Target sizes.**
   - For 3-5, every child-facing target is at least 20 mm, which is 104 px on the iPad and 121 px on an iPhone 17. That covers answer cards, the speaker, Next and Done.
   - For 6-8 the minimum is 15 mm, about 78 px. The current 76 px plan fits only this band.
   - Visible gaps between targets are at least 6 mm (32 px).
   - Today's 64 px rows and 44 px speaker are too small for both bands.
   - Sources: NN/g physical development; Vatavu 2015; Hourcade 2004 via Hourcade 2022.
3. **Forgiving hit testing.** Resolve a touch to the nearest target within 10 mm (52 px) of its edge when no other target is closer. Treat any press up to 5 s as a tap. Ignore second pointers. Suppress the callout and zoom with `-webkit-touch-callout: none` and `touch-action: manipulation`. Show the pressed state within 100 ms of pointerdown and commit on pointerup. Source: Vatavu 2015; Sesame 2012; WCAG 2.5.2; NN/g response times.
4. **No gesture is ever required beyond a single tap.** No long press, double tap, pinch or multi-touch, and no swipe as the only route (a swipe always pairs with an arrow). Long press and double tap stay reserved for guarding exit. Source: Nacher 2015; Vatavu 2015; Sesame 2012.
5. **Tap-then-place is the primary interaction for matching, ordering and sorting.** Drag is an optional extra: single finger, generous snap, partial completion accepted. Keep drag distance under 100 mm (520 px) and never punish a near-miss drop. Source: Joiner 1998 via Hourcade; NN/g; TIDRC TG43; WCAG 2.5.7.
6. **Choices per screen.** For 3-5, 2 or 3 options, with a maximum of 4 when options are pictures. For 6-8, up to 4 options and up to 6 sortable items. The editor warns past these counts in young lessons. Source: derived from Gathercole 2004, NN/g kids cognition, and the geometry in rule 2.
7. **Guard against holdovers.** After any screen change, ignore touches for 400 ms [derived]. Never put the next screen's answer under the Next button, which stays in a fixed spot. Source: Anthony 2013.
8. **Keep consequential controls off the bottom edge.** Exit, Back and Done sit at least 15 mm (78 px) above the bottom edge, where wrists rest. Exit needs a 1 s press-and-hold with a visible fill or a second confirm tap, never a single tap. Source: Sesame 2012 (screen edges, double tap only to prevent accidental navigation).
9. **Audio unlock and instruction playback.**
   - The session starts with one big "Start" tap that plays the first instruction and unlocks one shared audio element.
   - After that, each screen's instruction autoplays on open.
   - A speaker button (rule 2 size) sits in the same corner on every screen, at the start of the reading direction. It replays the instruction and the child can interrupt it.
   - After 7 s of inactivity, replay the instruction once and pulse the target area. After a second 7 s, pulse only. Never loop.
   - Children may answer while audio plays.
   - Sources: WebKit SpeechSynthesis.cpp and AudioContext.cpp; Chrome autoplay and chromestatus 5687444770914304; Sesame 2012 (6 to 8 s game time-outs, interruptibility); Hiniker 2015.
10. **Voice source, in this order.** Prefer the teacher's recorded voice. Next, pre-generated audio stored as a file and approved by the teacher at authoring time. Live `speechSynthesis` comes last, and never for Arabic without full harakat. Every recorded or generated clip is checked by the teacher before publishing. Source: Reynolds & Fucci 1998; Kory Westlund 2017; Levi 2015; Kinzler 2011; Seesaw Generate Voice; Readium voice list; earlier Arabic note.
11. **Synchronised word highlighting on read-aloud text.** Highlight one word at a time, driven by alignment timings stored with the clip, in a highlight colour distinct from the palette. Teachers can turn it off per lesson. Source: _Computers & Education_ 2019 (19% to 38% print attention); Justice 2008; Piasta 2012; Seesaw Read-with-Me; Sesame 2012.
12. **Sound.**
    - A soft tick on every accepted tap.
    - A short chime of 500 ms or less for a correct answer.
    - A soft neutral tone for a wrong answer, never a buzzer.
    - No background music, ever.
    - A per-class "sounds off" switch for teachers.
    - Every sound has a visual twin, because the device may be muted.
    - Sources: Sesame 2012; Sarı 2019; TIDRC S10; UK DfE; Khan Kids mute article.
13. **Wrong-answer ladder, Sesame's three levels.**
    - Try 1: dim the chosen option and keep it untappable. Say "Not that one. Try again."
    - Try 2: restate the prompt and give the authored hint.
    - Try 3: highlight the correct option and ask the child to tap it, and repeat until they do.
    - Record first-try correctness and the number of tries.
    - No red X in young mode: use a neutral mark plus sound plus the dimming.
    - Source: Sesame 2012; Khan Kids first-try celebration (earlier note); NEI colour vision.
14. **Right-answer feedback.** Spoken process praise that names the concept or the action, for example "You found the triangle" or "You put them in order", never "You're so smart" or "Amazing!!". A 1 s or shorter non-motion highlight (scale under 5% or a glow), then a Next arrow the child taps. No auto-advance. Write praise in pairs per locale, for example "وجدتَ المثلّث" and "رتّبتَها بالترتيب". Arabic second person is gendered (وجدتَ for a boy, وجدتِ for a girl), so each Arabic clip needs both forms, chosen from the student record. Source: Sesame 2012; Khan Kids "You traced the letter D"; Mueller & Dweck 1998; Brummelman 2016; Deci 1999.
15. **Celebrations: once per assignment, short, unannounced.** One end-of-assignment celebration of 2 s or less that does not cover content. No points, stars per item, streaks, collections, unlocks or "finish to earn" promises in young mode. Hide the `points` label that `CheckCard` shows today. Source: Lepper 1973; Deci 1999 (expected tangible rewards d = -0.39, unexpected d = 0.01); Radesky 2022; TIDRC FM33; product spec "no grade numbers".
16. **Motion budget.** Animation only where it carries meaning, such as showing where a tile goes. Nothing else moves while the child is choosing. Under `prefers-reduced-motion`, replace movement and confetti with a colour or opacity change and the sound. Nothing flashes more than 3 times a second. Source: Takacs 2015 and 2016; Hirsh-Pasek 2015; TIDRC CI16; WCAG 2.3.1, 2.3.3 and 2.2.2; UK DfE.
17. **Progress inside an activity.** A row of dots, one per item (8 or fewer items per young assignment), with the current dot enlarged and done dots filled. No "3/8" numerals for 3-5. The editor warns past 8 items in a young lesson to keep sessions short. Source: NN/g kids cognition; UK DfE (short periods, 1 h/day at 2-5); Sesame (indicate more).
18. **Done and resume.** The last screen is a big green check ("I'm done") that hands the work in, not a "Submit" text button. Each answer autosaves on the device and on the server. Reopening lands on the first unanswered item, and the home card reads "Continue". Source: Seesaw student flow (green Check, In Progress, local copy).
19. **Young student home.**
    - Big task cards in a grid of at most 6 per screen (3 x 2 landscape), unfinished work first.
    - Each card has a picture, a short title and a speaker that reads the title.
    - The Continue card is first.
    - No messages, grades or counters, and no auto-start of the next task after one ends.
    - Sources: product spec; Khan Kids big play button and heart for new work; Seesaw To Do and In Progress; UK DfE no autoplay.
20. **Sign-in on shared iPads.**
    - The teacher holds a class QR code and does not post it on the wall. Scanning shows a picker grid of the class's photos or avatars with names, at rule 2 sizes. The child taps their own face and confirms with a big check.
    - The device returns to the picker after the child taps Done or after 10 minutes idle [derived].
    - Home and 1:1 use need individual QR codes, rotated yearly and revocable by the teacher. A picture PIN is optional for Grades 1 and 2 only.
    - Sources: Seesaw sign-in modes; Khan Kids class code; ClassDojo; Clever Badges; Sesame 2012 (name plus unique icon); Assal 2018.
21. **Teacher preview is the real player.** "Preview as a child" opens the same young-mode player, with audio, highlighting and the wrong-answer ladder, under a teacher banner. Nothing is recorded. Source: derived; Khan Kids preview from reports.
22. **Early-years progress view for teachers.** Show each item as "first try", "with help" or "not yet", mapped to the ladder in rule 13. Do not show percentages to children. For EYFS classes, end-of-year judgements are teacher-entered "expected" or "emerging" per goal, never computed from screen tasks. Pre-reception screen activity is labelled practice, not assessment. Source: EYFS profile handbook; EYFS framework 2.2; DfE screen use; Khan Kids reports; Seesaw scales.
23. **Latin type.**
    - Andika for young mode: open licence, literacy-oriented, x-height 0.498 em.
    - 42 px for text the child must read in 3-5 lessons (x-height of about 4 mm) and 34 px for 6-8 (about 3.3 mm). Read-aloud-only prompts may be 28 px.
    - Line height 1.5, word spacing +0.1 em, start-aligned, never justified.
    - Sources: Wilkins 2009; Walker et al. 2018; Sesame 2012; Kuster 2018. The evidence is neutral on single-storey a, so Andika is chosen to match taught print letterforms, not for legibility.
24. **Arabic type.**
    - A naskh face for reading text: Noto Naskh Arabic, or Scheherazade New where stacked marks matter. Keep kufi and geometric faces (Cairo, Tajawal, Almarai) for UI labels.
    - Size is 1.3 times the Latin size, about 54 px for 3-5 reading text.
    - Line height at least 1.9 with full tashkeel in Noto Naskh, and 2.2 in Scheherazade New or Amiri.
    - Full harakat on all text a child reads up to Grade 2.
    - Sources: Abu-Rabia 1997; font measurements above; earlier Arabic note.
25. **Colour and pictures.**
    - Text contrast at least 4.5:1.
    - Right and wrong are never signalled by colour alone.
    - One highlight colour reserved for "touch here".
    - Plain backgrounds behind questions.
    - Option pictures show one object on a plain ground and match the spoken prompt.
    - Sources: NEI (1 in 12 men); Sesame 2012; Fisher 2014; Kaminski 2013; Takacs & Bus 2018; Crescenzi-Lanna & Grané 2016.
26. **No brand mascot.** Instead the teacher's photo and voice greet the child and give instructions. An optional neutral helper may appear only for hints and never pleads, counts down or withholds. Source: Lauricella 2011; Calvert 2019; Schroeder 2013; Radesky 2022.

---

## Gaps and unverified items

- No measured study found compares the number of answer options, progress-indicator styles, red X against neutral marks, or celebration length for ages 3 to 7. Rules 6, 13, 14, 15 and 17 rest on derived reasoning and are marked so.
- I could not read the following:
  - Duolingo ABC's, Lingokids', Endless Alphabet's, Teach Your Monster's, Starfall's, Homer's, ABCmouse's and Boom Cards' own docs on wrong-answer handling.
  - Google's QR-code student sign-in docs.
  - Apple's Shared iPad passcode options for young students.
  - Lamsa's teacher product beyond its store listing.
  - The Joan Ganz Cooney Center QuickStudy.
- Joiner et al. 1998 and Hourcade et al. 2004 were read as summarised in Hourcade 2022, not in the original papers.
- Fisher et al. 2014: only the abstract was verified, which gives the direction of the effect. The widely quoted off-task percentages were not.
- The holdover dead time (400 ms) and the 10-minute idle sign-out are engineering defaults, not evidence.
- The Sesame 2012 PDF has moved. The URL given is the original, and the text was read from an archived copy.
