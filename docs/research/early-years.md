# Early years: how Farida teaches children of three to seven

Researched 2026-10-02 for the early-years module (KG1 to Grade 2, IB PYP,
EYFS and Cambridge Early Years, American Pre-K to Grade 2, Arabic and
English). The evidence is in two reports beside this one:

- [early-years-ux.md](early-years-ux.md): touch, audio, feedback, motion,
  navigation, type, sign-in and the teacher side, ending in 26 design rules
  with numbers and sources.
- [early-years-activities.md](early-years-activities.md): which activities
  teachers of young children build (Wordwall and Seesaw samples, the four
  curricula), ranked, and which existing question kinds express them.

What follows is what Farida does with that evidence, and in what order.

## 1. What makes a children's lesson teach

Hirsh-Pasek and colleagues (Psychological Science in the Public Interest
16(1), 2015) name four pillars for apps that teach: minds-on activity,
engagement without distraction, meaningful content and social interaction.
Each shapes a rule here.

- **Minds-on, not tap-and-see.** Every interaction asks the child to decide
  something: choose, match, sort, order, count, trace. Nothing on a screen
  animates or makes a sound on a tap that does not answer something
  ("seductive details" in pop-up books and e-books lowered what 3-year-olds
  remembered, Parish-Morris 2013; Tare 2010).
- **Feedback that informs.** Rewards that carry information beat stickers
  (Alvarez and Booth 2014), praise names the effort or the action (Dweck),
  and expected rewards lowered intrinsic interest (Deci 1999, d = -0.39).
  So there are no points, streaks or collections for young children, and one
  short unannounced celebration at the end of a lesson.
- **The teacher's voice.** Digital phonics practice showed no effect on
  word reading overall (GraphoGame, 19 studies, g = -0.02) but g = 0.48 where
  adults took part (McTigue 2020). The teacher's recorded voice on every
  block, rather than a mascot or a synthetic voice, keeps the adult present.
- **Manipulatives connect to the idea.** Virtual manipulatives raised
  achievement by a moderate amount (d = 0.34, Moyer-Packenham and
  Westenskow 2012), when children are helped to connect the object to the
  mathematics (EEF, Improving Mathematics in the Early Years and KS1, 2020).
- **Finger tracing.** Preschoolers learned letter formation better with a
  finger on a tablet than with a stylus, and the tablet's instant feedback
  added nothing (Patchan and Puranik 2016). Start point and
  direction matter more than size (Development Matters).

## 2. Decisions

1. **Narration on every block and part.** A teacher records or uploads up to
   three minutes on any block, question, option, item, side of a pair or
   group name. It plays from a speaker beside it. The browser's own voice
   stands in only in young lessons, never for Arabic written without its
   vowels (diacritisers misread about one word in ten), and only where the
   device has a voice for the language. Recordings are AAC in MP4 where the
   browser can make it, since WebM plays on iPads only from iPadOS 17.4
   (caniuse).
2. **One screen at a time.** A young lesson plays full screen: each question
   with the words above it, a divider or continue gate starting a new
   screen. A Start tap unlocks sound on iPad and Chrome, then each screen
   reads itself as it opens and again after 7 s untouched (Sesame Workshop's
   6 to 8 s). A screen is laid out to fit 1180 x 820 without scrolling.
3. **Targets of 20 mm.** About 104 CSS px on an 11-inch iPad for cards, Next
   and the speaker on a question; arrows off the bottom edge, where wrists
   rest; leaving needs a second tap; taps in the first 400 ms of a screen are
   dropped (Vatavu 2015; Anthony 2013; NN/g).
4. **Tap, then place.** Matching, sorting and ordering are done by tapping a
   card and then its place, or by dragging it (WCAG 2.5.7). Five- and
   six-year-olds were faster and more accurate picking up and placing than
   dragging (Joiner 1998). Once every card has a place the answer is checked;
   right cards stay, the rest come back. Pictured parts work this way for
   older students too; text-only parts keep their lists and menus.
5. **A help ladder.** First miss: the card greys out and stays out of play.
   Second: the hint is said. Third: the answer lights up and the child taps
   it (Sesame Workshop 2012). Matching, sorting and ordering offer "Show me"
   after two tries. First-try correctness is recorded as before.
6. **Sound with a visual twin.** A soft tick on a tap, two rising notes for
   right, two soft falling ones for "not yet", drawn with Web Audio so
   nothing is licensed; never a buzzer, never music, and a mute switch.
7. **Type.** Text a child reads is set at 28 px and up, words on cards at
   36 px, and Arabic 1.3 times larger with line height 1.9.

## 3. Built

- Narration (76dbc5f), the screen-by-screen player (cb85a9d), tap-to-place
  boards (0b44e72), and the sizes, guards and help ladder above (2ca1682).
- Voice answers (6264efa), counting (dad0e28), tracing (9e18422), memory
  pairs (6438ed6), the word builder (d770b64), drawing and photo answers
  (d395bea), find-on-a-picture, and "tell me why" as a spoken question
  ready to place after any other.
- The young home (9bc5acd), QR sign-in badges (55a2885, a48de02), a
  guardian's hand-over at home (9738a3e), the teacher's first try, with help
  or not yet grid (6719cde), and the editor's advice for young lessons
  (d8ec4a9).

## 4. Next, in order

1. The starter library: an open picture set in the picture picker, activity
   templates, and StoryWeaver books as narrated read-along lessons.
