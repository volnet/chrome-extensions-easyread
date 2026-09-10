# Save Page privacy review

## Permission change

EasyRead 2.0 adds `clipboardWrite` so a user can explicitly copy a screenshot or Markdown capture from the Save Page tab.
It also adds `downloads` so direct media URLs can be handed to Chrome's download manager instead of being fetched through the page context.
It adds `scripting` and `webNavigation` for user-triggered frame snapshots and frame hierarchy reconstruction, and declares HTTP(S) hosts as optional permissions. The host permission is requested by Chrome only when the user presses **Save** on the HTML card.

## Data handling

- Clipboard writes occur only after the user presses **Copy**.
- Captured content is written to the operating-system clipboard and is not retained by EasyRead.
- No clipboard content is read.
- No captured page, media, screenshot, Markdown, or clipboard content is transmitted to EasyRead or any third party.
- Media downloads occur only after the user presses **Download** and go directly from the media host to Chrome's download manager.
- Adaptive media downloads may request temporary access to the player and CDN origins after the user presses **Download**. EasyRead downloads the selected video and audio segments, combines them locally, validates the resulting MP4, and then hands the file to Chrome's download manager.
- Downloaded media bytes are held only in memory while the user-triggered operation is running. They are not written to `chrome.storage.local` or sent to EasyRead services.
- Media previews contact the detected media provider only when needed. Vimeo and HLS playback starts after the user presses the preview control; ordinary direct video uses the browser's metadata preload so EasyRead can show its dimensions.
- Cross-origin page resources are fetched only during a user-triggered HTML snapshot and only after Chrome's permission prompt is accepted.
- Optional host access is used locally to embed stylesheets, fonts, images, and frame content. Captured bytes are not transmitted elsewhere.
- A document-start hook records closed Shadow DOM roots created after the extension loads. It does not transmit them and responds only to EasyRead's in-page snapshot event.
- Saved-file metadata continues to use `chrome.storage.local`; file bytes are not stored there.

## Host access

HTTP(S) host access is optional, not granted at installation. If the user declines it, inaccessible resources remain external and the HTML result is marked partial.
Media access follows the same optional-permission model. The prompt is scoped to the player/CDN origins needed by the selected item; a later redirect to another CDN origin triggers one additional scoped request instead of granting broad access silently.
