# Read Later settings refinement

| Before | After | Why |
| --- | --- | --- |
| Mixed English feature capitalization | Read Later, Save Page, All Records, Backup & Restore | Consistent product names in English messages |
| Three different deletion labels/styles | Delete Records / 删除记录 with the existing diagnostics secondary-button style | Consistent controls; confirmations still identify the affected category |
| Read Later settings only expose actions | Pending/in-progress list, 50 rows per page, live local-storage updates and a quiet empty state | Make saved items visible without rendering an unbounded list |
| All Records is a peer category | Indented immediately below Read Later, with parent-qualified accessible label | Reflect the product hierarchy while keeping the existing records actions |

The emil-design-eng skill guided consistent controls and the restrained empty state. Storage field names, export formats and existing category deletion scopes remain unchanged. Completed Read Later entries are omitted from the pending list, matching the popup's primary list behavior; underlying records are not deleted by rendering.

Validation: 45 unit tests, lint and unpacked builds pass. Browser regression covers 101 pending items across three pages, scoped deletion preserving highlights, empty-state rendering, restoration from local data, identical deletion-button appearance, nested navigation, language switching and existing popup/sidebar workflows. Both supported locales are checked with isolated Edge profiles.

## Embedded browsing history

| Before | After | Why |
| --- | --- | --- |
| Read Later parent followed immediately by All Records | Read Later parent, Read Later child, Browsing History child | Both parent and first child open the existing Read Later panel |
| Settings opens a separate records page and repeats export/delete actions | History is embedded directly: total / 500 per page, paginator, export, then table | Keep the complete workflow in settings and remove redundant controls |
| Standalone records controller owns all rendering | Shared recordsView controller, initialized lazily in settings | Preserve one pagination/render/export implementation and the original allRecords JSON contract |

English menu label: Browsing History. Chinese menu label: 浏览历史. The standalone records page remains compatible. Reading counts, latest reading time, reading/video progress and saved-copy metadata remain available.

Verified in isolated Edge MV3 development/zh-CN and production/en-US: 1002 records across 500/500/2 rows, full JSON export compared against storage, live empty/restore updates, vertical control order, both Read Later entries, language switching, standalone pagination and existing popup/sidebar workflows. All 45 unit tests, lint, baseline verification and both unpacked builds pass. Screenshots: output/quality-review/{development/zh-CN,production/en-US}/settings-history.png.
