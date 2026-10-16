# Cornhole Board Builder

A site where people design their own cornhole boards and order them.

- **Design live.** A regulation 24" x 48" board (6" hole, 9" from the top)
  drawn on a canvas in inches, not pixels. Thirty-two templates to start from
  (weddings, engagements, anniversaries, birthdays, baby showers, graduations, family, cabins, camping, tailgates, golf, business, holidays).
  Painted, two-colour fade or stained-wood base, 40 swatches plus a custom
  colour, nineteen patterns, 35 fonts, curved text with spacing, outline and
  shadow, on one line or several (Enter in a words field starts a new line;
  each line is centred, and bent and spaced on its own), 131 pieces of
  vector clip art in thirteen groups, any colour, uploaded pictures with
  flip, circle crop and white-background removal, and Fill the board: one
  picture per board drawn edge to edge under everything else, centred and
  trimmed to fit, in the preview and the print file alike (picked by a
  tap or a click on an empty spot, or from its list row, with no handles;
  a swipe that starts on it scrolls the page; unticked, it goes back to
  the place and size it had). Its print-size note offers unticking rather
  than a bigger file, since no file the page keeps can cover the board at
  100 dots per inch. New words and new clip art come in charcoal or
  off-white, whichever stands out more from the board where they land
  (the paint, a fade at that height, the stain, the pattern or a picture
  filling the board). Drag, resize and rotate
  on the board with handles (a red x on the handles removes; so does the
  button on each list row, and the Delete key), snap to centre, layer order,
  duplicate, undo/redo, and the design is kept in the browser across
  reloads. One design for both boards, or a different one each: switch
  boards above the preview or by tapping one, copy one board to the other,
  or make the other its colour opposite. On a phone the board pins under the
  header, the handles grow to finger size, picking something up opens the
  tab that edits it, and a bar at the foot carries the total and Review
  order. Templates are grouped by occasion with a blank start; a template
  hands over its first words selected and ready to type over, and each
  text has a field right in the list. Curve, spacing, rotation and layers
  sit under "Advanced text" and "Advanced artwork". Each board carries a
  hidden description for a screen reader, made again at every redraw: the
  base, the pattern, every text with its words and font, the clip art by
  name, the pictures by count, and which board is being edited when the
  two differ. The canvas keeps its short label, and the description is
  not a live region, so nothing is announced while someone edits.
- **A simpler start.** Search templates by name or occasion and filter the
  gallery: the cards are built once, a search shows the ones that match,
  and a thumbnail is drawn when it comes into view rather than all 160-odd
  of them before the page can be used.
  Template names resize within their original text space as you type;
  manual font, size, position and handle edits turn automatic fitting off.
  The phone layout has larger tap targets and makes room for the keyboard.
  Share a PNG preview from Start, or save an editable copy to open later.
  Find clip art by name or collection, with visible labels and compact group
  filters that keep the results close to the search field on a phone.
- **Kept safe.** The boards and the order choices are saved on the device
  (IndexedDB, with localStorage as the fallback) after every change, the
  page says "Saving", "Saved on this device" or exactly what went wrong,
  and a save that does not fit fails loudly instead of dropping a picture.
  Save errors are announced once, without speaking every saved keystroke,
  and a notice that storage failed stays on screen while the next
  keystrokes retry, so the field being typed in does not jump. While the
  saved design is being read back, the builder takes no click or key, so
  nothing can be typed over it; a device that takes more than six seconds
  gets the builder anyway, with a notice, and a design found after that
  is offered, not forced - whichever design is not kept is one Undo away.
  Two tabs on one device share the one saved project and the last save
  wins, but nobody is surprised: each page load has a token of its own
  that goes into every save, and after a save the tab sends the token and
  the time on a BroadcastChannel (through the storage event in a browser
  without one). A tab that hears of a newer save than the one on its
  screen says the project was changed in another tab, offers Reload, and
  says its next change replaces it (in the pinned toolbar on a phone, and
  otherwise in a line under the tabs that stays in view while the panel
  scrolls); that change saves as usual, the
  status goes back to "Saved on this device", and the other tab is the
  one told. The notice is announced once, and looking around an
  out-of-date tab writes nothing. A page back from the back-forward cache
  reads the saved record to see whether another tab wrote it meanwhile.
  Damaged records cannot hide an intact saved copy, and an
  unreadable draft is left untouched until the customer makes a new edit.
  Export writes the whole project as editable JSON; Import takes it back.
  Imported pictures and print masters must decode before the current draft
  is replaced; changes made while a file opens are preserved. Replacing a
  customized design asks first, and cancellation keeps the saved draft too.
  A design that has been worked on is never replaced by a template without
  asking, reload or no reload. Keys that edit the artwork (arrows, plus,
  minus, Delete) work only while its active board has the focus; browser
  shortcuts are left alone. Undo history shares image data across snapshots
  to keep repeated edits small.
- **Pictures.** Each upload has a preview of up to 1600 px for the board,
  and a print master as big as the file came (to 4000 px on the long side)
  when it contains more detail, sized so that the master and its preview
  travel together in one order request. A vector logo is drawn large for
  both. The page says when a picture is printed bigger than its pixels
  allow. An order carries only the board being ordered; one too big for
  the server even so leaves the masters out, then shrinks the previews,
  and says the full-size files will need to be supplied separately (there
  is no email follow-up yet, so none is promised).
- **Review.** Before the address: both boards as they will print, every
  choice, the price breakdown in USD before tax with what is and is not
  included, a check on words left over from a template, and the
  resolution warnings. Dispatch time (from the price list) is kept apart
  from delivery time, which is never promised.
- **Print file.** The same drawing code renders a 2400 x 4800 PNG at 100
  pixels per inch, with the hole marked as a hairline for the shop.
- **Order.** Options (set or single, satin, gloss or a matte guest-book
  finish that wedding guests sign, bags in your colours, a carrying case,
  rush, quantity), the occasion and the date it is needed by, a gift note,
  a live quote, a review, then the shipping form, and payment on Stripe
  Checkout. Orders land in a Supabase table; the Stripe webhook marks them
  paid. Shipping is to the contiguous United States: the page's state list
  and the server's check both read the price list. One tap sends one
  order: Continue to payment keeps the keyboard focus and turns a second
  press away while it works and while the payment page opens, and its
  answer is brought into view under it. An order answered with an invoice
  instead of a payment page takes the button away, with the order code
  left on screen, until the design or the options change and are
  reviewed again. Share preview and Download print file keep the focus
  the same way while they work.

Everything the customer sees is static: `index.html`, `app.mjs` and the
modules in `lib/` (`price.mjs`, `clips.mjs`, `templates.mjs`, `store.mjs`,
`site.mjs`). Two serverless functions in `api/` do the parts that need
secrets. No build step. The 35 web fonts come from Google Fonts through one
stylesheet that is fetched without holding the first paint: the page draws
straight away in system fonts, and the boards and the template thumbnails
are drawn again as the real faces land (a `<noscript>` copy of the link
serves a browser with scripts off).

## Business details

`lib/site.mjs` holds the trading name, contact details, delivery and
custom-order notes, the design-approval policy and the product photos. Every
field ships blank, and a blank field is shown as "being set up" rather than
filled with something invented. Fill it in once and the header, footer and
the "Contact & delivery" cards at the foot of the page pick it up.

## Run it locally

    npm install
    npm run serve          # http://127.0.0.1:5611

The designer works fully without any configuration. Ordering needs the
functions below, which run on Vercel (`vercel dev` serves them locally).

## Deploy

Deploy the folder as a Vercel project. `index.html` is served as-is and
`api/*.ts` become functions. Set these environment variables:

| Variable | What it is |
| --- | --- |
| `SUPABASE_URL` | The project URL, `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | The service role key. Server only, never in the page. |
| `STRIPE_SECRET_KEY` | `sk_live_…` or `sk_test_…`. Without it, orders are stored and answered as "we will invoice you". |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` for the endpoint below. |
| `SITE_URL` | Where Stripe sends people back, e.g. `https://boards.example`. Defaults to the request's host. |

Then:

1. Run `supabase/migrations/20261012000000_cornhole_orders.sql` on the
   project (SQL editor or `supabase db push`). It creates `cornhole_orders`
   with row level security on and no policies: only the service role can
   read or write it.
2. In Stripe, add a webhook endpoint at `https://<site>/api/stripe-webhook`
   for the event `checkout.session.completed`, and put its signing secret in
   `STRIPE_WEBHOOK_SECRET`.
3. Optionally turn on Stripe Tax and add `automatic_tax[enabled]=true` to the
   session body in `api/order.ts`; the page already tells customers tax is
   added at checkout.

## How an order moves

1. The page posts the design, the options, the previews and the address to
   `POST /api/order`.
2. The function validates everything (zod), prices it from `lib/price.mjs`
   (a total sent by the browser is ignored), inserts a `pending` row with a
   code like `CH-7F3K2Q`, opens a Stripe Checkout session for the quote's
   line items, and answers with the Checkout URL.
3. Stripe takes payment and sends the customer back to
   `/?order=success&code=…`, which shows the code and fetches the status
   from `GET /api/order?code=…` (status and amount only, never the address).
   A customer who leaves the Stripe page comes back to
   `/?order=cancelled&code=…`; that row stays `pending`, so the page says how
   to pay again from the Order tab (a new order with a new code).
4. Stripe calls `/api/stripe-webhook`; after checking the signature it
   moves the row from `pending` to `paid`. A second delivery, or one that
   arrives after the shop has moved the order on, changes nothing.

Orders with no Stripe key, and orders whose Checkout failed to open, stay
`pending` with no session id: the shop invoices those by hand from the row.

## Prices

Everything is in `lib/price.mjs`, in cents. The page and the server read the
same file, so a change there shows in the quote and is what gets charged.

## Tests

    npm test               # node tests, typecheck, then the browser suite
    npm run test:node      # pricing, the order API, the webhook: no browser
    npx playwright test    # the designer and the order flow in Chromium

The browser specs read pixels off the preview canvases and drive the page
through `window.cornhole`, the one global the page exposes on purpose. If
the environment ships its own Chromium, point `PLAYWRIGHT_CHROMIUM` at it.

## Adding clip art or a template

Clip art lives in `lib/clips.mjs`: each piece is a function that draws paths
into a 100 x 100 box, so it scales to any size and prints as vectors.
Templates are in `lib/templates.mjs`, built from the same element helpers
the page uses; each carries an `occasion`, which is the group it is shown
under, and its words are what the review calls sample words. The browser suite draws every piece and loads
every template, so a broken addition fails a test rather than a customer.

### Creative pack

[`asset-pack/`](asset-pack/README.md) contains 24 original SVG icons and six
editable board templates, plus their source data, previews and font licences.
Open [`asset-pack/preview.html`](asset-pack/preview.html) locally to browse the
collection. The native module in `lib/creative-pack.mjs` is registered in
`app.mjs`. [`asset-pack/CLAUDE-INTEGRATION.txt`](asset-pack/CLAUDE-INTEGRATION.txt)
documents the format and editing contract for future changes. Deployment
status is separate from this source integration.

## Still to do

- An admin view of orders (the table is the only one today).
- Email to the shop and the customer on a new paid order.
- Shipping outside the contiguous US, and real carrier rates.
- A shareable link for a design (images make the URL too long; it needs a
  saved-designs table).
- Merging edits made in two tabs. Today the last save wins: the tab that
  is behind says so and offers Reload, but its own unsaved view is not
  combined with the other tab's changes.
- The prices are placeholders, and `lib/site.mjs` is blank until the
  business fills it in.
