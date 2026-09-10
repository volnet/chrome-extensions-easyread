# EasyRead AI Takeover Baseline

Baseline date: 2026-08-10  
Takeover source version: 1.0.1; AI-maintained release line starts at 2.0.0  
Repository: `volnet/chrome-extensions-easyread`

## What the product does

EasyRead is a local-first Manifest V3 extension for Chrome and Microsoft Edge. Its core features are read later, selected-text notes with optional orange page restoration, automatic visit records, saved reading position, and ZIP/Markdown-oriented export and import.

## Architecture

| Area | Entry point | Responsibility |
| --- | --- | --- |
| Background | `src/scripts/background.js` | Tab observation, auto-recording, context menus, messages, scroll restoration |
| Shared data utilities | `src/scripts/easyReadTools.js` | Storage access, keys, settings, localization helpers, badge updates |
| Content script | `src/scripts/content.js` | Capture and restore page scroll progress |
| Popup | `src/popup/` | Current read-later workflow and navigation |
| Records | `src/records/` | History and note display, deletion, export |
| Settings | `src/setting/` | Auto-record configuration and data import/export/reset |

All user data is currently stored with `chrome.storage.local`. No application backend is present.

## Permissions and privacy boundary

The manifest declares `activeTab`, `tabs`, `storage`, `unlimitedStorage`, and `contextMenus`. A content script runs on all HTTP and HTTPS pages. This broad access is part of the current functionality, but any expansion requires explicit review. No analytics or application network API was found in the handwritten source.

The local `key.pem` is ignored by Git and has no tracked history. It is legacy signing material and must remain local; maintained builds no longer consume it.

## Reproducibility status

- `npm run build:unpacked`: passes and produces `dist/development` and `dist/production`.
- `npm run check`: validates JSON, locale-key parity, manifest references, JavaScript syntax, version parity, and tracked private-key patterns.
- Signed CRX generation has been retired from the repository. Store releases should package the verified production directory without placing a private key in the build process.
- Browser/manual acceptance: pending; source/build checks do not substitute for loading the extension in Chrome and Microsoft Edge.

## Security and maintenance findings

- The original audit reported 11 development/build dependency findings. The legacy Grunt/JSHint/CRX toolchain was replaced with Node, esbuild, and ESLint; use the current audit result rather than the historical count when evaluating release readiness.
- Anchor-only tab updates are now separated from reloads and real navigation by a tested per-tab navigation tracker.
- Read-later insertion and duplicate detection now share one tested data function while preserving the original storage schema.
- Automated browser tests and migration tests for stored data do not yet exist.

## Existing working-tree boundary

At takeover, Git reported pre-existing modifications to three Microsoft Edge PSD assets under `docs/MicrosoftEdgeExtensions/`. They are owner work and are outside this baseline. Do not reset, stage, or overwrite them without explicit instruction.

## Recommended modernization order

1. Add browser-level smoke tests around storage and the three extension pages.
2. Capture representative exported user data as sanitized compatibility fixtures.
3. Keep ESLint and the esbuild packaging chain current without changing extension behavior.
4. Centralize duplicated read-later mutations and add storage migration/version handling.
5. Fix anchor-navigation counting and add regression coverage.
6. Reassess whether `tabs`, `unlimitedStorage`, and all-site content-script access can be narrowed without reducing promised functionality.
