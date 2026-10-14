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
