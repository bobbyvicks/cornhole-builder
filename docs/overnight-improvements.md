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

## Next overnight priorities

1. Check the existing overnight PR and remote main for Claude changes before editing.
2. Inspect any Vercel preview/check results for the pushed commit. Report blockers
   with evidence; do not claim production deployment from a Git push.
3. Audit usability with fresh desktop/mobile journeys: finding artwork, changing
   boards, recovering drafts and reviewing a complete personalized order.
4. Check image upload behavior when switching boards or templates while a large
   picture is being processed. Preserve familiar editing behavior.
5. Check print/preflight warnings, slow devices and startup recovery if tests reveal gaps.
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
