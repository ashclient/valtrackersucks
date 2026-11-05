'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeMatch, summary, mapName } = require('../src/analytics.cjs');
const match = {
  matchInfo: { matchId: 'match-one', gameStartMillis: 1600000000000, mapId: '/Game/Maps/Ascent/Ascent', queueId: 'competitive' },
  players: [
    { puuid: 'my-puuid', teamId: 'Blue', characterId: 'agent-id', stats: { kills: 18, deaths: 12, assists: 4, roundsPlayed: 20, score: 5000 } },
    { puuid: 'somebody-else', teamId: 'Red', stats: { kills: 42, deaths: 1, assists: 0 } }
  ],
  teams: [{ teamId: 'Blue', won: true }, { teamId: 'Red', won: false }],
  roundResults: [{ playerStats: [
    { puuid: 'my-puuid', damage: [{ headshots: 3, bodyshots: 4, legshots: 1, damage: 600 }] },
    { puuid: 'somebody-else', damage: [{ headshots: 55, bodyshots: 1, legshots: 0, damage: 9000 }] }
  ] }]
};
test('finds only the owner and computes statistics correctly', () => {
  const result = analyzeMatch(match, 'my-puuid');
  assert.equal(result.id, 'match-one');
  assert.equal(result.map, 'Ascent');
  assert.equal(result.result, 'WIN');
  assert.equal(result.kd, 1.5);
  assert.equal(result.acs, 250);
  assert.equal(result.adr, 30);
  assert.equal(result.hs, 37.5);
  assert.ok(!JSON.stringify(result).includes('somebody-else'));
});
test('cannot import a match for which owner is absent', () => {
  assert.throws(() => analyzeMatch(match, 'absent'), /does not appear/);
});
test('summary respects missing data and unknown results', () => {
  assert.deepEqual(summary([]), { played: 0, wins: 0, winRate: null, kd: null, hs: null, adr: null, acs: null });
  assert.equal(summary([{ result: 'WIN', kd: 1.2, hs: null }, { result: 'LOSS', kd: 0.8, hs: 20 }]).winRate, 50);
  assert.equal(summary([{ result: 'WIN', kd: 1.2, hs: null }, { result: 'LOSS', kd: 0.8, hs: 20 }]).hs, 20);
});
test('map aliases are resolved', () => {
  assert.equal(mapName('/Game/Maps/Juliett/Juliett'), 'Sunset');
});
test('parses an anonymized internal Riot response using subject and queueID',()=>{
  const fixture=require('./fixtures/client-match-detail.json');
  const result=analyzeMatch(fixture,'11111111-1111-1111-1111-111111111111');
  assert.equal(result.kills,19);assert.equal(result.deaths,10);assert.equal(result.acs,303);assert.equal(result.hs,34.5);assert.equal(result.adr,206);assert.equal(result.queue,'competitive');
  assert.equal(result.combat.score,5148);assert.equal(result.combat.hits,58);
});
