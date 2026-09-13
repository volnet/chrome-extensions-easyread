# EasyRead AI Maintenance Guide

## Product invariants

- EasyRead is a local-first Chrome/Edge Manifest V3 extension.
- User reading history, notes, read-later entries, settings, and scroll positions are stored in `chrome.storage.local`.
- Do not add network transmission, analytics, remote code, or new host permissions without explicit owner approval and a privacy review.
- Preserve both English and Simplified Chinese locale coverage.
- Treat export/import compatibility as a public data contract. Do not silently rename storage keys or fields.
- Notes are also page highlights. Keep legacy `selectionText` notes readable; `prefix` and `suffix` are optional hints, never required migration fields.
- Notes unify highlights, quoted thoughts and whole-page thoughts under `notes`. Migrate legacy `annotations` without losing content; retain a local migration snapshot. Keep `annotationAuthor` as the compatible author setting. Text Notes follow document order; whole-page Notes always come last.
- Video progress is observational only. Never seek or resume page videos on the user's behalf.
- `highlightsEnabled` controls only visual rendering. Turning it off must never delete notes.
- Never commit `key.pem` or any replacement signing key.
- Keep settings aligned with the external product: use the same names and order for primary feature tabs and their secondary settings. Update both surfaces together whenever navigation changes.
- Diagnostics are local and opt-in through General > Diagnostic Tool in both builds. Never add diagnostic overlays or automatic error downloads. Disabling collection preserves existing reports.

## Safe workflow

1. Run `npm test` before changing code.
2. Make the smallest change that preserves existing storage data.
3. Run `npm run build:unpacked` and `npm test` after changing code.
4. Load `dist/development` as an unpacked extension in Chrome or Edge for behavior and visual checks.
5. Release signing is intentionally outside the repository. Never add a private key to a build command.
6. Do not modify or discard unrelated working-tree changes, especially store artwork under `docs/`.

## Required manual regression coverage

- Add, reopen, and complete a read-later item.
- Add a note from selected page text and delete it from the records view.
- Confirm that selecting ordinary text offers Add highlight, directly right-clicking an orange highlight offers Remove highlight, and unselected ordinary text offers neither.
- Enable/disable auto-record and confirm visit-count behavior.
- Restore a saved scroll position on a normal HTTP(S) page.
- Export data, clear/import it, and compare the restored records.
- Confirm all-records pagination at 500 rows per page, video progress recording without playback restoration, and annotation author/sidebar behavior.
- Check popup, records, and settings pages in both supported locales.

## Known baseline limitations

- ESLint currently reports legacy cleanup items as warnings; new undefined globals remain a blocking error.
- Pure data and navigation logic has unit coverage, but automated browser integration tests do not exist yet.
