# VTS desktop design system

Reference: UI UX Pro Max `analytics dashboard dense dark` → Data-Dense Dashboard. The generated marketing-page pattern did not fit an Electron companion and is not applied.

- A fixed, grouped left navigation; a quiet title bar; one content workspace. A separate match overlay and bottom-right agent panel.
- Charcoal surfaces (`#101113`, `#191b1e`), warm accent (`#e6ba72`), off-white primary text (`#f2f2ee`), secondary text (`#b3b5bd`). Green denotes ready/connected state and is paired with text.
- Segoe UI Variable / Segoe UI local font stack. 29px page headings, 13px body, 11px compact controls, tabular numeric data. Compact table annotations may use 9px; essential statuses use 11px or greater.
- 4/8px spacing rhythm, 5–8px radii, clear borders. No decorative blur, 3D, gradients or unnecessary motion. Existing map and item art carry the visual detail.
- Persistent mode selection applies to the live table, overlay, player requests and saved history. Defaults to all queues. A single overlay shortcut opens a clickable window.
- Every asynchronous page has loading, error and retry states. Do not fabricate data when an endpoint or identity is unavailable.
- Keyboard focus rings, named controls, logical navigation order, skip link, reduced-motion support, native checkboxes/selects, explicit inline lock confirmation.

Validation targets: 940px and larger desktop, 1000px match overlay, 376px agent panel, keyboard operation and actual Electron window behavior. Authenticated Windows endpoint validation is separate from mocked tests.
