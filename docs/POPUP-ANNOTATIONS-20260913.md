# Popup workspace refinement

| Before | After | Why |
| --- | --- | --- |
| 560 × 500 preferred popup size | 450 × 600, with 22px bottom padding | A portrait 3:4 workspace with more breathing room |
| Square lower surface | 20px lower content corners | A softer surface; browser-owned outer window framing remains outside extension control |
| Save cards include explanatory subtitles | Titles and compact right-aligned actions only | Reduce repetition and visual density |
| Annotations only accessible in the webpage sidebar | Fourth popup tab with page-ordered annotations, editing and removal | Keep reading tools in one workspace |
| No explicit transfer between surfaces | Sidebar/popup SVG buttons in each annotation surface | Move between compact reading and persistent side-by-side reading |
| Every popup starts at the first tab | Session-only last page and tab, using the existing page identity normalization | Reopen in context without changing reading data contracts |
| Abrupt content appearance | 150ms top-right-origin opacity/transform reveal | Subtle spatial cue using emil-design-eng guidance; reduced-motion and keyboard interaction disable motion |

## Behavior and boundaries

- Popup annotation numbering is obtained from the webpage's existing document-order resolver, not storage order.
- Enter saves edits, Shift+Enter inserts a newline, Escape cancels. Switching surfaces while an editor is active focuses the editor; finish or cancel before moving it.
- Moving to the sidebar closes the popup only after the sidebar acknowledges opening. Moving back opens the actual browser toolbar popup before collapsing the sidebar.
- Tab memory is stored in `chrome.storage.session`; reading histories, highlights and annotations are not migrated or deleted. Different page identities return to Read later.
- Browsers constrain popup height according to available screen space. The 600px preferred height may be reduced; only the active panel scrolls. The isolated headless test environment constrained the native popup to 514px height.
- CSS controls the content reveal and lower content corners, not the browser's toolbar icon location, native outer frame or native window-opening animation.

## Verification

- 44 unit tests, lint and unpacked builds pass.
- Browser tests cover popup annotation editing synchronized to the page, both transfer directions (including a real toolbar popup), same-page tab restoration, different-page reset and subtitle removal.
- Existing local-media, backup round-trip, pagination, diagnostics, annotation and settings tests pass in Chinese and English.
- Native popup checks sample 117 stable post-entry frames across four tabs and verify access to long feedback through internal scrolling.
