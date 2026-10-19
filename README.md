# Kinsips · Family genealogy

A clean, customizable genealogy editor with a shared table and kinship diagram. No external dependencies, tracking scripts, API keys, or runtime backend.

## Add a family

1. Open the website and build a family with **Add person**, or import an existing file.
2. Export the family as JSON.
3. Choose **Add .json files**, upload the export into `data/`, and commit it.
4. The **Validate and deploy Kinship** GitHub Actions workflow discovers every JSON file, validates it, generates the catalog, and publishes the updated website.

You can add multiple `.json` files, including files in subfolders of `data/`. Each table inside each file appears in the family selector. Do not manually edit the generated `data/index.json`. Invalid JSON or cyclic parent relationships fail the build and leave the last successful website available.

## Customize

- **Family settings:** table name, description, new/duplicate/delete family, restore published data.
- **Customize:** page title, subtitle, every table heading, column visibility, colors, font, text size, spacing, Henry numbering, deceased symbol, daughter-line and marriage-order marks, diagram orientation, nodes, and connectors.
- **Select a person:** edit their name, gender, parents, spouses, order, dates, relation label, and notes. Stable IDs allow duplicate names and safe renaming.
- **Diagram:** both parents, multiple spouses, zoom, fit, full screen, and downloadable SVG.
- **Table:** search, indentation, Henry numbers, customizable columns, print.
- **Import/export:** multiple-file import and single-family or complete-collection export.

Browser edits stay on that device. Published data is loaded alongside browser edits without replacing them. Export and upload JSON to publish edits. Shared page defaults are in the root `site-settings.json`; exported JSON also includes local settings, which are restored on import. Edit `site-settings.json` to change defaults for all visitors.

## JSON formats

The original Henry Number Generator `tables / entries` format is supported. `data/smith-family.json` and `data/khan-family.json` retain the original page's fictional examples.

New exports use stable IDs:

```json
{
  "format": "kinsips",
  "version": 2,
  "tables": [{
    "id": "family-1",
    "name": "My family",
    "description": "Our family history",
    "people": [
      {"id": "p1", "name": "Parent", "gender": "F", "parents": [], "spouses": []},
      {"id": "p2", "name": "Child", "gender": "U", "parents": ["p1"], "spouses": [], "order": 1}
    ]
  }]
}
```

Optional person fields: `dead` (boolean), `birth`, `death`, `label`, `notes`, `order` (1–999). Dates accept Nepali or Gregorian formats as free text. List up to two parents; the first determines the Henry numbering line. Spouse links are made reciprocal automatically. Missing references, duplicate IDs, self-relationships, and parent cycles are rejected. Unresolved siblings in legacy files are flagged for correction. Legacy added-root grandparent links retain intermediate unknown parents. Kinship labels can be Nepali or any custom text.

## Run checks

Node.js 22 or newer is sufficient; no installation step is needed.

```sh
node --test tests/*.test.mjs
node scripts/build.mjs
```

Build output is `_site/`. Repository Settings → Pages must use **GitHub Actions** as its source. Every push to `main` runs validation and deployment; pull requests run validation only. The workflow also supports manual runs.
