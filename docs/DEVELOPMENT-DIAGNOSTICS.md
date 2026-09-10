# Development error diagnostics

`npm run build:unpacked` produces two distinct builds:

- `dist/development`: local error reports and manually initiated JSON downloads.
- `dist/production`: diagnostics implementation is removed by the build. Normal error messages remain; diagnostic download buttons are unavailable, including the legacy media download buttons.

The source defaults to diagnostics disabled. This is a build choice, not a user setting or a runtime URL parameter.

Development reports contain the original Error stack and cause when available, operation context, page URL, extension version, browser information and recent capture stages. Browser error codes without an original JavaScript stack cannot provide one; response-boundary stacks identify the reporting boundary instead. Snapshot errors preserve their content-script report across extension messages.

Reports are local only and never automatically downloaded or uploaded. The development worker retains the latest 30 reports under the separate `easyreadDevelopmentErrors` storage key. Reopening popup, settings or records provides the latest error and a recent-errors download. Explicit save/copy failures have inline expandable details. Existing media failures retain their inline download button. Uncaught errors, rejected promises, logged Error objects, handled storage/background errors and preview failures use the shared recorder. Expected empty results and successful fallback branches are not treated as failures.

Reports can contain page/resource URLs and error context. Known password/authorization/cookie fields are redacted; review a report before sharing it. Reading-history, note and annotation fields are unchanged.

Verification:

- `npm test`: diagnostics disabled/enabled behavior, original stack/cause retention, circular values and redaction, plus existing regression tests.
- `node scripts/verify-snapshot-browser.mjs`: real headless Chrome checks main-page and iframe shadow serialization, nested roots, adopted CSS and closed-root host alignment using a local fixture. Uses an isolated temporary browser profile. Set `EASYREAD_TEST_BROWSER` to override the Chrome executable.
- Reload `dist/development` and refresh an existing webpage before testing a new content-script build. Full visual acceptance of the OpenAI page remains a separate browser check.
