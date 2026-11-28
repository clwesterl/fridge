# Wine & Sake Fridge (+ Whiskey and Bourbon shelves) and Sunshine Wine Club: notes for Claude

Chad and Nadia's two wine apps; the fridge page also has Whiskey and Bourbon tabs. Read this before adding bottles, changing a page, or touching the data.

## Architecture (same pattern as Movie Months and Two Spins)

| | |
|---|---|
| App repo (public, GitHub Pages) | `clwesterl/fridge`, served at https://clwesterl.github.io/fridge/ |
| Fridge page | `index.html`: tabs In the fridge (6 × 3 fridge map + bottle cards), Finished, Whiskey (distillery map + whiskey cards, no slots), and Bourbon (American whiskey cards grouped by brand, no map yet). Hash routes `#fridge` `#finished` `#whiskey` `#bourbon` |
| Club page | `club.html`, Sunshine Wine Club monthly pickups |
| Data repo (private) | `clwesterl/fridge-data`: `fridge.json` (wine and whiskey), `club.json`, `labels/*.jpg`, `cards/*.jpg` |
| Maps | Leaflet 1.9.4 vendored in `vendor/leaflet/` (official release zip; loaded only when the Whiskey tab or its sheet opens). Tiles: OpenStreetMap's standard tiles (`tile.openstreetmap.org`, no key; follow its tile usage policy: keep the attribution, no pre-fetching, no restrictive Referrer-Policy), muted with a CSS filter and inverted for dark mode. CARTO's basemaps were used first but have required an API key since Sept 25, 2026. Distillery search in the sheet: OpenStreetMap Nominatim, only when someone taps Find |

- Single-file HTML/CSS/JS, no build step. Both pages read and write the data repo through the **GitHub Contents
  API** with a **fine-grained token** (Contents: read and write on `fridge-data`).
- Per-browser settings in `localStorage` (shared by both pages, same origin): `fridge_token`, `fridge_person`
  (`chad` | `nadia`), and optional overrides `fridge_owner` / `fridge_repo`. On first run the fridge page borrows
  `mm_token` (Movie Months) or `twospins_token` if one of them already works on `fridge-data`, so a device that
  has those apps set up needs no pasting. The club page uses whatever the fridge page set up.
- There is no login. The person picker only labels ratings and commit messages; anyone holding the token can
  change anything.
- **Writes.** Every change is a function applied to the JSON document. It is applied on screen at once, then
  written in order: apply it to the latest server copy, PUT with that file's `sha`, and on 409/422 re-read and
  re-apply (up to 4 tries). Commit messages read `<Name>: <what>`, e.g. `Nadia: finished Château Meyney Grand Vin 2022`.
  The pages re-read when the tab regains focus and every 90 s.
- Photos are separate files in the data repo (`labels/…`, `cards/…`), fetched with the token as raw bytes and
  shown as object URLs. The fridge page uploads a new label photo as its own file before saving the bottle.
- The earlier Claude artifact versions are **retired**. They show a "moved" banner and their data is frozen as
  of Nov 21, 2026: fridge https://claude.ai/artifact/9HmtJsSkgcm8TrxxufFPWk, club
  https://claude.ai/artifact/YMTrtdur41oD33KCMuwRvX. Don't update them.

## Data (`fridge-data`)

### `fridge.json`

```json
{"version": 1, "wines": {"<wineKey>": {…}}, "bottles": {"<bottleId>": {…}}, "tastings": {"chad": {"<wineKey>": {"stars": 4, "note": "", "updatedAt": "ISO"}}},
 "spirits": {"<spiritKey>": {…}}, "spiritBottles": {"<spiritBottleId>": {…}}, "spiritTastings": {"nadia": {"<spiritKey>": {…}}}}
```

The three `spirit*` collections are the Whiskey and Bourbon tabs (below). The pages add them as `{}` on their next save if missing.

`wines[<wineKey>]`: one per wine identity. Vintages of the same wine share a key.

| field | notes |
|---|---|
| `type` | `red` `white` `rose` `sparkling` `orange` `dessert` `sake` `other` |
| `producer`, `name` | `name` excludes producer and vintage |
| `style` | classification or grade: "Premier Cru", "Bolgheri DOC Rosso", sake "Junmai Ginjo" |
| `varietal` | grapes with %s if known; for sake the rice and polish |
| `appellation`, `region`, `country`, `abv` | strings; `abv` like `"13.5%"` |
| `nose`, `palate`, `pairings`, `facts` | arrays of short phrases; facts ≤ 3 |
| `serve` | serving temp / decanting / drink-by advice |
| `short` | ≤ ~14 chars, the label on the fridge map |
| `labelPath` | `labels/<file>.jpg` in the data repo, or `""` |
| `source` | `research` (web), `club` (club card notes), `manual`; old cards may say `label`. `club` also marks Sunshine Wine Club bottles: their names show in orange on the Fridge tab (map labels and list) and in the Finished list |
| `sources` | `[{title, url}]`, shown as links when `source` is `research` |
| `sourceNote` | free text shown when `source` is `club` |
| `createdAt`, `updatedAt` | ISO timestamps |

`bottles[<bottleId>]`: one per physical bottle. Id `b-YYYY-MM-DD-<short-slug>`.

| field | notes |
|---|---|
| `wine` | the wineKey |
| `vintage` | number or `null` |
| `slot` | `r{row}c{col}` or `""` (door / on top / elsewhere). Row 1 = top, row 6 = bottom; col 1/2/3 = Left/Middle/Right |
| `status` | `"in"` or `"finished"` |
| `opened`, `openedOn` | bool, date |
| `addedOn`, `finishedOn` | `YYYY-MM-DD`, America/Phoenix; `lastSlot` kept when finished so "Put back" works |
| `purchasedOn`, `purchasedFrom` | optional; Chad and Nadia fill these in |

**wineKey** = `slug(producer + " " + name)`: NFD-fold accents, lowercase, non-alphanumerics → `-`, trim, max
120. It must match `wineKeyFor()` in `index.html` so "Bought it again" reuses the card and the counter.

**Finished counter**: the number of bottles with `status: "finished"` for that wineKey. It is derived, so there is no
counter field.

### Whiskey and bourbon (`spirits`, `spiritBottles`, `spiritTastings` in `fridge.json`)

Both tabs read the same collections; `kind` decides the tab (`tabOf()`): `bourbon`, `rye` and `american` go on the
**Bourbon** tab (grouped by brand, meta line shows proof, no maps on the tab or its cards, the add sheet keeps the
distillery name but hides the map finder), everything else on **Whiskey**. Chad asked for "no map for now" on
Bourbon; the cards still store `distillery` and `place` so one can be added later.

**Batch releases** (Booker's, Elijah Craig Barrel Proof, Lagavulin Distillers Edition…) differ in proof, age and
notes, so each batch is its own card: put the batch in `name` (`2022-02 “The Lumberyard Batch”`, `Barrel Proof
Batch C918`, `The Distillers Edition 2003`) and copy the label's age as free text (`7 yr 1 mo 7 days`, `11 yr 2 mo`).
Proof is shown as ABV × 2 with one decimal (131.4), so store the label's exact ABV.

Same idea as wines: one `spirits[key]` card per whiskey, one `spiritBottles[id]` per physical bottle, ratings in
`spiritTastings[person][key]` (same shape as `tastings`). No slots. **spiritKey** = `slug(producer + " " + name)`, the
same `wineKeyFor()` slug. Bottle id `s-YYYY-MM-DD-<short-slug>-<4 random>`.

`spirits[<spiritKey>]`:

| field | notes |
|---|---|
| `kind` | `scotch` `bourbon` `rye` `american` (other US) `irish` `japanese` `canadian` `world` (other whisky) `other` (not whiskey) |
| `producer`, `name` | brand as on the label ("Lagavulin", "Blanton's") and expression ("16 Year Old", "Single Barrel") |
| `style` | "Single malt", "Blended Scotch", "Straight bourbon", "Bottled-in-bond", "Single pot still"… |
| `age` | string: `"16"` shows as "16 yr"; free text otherwise ("NAS") |
| `abv` | `"43%"`. American kinds also show proof (ABV × 2) unless the string already says proof |
| `region`, `country` | Scotch `region` must be one of **Islay, Speyside, Highlands, Lowlands, Campbeltown, Islands** (Islands may add the island: "Islands (Skye)"); it picks the map color and the region filter. Others: state/county ("Kentucky", "County Cork"). `country` "Scotland", "United States", "Ireland", "Japan"… |
| `distillery` | where it's made, which is where the pin goes ("Buffalo Trace Distillery" for Blanton's). Blank for a blend with no single home |
| `place` | town or area of the distillery, without the region ("Port Ellen, Isle of Islay", "Frankfort") |
| `lat`, `lon` | numbers (5 decimals is plenty), or `null` = no pin |
| `cask`, `grain` | cask/finish text; grain or mash bill ("75% corn, 13% rye, 12% malted barley") |
| `nose`, `palate`, `finish`, `facts` | arrays of short phrases; facts ≤ 3 |
| `serve` | "Neat, a few drops of water" etc. |
| `labelPath`, `source`, `sources`, `sourceNote`, `createdAt`, `updatedAt` | as for wines |

`spiritBottles[<id>]`: `{spirit, status: "in"|"finished", opened, openedOn, level, addedOn, finishedOn, purchasedOn, purchasedFrom}`.
`level` is how full an opened bottle is: `100` `75` `50` `25` `10` (Full, ¾, ½, ¼, Last pour). `opened: false` = sealed
(`level` 100). Finishing keeps `level`; "Put back" sets `status` back to `in`.

Map colors come from `regionGroup()` in `index.html`: the six Scotch regions, then Ireland, United States, Japan, and
gray for Scotland-region-unknown and everywhere else. Seven neighbors can't all be told apart by color, so every pin
is labeled with its distillery and the legend chips filter (tap Islay → only Islay, zoomed in).

### `club.json`

```json
{"version": 1, "months": {"2026-11": {…}}, "wines": {"<id>": {…}}, "tastings": {"<person>": {"<id>": {…}}}}
```

- `months[YYYY-MM]`: `{label, club, selection, curator, curatorTitle, cardPath}`, with `cardPath` = `cards/card-YYYY-MM.jpg`
- `wines[<YYYY-MM>-<producer-slug>-<wine-slug>-<vintage>]`: `{month, order, producer, wine, grape, vintage,
  appellation, region, country, color, nose[], palate[], pairings[], facts[], notes, status, openedOn,
  finishedOn, buyAgain}`. `notes` is the full card text; `status` is `rack` | `opened` | `finished`.

JSON formatting: one-space indent, UTF-8 unescaped (what the pages write). From Python:
`json.dump(doc, f, ensure_ascii=False, indent=1)`. Keep it the same so diffs stay readable.

## Adding bottles from label photos (Claude's usual job)

1. Get the data repo: `git clone https://github.com/clwesterl/fridge-data` (or `git pull` if already cloned).
   **Always pull right before editing**, because the pages commit too.
2. Read each label. The cloud workspace can't decode iPhone HEIC; ask for JPEG or a screenshot.
3. Check occupied slots in `fridge.json` (bottles with `status: "in"`). If Chad names slots, use exactly those.
   Otherwise use the first empty slots in reading order (`r1c1, r1c2, r1c3, r2c1, …`), say which in the
   reply, and expect him to move them. Don't guess a scheme (reds up top etc.).
4. Web search each bottle: producer page, importer tech sheet, or a good retailer. Collect grapes, ABV, nose,
   palate, pairings, serving, 2–3 facts, and scores if handy. Leave unknowns blank rather than guess (grapes
   especially). Pairings or serving notes you add yourself are fine; say so in the reply.
5. Photos: `convert in.jpg -auto-orient -resize 1400x1400 -quality 82 labels/<slug>.jpg`.
6. Edit `fridge.json` with a short Python script: add `wines[key]` (don't overwrite an existing card on a re-buy,
   just add the bottle) and `bottles[id]` with `status "in"`, `opened false`, `addedOn` today in
   America/Phoenix, `finishedOn ""`, `purchasedOn/From ""`, and `source "research"` plus `sources` on new cards.
7. `git commit -m "Claude: add <wines> (<slots>)"` and push. If the push is rejected, `git pull --rebase`; on a
   JSON conflict, reset to the remote file and re-run the script.
8. Reply with one bullet per bottle (slot + a 1–2 sentence summary), slots filled out of 18, and a "Sources:"
   list.

### Whiskey bottles

Same steps, with these differences:
- No slots. New bottles are `status "in"`, `opened false`, `level 100` unless Chad says it's open (then `opened
  true`, `openedOn` today, and the level he gives).
- Research also needs the **distillery and its coordinates** (Whiskey tab; for Bourbon-tab kinds the distillery
  name and town are enough until it gets a map). Take them from the distillery's Wikipedia infobox or
  Wikidata (coordinate location), or the distillery's own address page; round to 4–5 decimals. Check the pin is the
  distillery, not a brand office or visitor center (Johnnie Walker Princes Street in Edinburgh distills nothing; Blanton's is made at Buffalo Trace). For a
  blend with no single home, leave `lat`/`lon` null and say so. Nominatim can't be reached from the workspace.
- Set `region` to the official Scotch region for scotch (Arran and Jura are Islands; Glenmorangie is Highlands;
  Speyside distilleries are Speyside even though Speyside sits inside the Highlands).
- Commit `Claude: add <whiskeys> to the whiskey shelf`. Reply with one bullet per bottle (distillery, region,
  1–2 sentence summary) and a Sources list.

Club wines going into the fridge reuse the club card's notes: `source: "club"`,
`sourceNote: "Notes from the Sunshine Wine Club card, <Month YYYY>"`.

## Adding a club month

Transcribe the card exactly (rejoin words split at line breaks, keep accents and curly apostrophes). Save the
shrunk photo as `cards/card-YYYY-MM.jpg`, then add `months[YYYY-MM]` and both `wines` entries to `club.json`
(`order` 1 and 2, `status "rack"`). If the card spells a name two ways, use the fuller form and mention it. If
those bottles also go in the fridge, add them to `fridge.json` too.

## Changing the pages

- Edit `index.html` / `club.html` here, run the checker, commit, push. GitHub Pages redeploys in about a minute.
- Checker: `node tools/render-check.js . <path to a fridge-data checkout> <outdir>`. It serves the pages
  on localhost, answers api.github.com from the data checkout (writes stay in memory), clicks through
  open/rate/finish/add and the club status toggle, and saves light/dark, desktop/phone screenshots. Read the PNGs.
  For the Whiskey tab it injects a dozen test whiskies in memory (real data untouched), serves a blank map tile from
  `tools/tile.png` and a fake Nominatim answer, and exercises the region filter, pin taps, level, rating,
  finish, and the add sheet's distillery finder.
- Keep the two pages' GitHub layer in sync (`ghGetJSON`, `ghPut`, `commit`/`drain`, the localStorage keys).
- Lessons already learned: a generic class like `empty` collided with `.slot.empty` and stretched the map (slots
  are now `.vacant`); a % width plus `aspect-ratio` inside grid/flex gives bad heights; decode base64 with
  `TextDecoder`, never bare `atob`, or accented names break; and read UTC ISO timestamps as dates through
  `new Date()`, not by slicing.
- Map lessons: Leaflet sets SVG presentation attributes, so pin colors come from CSS classes on `path.pin`
  (`.pin.rg-islay` etc. use `--rg-*` tokens that switch for dark mode), not from options. Map containers need
  `isolation:isolate` or Leaflet's z-index 400–1000 panes cover the sheets and overlays. Keep `zoomSnap` at 1
  (fractional zoom blurs tiles and leaves seams). The overview's `minZoom` is 1 so Kentucky and Japan fit together.
  On touch screens map dragging is off so one finger scrolls the page; pinch moves and zooms the map.

## New device / token

Open https://clwesterl.github.io/fridge/, paste the token, pick a name. The token is a fine-grained PAT:
GitHub → Settings → Developer settings → Fine-grained tokens → Repository access: Only select repositories →
`fridge-data` (it can be the same token as Movie Months with this repo added) → Permissions: Contents read and
write. On iPad/iPhone, Share → Add to Home Screen gives it an app icon.
