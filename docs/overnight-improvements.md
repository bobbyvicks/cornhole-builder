# Overnight improvements — October 13–14, 2026

The owner authorized autonomous work overnight to make the existing builder
easier to use. Work ends at 7:00 a.m. America/Toronto on October 14. An hourly
heartbeat in this chat is limited to eight runs. Continue from this log; check
the clock and repository state before each run.

## Repository and scope

- Repository: bobbyvicks/cornhole-builder.
- Working branch: `codex/overnight-ux`, based on the artwork pack and current main.
- Continue the existing overnight PR: https://github.com/bobbyvicks/cornhole-builder/pull/2.
- First implementation batch pushed as `94c87f6`; deployment is not confirmed.
- Main's favicon change was merged before implementation.
- Prior artwork handoff: PR #1, `codex/creative-asset-pack`.
- Preserve concurrent Claude changes, saved projects, original artwork IDs,
  order pricing and checkout behavior. No live orders or customer messages.
- Push tested changes as a reviewable PR. The user has not supplied real product
  photos, prices, contact details or fulfilment policies; do not invent these.

## First increment

1. Register the approved 24 vector icons and six editable templates in the app.
2. Search and filter templates by occasion with a result count and clear reset.
3. Make template text personalization clearer and keep replacement names within
   their intended space, with explicit feedback and existing advanced controls.
4. Improve phone touch targets, input sizes, focus navigation, reduced motion,
   safe areas and compact-height layout.
5. Run the existing tests plus focused regression tests, inspect the UI and push.

## First batch implemented

- All 24 approved clips and six templates registered; 32 templates and 131 clips total.
- Search, occasion filtering, result counts and reset; larger template cards.
- Guided text fits to original line dimensions, including the wedding arch;
  long text is never truncated. Manual controls and handles turn fitting off.
- Native preview sharing with a PNG download fallback; editable save/open labels.
- Autosave starts during typing. Storage restores the newest successful draft
  even when IndexedDB failed and localStorage held the newer fallback.
- Imported projects are validated before any current work is replaced. A 64 MiB
  file limit, known artwork/pattern checks and safe geometry reject corrupt input.
- Touch targets, skip navigation, reduced motion, safe areas and short-screen
  editing improved. Share controls remain outside the pinned preview.
- Checkout focuses the active step, requires an explicit state, and explains
  when a large print master must be provided separately. Small originals count
  as included. Approved thin borders pass checkout and render at authored width.
- A failed cached image cannot leave sharing/print preparation waiting forever.

## Verification so far

- `npm install --no-package-lock`: zero reported vulnerabilities.
- Original baseline: 24 node tests, typecheck and 60 browser tests passed.
- Final first-batch run: 47 node tests, typecheck and 117 browser tests passed.
  This includes pattern switching, exact thin-border rendering, export/import
  compatibility and undo/redo. `git diff --check` passed.
- Actual bundled fonts tested for fitting, including late loading and manual edits.
- Desktop and phone screenshots inspected. Chromium narrow-screen checks pass;
  physical iOS keyboard behavior and native OS sharing remain unverified.
- Node/API tests stub network services; no real payments or orders were created.

## Second batch - October 13, 11:50 p.m. Toronto continuation

- Confirmed main and the overnight branch had no concurrent remote changes.
  PR #2 was open and mergeable. GitHub reported no checks or deployments;
  this does not verify a Vercel preview or production deployment.
- Added search across all 131 artwork items, readable thumbnail labels,
  combined group filtering, result counts and accessible reset/empty states.
  Group controls collapse so phone search results stay near the search field.
- Reproduced and fixed undo/redo leaving the controls on hidden Board B when
  matching boards are visible. Layer labels follow text and size changes;
  removing a selected item keeps keyboard focus in the editor.
- Reproduced malformed embedded images replacing a valid live and saved
  project. Imported previews and print masters now decode before applying
  the project. Newer edits during file reading or decoding cancel the import;
  a newer file selection supersedes the older operation without stale alerts.
  Validate raster sources sequentially and retain only decoded previews, so
  opening a project does not retain every full-size print master in memory.
- Reproduced startup recovery races: typing before storage finished loading
  could be overwritten, and a committed early edit could remain unsaved.
  Compare the initial design and order state, preserve edits in progress and
  save them once storage is ready. Unchanged navigation still restores drafts.
- Independent review verified valid two-board image imports and print masters,
  file-opening races, artwork browsing, selection and startup recovery, including
  the sequential image decoder. No outstanding review findings.
- Final whole-suite run: **47 node tests, 143 Chromium browser tests and
  TypeScript checks passed**. `node --check app.mjs` and `git diff --check`
  passed. Phone and desktop artwork search screenshots were inspected.
  This batch adds 26 browser regressions; real device limitations noted above
  still apply. No production order or payment was created.

## Third batch - October 14, 12:46 a.m. Toronto continuation

- Fetched before implementation and again before final verification. Main stayed
  at `136fe35`; the overnight branch stayed at `5d84174`. PR #2 was mergeable,
  with no GitHub checks or deployments reported. Concurrent work was preserved.
- Pictures now finish on the board where the upload began. Replacing that board,
  switching to a template or hiding separate Board B cancels the stale upload.
  Concurrent uploads reserve picture slots before decoding and release them on
  failure. Visible status explains progress, cancellation and recovery.
- A finishing upload preserves newer typing, focused size/colour controls and
  active canvas dragging.
  Saving an editable copy, sharing, printing and checkout explain pending
  pictures instead of silently leaving them out. Leaving during processing
  uses the existing unsaved-work warning.
- Shared previews and both print PNGs use one captured design, even when editing
  continues while fonts load or PNGs encode. Print preparation prevents duplicate
  requests and recovers from encoding failures. Offscreen output preserves live
  canvas hit-testing geometry and render state.
- Order review waits for images and fonts. Confirming sample text applies only
  to the exact words reviewed; changed designs require fresh review. Preparation
  rechecks the design, options and address before sending, preserves entered
  details on return to review, and continues to allow the optional gift note.
- Full-size-file warnings use the completed previews' actual payload size.
  Failed images offer a retry, and a finishing upload refreshes an open review.
- Final whole-suite run: **47 node tests, 169 Chromium browser tests and
  TypeScript checks passed**. This batch adds 26 browser regressions covering
  real file decoding, native pointer/keyboard input, snapshot PNG pixels,
  delayed review assets and checkout races. Syntax and diff checks passed.
- Independent review closed all findings, including property-control and drag
  selection takeover, live canvas geometry during output, and the payload-size
  warning after decoding. The upload recovery message was inspected at 375 px;
  it is readable and introduces no horizontal overflow. Physical-device limits
  still apply. All order requests used stubs; no live purchases were made.

## Fourth batch - October 14, 1:47 a.m. Toronto continuation

- Repository clean at `7b15e28`; main remained `136fe35`. PR #2 was open and
  mergeable, with no GitHub check runs or deployment records.
- Reproduced choosing the final gallery template leaving its focused words
  above the viewport on both desktop and phone. Native focus now reveals and
  selects the first text field. Starting blank focuses the Add text button.
  The regression checks mouse/keyboard activation, visibility below sticky
  controls and immediate personalization.
- Reproduced detailed 900 x 900 PNGs losing their original pixels when the
  preview byte budget shrank them to 506 x 506. Keep the untouched source
  whenever it fits the existing original-file limits and preview dimensions
  have changed. Oversized PNGs with modest dimensions now receive a larger
  re-encoded print master within the same limits. Small lossless pictures
  still need only one source. New regressions cover genuine uploads, decoded
  dimensions, editable-file export/import, reload and print drawing source.
- Independent review found detailed transparent PNGs could exhaust the old
  six encoding attempts and retain an oversized master. Start resizing at the
  actual image size, reduce on each retry and return only within the configured
  byte limit. Both 1000 px and 4000 px RGBA regressions reproduce the failure
  before the fix and pass with preserved transparency afterward.
- Final full run: **47 node tests, 180 Chromium browser tests and TypeScript
  checks passed**. This batch adds 11 browser regressions. Independent review
  closed all findings within this increment; syntax and whitespace checks
  passed. Prices, project format and checkout API are unchanged.
- Vercel inspection found the production deployment ready at
  `cornhole-builder-ejxo7nbel-market-makers1.vercel.app` (created 00:58 UTC)
  and a later ready preview at
  `cornhole-builder-jm7t5qavs-market-makers1.vercel.app` (created 02:31 UTC).
  At 05:49 UTC the public site and that preview served identical `app.mjs`
  content without template search or the overnight upload/output guards.
  Neither matches the overnight branch; deployment metadata supplied no Git SHA.
- Commit-specific Vercel inspection with the explicit team returned HTTP 403:
  no access to `market-makers1` (`team_LItzcxZ0sHhTHp02o9kJbJd4`). The Vercel
  CLI is not installed. Project ID: `prj_ZVMhU1GndNu75US1pTcDAD864IWU`.
  An account with this team's access is needed to verify/create the correct
  PR preview. Do not retry the same denied operation without an access change.

## Photo history memory baseline

- A local Chromium audit on `7b15e28` uploaded one 1500 x 1500 JPEG (2.43 MB file, 1.24 MB
  preview URL, 3.24 MB master URL), then made 60 alternating keyboard nudges.
  After explicit garbage collection, JS heap grew from 6.56 MB after upload
  to 271.96 MB. The 60 history entries serialize identical picture data again.
  No browser crash was observed; the measured retention warrants a separate
  bounded change to history representation, with undo/redo/import/reload tests.
  Preserve exact original picture data and the existing history length.

## Fifth increment - photo history memory

- After pushing the fourth batch as `40ead65`, continued with the measured
  history problem. A committed regression on that code measured 224,027,980
  bytes of additional post-GC JavaScript heap after 60 small photo nudges.
- Undo history now copies mutable plain-data containers while sharing immutable
  image strings. Restoring an entry copies its containers again, so later edits
  cannot mutate past or future states. Equality checks avoid creating an entry
  or clearing redo when nothing changed. The existing 60-entry cap remains.
- Kept serialization for saving, exporting, importing, review and printing
  unchanged. No project-file migration or image-data registry is introduced.
- Seven node tests cover nested isolation and prior JSON snapshot semantics.
  Two browser regressions cover retained heap, all 59 available undo/redo steps,
  exact image-source hashes across history and reload, unchanged commits after
  undo, nested metadata and branching from a restored state.
- Independent review reported no findings. Its real Chromium run measured
  717,664 bytes of additional retained heap for the same 60 nudges; the committed
  test allows a broad 32 MiB ceiling to account for browser variance. This is
  measured JavaScript heap, not total browser or canvas memory.
- Final whole-suite run: **54 node tests, 182 Chromium browser tests and
  TypeScript checks passed**. The full-run photo regression retained 720,224
  additional heap bytes after 60 moves; source hashes and all history steps
  passed. `node --check app.mjs` and `git diff --check` passed. Remote main and
  the overnight branch were refetched before completion; no concurrent changes.

## Sixth increment - separate-board editing and touch input

- Started from clean `dd3a53c` at 2:56 a.m. Toronto. Remote main remained
  `136fe35`; PR #2 was open and mergeable. Refetched before final verification;
  no concurrent branch changes appeared.
- Reproduced keyboard navigation focusing Board B while arrow/Delete keys
  changed the selected item on Board A. Only the active editing canvas now
  participates in Tab navigation, and stale focus on another board cannot
  edit the selection. Clicking the matching Board B preview retains keyboard
  editing of the shared design through the canonical Board A canvas.
- Reproduced a second finger moving the first finger's dragged text from
  (14, 32) to (21, 41) and clearing selection. A drag now belongs to its original
  pointer, canvas and board; other fingers cannot move or end it. Lost pointer
  capture finishes the gesture once, and right-clicking a delete handle leaves
  the design intact. Real browser touch events, undo/redo and reload are covered.
- Reproduced phone Board B handles measuring roughly 5 px where Board A's
  measured 13 px because sizing read the hidden A canvas. Measure the active
  canvas instead. The same real touch within the intended handle reach now
  works on either board.
- Reproduced switching boards after personalizing text leaving the next board's
  fields above the phone viewport. Explicit phone board switches reveal the
  controls; short screens also move keyboard focus to the active tab. Desktop
  scrolling remains unchanged. Tests cover 375 x 812 and 375 x 420 viewports.
- Copying to a board already at its item limit previously did nothing. Explain
  the destination board, limit and removal/retry action. Tests cover all three
  item types, both destination directions, exact photo preservation, reload
  and a successful retry after making room.
- The 20 new browser regressions pass. Independent review found no issues and
  passed all 20 plus four normal-scroll mobile probes. A fresh photo journey
  also preserved exact data through upload, touch placement, undo/redo,
  flip/crop, export, reload and reopen.
- Final full run: **54 node tests, 202 Chromium browser tests and TypeScript
  checks passed**. Syntax and whitespace checks passed. A public-site recheck
  still found the older code without template search, the photo-history fix
  or pointer ownership. No production release was made; the Vercel access
  limitation recorded above remains unresolved.

## Seventh increment - recovery, artwork navigation and print handoff

- Started from clean `9d72b00` at 3:53 a.m. Toronto. PR #2 was mergeable and
  remote main remained `136fe35`; a second fetch before final verification
  found no concurrent changes.
- Reproduced choosing the last artwork group or adding distant artwork leaving
  the phone controls above the viewport. Collapsing groups now reveals its
  focused summary; adding artwork reveals the selected item's width control.
  Pointer and keyboard regressions cover desktop, tall and short phone layouts.
- Reproduced an unavailable-order response telling customers to send a print
  file for a manual quote even though no contact method is configured. The
  response now says the order was not submitted and nothing was charged, with
  a working Save editable copy action. Actual downloads retain artwork and
  order choices; address details stay in the form for retry and are not put in
  the editable file. Tests stub every order request. Reset confirmation now
  accurately describes the default design and available Undo recovery.
- Downloaded print PNGs were 2400 x 4800 pixels with no physical-resolution
  metadata. Add one 100 PPI pHYs chunk (3937 pixels per metre after rounding),
  replacing an existing chunk when present, without re-encoding the artwork.
  Both boards' decoded pixel hashes remain identical. Preview, share and order
  images keep their existing encoding. Invalid PNG preparation keeps the
  design intact, resets the button and permits retry. The format requirement
  is documented in the [W3C PNG specification](https://www.w3.org/TR/png-3/#11pHYs).
- Reproduced a malformed newer saved record hiding an intact older draft:
  malformed elements could stop startup and all later saves, while a missing
  board could silently replace the saved design with the default. Validate
  each storage candidate before comparing timestamps and contain restoration
  failures. If none can be opened, show a recovery message and leave stored
  records untouched until a deliberate edit. Navigation and unchanged inputs
  cannot overwrite them.
- Retain legacy defaults, uploaded images and old order sanitization. Ignore
  inherited enum names in stored order choices. Device recovery accepts safe
  off-board coordinates created by keyboard movement; imported project bounds
  remain unchanged. A regression moves text with 120 actual keyboard nudges
  and confirms the same position after reload.
- Final full run: **65 node tests, 220 Chromium browser tests and TypeScript
  checks passed**. This increment adds 11 node and 18 browser regressions.
  Independent reviews found no outstanding issues; syntax and whitespace
  checks passed. The public site still serves older code without template
  search or these recovery/print changes. Vercel team access and physical iOS
  keyboard/native-sharing checks remain unresolved; no production release
  or real purchase was made.

## Eighth increment - integrate Claude's second audit

- Claude pushed `06f7b0e` to main after the seventh increment was pushed.
  Merged it into `codex/overnight-ux`, resolving the four overlapping files
  by preserving both sets of behavior. Do not merge the PR into main or
  release production as part of this integration.
- Retain the validated draft recovery and early-edit safeguards while adding
  debounced input saving, a quiet save-status line, database reconnection and
  one retry after an unexpectedly closed connection. A slow startup read
  leaves editing available and offers an export after six seconds. Its late
  result cannot replace newer edits. Stored copies remain untouched until
  the read finishes or an unreadable-draft recovery receives a deliberate edit.
- Use keyboard-accessible buttons for import and picture selection. Validate
  a selected project's images before asking to replace a customized design;
  cancellation preserves both live and saved data. Keep layer names current,
  empty text empty, browser shortcut keys available and mobile scroll padding
  matched to the sticky preview. Preserve the short-screen scrolling layout.
- Keep memory-efficient object history rather than Claude's image-token
  registry: print, share, project export and frozen order snapshots continue
  carrying complete image sources. Adapt the overlapping history regression
  to measure actual retained browser heap instead of string lengths.
- Bring in full-size SVG rasterization and opaque WebP preview compression
  while retaining exact originals and the existing 3 MB print-master limit.
  Inspect source alpha in bounded tiles: a sampled thumbnail can miss a faint
  transparent pixel and incorrectly turn a logo into opaque JPEG.
- Outgoing orders omit the unused second board and empty text; the editable
  project keeps both. Review and submission shrink copied previews only after
  omitting oversized masters, report the required full-size-file handoff and
  repeat revision, upload and form checks after preparation. Retain quantity
  retyping, named bag colours, changed-review guidance and the unavailable-order
  export. All 480 pricing combinations retain their previous totals.
- The incoming ten-attempt limit could not prepare a valid eight-picture
  design. Bound reductions per picture instead, with an overall limit and
  an exit if encoding makes no progress. A real uploaded transparent PNG
  duplicated to four pictures on each board now sends 3,603,418 characters
  instead of 13,772,386; all live and saved image sources remain unchanged.
  Both the full-board case and an unchanged encoder result failed before the
  fix and pass afterward. Review also found genuine patterned PNGs can grow
  on their first resample before later shrinking. Preserve that progress,
  stopping early only for an identical encoded result; the bounded loop
  reduces the patterned case from 6,585,547 to 3,576,406 characters. Seven
  focused tests and sixteen independent order checks pass.
- Independent review reproduced a cancelled touch gesture being rolled back
  on screen but remaining saved if recovery completed during the drag. Save
  the rollback without adding history, preserving original geometry and
  automatic fitting. A native Chromium touch test failed without that save
  and passed with it, including the next reload.
- Final full run: **68 node tests, 253 Chromium browser tests and TypeScript
  checks passed**. Syntax and staged whitespace checks passed. Independent
  review closed all identified merge issues. Import/image checks (42), focused
  merge checks (38), gesture/input checks (9) and targeted order checks also
  passed during integration. A final fetch confirmed main remained `06f7b0e`.
  Real orders, customer messages and production releases were not made.
- A public-site recheck around 4:22 a.m. Toronto still found none of the new
  template search, print metadata, input debounce or request preparation
  functions. The Vercel permission limitation remains; do not assume this
  branch is live merely because its source is pushed.

## Ninth increment - visible save recovery and unchanged-tab protection

- Started from the clean `423e815` branch at about 4:55 a.m. Toronto. Fetch
  confirmed main remained `06f7b0e`; the existing overnight PR was open and
  mergeable with no deployment checks. Continued on the same branch.
- Reproduced a real two-tab data-loss path: after one tab saves new words,
  switching boards or entering order details in an unchanged older tab writes
  its stale draft over them. Compare design and order against the last loaded
  or successfully saved values before writing. Navigation now leaves the
  shared stored record and its timestamp untouched. Immutable image strings
  remain shared; no new project format or storage keys are introduced.
- Keep saves queued while another write is pending, and remember the values
  actually sent to storage rather than newer edits at completion. Real
  IndexedDB regressions cover typing and undo during a pending save, unchanged
  navigation in two tabs, and a fresh edit reverted before its first debounce.
  Three of the six cases failed before the guard; all six passed afterward.
  An untouched new page still says Not saved yet and creates no saved record.
- On phones, show failed, stalled and unreadable save notices alongside the
  preview while keeping routine saving/saved messages quiet. Refresh sticky
  scroll spacing when an asynchronous notice changes toolbar height. Six
  regressions at 320 and 375 pixels failed before the fix and passed afterward;
  they check readable notices, focused editing, export and persisted contents.
  Independently inspected the 320-pixel error screenshot for overlap/overflow.
- A delayed empty-store read exposed a stale screen-reader announcement.
  Once that check finishes, announce Not saved yet and clear the recovery flag;
  ordinary fresh loads remain quiet. The new regression failed before the fix.
- Replace misleading fallback contact/custom-order guidance: notes are sent
  only with a successfully received order, and an unavailable contact method
  is not replaced with an invented one. Explain the distinct uses of a shared
  PNG preview, a full-size print file and an editable project. Manual desktop
  and phone checks confirm the unavailable-order form keeps its inputs and
  configured business copy still takes precedence. No pricing, checkout or
  customer-message behavior changed.
- Intentional edits in multiple tabs can still overwrite each other's saves.
  Conflict detection and recovery of competing edits need a separate change;
  the README now distinguishes that limitation from unchanged navigation.
- Final clean `npm test`: **68 node tests, 266 Chromium browser tests and
  TypeScript checks passed**. The first full run had two startup timeouts;
  retained traces showed Chromium `ERR_NO_BUFFER_SPACE` fetching dependencies
  before the app executed, with no response headers or syntax errors. Both
  cases passed three focused reruns, then the entire frozen suite passed.
  All seven save-notice cases also passed independently after the announcement
  fix. Independent reviews found no remaining issues within this increment;
  syntax and whitespace checks passed. Main remained `06f7b0e` on final fetch.
- No production release or real order was made. The unresolved Vercel preview
  access, physical iOS keyboard/native-sharing checks and owner-supplied
  business configuration remain the same as in the previous increment.

## Tenth increment - verified order-return guidance

- Started from clean `c41128b` at 5:53 a.m. Toronto. The Claude handoff was
  already pushed. Main remained `06f7b0e`; PR #2 was open and mergeable with
  no deployment checks. Continued on the same branch and preserved all work.
- Reproduced the return screen claiming success and promising a receipt and
  shipping follow-up before its order lookup finished. The same claims stayed
  visible after pending, missing-order and offline responses. Both successful
  and cancelled checkout return URLs now identify the order to check; only
  its validated server response determines the displayed status.
- Keep the order code visible during lookup, distinguish payment-unconfirmed,
  paid, in-production, shipped and cancelled records, and show an honest
  unavailable/not-found message when the check fails. No charge, refund,
  receipt or shipping-contact claim is inferred from the return URL. Display
  the stored order summary with currency and its before-tax qualification.
- A Check status again button makes a fresh GET, with duplicate requests
  suppressed and an eight-second timeout covering response headers and body.
  Invalid/missing codes make no request. Mismatched codes, unknown statuses,
  malformed amounts/products and unsupported currency remain unconfirmed.
  The timeout also prevents a late response from replacing a later retry.
- Independent review reproduced arrays passing coerced property-key checks;
  require string status/product values before lookup. A keyboard regression
  found native button disabling dropped focus. Use an accessible disabled
  state plus a synchronous guard, retaining focus without restoring it later
  over a newer edit. Completed checks do not scroll or focus the page.
- Fourteen new browser regressions and the corrected cancellation test pass
  in the focused run. They cover real GET requests with stubbed responses,
  both return URLs, pending/verified states, bad response shapes, timeouts,
  retries, retained saved artwork and editing during a retry. The initial red
  run reproduced three failures before implementation. Inspected the 375-pixel
  pending-status screenshot: code, explanation, summary and focused retry are
  readable with no horizontal overflow.
- A separate fresh keyboard/customer audit found no additional gap across
  six desktop/phone viewport sizes and advanced text/art controls, including
  200%/400% equivalent reflow. This is viewport emulation, not verification of
  native browser zoom, physical iOS keyboards or native OS sharing.
- The public `app.mjs` returned HTTP 200 but still lacked template search,
  outgoing request preparation, unchanged-save protection and these verified
  outcome messages. The Vercel team permission limitation remains recorded;
  no denied team operation was retried and no production release was made.
- Final full `npm test`: **68 node tests, 280 Chromium browser tests and
  TypeScript checks passed**. Independent review closed the response-shape
  and retry-focus findings; syntax and whitespace checks passed. Prices,
  checkout submission, saved-project format and server handlers are unchanged.
  All order-status responses in tests were stubbed; no real purchases or
  customer messages were made. The Claude handoff is updated with this result.

## Next overnight priorities

1. Check the existing overnight PR and remote main for Claude changes before editing.
2. Check any new PR preview/check results. The currently inspected public site
   and preview are older; explicit Vercel team access is blocked as noted above.
3. Audit fresh desktop/mobile customer journeys, including image placement,
   text personalization and keyboard navigation; change only concrete gaps.
4. Check resource use with several photos if actual editing reveals another
   problem. Photo-history duplication is addressed by the fifth increment.
5. Device-test native sharing and the iOS keyboard when a physical device is
   available; Chromium emulation does not establish those behaviors.
6. Keep changes small, independently reviewed and tested; update this work log
   and the same PR with each meaningful increment. No new cloud storage or
   invented business details. Stop by 7 a.m. Toronto and report remaining needs.

## Local verification

Set `PLAYWRIGHT_CHROMIUM` to the installed Chromium executable before `npm test`
if Playwright's expected download is unavailable. Set `CB_PORT` to a free port
if another test worker is using the default. Parallel agents need separate
ports and separate top-level output folders: a full Playwright run clears its
output folder, including nested results from another run. Generated results
are ignored by Git.
