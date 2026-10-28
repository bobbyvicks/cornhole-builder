# Cornhole Creative Pack — Volume 01

24 original SVG clip-art assets and six coordinated, editable board templates.

Open `preview.html` to browse everything offline. The gallery supports category filters, keyword search, ink-colour previews, and downloads. The builder now loads this collection through `../lib/creative-pack.mjs`; `CLAUDE-INTEGRATION.txt` records the integration contract for future updates.

## Contents

| Location | Purpose |
| --- | --- |
| `svg/` | 24 transparent, single-colour SVG icons |
| `integration/creative-pack.mjs` | Native Path2D clip definitions and editable template factories |
| `templates/*.json` | Editable text, positions, palettes, artwork references, and metadata |
| `templates/svg/` | Six full-board vector artwork files; text is outlined |
| `previews/collection-overview.png` | All six designs and all 24 icons in one image |
| `previews/icons-contact-sheet.png` | Labelled icon collection |
| `previews/icons/`, `previews/templates/` | Individual transparent icons and board previews |
| `manifest.json` | Machine-readable catalog |
| `sources/` | Canonical editable icon paths and template definitions |
| `fonts/` | Four fonts and their SIL Open Font Licence notices |
| `tools/` | Rebuild and validation scripts |
| `validation/` | Geometry and compatibility results |

## Collections

**Wedding:** Botanical Arch, Linked Rings, Celebration Toast, Love Letter. Template: Garden vows.

**Family:** Family Oak, Home Is Love, Paw Heart, Family Crest. Template: Family roots.

**Cabin & lake:** Lakeside Cabin, Canoe Sunset, Mountain Pines, Leaping Fish. Template: Lake days.

**Camping:** Ridge Tent, Campfire, Trail Lantern, Compass Rose. Template: Off the grid.

**Backyard BBQ:** Kettle Grill, Pitmaster Tools, Offset Smoker, Stacked Burger. Template: Backyard pitmaster.

**Game day:** Cornhole Badge, Varsity Trophy, Baseball Diamond, Football Play. Template: Game on.

## Colour and editing

Icons use one `currentColor` fill and real transparent cutouts, with `fill-rule="evenodd"`. For inline SVG, set CSS `color`. For an external SVG image or canvas import, replace `currentColor` with the required colour before creating the image. The native module exposes colour through the builder's existing clip controls.

Each icon is centered in a 100 × 100 viewBox. IDs have a stable `bbp1-` prefix to avoid collisions with the existing library. The filled shape remains editable through the native builder's standard transformations.

Template SVG lettering is converted to vector outlines so the proof does not depend on installed fonts. Edit names in the JSON/native module, then regenerate the artwork. The JSON is descriptive template data, not a saved-design file for an existing import button.

## Board geometry

Templates use a 24 × 48 inch trim canvas. Hole center: 12 inches from the left, 9 inches from the top. Hole diameter: 6 inches. PNG previews show the hole; the full vector artwork intentionally omits a printed black hole and cut guide. No bleed is added. Confirm production bleed with the printer.

Templates use matching designs on the two boards by default and support separate-board editing. All sample names and dates are fictional personalization examples.

## Fonts

Anton 400, Bebas Neue 400, Cinzel 700, and Montserrat 800 were already present in the audited site's font list. Font files were retrieved from Google Fonts. Individual licence notices are in `fonts/`. They are included for reproducible local previews and outline conversion. Keep the notices if redistributing the fonts. The original icon paths and template compositions were created for this project; no stock clip-art files or sports-team marks were imported.

## Rebuild

Use Node.js with the dependencies declared in `package.json`:

```sh
npm install
npm run build
npm run verify
```

The application integration module itself has no dependencies. Node dependencies are only for rebuilding previews and checking the deliverables. Browser preview files run locally without a server or network access.

The application registers all 24 clips, six categories, and six templates additively in `../ui/model.mjs`. Its runtime module is an exact copy of `integration/creative-pack.mjs`; after rebuilding the pack, copy that module to `../lib/creative-pack.mjs` as part of the update. Keep the `bbp1-` IDs stable for saved designs.

`../tests/creative-pack.spec.js` covers all artwork buttons, SVG silhouettes and cutouts in preview and print on light and dark backgrounds, independent template layers, and recolour/undo/transform/duplicate/save/reload with separate boards. Run it from the application root with `npm exec -- playwright test tests/creative-pack.spec.js`. The browser suite blocks network fonts for deterministic rendering; the pack's own validation covers the supplied font files. Repository integration does not by itself confirm a live deployment.
