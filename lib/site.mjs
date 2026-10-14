/* THE BUSINESS BEHIND THE SITE.

   Everything here is shown to customers, so nothing here is made up: a
   blank field is left blank and the page says the detail is still being
   set up. Fill these in once with the real name, contact details, product
   photos and policies, and the header, footer and the "Good to know" cards
   pick them up. Photos go in a `photos/` folder next to index.html and are
   listed here with alt text. */
export const SITE = Object.freeze({
  name: '',            // the trading name, for the header and footer; blank shows "Cornhole Board Builder"
  email: '',           // e.g. 'orders@example.com'
  phone: '',
  address: '',         // where the boards are built, if you want it shown
  hours: '',           // e.g. 'Mon-Fri, 9 to 5 Central'
  delivery: '',        // delivery details beyond what the price list already says (carriers, kerbside, pallets)
  customOrders: '',    // how requests the builder cannot do are handled
  approval: '',        // the proof / design-approval policy, if there is one beyond "what you see is what we print"
  photos: Object.freeze([]),   // genuine product photos: [{ src: 'photos/set-on-lawn.jpg', alt: 'A finished navy set on a lawn' }]
});
