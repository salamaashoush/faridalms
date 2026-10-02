# Classroom check-in

Children mark themselves in on the classroom's touch screen, by a badge's QR
code or by tapping a card, and the teacher confirms the register. A school
turns each way on in its attendance rules.

## What the research settled

- **Self check-in is an input; the teacher's confirmation is the register.**
  England's 2024 pupil registration regulations put the register's accuracy on
  the school. Studybugs, the closest product, has children tap their photo on
  the whiteboard and the teacher cross-check the tally. A check-in therefore
  writes a present mark that records how it came in. The register stays in
  progress until the teacher marks the rest and saves it, which records who
  confirmed it.
- **Photos on a shared screen.** Schools may use register photos, but
  families may object. A child without a photo, or whose family asked for
  none, shows their initials and first name. The order of the tiles changes
  daily, so a child finds their own name rather than a place.
- **Identity grows with age.**
  - Young children need no secret, since the teacher checks the tally.
  - Badges carry a personal secret; a class-wide code is never identity.
  - NFC cards carry the same badge link.
  - A tag's serial number proves nothing, so it is never used.
- **Platform support.**
  - Scanning uses `BarcodeDetector` where it reads QR codes, and the
    maintained ZXing polyfill elsewhere, as on iPad Safari.
  - Web NFC exists only in Chrome on Android; iPads cannot read NFC.
  - NFC is therefore always an extra, never the only way.
- **No biometrics.** Face recognition is disproportionate for attendance.

## Steps

1. School settings for touch, QR and NFC check-in.
2. A check-in screen opened from the register on the teacher's device: big
   tiles of photos and first names, a tap to check in and a short undo, and
   a grown-up question to leave it. Self check-ins show in the register.
3. QR: the same screen reads a badge held to the camera.
4. NFC: on Android, the screen reads a card holding the badge link, and the
   badge sheet writes it to the card when the badge is issued.
