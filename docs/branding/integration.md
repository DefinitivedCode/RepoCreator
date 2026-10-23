# Keystone application integration

The approved Keystone artwork in `builder/` is the source for the shipping
identity. The proposal and its review documents remain a historical record.
Runtime assets are copied unchanged; no logo geometry or colours are regenerated.

| Shipping resource                           | Approved source under `builder/` | Use                                                                       |
| ------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| `app-icon.svg`                              | `masters/app-icon-windows.svg`   | Application icon source                                                   |
| `src/assets/branding/mark-colour-light.svg` | `masters/mark-colour-light.svg`  | Navigation header on light surfaces                                       |
| `src/assets/branding/mark-colour-dark.svg`  | `masters/mark-colour-dark.svg`   | Navigation header on dark surfaces                                        |
| `public/favicon.ico`                        | `icons/favicon.ico`              | Browser development/preview favicon                                       |
| `src-tauri/icons/32x32.png`                 | `icons/windows-32.png`           | Windows PNG resource                                                      |
| `src-tauri/icons/128x128.png`               | `icons/windows-128.png`          | Windows PNG resource                                                      |
| `src-tauri/icons/128x128@2x.png`            | `icons/windows-256.png`          | Windows PNG resource                                                      |
| `src-tauri/icons/icon.ico`                  | `icons/repo-creator.ico`         | Windows executable, window, taskbar, shortcuts, installer and uninstaller |
| `src-tauri/icons/icon.icns`                 | `icons/repo-creator.icns`        | macOS application, Finder, Dock and DMG application icon                  |
| `src-tauri/icons/macos-128.png`             | `icons/macos-128.png`            | macOS default window PNG fallback                                         |

The ICO retains all seven approved sizes (16, 24, 32, 48, 64, 128 and 256 px),
including the optical 16 px artwork. The ICNS retains all eleven native/retina
representations, from 16 through 1024 px. Keep the platform tiles and transparent
corners as supplied; do not add a second mask or background.

The header keeps its existing 19 px footprint and text heading. Its SVG mark
follows explicit Light/Dark preferences and System appearance changes. Fixed
Ink/Paper and Clay artwork is independent of the configurable UI accent.
Repository, Git and preset action icons remain semantic controls.

Tauri's Windows bundle list supplies the executable icon and MSI product icon.
NSIS explicitly uses the same ICO for setup and uninstall; its Start menu and
desktop shortcuts use the executable. The macOS override supplies the ICNS and
the matching macOS PNG. Existing application identifiers, names, updater keys,
signing settings and data paths are unchanged.

## Licensing

Keystone is original repository artwork under the existing MIT license.
See [the source asset notes](builder/README.md). The runtime uses standalone
marks and existing system typography, with no new font or third-party artwork.
The branding source's Manrope font remains under its bundled
[SIL Open Font License 1.1](builder/fonts/OFL.txt), with
[provenance](builder/fonts/README.md); it is not bundled with the application.
The existing Feather attribution still applies to semantic UI icons.
Regenerating `THIRD_PARTY_NOTICES.txt` produced no changes, and its integrity and
coverage checks passed.

## Verification

Checked on Windows on 23 October 2026:

- TypeScript check, 123 frontend unit tests, formatting and 13 focused build/licensing tests passed.
- All 12 appearance/UI polish browser checks passed across dark and light projects,
  including decoded SVG loading, explicit/system theme changes and accent independence.
- Optimized Windows executable and both NSIS/MSI packages built successfully.
- Both native WebView2 smoke scripts passed with isolated data and temporary local
  repositories. They cover dark/light themes, supported window sizes, persistence,
  generated output and workspace commands without creating remote repositories.
- Visually inspected the actual Windows title bar and navigation mark in dark and
  light themes at 100% display scaling. Native smoke also exercised CDP render
  scaling at 125%/150%; this is not a physical high-DPI display test.
- Decoded every ICO and ICNS member and compared its pixels with the approved
  platform PNG. Verified all seven app/setup executable icon resources and the MSI
  `ProductIcon` stream against the approved ICO. Inspected generated installer
  shortcut and installed-app icon references.

CI verifies that the icon named by `CFBundleIconFile` in each Intel/Apple Silicon
app bundle is byte-identical to the shipping ICNS, alongside existing architecture
and signature checks. A Windows host cannot validate macOS rendering or launch.

Remaining hands-on checks: install/upgrade on Windows and inspect Start menu,
taskbar/pinned shortcuts and Installed Apps, including physical high-DPI displays;
on both Mac architectures, install from DMG, launch, and inspect Finder, Dock and
application switching at standard/retina sizes on light/dark desktops. Existing
pinned shortcuts or OS icon caches may need a fresh launch to reflect new assets.
