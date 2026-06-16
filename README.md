# wallbreak — site

The landing page and case study for **wallbreak**, a read-only tool that finds public
GitHub repositories containing copies of your fonts. Built from a Figma design by
Christopher Robin Fiore, set in **SLTF Dessign Maison** (SilverStag Type Foundry).

Static, no build step.

## Structure

- `index.html` — the hero landing page
- `case-study.html` — the wallbreak case study
- `styles.css` — shared styles, tokens, motion
- `app.html` / `app.js` / `app.css` — the in-browser scanner
- `vendor/opentype.min.js` — font parser used by the scanner
- `fonts/` — self-hosted SLTF Dessign Maison (woff2 / woff only; the raw .otf source is intentionally not published)
- `favicon.svg`

## Run locally

```bash
cd wallbreak-site
python3 -m http.server 8000
# open http://localhost:8000
```

(Serve over HTTP, not `file://`, so the preloaded web font loads cleanly.)

## Deploy on GitHub Pages

1. Push this folder to a GitHub repo.
2. Settings → Pages → deploy from branch → `main` / root.
3. `.nojekyll` is included so Pages serves every file as-is. All paths are relative,
   so it works from a project subpath too.

## Notes

- The font is self-hosted and converted to woff2/woff for the web. Only the web formats
  are published; the raw `.otf` source is deliberately kept out of this public repo.
- Designed and built by **Christopher Robin Fiore** ([@globalanomalyindex](https://github.com/globalanomalyindex)).
- The wordmark uses the font's OpenType stylistic sets: `ss02` across the word, `ss01`
  on "break" (with ligatures off), matching the Figma source.
- "other projects :>" links to https://github.com/globalanomalyindex.
