# KIABI warehouse project report deck

Generates the PowerPoint sent to KIABI Retail International: completion status,
floor layout, goods-flow process and site photos, with every figure read live
from the warehouse rather than typed by hand.

## Rebuild

```bash
node scripts/kiabi-report/snapshot.mjs     # refresh live figures (needs .env.local)
node scripts/kiabi-report/build-deck.mjs   # → out/KIABI-Warehouse-Report-<date>.pptx
```

`snapshot.mjs` takes ~1–2 min against the live database. Rerun both on the day
the deck goes out so the "position as on" date and all counts match.

To also produce a PDF (KIABI can open it without PowerPoint):

```bash
"C:\Program Files\LibreOffice\program\soffice.exe" --headless --convert-to pdf --outdir scripts/kiabi-report/out scripts/kiabi-report/out/KIABI-Warehouse-Report-<date>.pptx
```

## Files

| Path | What it is |
|---|---|
| `content.mjs` | Every word in the deck — headings, process steps, photo captions, next steps |
| `snapshot.mjs` | Live figures → `data/snapshot.json` |
| `build-deck.mjs` | Slide layout and build |
| `photos/` | Site photos (Nilesh Bhondkar, 31-Jul-2026). Drop new ones here and add a caption in `content.mjs` |
| `build/img/` | Downscaled copies, cached. Delete a file here to re-process its photo |
| `out/` | Generated deck |

## Before sending

- **`APPROVAL_50PCT` in `content.mjs` is placeholder text.** While it starts with
  `[TO CONFIRM]` the slide renders it in red and the build prints a warning.
  Replace it with the agreed wording.
- Photos of the **dead stock area** and the **dock / pallet rack alley** were asked
  for but not supplied; the deck currently says the dead stock zone is still to be
  marked. Add the photos and revise `NEXT_STEPS` once that is done.
- The rack layout slides are a **schematic**, not a to-scale floor plan — labelled
  as such. KIABI's separate request for a floor layout drawing is still open.

## Adding a photo

1. Drop the file in `photos/`.
2. Add a caption in `CAPTIONS` in `content.mjs`, keyed by file name.
3. Reference the file name in the slide you want it on, then rebuild.
