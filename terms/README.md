# Terms library

Edit `default-terms.json` to change the built-in presets, then reload the unpacked extension in Chrome. You can also create a separate JSON file and load it with **Load terms JSON** in the viewer. After loading, select a group and click **Add terms**. The loaded library stays in the current viewer session; the resulting keyword list is saved automatically.

Format:

```json
{
  "version": 1,
  "groups": [
    {
      "name": "My terms",
      "terms": [
        { "label": "Renewal", "pattern": "\\brenew(?:al|als|ed|ing|s)?\\b" },
        { "label": "Money", "pattern": "\\$\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?\\b" }
      ]
    }
  ]
}
```

Patterns use JavaScript regular-expression syntax and are matched without regard to case. Write one backslash in regex notation as two backslashes in JSON. Use word boundaries (`\\b` in JSON) to avoid matching inside longer words, groups (`(?:...)`) for variants, and `\\s+` for flexible whitespace. Avoid patterns that can match an empty string. The file should contain only terms you want; the library is not tied to legal documents.
