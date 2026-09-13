# Popup and connection fixes — 2026-09-13

## UI review

| Before | After | Why |
| --- | --- | --- |
| Popup footer version and excessive save-panel whitespace | No popup footer; stable 560 × 500 shell with compact bottom padding | Reduce visual noise without restoring popup resize feedback |
| Screenshot actions occupy a separate full-width row | Compact right-aligned two-by-two actions | Match the action placement of the other save cards |
| Settings tabs run horizontally | Sticky left vertical navigation, with Up/Down keyboard navigation | Keep settings categories visible and consistent with desktop application navigation |

The layout follows the emil-design-eng skill's compact controls, clear hierarchy, and stable interaction principles. Long English content scrolls inside the active popup panel instead of resizing the toolbar popup.

## Error fixes

- The supplied Apple report failed before capture with `Receiving end does not exist`. The popup now bootstraps a missing page receiver using existing permissions, checks connectivity, and retries the unreceived message once. Concurrent recovery requests share one connection attempt. A closed response port is deliberately not retried, because the original operation might already have started.
- Content initialization is guarded against duplicate injection. Connection failures retain their original cause and provide localized refresh/site-access guidance.
- The background generic tab acknowledgement no longer races the dedicated asynchronous diagnostic-clear response. Settings also avoids duplicating the generic failure sentence.
- No storage-key migration, host-permission addition, or user-data deletion is part of these changes.

## Verification

- Baseline: 40 unit tests passed before editing.
- Final: 44 unit tests passed, including missing-receiver recovery, concurrent recovery, permission denial, non-retry of a closed response port, and diagnostic reply ownership.
- Development and production unpacked builds completed.
- Isolated Edge MV3 UI regression passed in development/zh-CN and production/en-US: annotation persistence/editing/order/removal, real backup export-clear-import, pagination, local media preview/download, diagnostic opt-in/download/clear, settings navigation and screenshot routing.
- Actual toolbar popup checks passed in both builds/locales: 117 stable frames per run, 560 × 500 outer size, internal scrolling and keyboard navigation.
- Rendered settings and popup screenshots inspected. Artifacts are under `output/quality-review` and `output/popup-layout`.
- `git diff --check` passed (Windows line-ending warnings only).

## Remaining acceptance boundary

The Apple error's connection failure is covered by targeted tests. A complete live Apple HTML download and its offline rendering have not been verified in this run; snapshot fidelity is not established by these connection tests.
