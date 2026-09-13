# Popup height and footer correction

| Before | After | Why |
| --- | --- | --- |
| 450 × 480 preferred size | Restore 450 × 600 | Preserve the requested portrait proportions |
| Unused space below the last reading/save card | Last card grows into remaining panel space | Extend the internal container instead of shortening the window |
| No version footer | Manifest version only, bottom right | Restore version identification without contact links |
| History list capped at 105px inside a taller card | History viewport flexes to the card's bottom padding | The emil-design-eng layout review identified an inner/outer height mismatch; retain visible title/count and scroll the timestamps |

This supersedes the 480px preference in SHARED-ANNOTATION-UI-20260913.md. Media cards remain compact; the annotation surface already fills its panel. Stable shell sizing and internal scrolling are retained. The emil-design-eng review guided spacing consistency, with no additional motion introduced.

Validation: 44 unit tests and unpacked builds pass. Browser screenshots confirm the stretched final cards and footer placement. Native popup frame sampling checks stable tab switching and long-content scroll access; the browser may constrain the preferred height to available screen space.
