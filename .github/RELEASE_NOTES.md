## VTS v0.3.0

- Separate desktop Shop, Party and Live Match views.
- Unofficial local Riot Client integration for daily offers, ready/unready and queue controls, agent select/lock, and visible players' latest competitive rank.
- Independent in-game overlay with agent picks and match players.
- Configurable global shortcuts: **Ctrl + Shift + V** shows/hides the overlay; **Ctrl + Shift + I** enables interaction by default.
- Minimize or close the desktop to the system tray while keeping shortcuts and the overlay available. Use the tray menu to quit.
- Full retained match history, up to 500 summaries, instead of a 40-match display cutoff.

### Downloads

- **VTS.Setup.0.3.0.exe** — Windows x64 installer.
- **VTS.0.3.0.exe** — Windows x64 portable executable.

These builds are unsigned, so Windows may show a SmartScreen warning.

### Validation and limitations

The automated suite contains 28 tests. Electron/X11 checks exercised global hotkeys, custom bindings, tray persistence and separate app/overlay windows. Live Riot endpoint behavior and display over a running VALORANT game still require Windows validation. Borderless Windowed mode is the overlay target; exclusive fullscreen visibility is not guaranteed.

The local integration requires Riot Client to remain signed in and uses unofficial endpoints that Riot can change. It does not require the optional production RSO backend. Hidden player identities are not resolved, and full opponent match histories are not implemented.
