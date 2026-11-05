# VTS — VALORANT companion for Windows

An independent VALORANT desktop app with automatic party and match statistics, a separate game overlay, shop, locker, agent controls and local match history. It connects to your signed-in Riot Client on Windows. An optional approved Riot Sign On integration is available separately.

**Development version:** v0.6.0. VTS is usable offline with local data. The optional official RSO integration requires an approved production client and backend. The separate local-client integration below uses unofficial endpoints.

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

## Local Riot Client integration (development)

Sign in to Riot Client first. VTS attempts to connect automatically on Windows; select your region in Settings if it differs from the default. You can also choose **Connect Riot Client** in Shop. Disable **Connect automatically** in Settings to keep the connection manual. Disconnect disables automatic reconnection. No production API key or RSO backend is needed for this connection.

- **Store:** shows daily offers, accessory offers, featured bundles, Night Market discounts when active, wallet balances and reset times. Daily prices fall back to Riot's offer catalog when the storefront omits them; missing prices stay unavailable. VP, RP and Kingdom Credits are displayed separately. It reads the signed-in account's rotating offers. VALORANT can be closed, but Riot Client must stay running and signed in. Refresh explicitly to load offers.
- **Party:** refresh lobby state, ready/unready your own account, and start/cancel matchmaking as party leader. VALORANT must be in a lobby.
- **Agent select:** explicitly select or lock an agent in the current pregame session. Locking asks for confirmation. This can act while the game UI is loading into agent select; it does not change an agent after locking or after the match starts.
- **Locker:** opens automatically when connected and loads owned weapon skins, unlocked levels/variants, cards, titles, sprays and buddy copies. It handles the canonical trailing-slash entitlement route, older route variants, and category-scoped ownership responses. If ownership or artwork is unavailable, the current equipped loadout remains visible with warnings and a retry control. Select an item to inspect it, then choose Equip. The backend reloads the server loadout and entitlements, checks ownership, and changes only the requested slot. It preserves unrelated weapons and privacy settings. No purchase requests are implemented.
- **Live match:** the default view shows a profile beside a dense ally/enemy table, with rank, party, K/D, win rate, ACS, headshot percentage, ADR, games played, selected-agent sample and reported peak. Both windows update automatically every five seconds; player histories load in the background without clicks. Data is a sample of up to 10 games from your selected queues, cached for five minutes. Empty and rejected histories have explicit row states.
- **Match phases:** own party members load in the lobby, allied players load during agent select, and opponents load as soon as Riot includes them in pregame or provisioned core-game responses, including map loading. Future opponents are not assigned in the lobby; VTS cannot display a roster that Riot has not supplied.
- **Names and parties:** displays Riot IDs returned by the signed-in session's name service, including masked in-game handles when the service returns them. Name visibility and history access are independent: a masked roster participant can have stats if Riot allows the history request. Withheld identities stay masked, and rejected histories stay unavailable. Matching **P#** badges identify confirmed current parties; hover to see members. **Past** means shared parties in completed games only, not a confirmed current group. VTS does not invent enemy party membership when it is absent from the response.
- **Mode selection:** all queues are included by default. Use **Live match → Stats from** for one queue, or **Settings → Statistics modes** for any combination. The selection applies to player histories, overlay samples, Performance, Career and saved match history. Switching modes clears old samples, uses separate caches and discards in-flight results from the previous selection. History samples scan at most 100 recent entries to find up to 10 matching games. Modes without team outcomes show no win rate; unavailable combat fields stay blank.
- **Performance / history:** automatic own-player stats also populate saved history for an empty or matching local profile, so Career and Match history load without a separate click. A different imported profile is preserved until you explicitly approve switching through Sync. Sync Riot matches uses your local Riot Client session to import your own completed games, without requiring the optional RSO login. Changing an existing local profile asks before replacing its stored summaries.
- **Tracker.gg:** a player's report can open their Tracker.gg profile in the browser. VTS does not use a Tracker.gg API or scrape private profiles. The layout uses the published Tracker live-match and agent-select screens as references; VTS implements its own interface and uses Riot data rather than proprietary Tracker scores.
- Existing offline match imports, career summaries, presets, overlay, catalog browser and CSV exports remain available. History and map breakdowns now include all retained summaries (up to 500), rather than only the latest 40.

This connector uses **unofficial endpoints**, which Riot can change or reject. It is a development implementation, not a claim of Riot approval or compatibility. It has fixture-based request tests and Linux UI validation; **live store, locker writes, party, agent and player-history behavior still needs validation with a signed-in Windows Riot Client**. Installer packaging is checked by the Windows CI workflow; it does not validate the live Riot endpoints.

VTS reads the current user's `%LOCALAPPDATA%/Riot Games/Riot Client/Config/lockfile` to authenticate only to Riot Client's loopback service. Access and entitlement tokens stay in Electron's main-process memory; they are not saved, logged or exposed through the preload bridge. Disconnect or exit clears the session. The self-signed certificate exception is limited to the literal loopback address and lockfile port; remote HTTPS retains certificate verification. No memory scanning, injection or in-game input simulation is used.

## Development validation

Run `npm test` and the JavaScript syntax checks in `.github/workflows/windows.yml`. Connector tests mock remote responses: they validate request construction and guards, not live endpoint compatibility. The internal-match parser also has an anonymized fixture derived from a published real-format response; it checks `subject` and `queueID`, which differ from the official API schema. See [fixture provenance](tests/fixtures/README.md).

UI references: [Tracker app screenshots](https://tracker.gg/valorant/app) and [Overwolf listing](https://www.overwolf.com/app/tracker_network-valorant_tracker). The live view follows their profile/table composition using original VTS code and branding.

On Windows, validate in this order:
1. Sign in to Riot Client, leave VALORANT closed, and load the daily shop. Compare names, prices and expiry with the game after launching it.
2. Enter a party, refresh the lobby, and verify ready/unready. As leader, start then cancel queue; as a member, confirm queue controls report the leadership requirement.
3. In a suitable match, select an available agent and confirm lock once. Check behavior when pregame ends or another player takes the agent.
4. Load Locker, compare owned skins/levels/variants with the game, and equip a different owned skin. Verify other weapons, buddies, cards, sprays and privacy settings are preserved. Repeat for a card, title, spray slot and buddy copy. Locked/unowned variants must be rejected.
5. Compare daily VP prices, accessory KC prices, bundle discounts, active Night Market discounts and wallet balances with the game. Check an inactive Night Market and missing-price responses.
6. Leave Live match open without clicking a player. Verify automatic party stats in the lobby, allied stats during agent select, and opponents as soon as the server publishes the loading/match roster. Verify sample size, K/D, ACS, headshots, ADR and party grouping against the game. Test a withheld identity and a rejected history: neither should fabricate data or sign out your account. Use **Diagnostics** to copy endpoint HTTP statuses if a row fails; the report excludes credentials, player IDs and names.
7. Disconnect and verify controls become unavailable. Reconnect after signing out, switching accounts, changing regions or an expired session. Wrong-region and rejected-session requests must fail clearly.

The public catalog/version service uses `valorant-api.com`; artwork uses `media.valorant-api.com`. Riot data uses `pd.<shard>.a.pvp.net` and `glz-<region>.<shard>.a.pvp.net`. These hosts must be reachable on the Windows machine. Live public catalog and artwork requests were validated here. The cloud machine contains no Riot Client, so authenticated live validation must happen on Windows. Preview screenshots marked VISUAL QA contain synthetic account data and real public artwork.

## Overlay shortcuts

| Shortcut | Function |
| --- | --- |
| **Ctrl + Shift + V** | Open or close the clickable match overlay |
| **Escape** | Close the focused match overlay |

The desktop app and overlay are separate windows. With **Minimize to system tray** enabled (the default), minimizing or closing the desktop hides it while VTS and its global shortcuts keep running. Click the tray icon or choose **Open VTS** to restore it; **Quit VTS** ends the app and overlay. Launching VTS again restores the existing instance.

The match overlay starts hidden. Its single global shortcut opens it clickable and focusable; the same shortcut or Escape closes it. There is no second interaction keybind. Change the shortcut and opacity in **Settings**. A conflicting shortcut preserves the last working binding.

A separate, always-clickable **agent selector** appears automatically at the bottom right of the display nearest the cursor during agent select and provisioned pregame loading. It shows all public catalog agents, disables locked ally picks, and requires an inline confirmation before locking. It hides on transition to the core match, on cancellation back to the lobby, or on disconnect. Agent selection is only possible while Riot still accepts pregame actions; it cannot change a locked agent after the match starts. The match overlay toggle does not control this panel.

Global hotkey dispatch, custom bindings, separate windows, hide/show, and tray persistence were exercised in the Linux/X11 cloud desktop. Real Windows tray interaction and display above a running VALORANT window remain unverified. Use Borderless Windowed mode; ordinary Electron overlays cannot guarantee visibility over exclusive fullscreen.

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

- No Riot password collection. Local client connection reuses the current signed-in session.
- No Riot production secret in the desktop binary.
- Local match summaries are saved in Electron's per-user data directory.
- The Riot backend stores ephemeral authorized accounts and sessions in memory.
- It processes only the authenticated user's finished matches and returns aggregated own-player match data.
- The local connector shows only identities returned for the current roster by the signed-in session; it does not bypass rejected profile/history requests.
- VTS does not publish your account data. The separate official RSO backend processes only its consenting authenticated account.

## Project layout

- `electron/store.cjs` — store normalization, reward IDs, prices, currency maps and discounts.
- `electron/presentation.cjs` — catalog joins and owned-item locker presentation.
- `src/companion.js` and `src/companion.css` — store, locker, player reports and expanded overlay.
- `electron/client.cjs` — local Riot Client session, shop, party, agent, roster and player-history requests.
- `electron/agent-panel.cjs` — pregame visibility and multi-display corner placement.
- `src/modes.js` — shared queue selection and labels.
- `src/menu.js` and `src/menu.css` — redesigned menu, queue controls and agent selector.
- `electron/match-monitor.cjs` — shared phase polling, bounded background stats hydration and stale-result suppression.
- `src/match-view.js` and `src/match-view.css` — automatic desktop and overlay roster tables.
- `electron/main.cjs` — Windows/tray lifecycle, overlay, IPC, local and approved account integrations.
- `electron/preload.cjs` — restricted IPC bridge.
- `electron/catalog.cjs` — public agents, maps, weapons and skins.
- `electron/local-data.cjs` — private file imports, folder rescan, CSV output.
- `src/` — desktop and overlay UI, performance views, settings.
- `server/rso-server.cjs` — separately hosted optional opt-in Riot OAuth integration and match sync.
- `scripts/generate-icons.cjs` — branded Windows icon generation.
- `tests/` — analytics, catalog, data, icon and backend tests.
- `.github/workflows/windows.yml` — CI, EXE packaging, artifact upload and release.

## Design skill

[UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) is installed in `.agents/skills/ui-ux-pro-max` with its license. [VTS design decisions](design-system/vts/MASTER.md) record the applicable dashboard guidance. Development skill files are excluded from packaged apps.

## Riot / legal notice

VTS is independent and not affiliated with or endorsed by Riot Games. VALORANT is a trademark of Riot Games, Inc. Riot's [VALORANT developer policy](https://developer.riotgames.com/docs/valorant) prohibits pre-match opponent scouting and deliberately identifying hidden players, and does not support online store tracking through the public API. Client-control operations such as selecting/locking agents, queuing/ready-up and changing loadouts are not provided by the documented API. VTS makes no guarantee of compatibility with game-client internals or Vanguard.

MIT licensed (see LICENSE).
