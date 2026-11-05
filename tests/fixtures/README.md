# Riot Client match contract fixture

`client-match-detail.json` is a reduced, anonymized derivative of the [published competitive match response](https://github.com/techchrism/valorant-api-docs/blob/trunk/valorant-api-types/tests/endpoint-responses/match-details/competitive.json). Source schema: [MatchDetails.ts](https://github.com/techchrism/valorant-api-docs/blob/trunk/valorant-api-types/src/endpoints/pvp/MatchDetails.ts).

The fixture keeps the internal API's `players[].subject`, round-stat `subject`, `queueID`, combat totals and 17 round damage records for one selected player. Participant IDs, match ID and agent ID are synthetic or public catalog identifiers. Names, connection/server information, tokens and unrelated fields are omitted. A second anonymous player remains to catch selection mistakes.

Expected selected-player values: 19 kills, 10 deaths, 2 assists, 5,148 score, 20 headshots, 35 bodyshots, 3 legshots and 3,495 damage across 17 rounds. Tests assert K/D 1.9, ACS 303, HS 34.5% and ADR 206.

This validates response parsing, not authenticated live access on Windows.
