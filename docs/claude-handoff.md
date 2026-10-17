# Claude handoff: cornhole builder

The owner asked Codex to push the overnight improvements for you to pick up.
Review the existing PR and continue from the implemented work below.

The one-night Codex effort ended at the October 14, 2026, 7 a.m. Toronto cutoff.
Its automation is paused. The branch is pushed for review; no merge or production
deployment was made. This handoff is in the repository for Claude to pick up.

## Source to pick up

- Repository: https://github.com/bobbyvicks/cornhole-builder
- PR: https://github.com/bobbyvicks/cornhole-builder/pull/2
- Branch: `codex/overnight-ux`
- Tested implementation commit: `85377e7bb7eedd098695760e25a0c681c8cf9916`
- Integrated main through `06f7b0e1e28802473627ae772df31e753dd2a720`, including
  your second audit. Fetch again and preserve any newer work before integrating.
- Full implementation history and evidence: [overnight-improvements.md](overnight-improvements.md).

Fetch `origin`, inspect your working tree and the current PR diff, then review
on a branch. Preserve uncommitted work and concurrent changes. Use the owner's
existing instructions for merging and deployment; this handoff does not change
those release instructions. The artwork from PR #1 is already included in #2.

## Implemented and tested

- Integrated 24 original vector icons and six editable templates. The builder
  now browses 32 templates and 131 artwork items, with search, filters, result
  counts and a clear route into personalization on phones.
- Fit long personalized names within their template's original space, retain
  complete words and show fit warnings. Manual text adjustments stay manual.
- Save while typing, recover valid stored drafts and handle closed databases.
  The builder takes no click or key until the stored draft is read back
  (see the review fixes below); after six seconds it opens with a notice,
  keeps what is typed, and asks before a late result replaces it. Validate
  imports and images before replacement; cancellation and stale
  upload/import results preserve the draft.
- Keep image strings shared across undo states, retain originals and alpha,
  rasterize SVG logos at useful sizes and reduce opaque preview memory usage.
  A print master is sized to travel beside its preview in one order request
  (never more than 3 MB); see the review fixes below.
- Improve keyboard controls, mobile touch targets, sticky spacing, short-screen
  editing and pointer ownership. Cancelled gestures also restore saved geometry.
- Share a PNG preview with a native-share/download fallback. Print downloads
  use one frozen design and include 100 PPI physical-resolution metadata.
- Review the current artwork and remaining sample words before ordering. Keep
  customer inputs on retry, recheck asynchronous preparation, and fit large
  outgoing image payloads without changing the editable originals or prices.
- Explain unavailable ordering and offer an editable export. Contact fallback
  text accurately describes when notes are submitted; preview, print and project
  downloads have distinct explanations.
- Unchanged board/order navigation no longer saves a stale
  tab over a newer draft, and a tab that is behind another tab's save now
  says so (see "Two tabs" below). Pending-save typing and undo remain safe. Mobile save
  errors, stalled reads and unreadable drafts remain visible; completed recovery
  updates the screen-reader announcement.
- Latest increment: returning from checkout verifies the stored order status
  before confirming payment. Pending, missing and unavailable lookups retain
  the code and offer a GET-only retry, with an eight-second timeout. Both return
  URLs defer to validated server data; keyboard retry keeps focus and delayed
  updates leave newer design edits alone. No receipt or no-charge claim is
  inferred from the URL.

## Review fixes on this branch

A review of the PR against main found defects that are fixed in the commit
after `c41128b`, each with a regression spec:

- The startup gate is back: `body.loading` and the `inert` attribute on the
  panel, stage and phone bar until the stored draft is read (a click or a
  key during the read could silently write the default design over it).
  After six seconds the builder opens with the "still checking" notice and
  keeps what is typed; a draft found later is offered with a confirm, as
  main did, and `history[0]` holds whichever design was not kept so Undo
  reaches it. The late-path specs in `tests/startup-recovery.spec.js` and
  `tests/gesture-merge.spec.js` now wait for that notice before editing.
- Print masters are sized to fit beside their preview in one order request
  (`PAYLOAD_BYTES` less the preview and a 200,000-character margin, capped
  at `ORIG_BYTES`), so ordinary 2.4-3 MB phone JPEGs again ship with the
  order instead of degrading to the preview. A detailed PNG whose master
  could never be sent keeps only its preview. The review and receipt no
  longer promise an email follow-up for files left out (none exists); they
  say the full-size files must be supplied separately.
- A failed, stalled or unreadable save notice stays on screen while the next
  keystrokes retry (`save`/`saveSoon` no longer swap it for "Saving…"), so on
  a phone the field being typed in does not move; `setSaveState` ignores a
  repeat of the same state, so nothing is re-announced.
- `#fitstatus`, `#templateresults` and `#clipresults` are rewritten only when
  their words change, so a screen reader does not hear the sentence again on
  every keystroke.
- The search fields are named by their visible labels ("Find a design",
  "Find artwork"); the redundant `aria-label`s are gone.
- Removing a list row with its own x moves the focus to the Select button of
  the row now in its place (never to another row's x), the refocus selector
  escapes the row id (a project file can hold any character), keyboard
  nudges and Duplicate stop at the same -4..28 / -4..52 inches as a drag
  (the server refuses further), the Occasion filter is 16 px and 44 px tall,
  and the clip-art Flip toggle is a 44 px target.
- Saving builds the record with `copyHistoryState` instead of serialising
  and re-parsing the whole design (hundreds of milliseconds per edit with
  photos on a phone). The one write per commit remains: the specs rely on a
  history entry and an immediate write per nudge, so a debounce was not
  added. Template and clip-art cards are built once, searches show the
  matching cards, thumbnails are drawn when they come into view, and
  `loadingdone` redraws only thumbnails already drawn.
- `test/price.test.mjs` now enumerates all 480 option combinations;
  `tests/share-preview.spec.js` pins the 664 x 700 image and checks that
  nothing but the boards and captions is drawn.

Verified for that commit: 69 node tests, the TypeScript check, and focused
Chromium runs of every spec file touched or affected (designer,
startup-recovery, gesture-merge, save-notice, personalization, art-browsing,
selection-recovery, image-quality, order-assets, share-preview,
creative-pack, mobile-accessibility, storage-integrity, text-fitting,
template-navigation, art-navigation, noop-saving, history-memory,
image-upload, input-ownership, image-merge, order-preflight,
integration-order, order-eight-pictures, project-import, image-recovery,
output-consistency, print-resolution, copy-limits, mobile-board-switch,
order-accessibility, order-unavailable) pass. One spec fails on this branch
before and after the fixes in the Linux Chromium used here:
`mobile-accessibility.spec.js` "the template choices have readable previews
and the bottom action leaves room for the page" (265.6 px of room against
the 300.3 px it asks for at 320 x 740); it was not changed in that commit.
The commit after it (`3e45aee`) shrinks the template cards and the bottom
bar's caption below 360 px, and that spec passes since. The full suite was
not run for the fix commits; run `npm test` before merging.

## Second review round

A review of the fix commit found five further defects, fixed in the commit
after `3e45aee`, each with a regression spec:

- A late result declined while the very first edit was a drag of the default
  words left the saved design with no way back: nothing had been recorded,
  the saved design took `history[0]`, and a cancelled touch rolled the drag
  back without recording anything, so Undo stayed disabled and the next
  reload lost the saved design. A cancelled gesture now goes through
  `commit` (a no-op save in every other case, so an ordinary cancelled touch
  still adds no Undo step), and the late-read code records an edit still in
  progress whenever it differs from the last history entry, not only when
  the history holds one entry. That also keeps typing done on top of a
  committed edit one Undo away when the found project is accepted, and the
  entry that only kept the untouched default in place is pushed only when
  the found project is declined, so accepting after an order-only edit no
  longer leaves an Undo step that changes nothing.
- `#savealert`, the live region for the save notices, sat inside the panel
  that is inert while the saved project is read back. The "could not be
  read" and "still checking" notices are written in the same task as the
  gate opens, so the region entered the accessibility tree with its text
  already in place, which screen readers do not announce. It now sits just
  before `.builder`, outside every inert region.
- The clip-art Flip toggle had joined the `.toggles label, .warn label`
  rule through a `:has()` selector; a browser without `:has()` drops a
  selector list whole, which took the other toggles' 44 px targets with it.
  The Flip label carries a `toggle` class instead and the rule uses no
  `:has()`.

Verified for that commit: 69 node tests, the TypeScript check, and focused
Chromium runs of `designer`, `startup-recovery`, `gesture-merge`,
`save-notice` and `mobile-accessibility` (all passing, including the
template-card spec above).

## Review of PR #3 (minimal interface)

A review of the merge of `codex/minimal-interface` found two defects, fixed
in the commit after `6af9752`, each with a regression spec:

- The cancelled return link showed the pending copy ("check the status
  again before starting another payment"), but that row never leaves
  `pending`: the webhook moves an order on only for a completed payment.
  With the old pay-again note removed, nothing said how to pay. A cancelled
  return whose order is still pending now says payment was not completed,
  and to open the Order tab, review and continue to payment again, which
  places a new order with a new code. It claims nothing about a charge, and
  a successful return that is still pending keeps the check-again copy.
- The header "How it works" link landed on the closed disclosure. Following
  it, or loading `#how`, now opens the steps.

Verified for that commit: 69 node tests, the TypeScript check, and focused
Chromium runs of `designer` and `order-outcome` (all passing). The new specs
fail on `6af9752`.

## Two tabs

Two tabs on one device share the single saved record in `lib/store.mjs`,
and the last save still wins; there is no merge. What changed is that the
tab whose screen is out of date is told:

- Each page load makes a random token (`TAB` in `app.mjs`), kept in
  sessionStorage as `cornhole.tab` and made fresh at every load, so a
  duplicated tab, which starts with a copy of its source tab's
  sessionStorage, never shares it. The saved record carries it as `tab`;
  the exported project file does not.
- After every successful save the tab posts `{tab, savedAt}` on the
  BroadcastChannel `cornhole.project`. Without BroadcastChannel it writes
  the same note to localStorage (`cornhole.saved`) and the other tabs hear
  it through the storage event.
- A tab that hears of a save newer than the one it read or wrote itself
  moves to the save state `elsewhere`: "This project was changed in another
  tab. Reload to see the latest; your next change here replaces it." with a
  Reload button (`#reloadlatest`) beside it. It is announced once through
  `#savealert`, it is one of `NOTICE_STATES` (so it stays while typing and
  shows in the pinned toolbar on a phone, as the CSS rule beside it does),
  and a tab that cannot save keeps its error notice instead. The tab's next
  successful save puts the status back to "Saved on this device", and the
  other tab is then the one told. Unchanged navigation still writes nothing
  and keeps the notice up.
- Where the toolbar under the boards is not pinned in view - a wide
  screen, where at the top of the page the stage runs below the fold, or
  a phone no more than 620 px tall, where the board scrolls away - the
  notice and a Reload of its own (`#tabreload`) sit in `#tabnotice`, a
  line under the tabs: pinned under the header on its own on a wide
  screen, pinned with the tabs (`.tabband`) on a short phone. The toolbar
  and the Start pane leave that notice out there, so one Reload shows at
  a time, and the scroll padding makes room for the line while it is up.
- A save another tab made while this one was still reading its project is
  checked when the read finishes; a page back from the back-forward cache
  reads the saved record and compares its `tab` and `savedAt`.

`tests/two-tabs.spec.js` drives two pages in one browser context over the
real IndexedDB: the notice and its single announcement, Reload showing the
other tab's design, an edit in the out-of-date tab winning and the other
tab then told, the storage-event fallback, the back-forward cache check,
the phone layout at 320, 375 and 390 px, and the line under the tabs at
1280 x 900, 320 x 568 and 375 x 420 (in view on every tab with a field
focused and at the foot of the pane). The stale-tab specs in
`tests/noop-saving.spec.js` now expect that notice in the stale tab where
they used to wait for "Saved".

Verified for that commit: 71 node tests, the TypeScript check, and the
whole Chromium suite (330 specs) pass.

## Review of Fill the board and two tabs

A review of the Fill the board and two-tabs commits raised five
findings, two of them the same defect. All are fixed in the commit after
`3cfdf18`, the three in the code each with a spec:

- With a picture filling the board, a swipe on the board on a phone
  picked the picture, switched to the Art tab, and from then on the board
  took every touch (`grabbable`, `touch-action: none`) though the picture
  is never dragged, so swipes on the board stopped scrolling the page and
  no tap could clear it. A filling picture no longer makes the board
  grabbable, and it is picked when the finger lifts within `TAP_SLOP`
  pixels of where it landed, not as it lands: a swipe that starts on it
  scrolls the page and leaves the selection and the open tab alone. A tap
  or a click still picks it and opens the Art tab, and the words on it
  are picked as before.
- The other-tab notice and Reload were off screen while editing at
  1280 x 900 (below the fold at the top of the page) and on phones short
  enough for the board to scroll away; see the `#tabnotice` bullet under
  "Two tabs".
- The print-size note for a filling picture told people to use a bigger
  file, but none can help: covering the board at 100 dots per inch takes
  2400 x 4800 pixels and the page keeps at most 4000 on the long side, so
  a filling picture prints at about 83 at best. Its note now ends
  "Untick Fill the board to print it at its own size." Ordinary pictures
  keep their wording; the dpi thresholds are unchanged.
- The comments on the words cleaning (`cleanWords` in `app.mjs`, the
  `words` check in `api/order.ts`) said a carriage return becomes a
  space; the code turns it, alone or before a line feed, into a line
  break, and only other control characters into spaces. The comments now
  say so; no code changed.

Verified for that commit: 71 node tests, the TypeScript check, and the
whole Chromium suite (335 specs) pass.

## Continue to payment: one tap, one order

From the customer-journey audits (a team set on a phone, keyboard and
screen reader at 1280 x 900), fixed in the commit after `3db8574`:

- An order the server answers without a payment page (no Stripe key, or
  Checkout failed to open) is placed and will be invoiced, yet the button
  came back as "Continue to payment" and a second tap placed a second
  order, replacing the first code on screen. The reviewed revision of a
  placed order is kept as `placedRevision`: `#checkout` is hidden while
  the current review matches it (set in `showOrderStep`), the submit
  handler turns a matching submit away (Enter in a field still submits
  through the hidden button), and the code stays in `#orderstatus`, which
  takes the focus the button had. Changing the design or the options
  sends the customer through Review as before, and the button is back for
  that new order. The gift note and the address are not part of the
  revision, so changing only those does not reopen it.
- The button is held from the tap until the answer with `aria-disabled`
  and `orderSubmitting` instead of the `disabled` property, which dropped
  keyboard focus to the page. With a payment URL it stays held while the
  browser opens the payment page (`payingCode`); a return through the
  back-forward cache releases it and says the payment for that code is
  not confirmed and that paying again places a new order, as the
  cancelled-payment return does. A navigation stopped before the payment
  page arrives leaves the button held until a reload.
- `status()` brings `#orderstatus` into view as it writes (`block:
  'nearest'`), and `#saveunsubmitted` with it when ordering is not
  switched on: both were below the fold at 1280 x 900.
- Download print file and Share preview use the same `aria-disabled` and
  flag pattern (`busyButton`), so the focus stays on them while they work.

`tests/checkout-result.spec.js` covers the invoice answer (requestSubmit
and Enter in ZIP send nothing more, an unchanged review keeps it placed, a
changed option makes a new order), the held 503 at 1280 x 900 and
390 x 844 (focus on the button, answer and Save editable copy in view and
not under the pinned board), the payment hand-off and its back-forward
return, and the focus on the two output buttons. No existing spec
changed.

Verified for that commit: 71 node tests, the TypeScript check, and the
whole Chromium suite (340 specs) pass.

## New items in an ink that shows

From the customer-journey audits (visual polish at 390 x 844, a team
set on a phone and a tablet), fixed in the commit after `7682e74`:

- The Add text button gave off-white words on every base but wood, and
  new clip art switched to charcoal only for four exact lowercase hex
  values, so on Wedding (ivory) the new words were a dashed box with
  nothing in it (1.05:1) and the Heart on Garden vows (`#F6F1E5`) did
  not show at all (1.03:1); Engagement, Baby shower, Brewery and Winter
  were 1.4 to 2.2:1. On The cabin's walnut every new item was charcoal,
  at 1.1:1.
- `defaultInk(board, el)` in `app.mjs` now picks charcoal (`#36393b`)
  or off-white (`#f5f5f0`) from the board where the new item lands: it
  draws the base, the pattern and a picture filling the board (not the
  hole, and not the other items) at 4 pixels per inch, reads the patch
  under the item's box, and takes the ink with the higher contrast at
  the tenth percentile of that patch, so grain lines, a thin border or
  an anti-aliased edge do not decide it. Off-white wins a tie. Add text
  and `addClip` use it whenever no colour is passed in; the creative
  pack spec and the others that pass a colour keep theirs. Pictures are
  unchanged.
- The triage suggested comparing against the base colour alone (the
  lower of the two contrasts for a fade, the stain colour for wood).
  That would have put charcoal on Lake days, whose lower half, where new
  items land, is a deep teal pattern (1.3:1); reading the spot handles
  that, a fade at the height of the item, and a light picture filling a
  dark board. A stripe pattern under the item still leaves half of it on
  the weaker colour whichever ink is taken.
- Where new items land is unchanged (12 in across, 36 in down), so on a
  board with something already there they still sit on top of it; that
  is a separate item.

`tests/new-item-ink.spec.js` applies Wedding, Monogram, Engagement,
Baby shower, Garden, Garden vows, Lake days, Brewery and Winter, presses
the Add text button and taps the Heart in the Art tab: each comes in an
ink at least 3:1 against the bare board under it, the words add hundreds
of pixels of that ink to the preview, and the middle of the Heart is its
colour, not the board's. It also checks off-white on the default navy
board, off-white on the walnut cabin and charcoal on the natural-wood
rustic board, both ends of a fade, a light picture filling a navy
board, and a colour passed to `addClip` being kept. No existing spec
changed.

Verified for that commit: 71 node tests, the TypeScript check, and the
whole Chromium suite (353 specs) pass.

## Sample words: the untouched ones, selected when tapped

From the customer-journey audits (a team set on a phone and a tablet,
a first-timer's wedding at 390 x 844, keyboard and screen reader),
fixed in the commit after `117c138`:

- Every text of every template counted as sample words, matched on the
  words alone, so a customer who started blank and typed EST. 2026 (the
  Team template's line, and a team founded this year) was told these
  were a template's sample words and could not continue until they
  ticked "Print these words exactly as they are". EST. 2018, EST. 2015
  and any other line a template happens to use did the same.
  `isSampleText(el)` in `app.mjs` now decides: the page's placeholders
  (YOUR TEAM, NEW TEXT, YOUR NAME, YOUR WORDS) are a sample whoever
  typed them; a template's words are a sample only on a text whose
  `fitReference.text` (set by `applyTemplate`) is those same words, so
  only while they are unchanged on a text the template put there. A
  copy of such a text is still a sample until it is typed over;
  another template's words typed over one are the customer's.
  `sampleWordsIn()` uses it, so the review and `#samplewarn` follow.
- Only the first words of a template arrived selected: a tap on SMITH
  or the date in the Text list put the caret at the end, and 18 of 71
  keystrokes in the wedding journey went on deleting them. A list
  field or `#ttext` that takes the focus while its words pass
  `isSampleText` now selects them (`selectSampleOnFocus`), a moment
  after the focus arrives, so a tap or a click that goes on to place the
  caret, as some browsers do, does not undo it. A key pressed first
  wins, and a field `syncLists` gives the focus back to after building
  the rows again keeps the caret it had (`restoringFocus`). Words the
  customer has changed are not selected again. In the Chromium used
  here a selection made at once survives the click and the tap too;
  the wait is for other engines and was not checked on a real iPhone.
- Each list field was named "Words: " and the template's words (from
  `fitReference.text`), so after typing Sam & Alex over Mr & Mrs a
  screen reader still heard "Words: Mr & Mrs". The fields are named by
  their place, "Words 1", "Words 2" and so on; a change of order or a
  removal builds the rows again, so the numbers stay right. The triage
  suggested "Words, line 1", but one text can hold several lines
  (Enter starts a new one), so "line" would mislead.
- The Help text now says to tap a template's words and type to replace
  them.
- Limits: a design saved before templates set `fitReference` has no
  mark on its template words, so they are no longer flagged. A
  customer's own text that is given a `fitReference` by Auto-fit or
  Fit this line while it reads exactly like a template's line is
  flagged again, since the mark cannot tell the two apart.

`tests/sample-words.spec.js` starts blank and types EST. 2026 (the
review is clear and Continue is enabled, also after a reload), holds
the untouched Team template for YOUR TEAM and EST. 2026, lists SMITH
and the date but not the new words on Wedding with the first line
replaced, checks a typed-back template line, a duplicated line and
another template's words on a template line, the field names by place
before and after a removal, a slow mouse click, Tab, the `#ttext`
field and a rebuilt list keeping its caret at 1280 x 900, and at
390 x 844 with touch a tap on SMITH selecting 0 to 5, JONES replacing
it in the field and on the board, and a second tap leaving a caret.
The existing NEW TEXT and YOUR TEAM specs in `designer.spec.js`,
`multiline-text.spec.js` and `order-preflight.spec.js` are unchanged.

Verified for that commit: 71 node tests, the TypeScript check, and the
whole Chromium suite (361 specs) pass.

## Review: words and art that will hardly show

From the customer-journey audits (a first-timer's wedding at 390 x 844,
visual polish, a team set), fixed in the commit after `c618885`:

- A board colour picked by hand could leave every line of words as dark
  as the board: Wedding on navy put the burgundy names at 1.17:1 and the
  charcoal SMITH and date at 1.15:1, and Board B in burgundy put "Emma &
  James" at 1.00:1. The review checked only for sample words and let the
  customer carry on. Auto-fit could also take a long surname to 23% of
  its size (Fairweather-Worthington at 0.57") and say nothing there.
- `readabilityIssues(keys, source)` in `app.mjs` runs in `renderReview`
  once the board previews are ready, and `#readwarn`, beside `#reswarn`,
  holds one line per item: '"Mr & Mrs" on Board B will hardly show
  against what is behind it.' or '"Fairweather-Worthington" on your board
  was shrunk to fit and will print very small (0.6 in).' ("your board"
  when there is one design). It warns; Continue is not held. The Help
  text under Text says to pick colours that stand apart from the board.
- How it reads: each board in `boardKeys()` is drawn at 8 pixels per
  inch, an item at a time in layer order (the base, the pattern, a
  picture filling the board, then the items), so each text and clip art
  is compared with what is really under it. The item is also drawn alone;
  over its own ink (alpha above 128, not in the hole, which is cut out) a
  spot is lost when the item's colour is under 1.35:1 from the board
  there, the CIELAB a*b* distance between the two scaled by their mean
  lightness (x L/100) is under 30, and its outline, if it has one, is
  under 3:1. An item with 80% of its ink lost is named. Pictures are not
  checked. A text with Auto-fit and a `fitReference` below 0.6 of the
  reference size (and, since the review of tonight's audits below,
  under 1 in) is named for its size, unless it is already named as
  hidden. The live hit boxes, `curPpi` and `printing` are put back after,
  as `renderOutput` does. A template's board takes a few milliseconds.
- Where this differs from the triage: it proposed the contrast ratio
  alone. That called the gold sun of the Lake and beach template hidden
  (1.04 to 1.15:1 against the sky at its height, and plain to see), and
  would have named red words on a forest green board (1.15:1) or an
  orange ball on sky blue (1.11:1) too. The colour gap keeps those (47,
  73, the sun 77 to 81) and still names burgundy (18), charcoal (14),
  purple (5) or hunter green (23) on navy, and green on teal (19).
  Yellow on white (1.28:1, gap 70) is not named. It reads at 8 pixels
  per inch rather than the 4 suggested, so a 1.1" line still has ink to
  read, and it says "will hardly show against what is behind it" rather
  than "is the same colour as", since burgundy on navy is not.
- The Business template's LOGO was charcoal on the charcoal board, in the
  badge's open middle, and the review listed it as sample words though
  nothing showed. It is antique gold (`#d8b25c`) in `lib/templates.mjs`.
  A design saved from the old Business template no longer counts as the
  untouched template, so a template click asks before replacing it.
- Limits: a difference of hue is judged for full colour vision, so red
  on green is not named though some colour-blind viewers would lose it.
  Only the colour of the item is compared, so a shadow does not save
  words that are lost, and an outline is judged by contrast alone. An
  item half on a pattern band of its own colour (the Nautical disc on
  its stripes) is not named.

`tests/readability.spec.js` reviews all 32 templates as they come (each
clear, Continue enabled once the sample words are confirmed, LOGO gold),
Wedding on navy (Mr & Mrs, SMITH and the date named, one line each, no
artwork, Continue enabled once the sample words are confirmed, clear
again on ivory), Board B painted the colour of its first words (named
for Board B only), SMITHS left alone and Fairweather-Worthington named
with its size, red on green and orange on sky blue left alone while
burgundy and purple on navy, green on teal and white on white are named
and an outline saves white on white, words read against a picture
filling the board rather than the paint, the hit boxes the same after
the check, and the warning at 320, 375 and 390 px wrapping a long
unbroken name with no sideways scroll. No existing spec changed.

Verified for that commit: 71 node tests, the TypeScript check, and the
whole Chromium suite (371 specs) pass.

## Checkout on phones: the board scrolls away, the review is bigger and lists the words

From the customer-journey audits (a first-timer's wedding at 390 x 844,
visual polish at 375 x 667 and 768 x 1024, a team set), fixed in the
commit after `80ef826`:

- At 940 px and below the editing stage stayed pinned through the
  review and the address form: y 60 to 418 of 844, 47% of a 375 x 667
  screen, with the selected words' handles, a red x, Undo and Start
  over above the Name field. `body.ordering .stage` is now
  `position: relative` there, so the board scrolls away with the page
  on the Order tab (Options, Review and Your details). `showTab` now
  sets the scroll padding at once (`syncScrollPadding`) rather than at
  the next paint: Chromium picks the element it keeps steady from the
  part of the screen the padding leaves, so a padding still sized for
  the pinned board made the review list that element, and the review
  boards drawn above it pushed the focused heading off the top (with
  reduced motion; a smooth scroll hid it). The typing shrink of the
  board is left out while ordering: the board is not in view to make
  room for, and shrinking it would move the field being typed in.
- On the Order tab, at any width, `paint` draws no selection outline
  and no handles (`showsSelection`); `selected` is left alone, so
  editing goes on where it was. The handles that are not drawn cannot
  be hit either: the pointer handler checks whether they showed when
  the finger came down, since a tap where the red x would be otherwise
  removed the words unseen. The board is not grabbable then, so a
  swipe on it scrolls. A board with the keyboard focus still outlines
  its selection, since the arrows and Delete act on it; focus and blur
  redraw the board.
- The review boards were 76 x 152 px, so the names on them were about
  8 px tall. On phones each review figure is now up to 160 px wide
  (`flex: 0 1 160px`, the image at 100% and `aspect-ratio: 1 / 2`):
  160 px for one board, and for two boards 160 px at 390, 153 at 375
  and 125 at 320, without sideways scroll. The pictures are drawn at
  12 pixels per inch rather than 8, so they stay sharp at that size.
  The desktop size is unchanged.
- The review listed every option but no words, so WILDKATS on one
  board and WILDCATS on the other went through. `#reviewlist` now has
  a "Words" row, or "Board A words" and "Board B words" when the two
  boards differ: each board's texts in layer order (the Text list's
  order), joined with " · ", a line break shown as " / ", empty texts
  left out, or "None". A long value wraps under itself at the right
  (`overflow-wrap: anywhere`) and the label keeps its width.
- The review's price note said "Bags are not included: add them
  above.", but the bags are on the Options step. `priceNote(q,
  { review: true })` says "add them under Options."; the Options step
  keeps "above", where they are.
- With the toolbar under the board scrolling away while ordering, the
  other-tab notice and its Reload go to the line under the tabs
  (`#tabnotice`), pinned under the header as on a wide screen, and the
  toolbar leaves that notice out, so it stays in view through the
  review and the address. The other save notices stay in the toolbar,
  as they do on a short phone.
- Where this differs from the triage: it proposed `width: min(42vw,
  160px)` on the images, which overflows with two boards at 375 and
  320 px (2 x 157 + 12 against about 317 px, and 2 x 134 + 12 against
  262); a shrinking figure keeps 160 px where it fits. It proposed
  hiding the handles only; the outline goes too, the hidden handles
  are not hit, and a focused board keeps its selection, for the
  reasons above. The scroll padding set at once, the notice, the
  typing shrink and the sharper review pictures were not in it.
- Not done: tapping a review board to see it full size, marking the
  lines that differ between the two boards, and a link from "under
  Options" to that step. Limits: a swipe that starts on a word on the
  board still picks it and opens the Text tab, as it did with the board
  pinned.

`tests/checkout-phone.spec.js`, at 390 x 844 and 375 x 667 with touch:
Wedding, Review order in the bar at the foot, the review heading
focused and in view once its boards are drawn (reduced motion), the
stage not sticky, the words still selected and the board the same as
one drawn with nothing selected, a tap where the red x would be
removing nothing, the review
board at least 150 px wide and twice as tall, the Words row, the note
saying "under Options" and not "above", then Your details with Name
focused in view and not under the stage, no sideways scroll, and back
to editing the stage pinned and the selection drawn again. Two
different boards with SMITH changed to SMYTHE on Board A list both
boards' words in rows of their own, both pictures at least 150 px. A
save in another tab during the review shows the notice and a 44 px
Reload in view at the foot of the review and with Name focused. At
320, 375 and 390 px a long unbroken name wraps in its row; line breaks
show as slashes, empty texts are left out and a board with no words
says None; at 1280 x 900 the stage stays sticky, the review boards are
76 x 152, the Options note still says "above", and the selection shows
only while the board has the keyboard focus. No existing spec changed.

Verified for that commit: 71 node tests, the TypeScript check, and the
whole Chromium suite (382 specs) pass.

## Two boards on a phone: opposite colours up front, the changed board in view

From the customer-journey audits (a first-timer's wedding at 390 x 844,
a team set at 360 x 780 and 820 x 1180), fixed in the commit after
`70dfbed`:

- `#boardactions` showed only once the boards were split, so with
  matching boards, where every template starts, the classic
  opposite-colours set could not be found. For a set with matching
  boards the row now shows `#swapcolours` alone (since the review of
  tonight's audits below, only where the board has two colours to
  switch, and first in the row), reading "Make Board B the opposite
  colours": the tap writes `oppositeColours(design.a)` to B and splits
  the pair (`replaceOther`). Copy (`#copyother`) shows once
  the boards are split, since before that there is nothing to copy
  between. Split, the button reads "Make Board A (or B) the opposite
  colours" and means what it did: it writes the other board from the
  one being edited.
- At 600 px and below only the board being edited is drawn
  (`.board.inactive` is `display: none`), so Copy and opposite colours
  changed a board out of sight, a second tap from A silently put B's
  own edits back to a fresh opposite of A, and an Undo that changed only
  the hidden board showed nothing. `revealBoard(key)` moves the panel to
  the board that changed when that board's box is not displayed (its
  computed display, read after `syncBoard` has set the classes). Copy and
  opposite colours call it, and so does `restore` (Undo and Redo) when
  the step changed exactly one board, compared with `sameHistoryState`,
  whose shared strings make a picture cost nothing. Where both boards
  show, the panel stays on the board it was editing, as before.
- On a tablet the board not being edited was drawn at 70% opacity, so
  gold read as pale yellow and navy as periwinkle beside the active
  board. That rule is gone; the dashed outline and "- editing" still
  mark the board being edited.
- The Help text under "Edit boards" names the button.
- Where this differs from the triage: it proposed `setActive('b')` after
  the matching-boards tap at every width. That tap follows the same rule
  as Copy and the split tap instead: on a phone it moves to B; from 601
  px up, where B then shows beside A, editing stays on A. The triage
  kept the split label "Board B in the opposite colours"; one wording,
  with a verb, now serves both. No confirm is asked before a board is
  overwritten: the change is on screen and one Undo away.
- Limits: on a phone no more than 620 px tall the board is not pinned,
  so after the tap the board that changed is above the Board tab, out
  of view, as with every Board tab change there. Nothing is announced
  to a screen reader when the panel moves to the other board; the
  chips' pressed state, the board's label and its description change.

`tests/board-pair.spec.js`, at 390 x 844 with touch: the Team template
on the Board tab shows "Make Board B the opposite colours" (44 px tall)
and no Copy; the tap splits the pair and shows Board B, gold with navy,
with A untouched and the buttons now reading Board A; on A, a red board
and the tap again show B with red on gold; on A, an Undo that changes
only B shows B, and so does the Redo; on B, an Undo that changes only A
shows A, and the first step undone goes back to matching boards. From B,
Copy shows A, an Undo of the board on screen stays on it, and opposite
colours from B shows A with B's own red kept. At 320, 375 and 390 px
both buttons are at least 44 px tall and inside the screen, with no
sideways scroll, before and after the split. At 820 x 1180 the tap
keeps editing A with B beside it, and the board not being edited has
opacity 1 either way round; at 1280 x 900, Enter on the button makes B,
keeps the focus and stays on A, and Undo goes back to matching boards.
`designer.spec.js` changed where it encoded the old behaviour: "two
different boards" and "with two boards, one tap copies..." asserted
`#boardactions` hidden with matching boards, and now assert
`#swapcolours` shown and `#copyother` hidden there; the second still
ends with Board A being edited at 1280 x 900.

Verified for that commit: 71 node tests, the TypeScript check,
and the whole Chromium suite (389 specs) pass.

## Adding a picture on a phone: working where the finger is, controls in view

From the customer-journey audits (a slow phone and a business owner's
logo at 375 x 812, visual polish), fixed in the commit after `7cba816`:

- A 12 MP photo holds the page for two to three seconds while it is
  read. With a picture already on the board the page is scrolled down,
  so "Preparing your picture" (`#uploadstatus`, above the tabs) sat
  under the header, nothing near the finger changed, and a second tap
  on "+ Add a picture or logo" opened the picker again just as the
  first photo landed. While a picture for the board being edited is on
  its way (`pendingImageUploads` has that board), `syncPictureButton`
  gives `#addimagebtn` `aria-disabled` and `aria-busy` (`busyButton`,
  as Share preview and Print file use) and the label "Preparing
  picture…"; its click handler turns a tap or a key away, and the focus
  stays on it. The upload's `finally` and `syncLists` (a board switch,
  a new design) put it back, so it is busy only on the board its
  picture is for. A file given to `#addimage` some other way still
  meets the limit checks, so the overlapping-upload and limit specs
  are unchanged.
- Once a picture lands and is picked up, `showPictureControls` brings
  `#imageprops` up with `scrollIntoView({ block: 'start' })` at 940 px
  and below. The scroll padding that `syncScrollPadding` keeps for the
  pinned board (or the 124 px of a short phone, where the tabs pin
  instead) puts its top just under the board. Before, the first
  picture's Fill the board and Remove white background were under the
  bar at the foot, and the second's behind the pinned board. It runs
  after "Picture added" is written, so nothing above moves them after,
  and the focus stays on the button.
- At 600 px and below the four switches (`#imageonly`: Flip, Circle
  crop, Fill the board, Remove white background) sit in two even
  columns instead of three ragged rows, 56 px shorter at 375 px, so
  they fit between the board and the bar at 375 x 812 even with a
  print-size warning above them.
- "Picture added to Board A." stayed above every tab for the rest of
  the visit, Review and Your details included. `uploadStatus(message,
  { done: true })` marks it, and `showTab` hides it when the tab
  changes. A picture that could not be read, was not added because its
  board changed, or would pass the four-picture limit keeps its
  message until the next picture is chosen.
- Where this differs from the triage: it scrolled with `scrollToPanel`'s
  arithmetic; `scrollIntoView` with the scroll padding is the same sum
  for the pinned board, and also allows for the tabs pinned on a short
  phone. The two columns were not in it: without them Remove white
  background still reached under the bar at 375 x 812 with a
  print-size warning showing.
- Limits: on a 375 x 667 screen with a print-size warning above them,
  Fill the board and Remove white background still end partly under
  the bar (there are 230 px between the board and the bar). The freeze
  itself is unchanged: encoding a 12 MP photo once, or off the main
  thread, is a separate job.

`tests/picture-phone.spec.js`, at 375 x 812 with touch: the first
picture, tapped in from the top of the Art tab, has Fill the board and
Remove white background (box and words) between the pinned board and
the bar, uncovered, with the focus on the button and its label back.
With one picture on the board and the page scrolled until its controls
are behind the board, a second picture, held, leaves the button reading
"Preparing picture…" with `aria-disabled` and the focus, and a tap and
Enter on it open no picker; once it lands, its controls are in view
under the board, and a tap opens the picker again. "Picture added" goes
when Order opens and does not come back; "Could not read that image"
stays on Text, Order and Art; a full board's message stays on the Board
tab. With two boards at 390 x 844 the button is busy only on Board A,
whose picture is on its way. At 1280 x 900, Enter and Space on the busy
button open nothing, the focus stays, and the page does not scroll when
the picture lands. No existing spec changed.

Verified for that commit: 71 node tests, the TypeScript check, and the
whole Chromium suite (394 specs) pass.

## A slow phone: every module at once, nothing claimed before the script runs

From the customer-journey audits (a slow phone at 375 x 812 with the
CPU slowed 4x on Slow 3G), fixed in the commit after `042b6d6`:

- The builder opened about 10 s after the page was asked for, and about
  9 s on a return visit when every file came back 304: the nine modules
  in `lib/` were asked for only once `app.mjs` had arrived and been
  read, one more round trip in series. The head of `index.html` now has
  a `<link rel="modulepreload">` for `app.mjs` and for each module it
  imports, so they come together. Measured here with the files gzipped
  behind a 2000 ms, 50 KB/s link and the CPU slowed 4x (the audit's
  setting), the builder opened at 7.2 to 7.3 s instead of 10.1 to
  10.2 s, on a first visit and a return alike.
  `test/module-preload.test.mjs` reads the import lines of `app.mjs`,
  and of every module they reach, and fails unless the head lists
  exactly those modules, each once, `app.mjs` first.
- Until the script ran, the markup said "$0.00" in the header and the
  bar at the foot, told a returning customer whose design was saved
  "Not saved yet", drew Undo and Redo ready, and on a phone drew two
  grey boards that became one. `#headtotal` and `#mobiletotal` now
  start empty (an empty chip is `visibility: hidden`, so there is no
  blank pill), each `.savestatus` starts empty with
  `data-state="loading"`, `#undo` and `#redo` carry `disabled`, and
  `#boardB` starts with the `same` class and the "(same as A)" label a
  new design has, so a phone draws one board before and after. The
  save line in the Start pane keeps one line of height while it is
  empty (`min-height: 1.45em`): without it the templates moved down
  18 px under a finger as the builder opened. At 320, 375, 390 and
  1280 px nothing in the Start pane moves when the script runs, and
  nothing scrolls sideways.
- `setSaveState` ignores a repeat of the state it has and `saveState`
  started as `'new'`, so the boot's `setSaveState('new')` would have
  left the status empty. It starts as `'loading'`, which has no text in
  `SAVE_TEXT` and is never set again; `cornhole.saveState` reads it
  only before `cornhole.loaded`, which the specs wait for.
- With photos on the board `isPristine()` wrote the whole board out as
  JSON, picture data included, twice for the default and blank boards
  and twice for each template (about 34 times a tap): 1.7 to 2.3 s on
  the slowed phone before "Replace your current design...?", and
  457 ms here on a desktop CPU with four 4000 px photos. No template and
  no blank board has a picture, so a board with one is someone's work
  without comparing anything (a template given a picture one day would
  only make a tap ask); otherwise the board is written out once and
  compared with each untouched board in turn.
- Where this differs from the triage: Board B's class and label, the
  hidden empty chip and the reserved save line were not in it. The
  untouched boards are still built at each call (a few milliseconds
  with no pictures), since caching them bought nothing measurable.
- Not done: the default board still shows for a moment before a saved
  design takes its place (that touches the startup gate), the audit's
  "Loading the designer" label, and versioned module addresses with a
  long cache life, which would let a return visit skip the
  revalidation round trips. Limits: a browser without `modulepreload`
  loads the modules one round trip later, as before. On a wide screen
  the header links move left as the total arrives, as they did when it
  changed from $0.00.

`tests/slow-start.spec.js`, at 375 x 812 with touch: `app.mjs` is held
with `page.route` while the requests are recorded. Meanwhile every
module it imports (read from its import lines) has been asked for, the
script has not run, both totals are empty and the chip hidden, the
three save lines are empty, Undo and Redo are disabled and one board
shows. Held 1.5 s and let go, both totals show
`money(quote(order).total)`, every save line reads "Not saved yet",
+ Start with blank boards has not moved, and a tap on the Wedding
template enables Undo, whose tap brings YOUR TEAM back with Redo
enabled. A return visit with the Wedding template saved claims nothing
while held and reads "Saved on this device" after. At 1280 x 900, a
board with four 4000 x 3000 photos and their masters (over 4 MB of
JSON) answers `isPristine()` false in under 100 ms, and a template tap
and + Start with blank boards still ask; the default board, the
Wedding, Monogram, Team and Sunflower templates and a blank board
answer true and are replaced with no question, and a changed word or
two different boards answer false. No existing spec changed.

Verified for that commit: 74 node tests, the TypeScript check,
and the whole Chromium suite (398 specs) pass.

## New items land in free space, not on the words

From the customer-journey audits (visual polish at 390 x 844 and
1280 x 900, a team set at 360 x 780), fixed in the commit after
`3899681`:

- New words and new clip art landed 12" across and 36" down, and a new
  picture 30" down and 10" wide, on top of whatever was there. A new
  picture covered a template's words on 29 of the 32 templates (on
  Wedding 44% of SMITH and all of the date; HAPPY, USA, AHOY and JORDAN
  entirely), and on a board with a basketball already at that spot the
  words typed next (EST. / 2026) went inside the ball in its own
  off-white: nothing new showed, and a tap on the ball picked the
  hidden words.
- `placeNew(board, el)` in `app.mjs` now decides, for the Add text
  button, for `addClip` when it is given no place (no `x` and no `y`),
  and for a picture as it lands. The usual spot is kept when the new
  item's box is at least `NEW_GAP` (0.25") clear of every other item
  and of the hole, so a blank board, and new words on the board a first
  visit opens with, get exactly what they got before. Otherwise the
  item goes into the area from 13" down (below the hole) to 46", 1" in
  from the sides: first centred across the board, at its own size or,
  for clip art and pictures, a quarter inch narrower at a time down to
  `NEW_MIN_WIDTH` (4"); then off to one side, half an inch further at a
  time, again at the biggest width that fits there. Of the free
  stretches at a place it takes the one that leaves it most room above
  and below, up to `NEW_ROOM` (2.5"), then the height nearest its usual
  one. A board with no free room at all takes the item, at its
  smallest, where it covers the least area of words, then of artwork.
- Each item counts as the upright box around its ink, turned with it:
  the size drawing gives it (words measured by `drawText`, clip art by
  its width and aspect, a picture by its width and its pixels),
  measured afresh rather than read from the last paint. A picture
  filling the board takes no room; the hole is a box 0.5" around it.
  The ink (`defaultInk`) is chosen after the place, so it is read from
  the spot the item lands on. Clip art given a place keeps it, as the
  creative pack spec and the others that pass `x` and `y` expect; clip
  art given only a width keeps that width and is moved, not shrunk.
- Where this differs from the triage: it proposed the tallest free
  band, centred, with today's spot as the last resort. The usual spot
  is kept whenever it is clear, not only on a blank board, so words
  added under YOUR TEAM, or a picture added to an empty board, land
  where they did. A stretch is chosen for its room up to 2.5" and then
  for being near the usual height, so an item does not jump to the far
  end of the board for a slightly taller gap. Off to one side was added
  after shrinking: on BBQ, Brewery, Graduation or Lake days, once new
  words are on, the only room left for a Heart 4" wide is beside the
  art. A
  board with no room left gets the spot that covers the fewest words,
  not the old spot, which on most templates is on the words. The 2.5"
  rather than 1" came from the team set: words placed 2" above YOUR
  TEAM ran into it once EST. / 2026 took a second line.
- Limits: words are placed by the size of NEW TEXT; longer words or
  more lines grow from their middle and can still reach a neighbour. A
  box is a rectangle, so the open middle of a wreath or a ring counts
  as taken, and a new item can land on a band of the pattern. On a
  crowded board a clip art or a picture can come in at 4" wide.
  Duplicate, Copy to the other board and the templates are unchanged.
  The browser suite loads no web fonts, so the boxes there are the
  fallback face's.

`tests/new-item-place.spec.js` applies all 32 templates and adds words
with the Add text button, the Heart from the Art tab and a 900 x 600
JPEG: each new item's box covers no more than 10% of any template
text's box (none covers any), is clear of the hole and of the other
two new items and on the board, and the Heart and the picture are at
least 4" wide. On Wedding the picture is clear of Mr & Mrs, SMITH and
the date. On a blank board the words and the Heart land at (12, 36),
the Heart 8" wide, and the picture at (12, 30), 10" wide; with YOUR
TEAM on the board new words still land at (12, 36). Clip art given a
place keeps it; given a width, it keeps the width and is moved clear.
At 360 x 780 with touch, on the board a first visit opens with, the
basketball found by search and tapped, then Add text tapped and EST.,
Enter, 2026 typed: the words, the ball and YOUR TEAM do not overlap,
the words add off-white to the board, and a tap on the middle of the
ball picks the ball. Four of the five fail before this change.
`new-item-ink.spec.js` changed where it encoded the old spot: its fade
case added the Heart to a board with the new words already at the
usual spot, so the Heart landed high up, at the other end of the fade;
each item now goes on a board with HELLO alone and is checked to land
low down. `order-preflight.spec.js` "a review opened during restored
image loading..." read the picture's colour at (12, 30), where HELLO
now keeps the picture away; it reads at the picture's own place.

Verified for that commit: 74 node tests, the TypeScript check,
and the whole Chromium suite (403 specs) pass.

## Small polish: the chosen swatch, the outline width, the board label, the header total

From the customer-journey audits (keyboard and screen reader at
1280 x 900, visual polish at 320, 390 and 1280 px), fixed in the commit
after `2277320`:

- The swatch whose colour is on the board had a 3 px navy ring (a
  box-shadow), and the swatch the keyboard was on had a 3 px navy
  outline: after Enter on teal and Tab to green, both looked chosen.
  The chosen swatch now has a 3 px white frame inside its ring
  (`inset 0 0 0 3px #fff`), and a focused swatch's ring is dashed and
  stands 3 px off it. A swatch both chosen and focused shows both.
- The outline width ('0"') wrapped onto a line of its own at the left,
  under Colour, at 1280, 390 and 320 px, and in the clip-art row Flip
  went with it. In the Text and clip-art rows, the Outline label, its
  colour, the width slider and the width are one `.outlineset` group,
  `flex: 1 1 300px`. It sits beside the fill colour where that leaves
  the slider about 90 px (on a tablet), and otherwise moves onto the
  next line whole. Its label is as wide as Colour's, so the two colours
  line up; at 360 px and under it takes only its own width, which
  leaves the slider 87 px at 320. Clip-art Flip has a row of its own.
- On phones and tablets the board's dashed outline, and the keyboard's
  focus ring, reach 7 px out from the canvas. They ran through "Board B -
  editing", 3 px under it, and into the board choices, 4 px above it.
  At 940 px and under, the label stands 7 px further off (10 px under
  the canvas) and the board 7 px further from the chips. The pinned
  stage is 14 px taller; at 320 x 740 a whole template card still fits
  between it and the bar, with 56 px to spare.
- The header total was read as a bare "$308.00" inside the navigation.
  Its explanation was a title on a plain span, which is not read out. A
  visually hidden "Estimated total, before tax" (the words on the bar at
  the foot) now comes just before the chip, outside it, so `#headtotal`
  still holds the amount alone.
- In Stars and stripes the middle star's tip was 14.45" down, 2" above
  the top of the blue square (16.44"), white on a white stripe. The
  three stars are 14" wide and 22.5" down, where they were 15" and 20".
  The tip is at 17.3", the stars run from 5.4" to 18.6" across inside
  the square's 4.4" to 19.6", and they end at 25.6", above USA.
- Where this differs from the triage: it proposed 15" to 14" wide and
  nothing else. That puts the stars' box (0.7 of the width tall) inside
  the square's box, but the box is not the ink: the middle star is drawn
  from 13 to 62 of the clip's 100, and at 14" wide and 20" down its tip
  would still be 1.6" above the square, so the stars moved down 2.5"
  too. The label stands off 7 px, not 6, so that it starts 10 px under
  the canvas as the acceptance asks (the gap was 3 px). The space above
  the board was not in the triage; it is the same outline. The Outline
  label lost its `auto` width so the colours line up. Flip moved to a row
  of its own rather than relying on the group to fill the line, since on
  a tablet the group shares the line with Colour and Flip would follow.
- Limits: on the white, off-white, ivory and cream swatches the white
  frame hardly shows against the swatch itself, so there it is the solid
  ring and the dashed ring that tell the two apart. On a wide screen the
  outline still clears the label by 1 px, as before. The hidden words are
  in the markup before the script runs, while the chip is still empty and
  hidden. A design saved with the old Stars and stripes no longer matches
  the template, so a template tap on it asks first.

`tests/editor-polish.spec.js`: at 1280 x 900, 390 x 844 and 320 x 568,
with words selected and then a clip, each outline width lies within its
slider's line and to its right, the outline colour is on that line
before the slider, the slider is 80 px or more, Flip is on a line below
and 44 px tall, and nothing scrolls sideways. At 1280 and 390 the
banner's accessibility snapshot reads "Estimated total, before tax"
and the amount, which `#headtotal` holds alone. At 1280, Enter on teal
and Tab: teal has the white inset frame and the navy ring and no
outline, green has the focus, a dashed outline and no frame, and
Shift+Tab back to teal shows both. At 390 x 844 with touch, after a tap
on Board B, the label starts 10 px or more under the canvas and 3 px
past the outline's reach (its offset and width), and the outline's top
is under the board choices. In Stars and stripes the stars' box lies in
the square's; each piece drawn by the page alone on a black board,
every pixel of the stars is on a pixel of the square, the tip 0.5" or
more inside its top, and the stars end 0.5" or more above USA. All eight
fail before this change. No existing spec changed.

Verified for that commit: 74 node tests, the TypeScript check,
and the whole Chromium suite (411 specs) pass.

## Review of tonight's audits: opposite colours, the shrink warning, a second invoiced order

A review of the commits from `7682e74` to `6ef876a` raised eight
findings, two of them the same defect. All are fixed in the commit after
`6ef876a`, each with a spec:

- After the first tap on "Make Board B the opposite colours", Copy
  appeared where the finger was: `#copyother` came before `#swapcolours`
  in `#boardactions`, so the button wrapped onto the next line. A double
  tap on a phone then copied B's new opposite over the customer's Board
  A (the panel had moved to B), and a double click on a wide screen
  copied A back over the new B. The opposite colours now come first, so
  the tapped button stays put when Copy appears after it, and both click
  handlers turn away the second click of a pair (`onceOnly`: `ev.detail
  > 1`; a key gives 0, so Enter and Space always act). Both halves are
  needed: with the order alone, the second tap of a pair on a phone made
  A again from B, and the colour fix-up does not undo itself exactly. A
  slow second tap is a click of its own and acts as its label says.
- The opposite colours hid words and art on three templates, the
  review's own check naming them: Nautical's anchor and AHOY (ivory on
  an ivory disc), Lake days' THE CARTERS (the colour of the band under
  it) and LAKE and DAYS (cream on that light band), and Bachelorette's
  pink words on the lilac middle of a white-to-purple fade. The fix-up
  compared each item with `base.color` alone and set anything under
  1.8:1 to the old board colour, so it undid a deliberate swap (the
  Nautical disc) and never saw a band, a disc or a fade's second colour.
  `oppositeColours` now gets its two colours from `oppositePair`, and
  after the swap reads every text and clip art against what is really
  behind it on both boards, in layer order: `readBoard`, which
  `readabilityIssues` now uses too, draws a board an item at a time and
  hands each item the colours under its own ink (`inkBackdrop`). An item
  that stood out at 1.8:1 or more on the source board (for nine tenths of
  its ink, `inkContrast`, scored as `defaultInk` scores an ink) and does
  not on the new one takes whichever of the two colours stands out more
  there, when that is better. One that did not stand out to begin with,
  the Nautical disc on its stripes, is left alone. A fade whose second
  end is a third colour takes the new board colour at both ends (Board
  B of Bachelorette is white with pink words); an end in one of the two
  colours switches as before. On every template that offers the button
  the review now names nothing on Board B; on Team, YOUR TEAM still
  turns navy on gold.
- The opposite colours were offered on stained wood with no pattern (The
  cabin, Rustic wedding) and on blank boards, where there is no second
  colour, and the tap only split the pair into two identical boards.
  `syncBoardActions` hides `#swapcolours` while `oppositePair` finds no
  pair for the board being edited, and `#boardactions` when Copy is
  hidden too. It runs from `syncBoard` and from `commit`, so words added
  to a blank board bring the button back.
- The review called ordinary names "very small": ANDERSON at 1.4 in,
  "Christopher & Elizabeth" at 1.9 in, NORTHSIDE BULLDOGS at 2.4 in,
  while the template's own date prints at 1.4 in and is never named. A
  line is named for its size only below 0.6 of its template size and
  under 1 in (`SMALL_PRINT`), the audit's own figure; Fairweather-
  Worthington (0.57 in) is still named. A hero line taken from 4.5 in
  to 1.2 in is no longer named; it is not very small next to the
  templates' own lines.
- After an invoiced order, changing the design brought Continue to
  payment back directly above the old "Order CH-... received. We will
  email you an invoice" line, so a tap read as paying for that order and
  silently placed a second one, whose code then replaced the first on
  screen. The placed order's code and answer are kept (`placedCode`,
  `placedAnswer`). When step 3 opens with the button back,
  `#orderstatus` reads "Order CH-... is already placed. Continue to
  payment places a second, separate order with your changes."; with the
  placed order's review it shows that order's answer again. The second
  answer ends "Order CH-... is a separate order." It is written without
  scrolling (`status(..., { scroll: false })`), and only when it differs.
- After an invoice answer, `#shipnote2` under it still said payment is
  taken on a secure Stripe page. The server answers with an invoice only
  when it has no Stripe key, so every later order in the visit is
  invoiced too: the invoice branch sets the note to the region sentence
  alone, and it is not put back.
- The spec "drawing the check leaves the board's hit boxes as they were"
  passed with the restore deleted, since drawing the live design again
  writes the same boxes in inches. It now reads a copy of the design
  with every text half as big again, as `renderReview` passes its own
  copy; with the restore deleted it fails.

`tests/board-pair.spec.js`: at 390 x 844 with touch, after one tap the
point under the finger is still `#swapcolours`, and two quick taps there
leave Board A as it was and B gold with navy; Nautical (a navy disc on
the stripes, its anchor and AHOY ivory), Lake days (LAKE, DAYS and THE
CARTERS dark teal) and Bachelorette (white at both ends, every item
pink) each leave A unchanged and `readabilityIssues(['a', 'b'])` empty;
the button and the row are hidden on The cabin and on blank boards
until words are added, and shown on Team. At 1280 x 900 a double
click, and two single clicks, leave A as it was and B the opposite, and
each of the 30 templates that offer the button (all but The cabin and
Rustic wedding) makes a Board B the review names nothing on.
`tests/readability.spec.js`: ANDERSON over SMITH, "Christopher &
Elizabeth" over Mr & Mrs and NORTHSIDE BULLDOGS over YOUR TEAM, each
under 0.6 of its template size and 1 in or more, leave `#readwarn`
hidden; the hit-box spec reads the enlarged copy.
`tests/checkout-result.spec.js`: the invoice spec checks the note before
and after the answer, the "already placed" line once the rush option
changes, and the first code in the second answer; a new spec at 390 x
844 places 'Emma & Jmaes', fixes it to 'Emma & James', and finds the
"already placed" line under the button, then both codes after the tap.
No existing assertion changed.

Verified for that commit: 74 node tests, the TypeScript check, and the
whole Chromium suite (420 specs) pass.

## Verification

At the tested implementation commit `f4d456a`, the final clean `npm test`
passed:

- 68 node tests.
- 280 Chromium browser tests.
- TypeScript checking; syntax and whitespace checks also passed.

Tests cover real shared IndexedDB tabs, pending-save races, image round trips,
print metadata, mobile recovery, imports and, since the review fixes, all 480
pricing combinations (each total against the price list and its own lines).
Order-return cases also cover malformed rows, stalled headers/bodies, retries
and preserving artwork and keyboard focus.
Order/payment services were stubbed. No real purchase or customer message was
made. The work log records an earlier Chromium resource-buffer failure and the
subsequent passing focused and complete reruns.

For this Windows workspace, the verified browser is:
`C:\Users\vicke\AppData\Local\ms-playwright\chromium-1243\chrome-win64\chrome.exe`.
Set `PLAYWRIGHT_CHROMIUM` to an installed Chromium when needed, and `CB_PORT` to
a free port. Parallel runs need separate top-level Playwright output folders.
Run `npm test` again after code changes.

## Concrete remaining work

1. Verify an exact-commit Vercel preview. Deployment was not confirmed; the last
   public-site check served older code, no GitHub deployment checks were shown,
   and Vercel team permissions blocked preview inspection.
2. Test the iOS keyboard and native OS sharing on physical devices. Chromium
   emulation does not verify those behaviors.
3. Merge competing edits from two tabs, if that is ever wanted. Today the
   last save wins and the tab that is behind says so and offers Reload (see
   "Two tabs"); its view is not combined with the other tab's changes.
4. Obtain and verify the owner's actual prices, contact details, product photos
   and fulfilment policies before release. Keep existing prices and checkout
   behavior intact until the owner provides replacements.

Preserve saved-design compatibility and artwork IDs. Do not register the
creative pack twice, invent business details or testimonials, or claim the live
site is updated solely because the branch is pushed.
