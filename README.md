# VTS — VALORANT desktop companion

**A lightweight, privacy-aware Windows VALORANT companion.** Built with Electron and native HTML/CSS/JS, no React runtime, no game injection, and no background player scanning.

> **Status: 0.1.0 developer preview.** This is a working foundation, **not yet a live VALORANT Tracker replacement**. It has no Riot account linking, automatic ready-up, or live opponent lookup.

## Feature status

| Feature | Status |
|---|---|
| Dashboard: overview, career, matches, agents, leaderboard, settings | Implemented |
| Transparent, always-on-top agent-prep overlay | Implemented (best in borderless/windowed mode) |
| Overlay show/hide shortcut | Ctrl+Shift+V |
| Overlay click-through toggle | Ctrl+Shift+I |
| Three prioritized agent choices | Implemented — visual reminders, not automatic locking |
| Import your own official match JSON | Implemented |
| Personal K/D, wins, ACS, HS%, ADR, map breakdown | Implemented for imported data |
| Official competitive leaderboard | Implemented; requires an approved Riot API key |
| Local synthetic demo match | examples/sample-match.json |
| Windows unsigned portable EXE and installer | GitHub Actions build; verify Actions run status |
| Riot Sign On and automatic own-match sync | Not yet implemented; needs production approval |
| Party/queue controls and automated agent selection | Not implemented; not available through documented APIs |
| Live enemy scouting and identifying hidden Riot IDs | Intentionally excluded under Riot policy |

## Getting started (Windows)

Install Node.js 22+ for development, then open PowerShell:

~~~powershell
git clone https://github.com/ashclient/valtrackersucks.git
cd valtrackersucks
npm install
npm test
npm start
~~~

In the app choose **Overlay**, or press **Ctrl+Shift+V**. The overlay initially ignores mouse events, so you can click through it into the game. Press **Ctrl+Shift+I** to make the overlay interactive (and again to restore click-through). Ordinary desktop overlays may not appear above exclusive fullscreen games; use **Borderless Windowed**.

### Try the sample data

1. Open **Settings**, enter **demo-puuid** as your PUUID, and save.
2. Click **Import match**, then select **examples/sample-match.json**.
3. The dashboard displays explicitly **synthetic** sample match metrics.
4. Later replace the PUUID with your *own* authorized account identifier and import your own official match responses. Changing the account clears the previous match summaries.

Only derived summaries are stored locally under Electron's user-data directory. No match data is sent to our servers.

### Official leaderboard

A registered and approved product is required to use Riot's player-specific production APIs and Riot Sign On. If you already have an approved Riot key, you can test the official read-only leaderboard endpoint in a developer environment:

~~~powershell
$env:RIOT_API_KEY = "YOUR_APPROVED_KEY"
npm start
~~~

Never commit the key or embed it in the installer. A distributable production application should call an approved, secure backend that holds the key. VTS does not ship with an API key or with Riot authentication.

## Technical layout

- **electron/main.cjs** — secure Electron windows, global shortcuts, preference persistence, local import, and official leaderboard fetching with rate-limit handling and caching.
- **electron/preload.cjs** — narrow IPC bridge; renderer has no Node access.
- **src/index.html**, **src/style.css**, **src/renderer.js** — desktop UI and small agent overlay.
- **src/analytics.cjs** — pure post-match stats computation for the specified own PUUID.
- **tests/analytics.test.cjs** — Node unit tests.
- **.github/workflows/windows.yml** — CI tests and unsigned Windows packaging.

No game memory access, DLL injection, lockfile/token scraping, input automation, hidden player resolution, or pre-match enemy scouting.

## Next engineering milestones

1. Riot-approved RSO opt-in account flow using a backend and explicit consent records.
2. Automatically import the signed-in user's **completed** matches through official endpoints.
3. Show permitted post-match and voluntarily public profile comparisons.
4. Retrieve the current agent catalog and more approved static content.
5. Measure cold-start time, fix any Windows packaging issues, and add further UI polish.

## Integrity and privacy

Riot's [developer policy](https://developer.riotgames.com/docs/valorant) excludes scouting opponents before a match, identifying deliberately hidden players, and immediate-performance live overlays. [Riot's third-party software guidance](https://support.riotgames.com/en-us/riot/events/third-party-applications) also warns against taking game actions on a player's behalf. This prototype intentionally avoids those features and does not claim Riot approval.

VALORANT and Riot Games are trademarks of Riot Games, Inc. VTS is independent and is not affiliated with Riot Games. MIT licensed; see LICENSE.
