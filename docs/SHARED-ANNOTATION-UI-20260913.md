# Shared annotation surface and compact popup

This refinement supersedes the 600px preferred popup height in the earlier popup notes.

| Before | After | Why |
| --- | --- | --- |
| 450 × 600 popup with substantial unused space below save cards | Stable 450 × 480 popup, 14px bottom padding | Reduce excess space without restarting viewport-dependent resize feedback |
| Page title without an icon | Active tab favicon before the title; packaged logo fallback on missing/failed icons | Make the current page easier to recognize; no third-party favicon service |
| Media actions below metadata | Compact actions stacked at the card's right edge | Reduce row height while preserving the one-third preview |
| Independent popup annotation markup with missing dates/download/empty artwork | Shared `annotationView.js` renderer and `annotations.css`, retaining each surface's transport handlers | Keep numbering, author/date, quote, comment, icon actions and empty state visually identical |

The emil-design-eng skill guided compact spacing and shared component consistency. Existing sidebar editing, page ordering, author settings and data schema remain unchanged. The popup now exposes the same per-page annotation download operation.

## Native window limitation

The requested iPhone-like **outer** window silhouette is not implemented. The existing content corner styling cannot change the Chrome/Edge-owned native popup frame/crop. No new window type, permissions or page-overlay substitute was introduced. A sparse panel can still contain free space inside the stable shell; the save view's excessive bottom space is removed.

## Verification

- Baseline and post-change unit tests: 44 passed; lint and unpacked builds passed.
- Chinese development and English production browser regressions cover editing, double-surface transfers, same-page tab memory, exports/imports, media, diagnostics and settings.
- Added direct comparison of annotation text, font, padding, border radius and number-column width between popup and sidebar; checks pass. Added favicon presence and annotation-download-button checks.
- Actual toolbar popup checks: 117 stable frames in each locale/build, 450 × 480, internal scroll access maintained.
- Visually inspected popup annotations, media and save-page screenshots under `output/quality-review` and `output/popup-layout`.
