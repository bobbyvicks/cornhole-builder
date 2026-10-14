# Cornhole Board Builder

A site where people design their own cornhole boards and order them.

- **Design live.** A regulation 24" x 48" board (6" hole, 9" from the top)
  drawn on a canvas in inches, not pixels. Twenty-six templates to start from
  (weddings, engagements, anniversaries, birthdays, baby showers, graduations, family, cabins, camping, tailgates, golf, business, holidays).
  Painted, two-colour fade or stained-wood base, 40 swatches plus a custom
  colour, nineteen patterns, 35 fonts, curved text with spacing, outline and
  shadow, 107 pieces of vector clip art in seven groups, any colour, uploaded pictures with
  flip, circle crop and white-background removal. Drag, resize and rotate
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
  sit in a "More" section.
- **Kept safe.** The boards and the order choices are saved on the device
  (IndexedDB, with localStorage as the fallback) after every change, the
  page says "Saving", "Saved on this device" or exactly what went wrong,
  and a save that does not fit fails loudly instead of dropping a picture.
  Export writes the whole project as editable JSON; Import takes it back.
  A design that has been worked on is never replaced by a template without
  asking, reload or no reload. Keys that edit the artwork (arrows, plus,
  minus, Delete) work only while a board has the focus.
- **Pictures.** Each upload is kept twice: a 1600 px preview the board is
  drawn with, and a print master as big as the file came (to 4000 px on
  the long side) that the print file and the order use. The page says when
  a picture is printed bigger than its pixels allow.
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
  and the server's check both read the price list.

Everything the customer sees is static: `index.html`, `app.mjs` and the
modules in `lib/` (`price.mjs`, `clips.mjs`, `templates.mjs`, `store.mjs`,
`site.mjs`). Two serverless functions in `api/` do the parts that need
secrets. No build step.

## Business details

`lib/site.mjs` holds the trading name, contact details, delivery and
custom-order notes, the design-approval policy and the product photos. Every
field ships blank, and a blank field is shown as "being set up" rather than
filled with something invented. Fill it in once and the header, footer and
the "Good to know" cards pick it up.

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

## Still to do

- An admin view of orders (the table is the only one today).
- Email to the shop and the customer on a new paid order.
- Shipping outside the contiguous US, and real carrier rates.
- A shareable link for a design (images make the URL too long; it needs a
  saved-designs table).
- The prices are placeholders, and `lib/site.mjs` is blank until the
  business fills it in.
