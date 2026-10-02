# PDF export pages

An Obsidian plugin that exports one markdown note to PDF the same way Obsidian does, and can start a new page at the heading levels you choose.

The note is rendered with Obsidian's own markdown preview, so headings, lists, tables, code, callouts, images, math, and embeds come through with the current theme. The PDF is forced to light colors, which is what Obsidian's export already does. Background colors and highlights are included.

Defaults:

- A4
- Portrait
- Minimal margin
- Full size (no downscale)

Each of H1, H2, and H3 starts a new page. H4, H5, and H6 stay with the text above them until you turn those levels on. The first block stays on page 1, so the export does not open with a blank page. When one heading follows another with nothing between them, they stay on the same page.

Two more switches:

- **Front page.** The file name, centered in the middle of the first page. Properties and other metadata stay off that page.
- **Table of contents.** The next page lists every heading by name, indented by level. Each line opens that heading. macOS Preview's sidebar lists the same headings. Links inside the note that point at a heading jump there too.
- **Live preview.** The export window has three columns: the pages on the left, the settings in the middle, and every heading on the right. Turn a heading on to start it on a new page. The preview updates as you change a heading or any other setting.

Minimal margin keeps a real top inset (0.6 inch) so a heading is not flush with the edge of the paper. None still has no margin.

You can still change the page size, landscape, margin, and downscale, and you can set the body font size. Those are the same page controls as Obsidian's Export to PDF, plus the heading breaks and the font size.

## How to use

Open a note, then run **Export current note to PDF** from the command palette. The same action is **Export PDF pages...** in the note's More options menu and in the file explorer's right-click menu.

Check the preview, turn page breaks on or off for individual headings, then save the PDF. The app opens the file when the export finishes.

## Install

Copy `main.js`, `manifest.json`, and `styles.css` into:

```
.obsidian/plugins/pdf-export-pages/
```

Reload Obsidian, then turn on **PDF export pages** in **Settings → Community plugins**.

With the BRAT plugin, add `himanshugupta2077/obsidian-pdf-export-pages`.

This plugin is not in the official community plugin directory yet. It runs in the desktop app.

## Develop

```
npm install
npm test
npm run build
```

## License

MIT. Copyright (c) 2026 Himanshu Gupta.
