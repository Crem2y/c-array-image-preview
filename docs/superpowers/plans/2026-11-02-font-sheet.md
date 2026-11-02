# Font sheet implementation plan

Goal: Render dhepper/font8x8 nested byte arrays using explicit metadata.

Approved approach: Extend existing metadata with bitOrder (msb default, lsb)
and sheet.columns. Preserve existing previews. Array hover shows a sheet;
hover inside a child initializer shows that glyph and its zero-based index.

Architecture: Keep initializer source ranges in the parser, render cells into
one PNG, and select sheet versus glyph in the hover provider. TypeScript/pngjs.
Use two source pixels of spacing and the existing 256px/1–4x scale policy.
Support sheets for packed 1bpp only in this increment. No release/version bump.

- [x] Test metadata defaults, invalid options, child ranges, comment braces,
  LSB pixel orientation, blank cells, incomplete rows, and hover integration.
- [x] Extend previewTypes and previewParser; require explicit child initializers
  with the expected byte count and literal byte values for sheets.
- [x] Extend previewRenderer with bit order and render1bppSheet. Bound total
  sheet area to 1024*1024 source pixels before allocating a PNG.
- [x] Wire selection into extension.ts, add usage documentation and changelog.
- [x] Run npm run test:unit, npm run lint and git diff --check. Inspect the
  real font8x8_basic fixture, including its brace-character comments.

