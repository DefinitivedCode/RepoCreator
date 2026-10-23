# Branding verification

Checked 23 October 2026 against `main` at `e0305c7`.

## Artwork and exports

- Parsed all 35 SVGs successfully. Distribution masters contain outlined lettering,
  apart from the explicitly labelled live-text wordmark.
- Rendered the SVGs with Inkscape and decoded all 64 PNGs successfully.
- Confirmed transparent logo, mark, wordmark and icon exports have RGBA data,
  clear corner pixels, fully transparent areas and fully opaque artwork.
- Confirmed the social PNGs are 1280 x 640 and README PNGs are 1600 x 560.
- Inspected colour, reverse and monochrome artwork, light/dark backgrounds,
  native-size previews and enlarged native pixels at 16 px.
- Added separate 16 px optical masters with pixel-aligned stems and assembly seams.
- Decoded all seven ICO members and compared them pixel-for-pixel with native PNGs.
- Parsed the ICNS container and decoded all eleven members, including retina
  representations. Compared each with its corresponding native PNG.
- Rendered and visually inspected the five-page guidelines and six-page
  presentation. All pages within each PDF have matching dimensions.
- Resolved every local link and image reference in the offline review page.
- Measured contrast: Ink/Paper 12.92:1, Slate/Paper 5.45:1, Clay/Paper 2.56:1.
  Clay is an artwork accent; normal text uses Ink or the documented reverse.

## Scope

All changes are additions beneath `docs/branding/builder/`. The existing brand
explorations, root README, application icon files, source code, package metadata,
workflows, signing and updater configuration are unchanged.

Application tests and desktop builds were not run because this proposal changes
no application or packaging input. This verification covers artwork and file
formats. Windows taskbar and macOS Dock behaviour on physical machines remain
for maintainer review before adopting the separate replacement candidates.
