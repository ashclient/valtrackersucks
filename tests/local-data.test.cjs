'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mergeMatches, importFiles, scanFolder, exportCSV, csvField } = require('../electron/local-data.cjs');

const own = {
  matchInfo: { matchId: 'match-1', gameStartMillis: 1000, mapId: '/Game/Maps/Ascent/Ascent', queueId: 'competitive' },
  players: [{ puuid: 'own', stats: { kills: 1, deaths: 1, assists: 0, roundsPlayed: 2 } }]
};
test('merge is stable and deduplicates on match id', () => {
  const data = mergeMatches([{ id: 'one', timestamp: 2, kills: 1 }], [
    { id: 'two', timestamp: 1 }, { id: 'one', timestamp: 3, kills: 2 }
  ]);
  assert.deepEqual(data.map(x => x.id), ['one','two']);
  assert.equal(data[0].kills, 2);
});
test('folder imports owner match JSON and skips symlinks and non-JSON', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vts-'));
  try {
    const file = path.join(folder, 'match.json');
    fs.writeFileSync(file, JSON.stringify(own));
    fs.writeFileSync(path.join(folder, 'not-a-match.txt'), 'NO');
    const result = scanFolder(folder, 'own', []);
    assert.equal(result.imported, 1);
    assert.equal(result.matches[0].id, 'match-1');
    const result2 = importFiles([file], 'own', result.matches);
    assert.equal(result2.imported, 0);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
test('CSV export escapes commas, quotes and spreadsheet formulas', () => {
  assert.equal(csvField('=SUM(A1)'), '"\'=SUM(A1)"');
});
test('CSV exports safe formulas without data injection', () => {
  const csv = exportCSV([{ id: '=SUM(A1)', map: 'Ascent,2', queue: '"ranked"', timestamp: 100 }]);
  assert.ok(csv.includes('"\'=SUM(A1)"'));
  assert.ok(csv.includes('"Ascent,2"'));
  assert.ok(csv.includes('"""ranked"""'));
});
