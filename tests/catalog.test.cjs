'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validImage, sanitizeAgent, sanitizeMap, sanitizeWeapon, getCatalog } = require('../electron/catalog.cjs');

test('only image URLs from allowed HTTPS host', () => {
  assert.equal(validImage('https://media.valorant-api.com/agents/test.png'), 'https://media.valorant-api.com/agents/test.png');
  assert.equal(validImage('https://media.valorant-api.com.evil.test/test.png'), null);
  assert.equal(validImage('javascript:alert(1)'), null);
  assert.equal(validImage('http://media.valorant-api.com/agents/foo.png'), null);
  assert.equal(validImage('file:///C:/secrets.txt'), null);
});
test('normalizes one playable agent, excludes non-playable agent', () => {
  assert.equal(sanitizeAgent({ uuid: 'abc', displayName: 'Jett', isPlayableCharacter: false }), null);
  assert.deepEqual(sanitizeAgent({
    uuid: 'abc', displayName: 'Jett', isPlayableCharacter: true,
    role: { displayName: 'Duelist' }, displayIconSmall: 'https://media.valorant-api.com/test.png',
    abilities: [{ displayName: 'Dash', slot: 'Ability2', displayIcon: 'javascript:evil()' }]
  }), {
    id: 'abc', name: 'Jett', role: 'Duelist', description: '',
    portrait: 'https://media.valorant-api.com/test.png', fullPortrait: null,
    icon: null,
    abilities: [{ name: 'Dash', slot: 'Ability2', description: '', icon: null }]
  });
});
test('map and weapons are filtered to display-safe fields', () => {
  assert.equal(sanitizeMap({ uuid: 'map1', displayName: 'Ascent', callouts: [1,2] }).callouts, 2);
  assert.equal(sanitizeWeapon({ uuid: 'weapon1', displayName: 'Vandal', shopData: { categoryText: 'Rifles', cost: 2900 } }).cost, 2900);
});
test('rejects arbitrary catalog queries', async () => {
  await assert.rejects(getCatalog('anything-else'), /Unknown catalog/);
});
