# Change Log

All notable changes to the "C Array Image Preview" extension will be documented in this file.

## 1.1.0 - 2026-11-02

### Added
- MSB/LSB bit order selection for packed 1bpp images (MSB by default).
- Font sheet previews for nested packed 1bpp arrays, including dhepper/font8x8.
- Font sheets from flat byte arrays, grouped by glyph dimensions and layout.
- Individual glyph previews with array indices when hovering inside a nested initializer or over bytes in a flat array.
- Font sheet cells placed without added spacing, preserving original glyph whitespace.

### Fixed
- Ignore braces in comments when finding array initializer boundaries.

## 1.0.2 - 2026-11-01

### Added
- Added the extension icon

## 1.0.1 - 2026-11-01

### Modified
- Updated repository, issue tracker, and homepage links after the repository rename.

## 1.0.0 - 2026-10-30

### Added
- Hover previews for annotated C and C++ image arrays.
- Packed and unpacked 1bpp images; packed is the default.
- RGB565 images stored in little-endian 8-bit arrays.
- Horizontal and vertical pixel layouts.
- Automatic integer scaling from 1× to 4×, targeting a 256px maximum side without downscaling.
- Insufficient-data messages and RGB565 byte-range validation.

## 0.0.1

### Added
- Test version :)
