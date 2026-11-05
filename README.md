# VTS — VALORANT companion for Windows

An independent, local-first VALORANT desktop app with a fast dashboard, optional always-on-top overlay, agent planning, match history, map statistics, cosmetic previews, and optional Riot Sign On integration for **consenting players** using an approved production API client.

**Release:** v0.2.0. VTS is usable offline with local data. Some connected features are conditional on production Riot approval, official API permissions, and a deployed backend.

## Install VTS (Windows)

1. Visit **[GitHub Releases](https://github.com/ashclient/valtrackersucks/releases)** and download the latest Windows installer or portable executable after the release workflow succeeds. If no release is published, use the installer artifact from **[Actions](https://github.com/ashclient/valtrackersucks/actions)**.
2. Run the EXE. The current build is **unsigned**, so Windows may warn you.
3. In VTS, choose **Agent presets**, **Collection library**, or **Import match**. No Riot sign-in is needed for offline features.
4. The optional overlay is designed for VALORANT in Borderless Windowed mode.

Developers can run the app with Node.js 22+:

~~~powershell
git clone https://github.com/ashclient/valtrackersucks.git
cd valtrackersucks
npm install
npm test
npm start
~~~

To build the installer on Windows, run `npm run dist:win`. Builds include a generated VTS application icon.

## Feature inventory

| Feature | v0.2.0 status |
| --- | --- |
| Native-feeling frameless Windows desktop dashboard | Implemented |
| Agent presets (top three picks) | Implemented; manual in-game selection only |
| Dynamic agent names and portraits | Implemented using public VALORANT game-content API |
| Cosmetics and skin library with filter | Implemented; static previews, not your daily shop |
| Separate transparent always-on-top overlay | Implemented; normal desktop overlay, borderless recommended |
| Click-through/interactive overlay shortcuts | Implemented |
| Match history for the consenting account | Implemented for imported or approved RSO-synced data |
| K/D, ACS, headshots, damage per round, maps and wins | Implemented for available post-match data |
| Import one/many JSON match responses | Implemented |
| Choose a folder with personal match JSON exports; auto-rescan | Implemented; every 60 seconds |
| Export local match history to CSV | Implemented |
| Start with Windows, minimize to tray, opacity options | Implemented |
| Riot account sign-in through approved RSO | Implemented as **optional backend integration**; requires approval, backend deployment and credentials |
| Sync signed-in account's completed matches | Backend implementation present, **requires approved server to be configured and authorized** |
| Official leaderboard | Supported with approved Riot API key (development mode only until secure server connector is added) |
| Automatic agent select/lock, matchmaking/ready-up | Not implemented; no documented official client-control endpoint |
| Personal rotating store or equip skins | Not implemented; Riot does not expose these actions via its supported public VALORANT API |
| Pre-match enemy scouting or revealing hidden accounts | Intentionally excluded |

No game injection, memory scanning, token/lockfile extraction, DLL hooks, credential capture, or gameplay automation is used.

## Overlay shortcuts

| Shortcut | Function |
| --- | --- |
| **Ctrl + Shift + V** | Show or hide overlay |
| **Ctrl + Shift + I** | Toggle between click-through and interactive overlay |

You may adjust opacity in **Settings**. The app can stay in your system tray when the dashboard window closes. Use the tray menu to quit.

## Local match data

Use **Settings → Your PUUID** and import authorized official match JSON exports with **Import match**. The parser extracts **your own** statistics by PUUID and discards other players' identity and match details. Files are not uploaded. Or choose **Settings → Local match sync → Choose folder** to rescan JSON exports periodically.

For a demonstration without credentials:
1. Enter `demo-puuid` in Settings as your PUUID.
2. Import `examples/sample-match.json`.
3. View synthetic match statistics on the Overview and Career pages.

Changing your PUUID clears locally imported summaries from the previous profile.

## Optional Riot Sign On (RSO) integration

Riot requires an **approved VALORANT production application and RSO client**. Simply signing into Riot does *not* grant shop, loadout, queue, or game-session control endpoints. The Windows installer deliberately contains **no client secrets or Riot passwords**.

For production integration:
1. Register your VTS app through the [Riot Developer Portal](https://developer.riotgames.com/) and request approval. Follow [Riot's VALORANT policy](https://developer.riotgames.com/docs/valorant) and opt-in requirements.
2. Get approved RSO client ID, client secret and production API key.
3. Deploy `server/rso-server.cjs` to a trusted service behind HTTPS with your redirect URI registered by Riot. Configure environment variables shown in `.env.example`. Keep all secrets server-side. The app does **not** bundle or start the backend automatically.
4. Launch the desktop app with `VTS_API_BASE_URL=https://api.your-domain.example` set in its environment.
5. Open Settings → **Connect Riot account**. VTS launches Riot's system-browser OAuth flow through your server. Only upon explicit authorization does your backend return a personal account session to VTS. On supported Windows systems, the desktop app encrypts this session using Electron safeStorage.
6. Choose Match history → **Sync Riot matches** to import **only your own completed games** through the official VAL-MATCH-V1 routes.
7. **Disconnect** invalidates the backend session and deletes local session credentials; imported stats remain on the device until explicitly cleared.

The backend is a minimal **single-process reference deployment**. For public production use, add a persistent encrypted database/session manager, audit logging that excludes credentials, robust external rate limits, deployment security review, data deletion controls, operational monitoring, and abuse protection. **It has not been production security-reviewed or live-tested with real RSO credentials.**

## Data and privacy

- No Riot password collection.
- No Riot production secret in the desktop binary.
- Local match summaries are saved in Electron's per-user data directory.
- The Riot backend stores ephemeral authorized accounts and sessions in memory.
- It processes only the authenticated user's finished matches and returns aggregated own-player match data.
- No hidden accounts or opponent pre-match scouting.
- Players must explicitly opt in; VTS never publishes a user's stats to other people by default.

## Project layout

- `electron/main.cjs` — Windows/tray lifecycle, overlay, IPC, local and approved account integrations.
- `electron/preload.cjs` — restricted IPC bridge.
- `electron/catalog.cjs` — public agents, maps, weapons and skins.
- `electron/local-data.cjs` — private file imports, folder rescan, CSV output.
- `src/` — desktop and overlay UI, performance views, settings.
- `server/rso-server.cjs` — separately hosted optional opt-in Riot OAuth integration and match sync.
- `scripts/generate-icons.cjs` — branded Windows icon generation.
- `tests/` — analytics, catalog, data, icon and backend tests.
- `.github/workflows/windows.yml` — CI, EXE packaging, artifact upload and release.

## Riot / legal notice

VTS is independent and not affiliated with or endorsed by Riot Games. VALORANT is a trademark of Riot Games, Inc. Riot's [VALORANT developer policy](https://developer.riotgames.com/docs/valorant) prohibits pre-match opponent scouting and deliberately identifying hidden players, and does not support online store tracking through the public API. Client-control operations such as selecting/locking agents, queuing/ready-up and changing loadouts are not provided by the documented API. VTS makes no guarantee of compatibility with game-client internals or Vanguard.

MIT licensed (see LICENSE).
