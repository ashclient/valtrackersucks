## VTS v0.5.0

### Automatic match stats

- Fixed Riot Client match parsing: internal responses use `subject` and `queueID`, unlike the official API. The previous parser discarded valid games.
- Sync Riot matches now uses your connected local client without asking for optional RSO sign-in.
- VTS automatically connects to the signed-in Windows Riot Client and updates the roster every five seconds. This is configurable in Settings; Disconnect disables reconnection.
- Party stats load in the lobby, allies during agent select, and enemies as soon as Riot publishes the loading/match roster. No player click is needed.
- Both windows show recent competitive K/D, win rate, ACS, headshots, ADR, sample size, rank and reported peak. The desktop also shows the selected agent's recent sample.
- Confirmed current parties share P# badges; hover to see who is grouped. Past-party evidence is labeled separately and does not assert current membership.
- Displays Riot IDs returned by your session's name service, including masked handles if returned. Withheld names and rejected histories remain unavailable.
- Background loading is bounded and cached; stale results are discarded on phase/account changes. Endpoint diagnostics copy HTTP statuses without credentials or player IDs.

### Desktop and overlay

- Rebuilt the default Live match screen around the published Tracker profile-and-table composition, with original VTS code and branding.
- Dense ally/enemy rows, grouped stat columns, rank badges, agent art, own-player highlighting and team averages replace click-to-load reports.
- Wider separate overlay opens directly to the match table; tray and configurable global shortcuts remain available.
- Shop, accessories, bundles, Night Market and owned-item locker remain available.

### Downloads and validation

- **VTS.Setup.0.5.0.exe** — Windows x64 installer.
- **VTS.0.5.0.exe** — Windows x64 portable.

57 tests cover parsing, phase changes, background loading, parties and existing store/locker behavior. The parser includes an anonymized published response fixture. Electron layout and hotkeys were checked on Linux. Live authenticated Riot requests and display over VALORANT still require Windows account validation. Future opponents cannot be shown before Riot assigns and supplies their roster. These are recent Riot Client samples, not lifetime Tracker scores or a Tracker.gg API integration. Builds are unsigned; Borderless Windowed is the overlay target.
