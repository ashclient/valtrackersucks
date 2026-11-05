## VTS v0.6.0

- Redesigned the entire desktop menu and shared store/locker/settings surfaces with grouped navigation, readable statuses, consistent controls and keyboard focus. UI UX Pro Max is installed in the repository; VTS design decisions are recorded separately.
- All modes are included in stats by default. Pick one queue from Live match, or any subset in Settings. Choices persist and apply to the live table, overlay, reports and saved-history views. Switching filters discards old samples and uses separate caches.
- Masked names no longer block stat requests. Players in the current roster can show permitted history without their names being revealed. A 403 or withheld identity is respected; unknown enemies cannot be displayed before Riot supplies them.
- Locker loads on entry. Supports canonical/legacy entitlement routes, category-scoped responses and optional read-field omissions; preserves equipped items and shows warnings/retry when ownership or artwork is unavailable. Equip still requires ownership and complete privacy settings.
- One global shortcut, **Ctrl + Shift + V**, opens/closes an immediately clickable overlay. **Escape** closes it. The second interaction keybind is removed.
- A separate always-clickable agent picker appears at the bottom right during pregame/loading, offers the full catalog with inline lock confirmation, and hides when the core match starts, the queue is cancelled or the account disconnects.
- Diagnostics preserve history, loadout, ownership and name-service HTTP statuses plus response counts/shape information without credentials, player IDs or names.

**Downloads:** `VTS.Setup.0.6.0.exe` (installer) and `VTS.0.6.0.exe` (portable), Windows x64.

66 automated tests and real Electron/X11 checks cover modes, stale requests, masked-player stats, locker fallbacks, one-key clickable overlay, tray operation and automatic agent-panel placement/dismissal. Public artwork and clearly labeled synthetic account data are used for visual QA. Live authenticated Riot requests and overlay compatibility over VALORANT still need Windows validation. Builds are unsigned; Borderless Windowed remains the overlay target. Recent Riot Client samples are not lifetime Tracker.gg scores.
