# Claude handoff: cornhole builder

The owner asked Codex to push the overnight improvements for you to pick up.
Review the existing PR and continue from the implemented work below.

## Source to pick up

- Repository: https://github.com/bobbyvicks/cornhole-builder
- PR: https://github.com/bobbyvicks/cornhole-builder/pull/2
- Branch: `codex/overnight-ux`
- Tested implementation commit: `f4d456a0fbc77c63e06855250ad81a034907cac4`
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
- Latest increment: unchanged board/order navigation no longer saves a stale
  tab over a newer draft. Pending-save typing and undo remain safe. Mobile save
  errors, stalled reads and unreadable drafts remain visible; completed recovery
  updates the screen-reader announcement.

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
the 300.3 px it asks for at 320 x 740); it was not changed. The full suite
was not run for the fix commit; run `npm test` before merging.

## Verification

At the tested implementation commit `f4d456a`, the final clean `npm test`
passed:

- 68 node tests.
- 266 Chromium browser tests.
- TypeScript checking; syntax and whitespace checks also passed.

Tests cover real shared IndexedDB tabs, pending-save races, image round trips,
print metadata, mobile recovery, imports and, since the review fixes, all 480
pricing combinations (each total against the price list and its own lines).
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
3. Add conflict detection and recovery if supporting deliberate edits in two
   tabs. The latest fix protects unchanged navigation; competing actual edits
   can still overwrite each other's saves.
4. Obtain and verify the owner's actual prices, contact details, product photos
   and fulfilment policies before release. Keep existing prices and checkout
   behavior intact until the owner provides replacements.

Preserve saved-design compatibility and artwork IDs. Do not register the
creative pack twice, invent business details or testimonials, or claim the live
site is updated solely because the branch is pushed.
