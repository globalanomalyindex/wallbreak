# wallbreak

the landing page, case study, and in-browser scanner for **wallbreak**, a read-only
cybersecurity tool that checks whether your paywalled fonts are exposed on public
github.

live: https://globalanomalyindex.github.io/wallbreak/

## what's here

- `index.html` the hero
- `app.html`, `app.js`, `app.css` the scanner. it reads a font locally, fingerprints it
  (name table plus a sha-256), searches github code search with your token, pulls down
  each candidate, and grades it weak, strong, or proven
- `case-study.html` the writeup
- `styles.css` shared tokens, type, and motion
- `vendor/opentype.min.js` the font parser the scanner uses
- `fonts/` the self-hosted font, web formats only (woff2, woff). the raw .otf source is
  kept out of this repo on purpose
- `favicon.svg`

## run it

serve over http (not file://) so the web font loads:

    python3 -m http.server 8000

then open localhost:8000. the scanner needs a github token, which stays in your browser,
to run a live search.

## deploy

static site, relative paths, and a `.nojekyll` file, so it drops onto github pages from
the main branch root as-is.
