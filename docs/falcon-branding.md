# LBD Focus — original Falcon Gold Concept 02

## Source verified before implementation

`LBD_GO_Infographic_va_Prompt.png` is the user-uploaded **Concept 02 / 04**
brand board for LBD Focus, with the gold falcon/circular stroke, Header lockups,
favicon variation, app-icon presentation and "by Lộc Boy Đảo" attribution.
It is a 1122 × 1402 RGB PNG, not a standalone transparent/vector master.

SHA-256 of the untouched board:
`e44df742b4b72ae5314e634dcb2a67dceff4613db5208329abe76f9765998270`.

Exact extraction was possible once the original image became available in Git.
No generative image tool, tracing, color replacement, background removal or new
falcon drawing is used. Original dark backgrounds/gradients are deliberately
preserved to avoid damaging antialiased gold edges or changing the source design.

## Pixel crops and exported assets

Coordinates are `width × height + left + top` in the original image:

| Source region                                  | Crop              | Output                                   |
| ---------------------------------------------- | ----------------- | ---------------------------------------- |
| Large unframed mark above the central wordmark | `365x310+372+85`  | `public/brand/falcon-mark.png`           |
| Dedicated circular favicon variation           | `140x140+905+667` | `public/brand/falcon-favicon-source.png` |
| Dedicated app-icon presentation at upper right | `256x256+844+172` | `public/brand/falcon-app-source.png`     |

Each raw crop was decoded and compared to the same original source rectangle
with ImageMagick `compare -metric AE`: **0 differing pixels** for all three.
These crops contain the complete marks, without adjacent labels or board text.

Only uniform Lanczos resizing is used for derived native icons:

- Favicon PNGs: 16, 32 and 48 px; multi-size `public/favicon.ico` includes all three.
- Apple Touch Icon: 180 px.
- App Icon PNGs: 192 and 512 px.

The 512 px icon is enlarged from the original 256 px crop. It preserves the
provided design but does not gain vector detail. A standalone SVG or higher-
resolution original would improve very large output; none is fabricated here.

## Application integration

Header swaps only the old Lucide hourglass for the cropped image. Existing
**LBD FOCUS** and **BY LỘC BOY ĐẢO**, the home link and its accessible label remain.
The image uses `object-fit: contain`, 44 px desktop / 40 px mobile containers,
and its original intrinsic 365:310 proportions. No clipping/stretching is used.

`index.html` references the new favicon/Apple Touch assets. The unused hourglass
`public/favicon.svg` is removed. App Icon 192/512 exports are available for native
icon consumers. There is still **no PWA manifest or service worker**: this change
does not add offline behavior, install logic or a standalone display mode.

No Task, Calendar, Habit, Focus, timing, sound, auth, sync, database, API or storage
logic changes. The original uploaded board is not modified. Only the feature
branch is updated; Production/main are outside scope.

## Reproduction

```bash
node scripts/extract-falcon-logo.mjs
```

Asset regeneration requires ImageMagick 7 (`magick`). The script verifies the
original board's SHA-256 before using the documented coordinates. Normal app
builds use committed assets and **do not require ImageMagick** or new npm packages.

## Verification and manual checks

Build and the existing unit/desktop/mobile regression suites are run. Added
browser checks load the Header on every screen, verify intrinsic dimensions and
containment, decode every exported PNG at its declared size, inspect the ICO
frames, and verify that navigation/icon requests leave workspace storage intact.

Headless browser tests do not include native browser chrome or a physical iPhone
Home Screen. Check the actual tab favicon and a new Add to Home Screen shortcut
on the intended device after deploying the feature Preview. Browser/OS icon caches
may retain an old icon temporarily; reload/open a new tab without clearing site
data or LocalStorage. No Production deployment is performed by this change.

Verified locally on 2026-10-30: build passed, **58/58 unit tests** and **60/60
Playwright desktop/mobile cases** passed. All three raw crops have AE=0 versus
the original board rectangles. [Desktop Header](ui-preview/falcon-header-desktop.png)
and [Mobile Header](ui-preview/falcon-header-mobile.png) are actual browser captures.
