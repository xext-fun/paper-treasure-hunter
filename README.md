# Highlightext PDF Viewer

A Manifest V3 Chrome extension that renders text-based PDFs locally with PDF.js and highlights literal words, phrases, or regular expressions in the PDF text layer. It does not change the PDF or upload its contents.

## Install and use

1. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
2. Select this repository folder. No build step is needed; the PDF.js library and worker are bundled in `pdf/`.
3. Click the Highlightext toolbar icon to open the viewer.
4. Choose a local PDF, or paste an HTTP(S) PDF URL and click **Open URL**. Remote URLs depend on server access and response headers.
5. Enter one term per line and click **Highlight**. Use **Previous Match** and **Next Match** to move among occurrences. **Clear Highlights** restores the original text layer.

The most recent keyword list is saved in `chrome.storage.local`. No PDF data or extracted text is stored there. The viewer shows an OCR notice for image-only PDFs.

## Terms and regex

A line can be a literal term or a named regular expression:

```text
termination
intellectual property
$10,000
Termination variations :: /\bterminat(?:e|es|ed|ing|ion|ions)\b/i
```

Literal phrases are case insensitive and allow flexible whitespace. Regex patterns are case insensitive, global matches by default. Empty lines and lines starting with `#` are ignored. If expressions overlap, the earliest match wins; for the same start position the longer match wins. Counts reflect highlighted, non-overlapping occurrences.

The viewer starts with built-in date, time, duration, and legal term patterns. You can add a preset group using the dropdown, or load your own JSON library. See [terms/README.md](terms/README.md) for the format. The library is meant to be edited and expanded for any domain.

## Development

```sh
npm install
npm test
```

`npm test` uses Playwright Chromium and the included two-page text PDF in `fixtures/`. If the browser is missing, run `npx playwright install chromium` once. Runtime files do not depend on npm or a build step. The PDF.js runtime files are copied from `pdfjs-dist` 6.5.438; its text-layer CSS is bundled as `pdf/pdf_viewer.css`.

`highlight/keyword-manager.js` parses terms and libraries. `highlight/highlighter.js` accepts rendered text spans and provides `setKeywords`, `highlightDocument`, `clearHighlights`, `nextMatch`, `previousMatch`, and `getMatchCounts`. `pdf/viewer.js` handles PDF.js rendering and UI controls.

### Limits

PDF.js text extraction is required, so scanned/image-only documents need OCR. Phrase matching is page-local and uses text-span geometry to infer spaces across spans; unusually ordered PDF text streams may still require a different extraction strategy. Large PDFs render every page before highlighting, so they may take longer to open. Remote PDFs can be blocked by the source server or authentication requirements.
