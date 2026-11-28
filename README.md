# fridge

Two small web apps for Chad and Nadia, hosted on GitHub Pages:

- **Wine & Sake Fridge** (https://clwesterl.github.io/fridge/): what's in our 6 × 3 wine fridge, where each
  bottle sits, tasting notes and ratings, and a Finished list that counts how many times we've had each wine.
  Its **Whiskey** tab does the same for scotch, bourbon and the rest, with each distillery pinned on a map.
- **Sunshine Wine Club** (https://clwesterl.github.io/fridge/club.html): every wine from our monthly club
  pickups, with the club's notes and our ratings.

The data lives in a private repo and is read and written with a GitHub access token saved in each browser.
See [CLAUDE.md](CLAUDE.md) for how it all works.

Maps use [Leaflet](https://leafletjs.com) 1.9.4 (BSD-2, vendored in `vendor/leaflet/`) with CARTO basemaps of
OpenStreetMap data.
