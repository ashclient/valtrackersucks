## VTS v0.4.0

### Store and locker

- Correct daily-price lookup with a fallback to the offer catalog when prices are missing.
- Separate VP, Radianite and Kingdom Credit balances/prices; missing prices are never displayed as zero.
- Accessory shop, featured bundles and Night Market sections with reset timers and discounted/original prices where supplied by Riot.
- An owned-item Locker for weapon skins, unlocked levels/variants, player cards, titles, sprays and buddy copies.
- Equip controls validate ownership against fresh entitlements, reload the current loadout, and preserve other slots and privacy settings. VTS does not purchase items.

### Desktop and overlay

- Artwork-led store cards, item inspection, weapon-slot navigation and a searchable locker.
- Team-based overlay roster with agent portraits, rank badges and player reports.
- Recent competitive reports include K/D, average ACS, HS% and win rate over up to 10 games. Data comes from the Riot Client session and is cached for five minutes.
- Visible player reports can open their Tracker.gg profile. This is not a Tracker.gg API or scraping integration.
- Private/unavailable histories fail clearly. Hidden identities are not resolved.
- Reconnecting/disconnecting clears account-specific store, locker and report data.

### Downloads

- **VTS.Setup.0.4.0.exe** — Windows x64 installer.
- **VTS.0.4.0.exe** — Windows x64 portable executable.

The builds are unsigned. Unofficial Riot endpoints can change. Live authenticated store/loadout behavior and display over a running VALORANT game require Windows validation; Electron tests using synthetic inventories do not establish that compatibility. Borderless Windowed mode remains the overlay target.
