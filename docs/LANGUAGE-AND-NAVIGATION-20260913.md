# Language and navigation refinement

| Before | After | Why |
| --- | --- | --- |
| Version aligned with shell, not inner cards | Version uses the panel gutter offset | Align right edges |
| Downward card shadows | Soft zero-offset outer shadows | Even edge transition |
| Last save card disproportionately tall | Four equal grid rows | Balanced save-page layout |
| Duplicate annotation/records header icons | Annotation tab; records button in Settings → All records | Reduce redundant navigation |
| Browser language only | General → Language: Automatic, English, 简体中文 | Explicit local preference with native automatic fallback |
| Settings contacts/footer below content | Three lines below left navigation | Contacts, version, ©i-whimsy |

The emil-design-eng skill guided consistent spacing, shadows and navigation hierarchy. Preferred popup dimensions remain 450 × 600; short screens constrain native popup height and the active panel scrolls.

## Language implementation

`uiLanguage` is a new optional `chrome.storage.local` preference. No existing user-data fields are renamed. Packaged `_locales` dictionaries supply explicit languages, with native i18n as fallback. Content scripts obtain dictionaries through the extension worker; no remote service, new host permission or browser i18n API mutation is used. Popup and records pages wait for language readiness on opening. Settings refreshes after the user's language selection. Existing annotation cards and toolbar labels update live when not editing; active editors are retained. Context menus are rebuilt using the selected language. Browser-owned manifest labels still follow the browser's extension-localization rules.

## Verification

- Unit tests include dictionary loading, placeholder substitution, fallback and switching back to automatic.
- Browser regression checks equal card heights, aligned version edge, removed icons, three-line left footer, records navigation, and English/Chinese/automatic switching in settings, popup and page annotations.
- Chinese development and English production UI tests and native popup frame checks are used. Screenshots are in `output/quality-review` and `output/popup-layout`.
